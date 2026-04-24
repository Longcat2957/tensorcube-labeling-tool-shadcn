import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  shuffleArray,
  sanitizeExportName,
  assignSplits,
  scaleBbox,
  scaleObb,
  normalizeBboxForYolo,
  isBboxOutOfBounds,
  clampBbox,
  clampYoloNormalized,
  isObbOutOfBounds,
  clampObb,
  applyOutOfBoundsPolicyToBbox,
  applyOutOfBoundsPolicyToYolo,
  applyOutOfBoundsPolicyToObb
} from '../src/main/services/export/utils'

function makeItems(n: number): Array<{ imageId: string; split: 'train' | 'val' | 'test' }> {
  return Array.from({ length: n }, (_, i) => ({
    imageId: String(i + 1).padStart(9, '0'),
    split: 'train' as const
  }))
}

describe('sanitizeExportName', () => {
  it('strips disallowed path chars', () => {
    expect(sanitizeExportName('hello/world:foo*bar?')).toBe('hello-world-foo-bar-')
  })
  it('trims whitespace', () => {
    expect(sanitizeExportName('  spaced  ')).toBe('spaced')
  })
})

describe('shuffleArray', () => {
  beforeEach(() => {
    // Math.random을 결정적 시퀀스로 대체 (시드 고정 동작)
    let seed = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('produces a deterministic permutation under seeded Math.random', () => {
    const arr = [1, 2, 3, 4, 5]
    shuffleArray(arr)
    // 같은 시드로 두 번 섞어도 같은 결과가 나와야 한다 (별도 배열에)
    const arr2 = [1, 2, 3, 4, 5]
    // reset seed via restoring + respying
    vi.restoreAllMocks()
    let seed = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    })
    shuffleArray(arr2)
    expect(arr2).toEqual(arr)
    expect(arr).toHaveLength(5)
    expect(new Set(arr)).toEqual(new Set([1, 2, 3, 4, 5]))
  })
})

describe('assignSplits', () => {
  it('allocates counts matching ratios', () => {
    const items = makeItems(100)
    assignSplits(items as any, { train: 80, val: 10, test: 10 })
    const counts = { train: 0, val: 0, test: 0 }
    for (const it of items) counts[it.split]++
    expect(counts.train).toBe(80)
    expect(counts.val).toBe(10)
    expect(counts.test).toBe(10)
  })

  it('normalizes non-100 ratios', () => {
    const items = makeItems(10)
    assignSplits(items as any, { train: 8, val: 1, test: 1 })
    const counts = { train: 0, val: 0, test: 0 }
    for (const it of items) counts[it.split]++
    expect(counts.train).toBe(8)
    expect(counts.val).toBe(1)
    expect(counts.test).toBe(1)
  })

  it('guarantees at least 1 per non-zero split when total >= non-zero-split count', () => {
    const items = makeItems(3)
    assignSplits(items as any, { train: 98, val: 1, test: 1 })
    const counts = { train: 0, val: 0, test: 0 }
    for (const it of items) counts[it.split]++
    expect(counts.train + counts.val + counts.test).toBe(3)
    expect(counts.train).toBeGreaterThanOrEqual(1)
    expect(counts.val).toBeGreaterThanOrEqual(1)
    expect(counts.test).toBeGreaterThanOrEqual(1)
  })

  it('skips min-guarantee when total < non-zero-split count', () => {
    // 2 items with 3 non-zero splits — 최소 보장 불가능, 그대로 분배
    const items = makeItems(2)
    assignSplits(items as any, { train: 50, val: 25, test: 25 })
    const counts = { train: 0, val: 0, test: 0 }
    for (const it of items) counts[it.split]++
    expect(counts.train + counts.val + counts.test).toBe(2)
  })

  it('distributes evenly when ratios are equal', () => {
    const items = makeItems(9)
    assignSplits(items as any, { train: 1, val: 1, test: 1 })
    const counts = { train: 0, val: 0, test: 0 }
    for (const it of items) counts[it.split]++
    expect(counts.train).toBe(3)
    expect(counts.val).toBe(3)
    expect(counts.test).toBe(3)
  })

  it('respects 0% split = 0 count', () => {
    const items = makeItems(10)
    assignSplits(items as any, { train: 100, val: 0, test: 0 })
    const counts = { train: 0, val: 0, test: 0 }
    for (const it of items) counts[it.split]++
    expect(counts.train).toBe(10)
    expect(counts.val).toBe(0)
    expect(counts.test).toBe(0)
  })

  it('is a no-op on empty items', () => {
    const items: any[] = []
    assignSplits(items, { train: 70, val: 20, test: 10 })
    expect(items).toEqual([])
  })
})

describe('scaleBbox / scaleObb', () => {
  it('scales bbox proportionally', () => {
    const r = scaleBbox(
      [100, 200, 300, 400],
      { width: 1000, height: 1000 },
      { width: 500, height: 500 }
    )
    expect(r).toEqual({ x1: 50, y1: 100, x2: 150, y2: 200 })
  })

  it('scales obb and preserves angle', () => {
    const r = scaleObb(
      [100, 200, 40, 20, 30],
      { width: 1000, height: 1000 },
      { width: 500, height: 500 }
    )
    expect(r.cx).toBe(50)
    expect(r.cy).toBe(100)
    expect(r.width).toBe(20)
    expect(r.height).toBe(10)
    expect(r.angle).toBe(30)
  })
})

describe('normalizeBboxForYolo', () => {
  it('produces (cx, cy, w, h) in [0,1]', () => {
    const r = normalizeBboxForYolo(
      { x1: 100, y1: 200, x2: 300, y2: 400 },
      { width: 1000, height: 1000 }
    )
    expect(r.cx).toBeCloseTo(0.2)
    expect(r.cy).toBeCloseTo(0.3)
    expect(r.width).toBeCloseTo(0.2)
    expect(r.height).toBeCloseTo(0.2)
  })
})

describe('bbox out-of-bounds helpers', () => {
  const imgSize = { width: 1000, height: 1000 }

  it('detects out-of-bounds bbox', () => {
    expect(isBboxOutOfBounds({ x1: -5, y1: 0, x2: 100, y2: 100 }, imgSize)).toBe(true)
    expect(isBboxOutOfBounds({ x1: 0, y1: 0, x2: 1001, y2: 100 }, imgSize)).toBe(true)
    expect(isBboxOutOfBounds({ x1: 0, y1: 0, x2: 100, y2: 100 }, imgSize)).toBe(false)
  })

  it('clamps bbox to image', () => {
    expect(clampBbox({ x1: -10, y1: -5, x2: 1500, y2: 2000 }, imgSize)).toEqual({
      x1: 0,
      y1: 0,
      x2: 1000,
      y2: 1000
    })
  })

  it('applies outOfBounds policy correctly', () => {
    const out = { x1: -10, y1: 0, x2: 100, y2: 100 }
    expect(applyOutOfBoundsPolicyToBbox(out, imgSize, 'none')).toEqual(out)
    expect(applyOutOfBoundsPolicyToBbox(out, imgSize, 'skip')).toBeNull()
    expect(applyOutOfBoundsPolicyToBbox(out, imgSize, 'clip')).toEqual({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100
    })
  })
})

describe('yolo normalized clamping', () => {
  it('clamps within [0,1] preserving sanity', () => {
    const r = clampYoloNormalized({ cx: 1.5, cy: -0.2, width: 0.4, height: 0.4 })
    expect(r.cx).toBeLessThanOrEqual(1)
    expect(r.cx).toBeGreaterThanOrEqual(0)
    expect(r.cy).toBeLessThanOrEqual(1)
    expect(r.cy).toBeGreaterThanOrEqual(0)
    expect(r.width).toBeGreaterThanOrEqual(0)
    expect(r.height).toBeGreaterThanOrEqual(0)
  })

  it('policy skip returns null for out-of-bound normalized', () => {
    const r = applyOutOfBoundsPolicyToYolo({ cx: 1.5, cy: 0.5, width: 0.1, height: 0.1 }, 'skip')
    expect(r).toBeNull()
  })
})

describe('obb out-of-bounds helpers', () => {
  const imgSize = { width: 1000, height: 1000 }

  it('treats small rotation overflow as normal (not out-of-bounds)', () => {
    // 중심점이 이미지 내부, 코너가 약간 밖이어도 정상
    expect(
      isObbOutOfBounds({ cx: 500, cy: 500, width: 200, height: 100, angle: 30 }, imgSize)
    ).toBe(false)
  })

  it('flags center far outside image as out-of-bounds', () => {
    expect(
      isObbOutOfBounds({ cx: 5000, cy: 500, width: 100, height: 100, angle: 0 }, imgSize)
    ).toBe(true)
  })

  it('flags zero-size obb as out-of-bounds', () => {
    expect(isObbOutOfBounds({ cx: 500, cy: 500, width: 0, height: 100, angle: 0 }, imgSize)).toBe(
      true
    )
  })

  it('clamps obb center to keep bbox inside', () => {
    const r = clampObb({ cx: -50, cy: 1100, width: 200, height: 100, angle: 0 }, imgSize)
    expect(r.cx).toBe(100) // halfW=100
    expect(r.cy).toBe(950) // imgH - halfH
    expect(r.width).toBe(200)
    expect(r.height).toBe(100)
  })

  it('policy dispatch for obb', () => {
    const bad = { cx: 5000, cy: 500, width: 100, height: 100, angle: 0 }
    expect(applyOutOfBoundsPolicyToObb(bad, imgSize, 'none')).toEqual(bad)
    expect(applyOutOfBoundsPolicyToObb(bad, imgSize, 'skip')).toBeNull()
  })
})
