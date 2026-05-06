/**
 * Polygon 팩토리
 * Fabric.js Polygon 객체 생성 + 좌표 추출
 *
 * 핵심 원칙:
 * - 어노테이션의 polygon은 이미지 픽셀 좌표 (실수)
 * - 캔버스 표시 시에는 scale + offset 적용
 * - Phase 14b v1: 이동만 허용, 스케일/회전 비활성화 (정점 편집은 후속)
 */

import { Polygon, Point, util as fabricUtil } from 'fabric'
import type { PolygonAnnotation } from '../../../../shared/types'
import { getClassColor, hexToRgba, BOX_STYLE, type BoxRect } from './styles/boxStyles.js'

/**
 * 어노테이션의 polygon 좌표(이미지 픽셀)를 스크린 좌표로 변환해 Fabric Polygon을 생성한다.
 */
export function createPolygonObject(
  annotation: PolygonAnnotation,
  scale: number,
  offsetX: number,
  offsetY: number
): BoxRect {
  const color = getClassColor(annotation.class_id)
  const screenPoints = annotation.polygon.map(([x, y]) => ({
    x: x * scale + offsetX,
    y: y * scale + offsetY
  }))

  const polygon = new Polygon(screenPoints, {
    stroke: color,
    strokeWidth: BOX_STYLE.strokeWidth,
    fill: hexToRgba(color, BOX_STYLE.fillOpacity),
    objectCaching: false,
    selectable: true,
    hasControls: true,
    hasBorders: true,
    cornerColor: '#ffffff',
    cornerStrokeColor: color,
    cornerSize: 9,
    cornerStyle: 'circle',
    transparentCorners: false,
    hoverCursor: 'move',
    // v1: 이동만 허용. 스케일/회전 잠금 (정점 편집은 후속).
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true
  })

  ;(polygon as unknown as BoxRect).data = {
    id: annotation.id,
    classId: annotation.class_id,
    color,
    type: 'label',
    shape: 'polygon'
  }

  return polygon as unknown as BoxRect
}

/**
 * Fabric Polygon에서 이미지 픽셀 좌표 polygon 배열 추출.
 * 이동 후 polygon.left/top이 변하므로 transform matrix를 통해 정확한 world 좌표를 얻은 뒤
 * scale/offset을 역변환한다.
 */
export function extractPolygonFromObject(
  obj: BoxRect,
  scale: number,
  offsetX: number,
  offsetY: number
): [number, number][] {
  const polygon = obj as unknown as Polygon
  const points = polygon.points ?? []
  const matrix = polygon.calcTransformMatrix()
  const pathOffset = polygon.pathOffset

  return points.map((p) => {
    const local = new Point(p.x - pathOffset.x, p.y - pathOffset.y)
    const world = local.transform(matrix)
    return [(world.x - offsetX) / scale, (world.y - offsetY) / scale] as [number, number]
  })
}

/** 회전·스케일 변경 후 폴리곤 위치 갱신 */
export function updatePolygonPosition(
  obj: BoxRect,
  imagePoints: [number, number][],
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  const polygon = obj as unknown as Polygon
  const screenPoints = imagePoints.map(
    ([x, y]) => new Point(x * scale + offsetX, y * scale + offsetY)
  )
  polygon.set({ points: screenPoints })

  // pathOffset 재계산 — Fabric은 points 변경 시 자동으로 갱신하지 않음
  if (screenPoints.length > 0) {
    const xs = screenPoints.map((p) => p.x)
    const ys = screenPoints.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    polygon.set({
      left: minX,
      top: minY,
      pathOffset: new Point((minX + maxX) / 2, (minY + maxY) / 2),
      width: maxX - minX,
      height: maxY - minY
    })
  }
  polygon.setCoords()
}

// fabricUtil 미사용이지만 polygon transform 연산에 필요해 import. eslint silence.
void fabricUtil
