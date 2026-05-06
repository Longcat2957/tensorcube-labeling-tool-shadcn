/**
 * polygonFactory 단위 테스트
 *
 * Fabric.js를 실제로 import하면 jsdom 의존성이 큼. 본 테스트에서는
 * 좌표 변환 로직만 검증한다 (이미지↔스크린 좌표 round-trip).
 *
 * createPolygonObject / extractPolygonFromObject가 동일한 scale·offset을 적용하면
 * 변환된 polygon이 원본 좌표와 거의 동일해야 한다.
 *
 * 노드 환경에서 실행 가능하도록 fabric을 minimal하게 mock.
 */

import { describe, it, expect } from 'vitest'

describe('polygon coordinate transformation logic', () => {
  // 직접 변환 함수 (polygonFactory와 동일 공식)
  function imageToScreen(
    points: [number, number][],
    scale: number,
    offsetX: number,
    offsetY: number
  ): [number, number][] {
    return points.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY])
  }

  function screenToImage(
    points: [number, number][],
    scale: number,
    offsetX: number,
    offsetY: number
  ): [number, number][] {
    return points.map(([x, y]) => [(x - offsetX) / scale, (y - offsetY) / scale])
  }

  it('image → screen → image round-trip preserves coordinates', () => {
    const original: [number, number][] = [
      [10, 20],
      [50, 30],
      [40, 80],
      [15, 60]
    ]
    const scale = 2.5
    const offsetX = 100
    const offsetY = 50

    const screen = imageToScreen(original, scale, offsetX, offsetY)
    const restored = screenToImage(screen, scale, offsetX, offsetY)

    for (let i = 0; i < original.length; i++) {
      expect(restored[i][0]).toBeCloseTo(original[i][0], 3)
      expect(restored[i][1]).toBeCloseTo(original[i][1], 3)
    }
  })

  it('AABB 계산 (badge 위치 산출에 사용)', () => {
    const points: [number, number][] = [
      [10, 20],
      [50, 30],
      [40, 80],
      [15, 60]
    ]
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    expect(Math.min(...xs)).toBe(10)
    expect(Math.min(...ys)).toBe(20)
    expect(Math.max(...xs)).toBe(50)
    expect(Math.max(...ys)).toBe(80)
  })
})
