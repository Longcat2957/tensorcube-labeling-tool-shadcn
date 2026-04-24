/**
 * 좌표 변환 유틸리티
 * 이미지 픽셀 좌표와 스크린 좌표 간 변환
 *
 * 핵심 원칙:
 * - 모든 좌표는 실수로 저장 (Math.round 사용 안함)
 * - 이미지 좌표 = 원본 픽셀 좌표
 * - 스크린 좌표 = Fabric.js 캔버스 좌표
 */

// ============================================
// 타입 정의
// ============================================

/** 이미지 좌표 (픽셀 단위, 실수) */
export interface ImageCoords {
  x: number
  y: number
}

/** 이미지 BBox (xmin, ymin, xmax, ymax, 실수) */
export type ImageBBox = [number, number, number, number]

/** 이미지 OBB (cx, cy, width, height, angle, 실수) */
export type ImageOBB = [number, number, number, number, number]

/** 스크린 좌표 (Fabric.js 캔버스 좌표) */
export interface ScreenCoords {
  left: number
  top: number
  width: number
  height: number
}

// ============================================
// 기본 변환 함수
// ============================================

/**
 * 이미지 BBox를 스크린 좌표로 변환
 * BB: originX='left', originY='top'
 */
export function bboxToScreen(
  bbox: ImageBBox,
  scale: number,
  offsetX: number,
  offsetY: number
): ScreenCoords {
  const [xmin, ymin, xmax, ymax] = bbox
  return {
    left: xmin * scale + offsetX,
    top: ymin * scale + offsetY,
    width: (xmax - xmin) * scale,
    height: (ymax - ymin) * scale
  }
}

/**
 * 스크린 좌표를 이미지 BBox로 변환
 */
export function screenToBbox(
  screen: ScreenCoords,
  scale: number,
  offsetX: number,
  offsetY: number
): ImageBBox {
  const xmin = (screen.left - offsetX) / scale
  const ymin = (screen.top - offsetY) / scale
  const xmax = (screen.left + screen.width - offsetX) / scale
  const ymax = (screen.top + screen.height - offsetY) / scale
  return [xmin, ymin, xmax, ymax]
}

/**
 * 이미지 OBB를 스크린 좌표로 변환
 * OBB: originX='center', originY='center'
 */
export function obbToScreen(
  obb: ImageOBB,
  scale: number,
  offsetX: number,
  offsetY: number
): { left: number; top: number; width: number; height: number; angle: number } {
  const [cx, cy, width, height, angle] = obb
  return {
    left: cx * scale + offsetX,
    top: cy * scale + offsetY,
    width: width * scale,
    height: height * scale,
    angle
  }
}

/**
 * 스크린 좌표를 이미지 OBB로 변환
 */
export function screenToObb(
  screen: { left: number; top: number; width: number; height: number; angle: number },
  scale: number,
  offsetX: number,
  offsetY: number
): ImageOBB {
  const cx = (screen.left - offsetX) / scale
  const cy = (screen.top - offsetY) / scale
  const width = screen.width / scale
  const height = screen.height / scale
  const angle = screen.angle
  return [cx, cy, width, height, angle]
}

// ============================================
// 팩토리 함수
// ============================================

/**
 * 두 점으로 BBox 생성 (드로잉 완료 시)
 */
export function createBboxFromPoints(x1: number, y1: number, x2: number, y2: number): ImageBBox {
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]
}

/**
 * BBox를 OBB로 변환 (회전 없음)
 */
export function bboxToObb(bbox: ImageBBox, angle: number = 0): ImageOBB {
  const [xmin, ymin, xmax, ymax] = bbox
  return [(xmin + xmax) / 2, (ymin + ymax) / 2, xmax - xmin, ymax - ymin, angle]
}

/**
 * OBB를 BBox로 변환 (회전 무시)
 */
export function obbToBbox(obb: ImageOBB): ImageBBox {
  const [cx, cy, width, height] = obb
  const halfW = width / 2
  const halfH = height / 2
  return [cx - halfW, cy - halfH, cx + halfW, cy + halfH]
}

// ============================================
// 스케일 변환
// ============================================

/**
 * 픽셀 좌표를 이미지 좌표로 변환 (마우스 좌표 등)
 */
export function pixelToImage(
  pixelX: number,
  pixelY: number,
  scale: number,
  offsetX: number,
  offsetY: number
): ImageCoords {
  return {
    x: (pixelX - offsetX) / scale,
    y: (pixelY - offsetY) / scale
  }
}

/**
 * 이미지 좌표를 픽셀 좌표로 변환
 */
export function imageToPixel(
  imageX: number,
  imageY: number,
  scale: number,
  offsetX: number,
  offsetY: number
): ImageCoords {
  return {
    x: imageX * scale + offsetX,
    y: imageY * scale + offsetY
  }
}
