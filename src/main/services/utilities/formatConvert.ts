/**
 * 배치 포맷 변환 + EXIF orientation 정규화
 * - HEIC/PNG/WebP/BMP/JPEG → JPG (또는 PNG/WebP) 변환
 * - sharp.rotate() 로 EXIF 방향 자동 적용
 * - 원본은 보존, 타겟 디렉토리에 변환된 파일을 생성
 */

import { join, extname, basename } from 'path'
import { mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'

const READABLE = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.webp',
  '.heic',
  '.heif',
  '.tiff',
  '.tif'
])

export type OutputFormat = 'jpg' | 'png' | 'webp'

export interface ConvertOptions {
  sourceDir: string
  targetDir: string
  format: OutputFormat
  /** JPEG/WebP 품질 (1-100), 기본 90 */
  quality?: number
  /** EXIF 회전 정규화 (기본 true) */
  applyExifRotation?: boolean
}

export interface ConvertResult {
  processed: number
  failed: number
  total: number
  errors: { file: string; reason: string }[]
}

export async function batchConvertFormat(opts: ConvertOptions): Promise<ConvertResult> {
  if (!existsSync(opts.sourceDir)) {
    throw new Error('소스 디렉토리가 존재하지 않습니다.')
  }
  await mkdir(opts.targetDir, { recursive: true })

  const all = (await readdir(opts.sourceDir)).filter((f) => READABLE.has(extname(f).toLowerCase()))

  const result: ConvertResult = {
    processed: 0,
    failed: 0,
    total: all.length,
    errors: []
  }

  const targetExt = opts.format === 'jpg' ? '.jpg' : `.${opts.format}`
  const quality = opts.quality ?? 90
  const applyRotation = opts.applyExifRotation ?? true

  for (const name of all) {
    const src = join(opts.sourceDir, name)
    const stem = basename(name, extname(name))
    const dst = join(opts.targetDir, `${stem}${targetExt}`)
    try {
      let pipeline = sharp(src)
      if (applyRotation) pipeline = pipeline.rotate()

      if (opts.format === 'jpg') {
        pipeline = pipeline.jpeg({ quality, mozjpeg: true })
      } else if (opts.format === 'png') {
        pipeline = pipeline.png()
      } else if (opts.format === 'webp') {
        pipeline = pipeline.webp({ quality })
      }

      await pipeline.toFile(dst)
      result.processed++
    } catch (err) {
      result.failed++
      result.errors.push({
        file: name,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
  }

  return result
}
