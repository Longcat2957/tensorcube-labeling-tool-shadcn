/**
 * 박스 스타일 유틸리티
 *
 * 핵심 원칙:
 * - strokeWidth=0으로 설정 (Fabric.js 스트로크 보정 문제 제거)
 * - 테두리는 별도 레이어로 처리하지 않고, stroke 직접 사용
 * - 모든 좌표는 실수 기반
 */

import type { FabricObject } from 'fabric'
import { Shadow } from 'fabric'

// ============================================
// 타입 정의
// ============================================

/** 클래스 ID에 따른 색상 */
export function getClassColor(classId: number): string {
  const colors = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#22c55e', // green
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1' // indigo
  ]
  return colors[classId % colors.length]
}

/** hex 색상을 rgba로 변환 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ============================================
// 박스 스타일 상수
// ============================================

/** 기본 박스 스타일 */
export const BOX_STYLE = {
  strokeWidth: 2, // 테두리 두께
  strokeOpacity: 1, // 테두리 불투명도
  fillOpacity: 0.15 // 채우기 불투명도
} as const

/** 선택된 박스 스타일 */
export const BOX_STYLE_SELECTED = {
  strokeWidth: 3,
  strokeOpacity: 1,
  fillOpacity: 0.25
} as const

// ============================================
// Fabric.js Rect 타입 확장
// ============================================

/** 박스 데이터 메타데이터 */
export interface BoxData {
  id: string
  classId: number
  color: string
  type: 'label'
  shape: 'bb' | 'obb'
}

/** 박스 Rect 타입 */
export type BoxRect = FabricObject & {
  data: BoxData
}

/** 뱃지 객체 */
export interface BadgeObjects {
  background: FabricObject
  text: FabricObject
}

// ============================================
// 스타일 적용 함수
// ============================================

/**
 * 박스 선택 상태 스타일 적용
 */
export function applySelectedStyle(rect: BoxRect, selected: boolean): void {
  const color = rect.data.color

  if (selected) {
    rect.set({
      stroke: '#ffffff',
      strokeWidth: BOX_STYLE_SELECTED.strokeWidth,
      fill: hexToRgba(color, BOX_STYLE_SELECTED.fillOpacity),
      shadow: new Shadow({
        color: hexToRgba(color, 0.8),
        blur: 12,
        offsetX: 0,
        offsetY: 0
      }),
      cornerColor: '#ffffff',
      cornerStrokeColor: color,
      cornerSize: 11
    })
  } else {
    rect.set({
      stroke: color,
      strokeWidth: BOX_STYLE.strokeWidth,
      fill: hexToRgba(color, BOX_STYLE.fillOpacity),
      shadow: null,
      cornerColor: '#ffffff',
      cornerStrokeColor: color,
      cornerSize: 9
    })
  }

  // OBB 모드에서는 회전 컨트롤 항상 표시, BB 모드에서는 항상 숨김
  if (rect.data.shape === 'obb') {
    rect.setControlVisible('mtr', true)
  } else {
    rect.setControlVisible('mtr', false)
  }

  rect.setCoords()
}

// ============================================
// 뱃지 상수
// ============================================

export const BADGE_HEIGHT = 22
export const BADGE_PADDING = 8
export const BADGE_FONT_SIZE = 12
export const BADGE_MIN_SCALE = 0.5

/** 뱃지 스케일링: 제곱근 기반으로 축소 시 덜 줄어들고 확대 시 덜 커지도록 보정 */
export function badgeScale(scale: number): number {
  return Math.max(Math.sqrt(scale), BADGE_MIN_SCALE)
}
