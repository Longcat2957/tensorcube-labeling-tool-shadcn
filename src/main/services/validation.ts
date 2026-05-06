/**
 * Validation 규칙 + 스캔
 *
 * 규칙 (모두 옵션):
 * - minBoxArea: 박스 최소 면적 (px²) — 미만이면 'tooSmall'
 * - minBoxSide: 박스 최소 변 길이 (px) — 어느 한 변이라도 미만이면 'tooThin'
 * - allowOutOfBounds: false면 이미지 경계를 벗어난 박스를 'outOfBounds'로 표시
 * - duplicateIou: 동일 이미지 내 동일 클래스 박스가 IoU >= 임계값이면 'duplicate'
 * - minImagesPerClass: 워크스페이스 전체에서 클래스별 최소 어노테이션 수 (요약 위반)
 * - minBoxesPerClass: 위와 동일하지만 박스 단위
 *
 * 결과는 위반 항목 리스트 + 요약 카운트로 반환된다.
 */

import { join } from 'path'
import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { readJsonFile } from './fileService.js'
import type {
  LabelData,
  OBBAnnotation,
  PolygonAnnotation,
  KeypointAnnotation,
  AnyAnnotation
} from '../../shared/types.js'

const LABEL_DIR = 'label'

export interface ValidationRules {
  minBoxArea?: number
  minBoxSide?: number
  allowOutOfBounds?: boolean
  duplicateIou?: number
  minBoxesPerClass?: number
}

export type ValidationViolationKind =
  | 'tooSmall'
  | 'tooThin'
  | 'outOfBounds'
  | 'duplicate'
  | 'classUnderMin'

export interface ValidationViolation {
  kind: ValidationViolationKind
  imageId: string
  message: string
  /** 어노테이션 위반인 경우 채워짐 */
  annotationId?: string
  classId?: number
}

export interface ValidationReport {
  rules: ValidationRules
  violations: ValidationViolation[]
  byImage: Record<string, number>
  byKind: Record<ValidationViolationKind, number>
  scanned: { images: number; annotations: number }
}

function bboxArea(bbox: [number, number, number, number]): number {
  const [xmin, ymin, xmax, ymax] = bbox
  return Math.max(0, xmax - xmin) * Math.max(0, ymax - ymin)
}
function bboxSides(bbox: [number, number, number, number]): { w: number; h: number } {
  const [xmin, ymin, xmax, ymax] = bbox
  return { w: Math.max(0, xmax - xmin), h: Math.max(0, ymax - ymin) }
}
function bboxIoU(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2])
  const y2 = Math.min(a[3], b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const ua = bboxArea(a) + bboxArea(b) - inter
  return ua > 0 ? inter / ua : 0
}

function obbToAabb(
  obb: [number, number, number, number, number]
): [number, number, number, number] {
  const [cx, cy, w, h, angle] = obb
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const hw = w / 2
  const hh = h / 2
  const corners = [
    [hw, hh],
    [-hw, hh],
    [-hw, -hh],
    [hw, -hh]
  ].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]) as [number, number][]
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function polygonAabb(points: [number, number][]): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0]
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function keypointAabb(ann: KeypointAnnotation): [number, number, number, number] {
  if (ann.bbox) return ann.bbox
  const visible = ann.keypoints.filter((k) => k.v > 0)
  if (visible.length === 0) return [0, 0, 0, 0]
  const xs = visible.map((k) => k.x)
  const ys = visible.map((k) => k.y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function annotationAabb(ann: AnyAnnotation): [number, number, number, number] {
  if ('bbox' in ann && Array.isArray(ann.bbox)) return ann.bbox as [number, number, number, number]
  if ('obb' in ann) return obbToAabb((ann as OBBAnnotation).obb)
  if ('polygon' in ann) return polygonAabb((ann as PolygonAnnotation).polygon)
  if ('keypoints' in ann) return keypointAabb(ann as KeypointAnnotation)
  return [0, 0, 0, 0]
}

export async function runValidation(
  workspacePath: string,
  rules: ValidationRules
): Promise<ValidationReport> {
  const labelDir = join(workspacePath, LABEL_DIR)
  const violations: ValidationViolation[] = []
  const byImage: Record<string, number> = {}
  const byKind: Record<ValidationViolationKind, number> = {
    tooSmall: 0,
    tooThin: 0,
    outOfBounds: 0,
    duplicate: 0,
    classUnderMin: 0
  }
  const perClassCounts: Record<number, number> = {}
  let totalAnn = 0
  let totalImg = 0

  if (!existsSync(labelDir)) {
    return { rules, violations, byImage, byKind, scanned: { images: 0, annotations: 0 } }
  }

  const labelFiles = (await readdir(labelDir)).filter((f) => f.endsWith('.json'))

  for (const f of labelFiles) {
    const m = f.match(/^(\d{9})(_[CW])?\.json$/)
    if (!m) continue
    const imageId = m[1]
    totalImg++

    const data = await readJsonFile<LabelData>(join(labelDir, f))
    if (!data?.annotations) continue
    const W = data.image_info?.width ?? 0
    const H = data.image_info?.height ?? 0
    const annotations = data.annotations

    const aabbs: { ann: AnyAnnotation; aabb: [number, number, number, number] }[] = []
    for (const ann of annotations) {
      totalAnn++
      perClassCounts[ann.class_id] = (perClassCounts[ann.class_id] ?? 0) + 1
      const aabb = annotationAabb(ann)
      aabbs.push({ ann, aabb })

      const area = bboxArea(aabb)
      const { w, h } = bboxSides(aabb)

      if (rules.minBoxArea !== undefined && area < rules.minBoxArea) {
        addViolation(
          violations,
          byImage,
          byKind,
          'tooSmall',
          imageId,
          `면적 ${area.toFixed(0)} < ${rules.minBoxArea}`,
          ann.id,
          ann.class_id
        )
      }
      if (rules.minBoxSide !== undefined && (w < rules.minBoxSide || h < rules.minBoxSide)) {
        addViolation(
          violations,
          byImage,
          byKind,
          'tooThin',
          imageId,
          `변 길이 (${w.toFixed(0)}, ${h.toFixed(0)}) 중 일부가 ${rules.minBoxSide} 미만`,
          ann.id,
          ann.class_id
        )
      }
      if (rules.allowOutOfBounds === false && W > 0 && H > 0) {
        const oob = aabb[0] < 0 || aabb[1] < 0 || aabb[2] > W || aabb[3] > H
        if (oob) {
          addViolation(
            violations,
            byImage,
            byKind,
            'outOfBounds',
            imageId,
            `이미지 (${W}×${H}) 경계를 벗어남`,
            ann.id,
            ann.class_id
          )
        }
      }
    }

    // 동일 이미지 내 중복 (같은 class_id, IoU 임계 이상)
    if (rules.duplicateIou !== undefined && rules.duplicateIou > 0) {
      for (let i = 0; i < aabbs.length; i++) {
        for (let j = i + 1; j < aabbs.length; j++) {
          if (aabbs[i].ann.class_id !== aabbs[j].ann.class_id) continue
          const iou = bboxIoU(aabbs[i].aabb, aabbs[j].aabb)
          if (iou >= rules.duplicateIou) {
            addViolation(
              violations,
              byImage,
              byKind,
              'duplicate',
              imageId,
              `동일 클래스 ${aabbs[i].ann.class_id} 박스 IoU=${iou.toFixed(2)}`,
              aabbs[j].ann.id,
              aabbs[j].ann.class_id
            )
          }
        }
      }
    }
  }

  // 클래스별 최소 박스 수
  if (rules.minBoxesPerClass !== undefined) {
    for (const [cidStr, cnt] of Object.entries(perClassCounts)) {
      if (cnt < rules.minBoxesPerClass) {
        const cid = Number(cidStr)
        addViolation(
          violations,
          byImage,
          byKind,
          'classUnderMin',
          '',
          `class ${cid}: ${cnt}개 < ${rules.minBoxesPerClass}`,
          undefined,
          cid
        )
      }
    }
  }

  return {
    rules,
    violations,
    byImage,
    byKind,
    scanned: { images: totalImg, annotations: totalAnn }
  }
}

function addViolation(
  violations: ValidationViolation[],
  byImage: Record<string, number>,
  byKind: Record<ValidationViolationKind, number>,
  kind: ValidationViolationKind,
  imageId: string,
  message: string,
  annotationId?: string,
  classId?: number
): void {
  violations.push({ kind, imageId, message, annotationId, classId })
  if (imageId) byImage[imageId] = (byImage[imageId] ?? 0) + 1
  byKind[kind]++
}
