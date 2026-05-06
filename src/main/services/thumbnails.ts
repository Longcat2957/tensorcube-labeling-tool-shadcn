/**
 * 썸네일 캐시 / 생성
 *
 * 캐시 위치: <workspace>/.cache/thumb/<imageId>.jpg
 * 크기: 기본 200px (긴 변 기준), 품질 70 JPEG.
 * 원본보다 새것이면 캐시 재사용 (mtime 비교).
 */

import { join, basename, extname } from 'path'
import { mkdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'

const CACHE_DIR = '.cache/thumb'
const THUMB_SIZE = 200

export interface ThumbnailRequest {
  workspacePath: string
  imageId: string
  /** src 폴더 안 이미지 파일 절대 경로 */
  imagePath: string
}

export interface ThumbnailResult {
  imageId: string
  thumbPath: string
  cached: boolean
}

export async function ensureThumbnail(req: ThumbnailRequest): Promise<ThumbnailResult> {
  const cacheRoot = join(req.workspacePath, CACHE_DIR)
  await mkdir(cacheRoot, { recursive: true })
  const thumbPath = join(cacheRoot, `${req.imageId}.jpg`)

  if (existsSync(thumbPath) && existsSync(req.imagePath)) {
    const [thumbStat, srcStat] = await Promise.all([stat(thumbPath), stat(req.imagePath)])
    if (thumbStat.mtimeMs >= srcStat.mtimeMs) {
      return { imageId: req.imageId, thumbPath, cached: true }
    }
  }

  await sharp(req.imagePath)
    .rotate()
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toFile(thumbPath)

  return { imageId: req.imageId, thumbPath, cached: false }
}

/** 가능하면 src/ 안에서 imageId에 해당하는 이미지 경로를 찾아 썸네일을 만든다. */
export async function ensureThumbnailById(
  workspacePath: string,
  imageId: string
): Promise<ThumbnailResult> {
  const srcDir = join(workspacePath, 'src')
  for (const ext of ['.jpg', '.jpeg', '.png', '.bmp', '.webp']) {
    const p = join(srcDir, `${imageId}${ext}`)
    if (existsSync(p)) {
      return await ensureThumbnail({ workspacePath, imageId, imagePath: p })
    }
  }
  throw new Error(`이미지를 찾을 수 없음: ${imageId}`)
}

/** filename 추정 (현재 ImageInfo는 filename을 저장하지만 안전망용) */
export function getThumbnailPath(workspacePath: string, imageId: string): string {
  return join(workspacePath, CACHE_DIR, `${imageId}.jpg`)
}

/** path 유틸 — sourcePath가 절대 경로일 때 imageId 추출용 */
export function inferImageId(imagePath: string): string {
  return basename(imagePath, extname(imagePath))
}
