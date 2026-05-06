/**
 * 이미지 품질 분석 / 저품질 필터
 *
 * 메트릭:
 *  - mean: 픽셀 평균 밝기 (0-255)
 *  - stdev: 픽셀 표준편차 — 낮을수록 평탄한(블러/단색) 이미지일 가능성
 *  - laplacianVar: Laplacian 컨볼루션 응답의 분산 — 낮을수록 블러
 *  - width / height: 이미지 크기
 *
 * 사용자가 임계값을 설정해 저품질 이미지 그룹을 추출할 수 있다.
 */

import { join, extname } from 'path'
import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])

export interface QualityOptions {
  sourceDir: string
  /** Laplacian variance가 이 값 미만이면 'blur'로 표시 (기본 비활성) */
  blurThreshold?: number
  /** 평균 밝기 < min 이면 'tooDark', > max 이면 'tooBright' */
  brightnessMin?: number
  brightnessMax?: number
  /** stdev 미만이면 'lowContrast' */
  stdevMin?: number
  /** 이미지 짧은 변 < 이면 'tooSmall' */
  minSide?: number
}

export type QualityFlag = 'blur' | 'tooDark' | 'tooBright' | 'lowContrast' | 'tooSmall'

export interface QualityItem {
  file: string
  width: number
  height: number
  mean: number
  stdev: number
  laplacianVar: number
  flags: QualityFlag[]
}

export interface QualityResult {
  items: QualityItem[]
  flagged: number
  total: number
}

const LAPLACIAN_KERNEL = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0]
}

async function analyzeImage(
  imagePath: string
): Promise<Omit<QualityItem, 'file' | 'flags'> | null> {
  try {
    const meta = await sharp(imagePath).metadata()
    const W = meta.width ?? 0
    const H = meta.height ?? 0

    // grayscale 통계
    const stats = await sharp(imagePath).grayscale().stats()
    const mean = stats.channels[0]?.mean ?? 0
    const stdev = stats.channels[0]?.stdev ?? 0

    // Laplacian 응답 분산 (블러 지표)
    const lapStats = await sharp(imagePath).grayscale().convolve(LAPLACIAN_KERNEL).stats()
    const laplacianVar = (lapStats.channels[0]?.stdev ?? 0) ** 2

    return { width: W, height: H, mean, stdev, laplacianVar }
  } catch {
    return null
  }
}

function evaluateFlags(
  metrics: Omit<QualityItem, 'file' | 'flags'>,
  opts: QualityOptions
): QualityFlag[] {
  const flags: QualityFlag[] = []
  if (opts.blurThreshold !== undefined && metrics.laplacianVar < opts.blurThreshold) {
    flags.push('blur')
  }
  if (opts.brightnessMin !== undefined && metrics.mean < opts.brightnessMin) {
    flags.push('tooDark')
  }
  if (opts.brightnessMax !== undefined && metrics.mean > opts.brightnessMax) {
    flags.push('tooBright')
  }
  if (opts.stdevMin !== undefined && metrics.stdev < opts.stdevMin) {
    flags.push('lowContrast')
  }
  if (opts.minSide !== undefined) {
    const shortest = Math.min(metrics.width, metrics.height)
    if (shortest < opts.minSide) flags.push('tooSmall')
  }
  return flags
}

export async function analyzeQuality(opts: QualityOptions): Promise<QualityResult> {
  if (!existsSync(opts.sourceDir)) {
    throw new Error('소스 디렉토리가 존재하지 않습니다.')
  }
  const files = (await readdir(opts.sourceDir))
    .filter((f) => SUPPORTED.has(extname(f).toLowerCase()))
    .sort()

  const items: QualityItem[] = []
  let flagged = 0
  for (const f of files) {
    const m = await analyzeImage(join(opts.sourceDir, f))
    if (!m) continue
    const flags = evaluateFlags(m, opts)
    if (flags.length > 0) flagged++
    items.push({ file: f, ...m, flags })
  }

  return { items, flagged, total: files.length }
}
