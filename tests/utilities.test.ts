import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readdir, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { sampleImages } from '../src/main/services/utilities/sampling'
import { batchResize } from '../src/main/services/utilities/batchResize'
import { batchConvertFormat } from '../src/main/services/utilities/formatConvert'

let baseDir: string

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'utils-'))
})

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

async function makeJpeg(path: string, w = 32, h = 32): Promise<void> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 200, g: 100, b: 50 } }
  })
    .jpeg()
    .toBuffer()
  await writeFile(path, buf)
}

describe('sampleImages', () => {
  it('주어진 N장만큼 복사한다', async () => {
    const src = join(baseDir, 'src')
    const dst = join(baseDir, 'dst')
    await writeFile(join(baseDir, '_dummy.txt'), '') // src dir 생성 효과
    await rm(join(baseDir, '_dummy.txt'))
    const { mkdir } = await import('fs/promises')
    await mkdir(src, { recursive: true })
    for (let i = 0; i < 10; i++) {
      await makeJpeg(join(src, `${String(i).padStart(3, '0')}.jpg`))
    }

    const result = await sampleImages({ sourceDir: src, targetDir: dst, count: 3, seed: 42 })
    expect(result.copied).toBe(3)
    expect(result.total).toBe(10)
    const files = await readdir(dst)
    expect(files).toHaveLength(3)
  })

  it('동일 시드는 동일 샘플을 만든다', async () => {
    const src = join(baseDir, 'src')
    const dst1 = join(baseDir, 'd1')
    const dst2 = join(baseDir, 'd2')
    const { mkdir } = await import('fs/promises')
    await mkdir(src, { recursive: true })
    for (let i = 0; i < 20; i++) {
      await makeJpeg(join(src, `${String(i).padStart(3, '0')}.jpg`))
    }

    const r1 = await sampleImages({ sourceDir: src, targetDir: dst1, count: 5, seed: 1 })
    const r2 = await sampleImages({ sourceDir: src, targetDir: dst2, count: 5, seed: 1 })
    const f1 = (await readdir(dst1)).sort()
    const f2 = (await readdir(dst2)).sort()
    expect(f1).toEqual(f2)
    expect(r1.copied).toBe(5)
  })
})

describe('batchResize', () => {
  it('maxSide 모드는 긴 변을 제한한다', async () => {
    const src = join(baseDir, 'src')
    const dst = join(baseDir, 'dst')
    const { mkdir } = await import('fs/promises')
    await mkdir(src, { recursive: true })
    await makeJpeg(join(src, 'a.jpg'), 200, 100)
    await makeJpeg(join(src, 'b.jpg'), 100, 200)

    const res = await batchResize({
      sourceDir: src,
      targetDir: dst,
      mode: 'maxSide',
      width: 50
    })
    expect(res.processed).toBe(2)
    const meta1 = await sharp(join(dst, 'a.jpg')).metadata()
    const meta2 = await sharp(join(dst, 'b.jpg')).metadata()
    expect(Math.max(meta1.width ?? 0, meta1.height ?? 0)).toBeLessThanOrEqual(50)
    expect(Math.max(meta2.width ?? 0, meta2.height ?? 0)).toBeLessThanOrEqual(50)
  })

  it('scale 모드는 배율을 적용한다', async () => {
    const src = join(baseDir, 'src')
    const dst = join(baseDir, 'dst')
    const { mkdir } = await import('fs/promises')
    await mkdir(src, { recursive: true })
    await makeJpeg(join(src, 'a.jpg'), 100, 80)

    await batchResize({ sourceDir: src, targetDir: dst, mode: 'scale', scale: 0.5 })
    const meta = await sharp(join(dst, 'a.jpg')).metadata()
    expect(meta.width).toBe(50)
    expect(meta.height).toBe(40)
  })
})

describe('batchConvertFormat', () => {
  it('JPG → PNG 변환', async () => {
    const src = join(baseDir, 'src')
    const dst = join(baseDir, 'dst')
    const { mkdir } = await import('fs/promises')
    await mkdir(src, { recursive: true })
    await makeJpeg(join(src, 'a.jpg'))

    await batchConvertFormat({ sourceDir: src, targetDir: dst, format: 'png' })
    const files = await readdir(dst)
    expect(files).toContain('a.png')
    const st = await stat(join(dst, 'a.png'))
    expect(st.size).toBeGreaterThan(0)
  })

  it('PNG → WebP 변환 + 품질 옵션', async () => {
    const src = join(baseDir, 'src')
    const dst = join(baseDir, 'dst')
    const { mkdir } = await import('fs/promises')
    await mkdir(src, { recursive: true })
    const png = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } }
    })
      .png()
      .toBuffer()
    await writeFile(join(src, 'b.png'), png)

    const res = await batchConvertFormat({
      sourceDir: src,
      targetDir: dst,
      format: 'webp',
      quality: 50
    })
    expect(res.processed).toBe(1)
    const files = await readdir(dst)
    expect(files).toContain('b.webp')
  })
})
