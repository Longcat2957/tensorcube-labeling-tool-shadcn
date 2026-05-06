/**
 * Export 공통 유틸리티 함수
 */

import { existsSync } from 'fs'
import { copyFile } from 'fs/promises'
import { readdir } from 'fs/promises'
import { basename, extname, join } from 'path'
import sharp from 'sharp'
import { ensureDir, readJsonFile } from '../fileService.js'
import type { LabelData, OutOfBoundsPolicy } from '../../../shared/types.js'
import type { ExportableItem, ScaledSize, ScaledBbox, ScaledObb } from './types.js'

export const WORKSPACE_FILE = 'workspace.yaml'
export const SRC_DIR = 'src'
export const LABEL_DIR = 'label'

/**
 * 배열 셔플 (Fisher-Yates 알고리즘)
 */
export function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
}

/**
 * Export 이름 정규화
 */
export function sanitizeExportName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-')
}

/**
 * 데이터셋 분할 할당
 * - 분할 비율 정규화 (합이 100이 아니어도 동작)
 * - 0% 비율은 항상 0개
 * - 데이터 수 ≥ 비율이 0이 아닌 split 수이면 각 split에 최소 1개 보장
 * - 최종 합이 항상 total과 정확히 일치
 */
export function assignSplits(
  items: ExportableItem[],
  split: { train: number; val: number; test: number }
): void {
  const total = items.length
  if (total === 0) return

  const totalRatio = split.train + split.val + split.test
  if (totalRatio <= 0) return

  const keys = ['train', 'val', 'test'] as const
  type Key = (typeof keys)[number]

  // floor 기반 초기 할당
  const raw: Record<Key, number> = {
    train: split.train === 0 ? 0 : (split.train / totalRatio) * total,
    val: split.val === 0 ? 0 : (split.val / totalRatio) * total,
    test: split.test === 0 ? 0 : (split.test / totalRatio) * total
  }
  const counts: Record<Key, number> = {
    train: Math.floor(raw.train),
    val: Math.floor(raw.val),
    test: Math.floor(raw.test)
  }

  // 잔여 아이템을 소수부가 큰 순으로 분배 (비율이 0인 split은 제외)
  let remaining = total - (counts.train + counts.val + counts.test)
  const fractional = keys
    .filter((k) => split[k] > 0)
    .map((k) => ({ key: k, frac: raw[k] - Math.floor(raw[k]) }))
    .sort((a, b) => b.frac - a.frac)
  for (const entry of fractional) {
    if (remaining <= 0) break
    counts[entry.key]++
    remaining--
  }

  // 최소 1개 보장 (비율 > 0인 split 수보다 데이터가 많을 때)
  const nonZero = keys.filter((k) => split[k] > 0)
  if (total >= nonZero.length) {
    for (const k of nonZero) {
      if (counts[k] >= 1) continue
      counts[k] = 1
      // 가장 여유 있는 split(count가 크고 1보다 큰)에서 1 차감
      const donor = keys
        .filter((k2) => k2 !== k && counts[k2] > 1 && split[k2] > 0)
        .sort((a, b) => counts[b] - counts[a])[0]
      if (donor) counts[donor]--
    }
  }

  items.forEach((item, index) => {
    if (index < counts.train) {
      item.split = 'train'
    } else if (index < counts.train + counts.val) {
      item.split = 'val'
    } else {
      item.split = 'test'
    }
  })
}

/**
 * Export 아이템 수집
 * 빈 어노테이션도 기본적으로 포함하나, requireAnnotations=true 면 어노테이션이 있는 항목만 포함한다.
 */
export async function collectExportItems(
  workspacePath: string,
  includeCompletedOnly: boolean,
  requireAnnotations: boolean = false
): Promise<ExportableItem[]> {
  console.log('[Export] collectExportItems 시작:', {
    workspacePath,
    includeCompletedOnly,
    requireAnnotations
  })

  const labelDir = join(workspacePath, LABEL_DIR)
  const srcDir = join(workspacePath, SRC_DIR)

  if (!existsSync(labelDir)) {
    console.error('[Export] 라벨 디렉토리 없음:', labelDir)
    return []
  }
  if (!existsSync(srcDir)) {
    console.error('[Export] 소스 디렉토리 없음:', srcDir)
    return []
  }

  const labelFiles = await readdir(labelDir)
  console.log('[Export] 전체 라벨 파일 수:', labelFiles.length)

  const items: ExportableItem[] = []
  let skipped = 0

  for (const file of labelFiles.sort()) {
    if (!file.endsWith('.json')) continue
    if (includeCompletedOnly && !file.endsWith('_C.json')) continue

    const imageId = file.replace(/(_C|_W)?\.json$/, '')
    const labelData = await readJsonFile<LabelData>(join(labelDir, file))

    // labelData가 없는 경우만 건너뜀 (빈 어노테이션은 허용)
    if (!labelData) {
      console.warn('[Export] 라벨 데이터 읽기 실패:', file)
      skipped++
      continue
    }

    const annotations = labelData.annotations || []

    // 라벨이 있는 이미지만 강제 export 옵션
    if (requireAnnotations && annotations.length === 0) {
      skipped++
      continue
    }

    const imagePath = join(srcDir, labelData.image_info.filename)
    if (!existsSync(imagePath)) {
      console.warn('[Export] 이미지 파일 없음:', imagePath)
      skipped++
      continue
    }

    items.push({
      imageId,
      imageFilename: labelData.image_info.filename,
      imagePath,
      labelData: {
        image_info: labelData.image_info,
        // 빈 어노테이션도 포함
        annotations
      },
      split: 'train'
    })
  }

  console.log('[Export] 수집 완료:', { collected: items.length, skipped })
  return items
}

/**
 * 이미지 리사이즈 및 복사
 */
export async function writeExportImage(
  sourcePath: string,
  destinationPath: string,
  resize?: { enabled: boolean; width: number; height: number }
): Promise<ScaledSize> {
  if (resize?.enabled) {
    await sharp(sourcePath).resize(resize.width, resize.height).toFile(destinationPath)

    return { width: resize.width, height: resize.height }
  }

  await copyFile(sourcePath, destinationPath)
  const metadata = await sharp(sourcePath).metadata()
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0
  }
}

/**
 * BBox 좌표 스케일링
 */
export function scaleBbox(
  bbox: [number, number, number, number],
  originalSize: { width: number; height: number },
  targetSize: ScaledSize
): ScaledBbox {
  const scaleX = originalSize.width > 0 ? targetSize.width / originalSize.width : 1
  const scaleY = originalSize.height > 0 ? targetSize.height / originalSize.height : 1

  return {
    x1: bbox[0] * scaleX,
    y1: bbox[1] * scaleY,
    x2: bbox[2] * scaleX,
    y2: bbox[3] * scaleY
  }
}

/**
 * OBB 좌표 스케일링
 */
export function scaleObb(
  obb: [number, number, number, number, number],
  originalSize: { width: number; height: number },
  targetSize: ScaledSize
): ScaledObb {
  const scaleX = originalSize.width > 0 ? targetSize.width / originalSize.width : 1
  const scaleY = originalSize.height > 0 ? targetSize.height / originalSize.height : 1

  return {
    cx: obb[0] * scaleX,
    cy: obb[1] * scaleY,
    width: obb[2] * scaleX,
    height: obb[3] * scaleY,
    angle: obb[4] // 각도는 스케일링 불필요
  }
}

/**
 * OBB를 폴리곤 4점 좌표로 변환 (DOTA 포맷용)
 */
export function obbToPolygon(
  obb: ScaledObb
): [number, number, number, number, number, number, number, number] {
  const { cx, cy, width, height, angle } = obb
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const halfW = width / 2
  const halfH = height / 2

  const corners: Array<[number, number]> = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH]
  ]

  return corners.flatMap(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ]
}

/**
 * YOLO 포맷용 BB 좌표 정규화
 */
export function normalizeBboxForYolo(
  bbox: ScaledBbox,
  imageSize: ScaledSize
): { cx: number; cy: number; width: number; height: number } {
  const cx = (bbox.x1 + bbox.x2) / 2 / imageSize.width
  const cy = (bbox.y1 + bbox.y2) / 2 / imageSize.height
  const width = (bbox.x2 - bbox.x1) / imageSize.width
  const height = (bbox.y2 - bbox.y1) / imageSize.height

  return { cx, cy, width, height }
}

/**
 * 디렉토리 구조 생성 (images, labels 서브디렉토리 포함)
 */
export async function createDatasetDirectories(
  basePath: string,
  splits: Set<string>
): Promise<void> {
  for (const split of splits) {
    await ensureDir(join(basePath, split, 'images'))
    await ensureDir(join(basePath, split, 'labels'))
  }
}

/**
 * COCO용 디렉토리 구조 생성 (images 서브디렉토리만)
 */
export async function createCocoDirectories(basePath: string, splits: Set<string>): Promise<void> {
  for (const split of splits) {
    await ensureDir(join(basePath, split, 'images'))
  }
}

/**
 * 라벨 파일 경로 생성
 */
export function getLabelPath(imageFilename: string, split: string, basePath: string): string {
  const baseName = basename(imageFilename, extname(imageFilename))
  return join(basePath, split, 'labels', `${baseName}.txt`)
}

/**
 * 이미지 파일 경로 생성
 */
export function getImagePath(imageFilename: string, split: string, basePath: string): string {
  return join(basePath, split, 'images', imageFilename)
}

// ---- Out-of-Bounds 처리 유틸리티 ----

/**
 * BB가 이미지 범위를 벗어나는지 검사
 * x1 < 0, y1 < 0, x2 > width, y2 > height 중 하나라도 true면 out-of-bounds
 */
export function isBboxOutOfBounds(bbox: ScaledBbox, imageSize: ScaledSize): boolean {
  return bbox.x1 < 0 || bbox.y1 < 0 || bbox.x2 > imageSize.width || bbox.y2 > imageSize.height
}

/**
 * BB를 이미지 경계로 clamp (잘라내기)
 */
export function clampBbox(bbox: ScaledBbox, imageSize: ScaledSize): ScaledBbox {
  return {
    x1: Math.max(0, bbox.x1),
    y1: Math.max(0, bbox.y1),
    x2: Math.min(imageSize.width, bbox.x2),
    y2: Math.min(imageSize.height, bbox.y2)
  }
}

/**
 * YOLO 정규화 좌표를 [0, 1] 범위로 clamp
 * w, h는 음수가 되지 않도록 보장
 */
export function clampYoloNormalized(normalized: {
  cx: number
  cy: number
  width: number
  height: number
}): { cx: number; cy: number; width: number; height: number } {
  const halfW = Math.max(0, normalized.width) / 2
  const halfH = Math.max(0, normalized.height) / 2
  const cx = Math.max(halfW, Math.min(1 - halfW, normalized.cx))
  const cy = Math.max(halfH, Math.min(1 - halfH, normalized.cy))
  return {
    cx,
    cy,
    width: Math.max(0, Math.min(cx + halfW, 1) - Math.max(cx - halfW, 0)) * 2,
    height: Math.max(0, Math.min(cy + halfH, 1) - Math.max(cy - halfH, 0)) * 2
  }
}

/**
 * OBB가 비정상적으로 범위를 벗어나는지 검사
 * 회전 박스는 코너가 이미지 밖으로 나가는 것이 정상이므로,
 * 중심점이 이미지 범위를 크게 벗어나거나 크기가 무효인 경우만 체크
 */
export function isObbOutOfBounds(obb: ScaledObb, imageSize: ScaledSize): boolean {
  const maxDim = Math.max(imageSize.width, imageSize.height)
  // 중심점이 이미지 대각선 길이의 절반 이상 벗어나면 비정상
  const maxOffset = maxDim * 0.5
  if (obb.cx < -maxOffset || obb.cx > imageSize.width + maxOffset) return true
  if (obb.cy < -maxOffset || obb.cy > imageSize.height + maxOffset) return true
  // 너비나 높이가 0 이하이면 무효
  if (obb.width <= 0 || obb.height <= 0) return true
  return false
}

/**
 * OBB 중심점을 이미지 경계 근처로 clamp
 * 코너 초과는 정상이므로 중심점만 보수적으로 clamp
 */
export function clampObb(obb: ScaledObb, imageSize: ScaledSize): ScaledObb {
  const halfW = obb.width / 2
  const halfH = obb.height / 2
  return {
    ...obb,
    cx: Math.max(halfW, Math.min(imageSize.width - halfW, obb.cx)),
    cy: Math.max(halfH, Math.min(imageSize.height - halfH, obb.cy))
  }
}

/**
 * 폴리곤 점들을 이미지 경계로 clamp (DOTA 포맷용)
 */
export function clampPolygon(polygon: number[]): number[] {
  return polygon.map((val) => Math.max(0, val))
}

/**
 * Out-of-Bounds 정책에 따라 ScaledBbox 처리
 * - 'clip': 이미지 경계로 clamp
 * - 'skip': 범위 밖이면 null 반환
 * - 'none': 그대로 반환
 */
export function applyOutOfBoundsPolicyToBbox(
  bbox: ScaledBbox,
  imageSize: ScaledSize,
  policy: OutOfBoundsPolicy
): ScaledBbox | null {
  if (policy === 'none') return bbox
  if (policy === 'skip' && isBboxOutOfBounds(bbox, imageSize)) return null
  if (policy === 'clip') return clampBbox(bbox, imageSize)
  return bbox
}

/**
 * Out-of-Bounds 정책에 따라 YOLO 정규화 좌표 처리
 */
export function applyOutOfBoundsPolicyToYolo(
  normalized: { cx: number; cy: number; width: number; height: number },
  policy: OutOfBoundsPolicy
): { cx: number; cy: number; width: number; height: number } | null {
  if (policy === 'none') return normalized
  const isOutOfBounds =
    normalized.cx < 0 ||
    normalized.cx > 1 ||
    normalized.cy < 0 ||
    normalized.cy > 1 ||
    normalized.width < 0 ||
    normalized.height < 0
  if (policy === 'skip' && isOutOfBounds) return null
  if (policy === 'clip') return clampYoloNormalized(normalized)
  return normalized
}

/**
 * Out-of-Bounds 정책에 따라 ScaledObb 처리
 */
export function applyOutOfBoundsPolicyToObb(
  obb: ScaledObb,
  imageSize: ScaledSize,
  policy: OutOfBoundsPolicy
): ScaledObb | null {
  if (policy === 'none') return obb
  if (policy === 'skip' && isObbOutOfBounds(obb, imageSize)) return null
  if (policy === 'clip') return clampObb(obb, imageSize)
  return obb
}
