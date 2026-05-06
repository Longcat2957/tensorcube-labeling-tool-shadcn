/**
 * 이미지 샘플링 유틸
 * - 소스 디렉토리에서 N장을 시드 고정 랜덤 선택해 타겟 디렉토리에 복사한다.
 * - 워크스페이스가 아니어도 동작 (단순 디렉토리 → 디렉토리).
 * - 9-digit ID 리네이밍은 하지 않는다 (워크스페이스 생성은 별도 단계).
 */

import { join, extname, basename } from 'path'
import { copyFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.heic'])

export interface SamplingOptions {
  sourceDir: string
  targetDir: string
  count: number
  seed?: number
}

export interface SamplingResult {
  copied: number
  total: number
  files: string[]
}

// Mulberry32 — 시드 기반 의사 난수
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export async function sampleImages(opts: SamplingOptions): Promise<SamplingResult> {
  if (!existsSync(opts.sourceDir)) {
    throw new Error('소스 디렉토리가 존재하지 않습니다.')
  }

  const all = (await readdir(opts.sourceDir)).filter((f) => SUPPORTED.has(extname(f).toLowerCase()))

  const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff)
  const shuffled = shuffleSeeded(all, seed)
  const picked = shuffled.slice(0, Math.max(0, Math.min(opts.count, shuffled.length)))

  await mkdir(opts.targetDir, { recursive: true })

  const files: string[] = []
  for (const name of picked) {
    const src = join(opts.sourceDir, name)
    const dst = join(opts.targetDir, basename(name))
    await copyFile(src, dst)
    files.push(dst)
  }

  return { copied: picked.length, total: all.length, files }
}
