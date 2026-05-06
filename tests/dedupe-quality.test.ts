import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { dedupeImages } from '../src/main/services/utilities/imageDedupe'
import { analyzeQuality } from '../src/main/services/utilities/imageQuality'

let dir: string

async function makeJpeg(
  name: string,
  w: number,
  h: number,
  color: { r: number; g: number; b: number }
) {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: color }
  })
    .jpeg()
    .toBuffer()
  await writeFile(join(dir, name), buf)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dq-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('dedupeImages', () => {
  it('동일 색 이미지 두 장은 같은 그룹', async () => {
    await makeJpeg('a.jpg', 64, 64, { r: 100, g: 100, b: 100 })
    await makeJpeg('b.jpg', 64, 64, { r: 100, g: 100, b: 100 })
    await makeJpeg('c.jpg', 64, 64, { r: 200, g: 50, b: 50 })

    const r = await dedupeImages({ sourceDir: dir, threshold: 0 })
    // 최소 하나의 듀얼 그룹은 a,b
    const has = r.groups.some((g) => g.files.includes('a.jpg') && g.files.includes('b.jpg'))
    expect(has).toBe(true)
    expect(r.duplicateFiles).toBeGreaterThanOrEqual(1)
  })
})

describe('analyzeQuality', () => {
  it('중간 회색 이미지는 mean ~ 128', async () => {
    await makeJpeg('a.jpg', 64, 64, { r: 128, g: 128, b: 128 })
    const r = await analyzeQuality({ sourceDir: dir })
    expect(r.items).toHaveLength(1)
    expect(r.items[0].mean).toBeGreaterThan(120)
    expect(r.items[0].mean).toBeLessThan(140)
  })

  it('너무 어두운 이미지를 tooDark로 표시', async () => {
    await makeJpeg('a.jpg', 64, 64, { r: 5, g: 5, b: 5 })
    const r = await analyzeQuality({ sourceDir: dir, brightnessMin: 30 })
    expect(r.items[0].flags).toContain('tooDark')
    expect(r.flagged).toBe(1)
  })

  it('짧은 변 미달 이미지를 tooSmall로 표시', async () => {
    await makeJpeg('a.jpg', 32, 80, { r: 100, g: 100, b: 100 })
    const r = await analyzeQuality({ sourceDir: dir, minSide: 64 })
    expect(r.items[0].flags).toContain('tooSmall')
  })
})
