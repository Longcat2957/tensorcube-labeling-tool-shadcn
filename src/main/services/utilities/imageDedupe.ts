/**
 * 이미지 중복 / 유사 그룹화 (aHash 기반)
 *
 * 알고리즘 (단순/안정):
 *  1. 이미지를 8x8 grayscale로 리사이즈
 *  2. 평균 픽셀값 계산
 *  3. 각 픽셀이 평균보다 크면 1, 아니면 0 — 64비트 hash
 *  4. 두 hash 의 Hamming distance ≤ 임계값이면 같은 그룹
 *
 * dHash나 pHash가 더 robust하지만, sharp만으로 가능한 aHash로 충분.
 * 임계값 가이드: 0=완전 동일, 1-5=거의 동일, 6-10=유사, >10=다름.
 */

import { join, extname } from 'path'
import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])
const HASH_SIZE = 8 // 8x8

export interface DedupeOptions {
  sourceDir: string
  /** Hamming distance 임계값 (이하면 같은 그룹). 기본 5 */
  threshold?: number
}

export interface DedupeGroup {
  /** 대표 hash hex (16자리) */
  hash: string
  files: string[]
}

export interface DedupeResult {
  groups: DedupeGroup[]
  /** 단일 파일만 있는 (중복 아닌) 그룹은 제외하고 반환 — 사용자 관심 대상 */
  totalFiles: number
  duplicateFiles: number
}

async function computeAhash(imagePath: string): Promise<bigint | null> {
  try {
    const buf = await sharp(imagePath)
      .resize({ width: HASH_SIZE, height: HASH_SIZE, fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer()

    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i]
    const avg = sum / buf.length

    let hash = 0n
    for (let i = 0; i < buf.length; i++) {
      hash <<= 1n
      if (buf[i] >= avg) hash |= 1n
    }
    return hash
  } catch {
    return null
  }
}

function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b
  let count = 0
  while (x) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}

function bigintToHex(n: bigint): string {
  return n.toString(16).padStart(16, '0')
}

export async function dedupeImages(opts: DedupeOptions): Promise<DedupeResult> {
  if (!existsSync(opts.sourceDir)) {
    throw new Error('소스 디렉토리가 존재하지 않습니다.')
  }
  const threshold = opts.threshold ?? 5

  const files = (await readdir(opts.sourceDir))
    .filter((f) => SUPPORTED.has(extname(f).toLowerCase()))
    .sort()

  // hash 산출
  const hashes: { file: string; hash: bigint }[] = []
  for (const f of files) {
    const h = await computeAhash(join(opts.sourceDir, f))
    if (h !== null) hashes.push({ file: f, hash: h })
  }

  // greedy grouping: 처음 보는 hash마다 새 그룹, 이후 임계 이내인 항목은 그룹에 합류
  const groups: { hash: bigint; files: string[] }[] = []
  for (const item of hashes) {
    let placed = false
    for (const g of groups) {
      if (hammingDistance(g.hash, item.hash) <= threshold) {
        g.files.push(item.file)
        placed = true
        break
      }
    }
    if (!placed) {
      groups.push({ hash: item.hash, files: [item.file] })
    }
  }

  const dupGroups = groups.filter((g) => g.files.length > 1)
  const duplicateFiles = dupGroups.reduce((sum, g) => sum + (g.files.length - 1), 0)

  return {
    groups: dupGroups.map((g) => ({ hash: bigintToHex(g.hash), files: g.files })),
    totalFiles: files.length,
    duplicateFiles
  }
}
