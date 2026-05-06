/**
 * 배치 이미지 리사이즈 (외부 디렉토리 → 외부 디렉토리)
 * 워크스페이스 내부 적용은 라벨 좌표 동기화가 필요해 별도 흐름으로 분리.
 */

import { join, extname, basename } from 'path'
import { mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])

export type ResizeMode = 'maxSide' | 'fixed' | 'scale'
export type ResizeFit = 'contain' | 'cover' | 'fill' | 'inside' | 'outside'

export interface BatchResizeOptions {
  sourceDir: string
  targetDir: string
  mode: ResizeMode
  /** maxSide / fixed에서 사용 */
  width?: number
  /** maxSide / fixed에서 사용 — maxSide면 width로만도 충분 */
  height?: number
  /** scale 모드 배율 (예: 0.5) */
  scale?: number
  /** sharp fit 옵션, 기본 inside (aspect 유지하며 모두 들어가게) */
  fit?: ResizeFit
  /** JPEG 품질 (1-100), 기본 90 */
  quality?: number
}

export interface BatchResizeResult {
  processed: number
  failed: number
  total: number
  errors: { file: string; reason: string }[]
}

export async function batchResize(opts: BatchResizeOptions): Promise<BatchResizeResult> {
  if (!existsSync(opts.sourceDir)) {
    throw new Error('소스 디렉토리가 존재하지 않습니다.')
  }
  await mkdir(opts.targetDir, { recursive: true })

  const all = (await readdir(opts.sourceDir)).filter((f) => SUPPORTED.has(extname(f).toLowerCase()))

  const result: BatchResizeResult = {
    processed: 0,
    failed: 0,
    total: all.length,
    errors: []
  }

  for (const name of all) {
    const src = join(opts.sourceDir, name)
    const dst = join(opts.targetDir, basename(name))
    try {
      let pipeline = sharp(src).rotate() // EXIF 회전 자동 적용

      if (opts.mode === 'maxSide') {
        const m = opts.width ?? opts.height
        if (!m || m <= 0) throw new Error('maxSide 값이 필요합니다.')
        pipeline = pipeline.resize({
          width: m,
          height: m,
          fit: 'inside',
          withoutEnlargement: true
        })
      } else if (opts.mode === 'fixed') {
        if (!opts.width || !opts.height) {
          throw new Error('fixed 모드에는 width/height 모두 필요합니다.')
        }
        pipeline = pipeline.resize({
          width: opts.width,
          height: opts.height,
          fit: opts.fit ?? 'inside'
        })
      } else if (opts.mode === 'scale') {
        const s = opts.scale ?? 1
        if (s <= 0) throw new Error('scale 값이 잘못됨.')
        const meta = await sharp(src).metadata()
        const w = Math.max(1, Math.round((meta.width ?? 0) * s))
        const h = Math.max(1, Math.round((meta.height ?? 0) * s))
        pipeline = pipeline.resize({ width: w, height: h, fit: 'fill' })
      }

      const ext = extname(name).toLowerCase()
      if (ext === '.jpg' || ext === '.jpeg') {
        pipeline = pipeline.jpeg({ quality: opts.quality ?? 90 })
      } else if (ext === '.webp') {
        pipeline = pipeline.webp({ quality: opts.quality ?? 90 })
      } else if (ext === '.png') {
        pipeline = pipeline.png()
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
