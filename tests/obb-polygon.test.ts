import { describe, it, expect } from 'vitest'
import { obbToPolygon } from '../src/main/services/export/utils'

function closeArr(actual: number[], expected: number[], tol = 1e-6): void {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tol)
  }
}

describe('obbToPolygon (DOTA 4-corner)', () => {
  it('angle=0: axis-aligned rectangle corners', () => {
    // 중심 (100, 200), 폭 40, 높이 20, 회전 0
    // 코너는 TL, TR, BR, BL 순: 로컬 (-20,-10),(20,-10),(20,10),(-20,10)
    const poly = obbToPolygon({ cx: 100, cy: 200, width: 40, height: 20, angle: 0 })
    closeArr(Array.from(poly), [80, 190, 120, 190, 120, 210, 80, 210])
  })

  it('angle=90: 4-corner rotated by 90° CCW mapping (x→-y, y→x in image coords)', () => {
    // 로컬 (-20,-10) 회전90 → (-(-10), -20)·(-20) = … 실제 행렬:
    // [cos -sin; sin cos] 적용. angle=90 → cos=0, sin=1
    // (-20,-10) → (0·-20 - 1·-10, 1·-20 + 0·-10) = (10, -20)
    // 즉 월드 좌표: (cx+10, cy-20) = (110, 180)
    const poly = obbToPolygon({ cx: 100, cy: 200, width: 40, height: 20, angle: 90 })
    closeArr(Array.from(poly), [110, 180, 110, 220, 90, 220, 90, 180])
  })

  it('angle=180: equivalent to flipping corners', () => {
    const poly = obbToPolygon({ cx: 100, cy: 200, width: 40, height: 20, angle: 180 })
    // (-20,-10) → (20, 10); (20,-10) → (-20, 10); (20,10) → (-20,-10); (-20,10) → (20,-10)
    closeArr(Array.from(poly), [120, 210, 80, 210, 80, 190, 120, 190])
  })

  it('angle=45: known diagonal', () => {
    // 폭 2, 높이 0인 가상의 선분: 코너 (-1,0),(1,0),(1,0),(-1,0)
    // 회전 45: (x,y)→(x·cos - y·sin, x·sin + y·cos)
    // (-1,0) → (-√2/2, -√2/2), (1,0) → (√2/2, √2/2)
    const poly = obbToPolygon({ cx: 0, cy: 0, width: 2, height: 0, angle: 45 })
    const s = Math.SQRT2 / 2
    closeArr(Array.from(poly), [-s, -s, s, s, s, s, -s, -s])
  })

  it('preserves corner count (8 numbers)', () => {
    const poly = obbToPolygon({ cx: 50, cy: 75, width: 30, height: 40, angle: 17 })
    expect(poly.length).toBe(8)
    for (const v of poly) expect(Number.isFinite(v)).toBe(true)
  })
})
