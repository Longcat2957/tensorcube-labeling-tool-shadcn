/**
 * 워크스페이스 통계 집계
 *
 * 이미지 리스트와 라벨 파일을 모두 스캔해 다음을 산출:
 * - 클래스별 어노테이션 개수
 * - 이미지 상태(none / working / completed) 카운트
 * - 박스 크기 분포 (BB는 width*height, OBB는 w*h 면적 기반 히스토그램)
 * - 박스 aspect 분포 (w/h)
 * - 빈 이미지 수 (어노테이션 0개)
 * - 이미지별 박스 수 인덱스 (필터링용)
 */

import { join } from 'path'
import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { readJsonFile } from './fileService.js'
import type { LabelData } from '../../shared/types.js'

const LABEL_DIR = 'label'

export interface WorkspaceStats {
  totalImages: number
  /** 라벨 파일이 존재하는 이미지 수 */
  totalLabelFiles: number
  totalAnnotations: number
  emptyImages: number
  status: { none: number; working: number; completed: number }
  perClassCounts: Record<number, number>
  /** 박스 크기 히스토그램 (px², 6 bin) */
  sizeHistogram: HistogramBin[]
  /** aspect ratio 히스토그램 (w/h, 5 bin) */
  aspectHistogram: HistogramBin[]
  /** image id → 박스 수 (필터링용) */
  boxCountById: Record<string, number>
  /** image id → 클래스 ID 집합 (필터링용) */
  classesById: Record<string, number[]>
}

export interface HistogramBin {
  label: string
  /** [min, max) — 마지막 bin은 [min, ∞) */
  min: number
  max: number | null
  count: number
}

const SIZE_BINS: { label: string; min: number; max: number | null }[] = [
  { label: '<1k', min: 0, max: 1_000 },
  { label: '1k-10k', min: 1_000, max: 10_000 },
  { label: '10k-100k', min: 10_000, max: 100_000 },
  { label: '100k-1M', min: 100_000, max: 1_000_000 },
  { label: '1M-10M', min: 1_000_000, max: 10_000_000 },
  { label: '≥10M', min: 10_000_000, max: null }
]

const ASPECT_BINS: { label: string; min: number; max: number | null }[] = [
  { label: '<0.5', min: 0, max: 0.5 },
  { label: '0.5-1', min: 0.5, max: 1 },
  { label: '1-2', min: 1, max: 2 },
  { label: '2-4', min: 2, max: 4 },
  { label: '≥4', min: 4, max: null }
]

function fitBin(value: number, bins: typeof SIZE_BINS): number {
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i]
    if (b.max === null) return i
    if (value >= b.min && value < b.max) return i
  }
  return bins.length - 1
}

function annotationSizeAndAspect(
  ann: import('../../shared/types.js').AnyAnnotation
): { area: number; aspect: number } | null {
  if ('bbox' in ann && Array.isArray(ann.bbox)) {
    const [xmin, ymin, xmax, ymax] = ann.bbox
    const w = Math.max(0, xmax - xmin)
    const h = Math.max(0, ymax - ymin)
    if (h === 0) return null
    return { area: w * h, aspect: w / h }
  }
  if ('obb' in ann) {
    const [, , w, h] = ann.obb
    if (h === 0) return null
    return { area: Math.abs(w * h), aspect: Math.abs(w / h) }
  }
  if ('polygon' in ann) {
    const pts = ann.polygon
    if (pts.length < 3) return null
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    if (h === 0) return null
    return { area: w * h, aspect: w / h }
  }
  if ('keypoints' in ann) {
    const visible = ann.keypoints.filter((k) => k.v > 0)
    if (visible.length === 0) return null
    const xs = visible.map((k) => k.x)
    const ys = visible.map((k) => k.y)
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    if (h === 0) return null
    return { area: w * h, aspect: w / h }
  }
  return null
}

export async function computeWorkspaceStats(workspacePath: string): Promise<WorkspaceStats> {
  const stats: WorkspaceStats = {
    totalImages: 0,
    totalLabelFiles: 0,
    totalAnnotations: 0,
    emptyImages: 0,
    status: { none: 0, working: 0, completed: 0 },
    perClassCounts: {},
    sizeHistogram: SIZE_BINS.map((b) => ({ ...b, count: 0 })),
    aspectHistogram: ASPECT_BINS.map((b) => ({ ...b, count: 0 })),
    boxCountById: {},
    classesById: {}
  }

  const labelDir = join(workspacePath, LABEL_DIR)
  if (!existsSync(labelDir)) return stats

  const labelFiles = (await readdir(labelDir)).filter((f) => f.endsWith('.json'))

  for (const f of labelFiles) {
    const m = f.match(/^(\d{9})(_[CW])?\.json$/)
    if (!m) continue
    const id = m[1]
    const suffix = m[2]
    const status: 'none' | 'working' | 'completed' =
      suffix === '_C' ? 'completed' : suffix === '_W' ? 'working' : 'none'

    stats.status[status]++
    stats.totalImages++

    const data = await readJsonFile<LabelData>(join(labelDir, f))
    if (!data) continue
    stats.totalLabelFiles++

    const annotations = Array.isArray(data.annotations) ? data.annotations : []
    stats.boxCountById[id] = annotations.length
    if (annotations.length === 0) {
      stats.emptyImages++
      stats.classesById[id] = []
      continue
    }

    const classSet = new Set<number>()
    for (const ann of annotations) {
      stats.totalAnnotations++
      stats.perClassCounts[ann.class_id] = (stats.perClassCounts[ann.class_id] ?? 0) + 1
      classSet.add(ann.class_id)
      const sa = annotationSizeAndAspect(ann)
      if (sa) {
        stats.sizeHistogram[fitBin(sa.area, SIZE_BINS)].count++
        stats.aspectHistogram[fitBin(sa.aspect, ASPECT_BINS)].count++
      }
    }
    stats.classesById[id] = [...classSet]
  }

  return stats
}
