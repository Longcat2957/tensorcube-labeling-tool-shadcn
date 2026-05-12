/**
 * 박스 유틸리티
 * 위치 업데이트 및 기타 유틸리티 함수
 *
 * 핵심 원칙:
 * - 모든 좌표는 이미지 픽셀 단위 (실수)
 * - 스크린 변환은 렌더링 시에만 수행
 */

import type { FabricObject } from 'fabric'
import type { BoxRect, BadgeObjects } from './styles/boxStyles.js'
import { badgeScale, BADGE_HEIGHT, BADGE_PADDING, BADGE_FONT_SIZE } from './styles/boxStyles.js'
import { bboxToScreen, obbToScreen, type ImageBBox, type ImageOBB } from './coordinates.js'

// ============================================
// 박스 위치 업데이트
// ============================================

/**
 * BB Rect 위치 업데이트
 */
export function updateBBRectPosition(
  rect: BoxRect,
  bbox: ImageBBox,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  const screen = bboxToScreen(bbox, scale, offsetX, offsetY)

  rect.set({
    left: screen.left,
    top: screen.top,
    width: screen.width,
    height: screen.height
  })

  rect.setCoords()
}

/**
 * OBB Rect 위치 업데이트
 */
export function updateOBBRectPosition(
  rect: BoxRect,
  obb: ImageOBB,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  const screen = obbToScreen(obb, scale, offsetX, offsetY)

  rect.set({
    left: screen.left,
    top: screen.top,
    width: screen.width,
    height: screen.height,
    angle: screen.angle
  })

  rect.setCoords()
}

/**
 * 통합 박스 위치 업데이트
 */
export function updateBoxPosition(
  rect: BoxRect,
  coords: ImageBBox | ImageOBB,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  if (rect.data.shape === 'bb') {
    updateBBRectPosition(rect, coords as ImageBBox, scale, offsetX, offsetY)
  } else {
    updateOBBRectPosition(rect, coords as ImageOBB, scale, offsetX, offsetY)
  }
}

// ============================================
// 뱃지 위치 업데이트
// ============================================

/**
 * 뱃지 위치 업데이트
 * bbox의 left-top point 위쪽에 표시.
 * userScale: 사용자 슬라이더 크기 가중치. 0이면 visible=false.
 */
export function updateBadgePosition(
  badge: BadgeObjects,
  coords: ImageBBox | ImageOBB,
  scale: number,
  offsetX: number,
  offsetY: number,
  isBB: boolean,
  className: string = '',
  userScale: number = 1
): void {
  let leftX: number, topY: number

  if (isBB) {
    // BB: left-top point
    const [xmin, ymin] = coords as ImageBBox
    leftX = xmin
    topY = ymin
  } else {
    // OBB: 4코너 중 화면상 가장 위쪽(topmost) 코너 찾기
    const [cx, cy, w, h, angle] = coords as ImageOBB
    const rad = (angle * Math.PI) / 180
    const halfW = w / 2
    const halfH = h / 2
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const corners = [
      { x: cx + -halfW * cos - -halfH * sin, y: cy + -halfW * sin + -halfH * cos },
      { x: cx + halfW * cos - -halfH * sin, y: cy + halfW * sin + -halfH * cos },
      { x: cx + -halfW * cos - halfH * sin, y: cy + -halfW * sin + halfH * cos },
      { x: cx + halfW * cos - halfH * sin, y: cy + halfW * sin + halfH * cos }
    ]
    const topmost = corners.reduce((a, b) => (a.y < b.y ? a : b))
    leftX = topmost.x
    topY = topmost.y
  }

  const bs = badgeScale(scale, userScale)
  const visible = userScale > 0
  const screenX = leftX * scale + offsetX
  const screenY = topY * scale + offsetY - BADGE_HEIGHT * bs

  // 모든 길이는 한 번만 bs 로 스케일. textWidth 는 실제 렌더 폰트 크기(BADGE_FONT_SIZE * bs)
  // 기준이라 여기에 다시 bs를 곱하지 않는다 — 이중 스케일 방지.
  const textWidth = className.length * BADGE_FONT_SIZE * 0.6 * bs
  const badgeWidth = BADGE_PADDING * 2 * bs + textWidth

  badge.background.set({
    left: screenX,
    top: screenY,
    width: badgeWidth,
    height: BADGE_HEIGHT * bs,
    rx: 3 * bs,
    ry: 3 * bs,
    visible
  })

  badge.text.set({
    left: screenX + BADGE_PADDING * bs,
    top: screenY + (BADGE_HEIGHT / 2) * bs,
    fontSize: BADGE_FONT_SIZE * bs,
    visible
  })
}

// ============================================
// 스크린 좌표에서 이미지 좌표로 변환 (수정 완료 후)
// ============================================

/**
 * Fabric.js Rect에서 BB 좌표 추출 (수정 완료 후 호출)
 * BB: originX='left', originY='top'
 */
export function extractBBoxFromRect(
  rect: FabricObject,
  scale: number,
  offsetX: number,
  offsetY: number
): ImageBBox {
  const left = (rect.left - offsetX) / scale
  const top = (rect.top - offsetY) / scale
  const width = (rect.width * rect.scaleX) / scale
  const height = (rect.height * rect.scaleY) / scale

  return [left, top, left + width, top + height]
}

/**
 * Fabric.js Rect에서 OBB 좌표 추출 (수정 완료 후 호출)
 * OBB: originX='center', originY='center'
 */
export function extractOBBFromRect(
  rect: FabricObject,
  scale: number,
  offsetX: number,
  offsetY: number
): ImageOBB {
  const cx = (rect.left - offsetX) / scale
  const cy = (rect.top - offsetY) / scale
  const width = (rect.width * rect.scaleX) / scale
  const height = (rect.height * rect.scaleY) / scale
  const angle = rect.angle

  return [cx, cy, width, height, angle]
}
