/**
 * 좌표 변환 유틸리티
 * 이미지 픽셀 좌표와 스크린 좌표 간 변환
 */

/**
 * 이미지 좌표를 스크린 좌표로 변환
 * @param imageCoords - 이미지 픽셀 좌표 [xmin, ymin, xmax, ymax]
 * @param scale - 현재 줌 스케일
 * @param imageOffsetX - 이미지의 화면상 좌상단 X 좌표
 * @param imageOffsetY - 이미지의 화면상 좌상단 Y 좌표
 */
export function imageToScreen(
  imageCoords: [number, number, number, number],
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): { left: number; top: number; width: number; height: number } {
  const [xmin, ymin, xmax, ymax] = imageCoords;
  return {
    left: xmin * scale + imageOffsetX,
    top: ymin * scale + imageOffsetY,
    width: (xmax - xmin) * scale,
    height: (ymax - ymin) * scale,
  };
}

/**
 * 스크린 좌표를 이미지 좌표로 변환
 * @param screenCoords - 스크린 좌표 { left, top, width, height }
 * @param scale - 현재 줌 스케일
 * @param imageOffsetX - 이미지의 화면상 좌상단 X 좌표
 * @param imageOffsetY - 이미지의 화면상 좌상단 Y 좌표
 */
export function screenToImage(
  screenCoords: { left: number; top: number; width: number; height: number },
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): [number, number, number, number] {
  const xmin = (screenCoords.left - imageOffsetX) / scale;
  const ymin = (screenCoords.top - imageOffsetY) / scale;
  const xmax = (screenCoords.left + screenCoords.width - imageOffsetX) / scale;
  const ymax = (screenCoords.top + screenCoords.height - imageOffsetY) / scale;
  return [xmin, ymin, xmax, ymax];
}

/**
 * 두 점에서 bbox 좌표 계산 (정규화: xmin < xmax, ymin < ymax)
 */
export function normalizeBbox(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): [number, number, number, number] {
  return [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.max(x1, x2),
    Math.max(y1, y2),
  ];
}

/**
 * BBOX를 OBB로 변환 (angle=0)
 */
export function bboxToObb(
  bbox: [number, number, number, number],
  angle = 0
): [number, number, number, number, number] {
  const [xmin, ymin, xmax, ymax] = bbox;
  return [
    (xmin + xmax) / 2,
    (ymin + ymax) / 2,
    xmax - xmin,
    ymax - ymin,
    angle,
  ];
}

/**
 * OBB를 BBOX로 변환 (회전 고려 안함)
 */
export function obbToBbox(
  obb: [number, number, number, number, number]
): [number, number, number, number] {
  const [cx, cy, width, height] = obb;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return [
    cx - halfWidth,
    cy - halfHeight,
    cx + halfWidth,
    cy + halfHeight,
  ];
}

/**
 * 스크린 좌표에서 OBB 좌표로 변환 (회전 박스용)
 */
export function screenToObb(
  rect: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    scaleX?: number;
    scaleY?: number;
    angle?: number;
  },
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): [number, number, number, number, number] {
  const width = ((rect.width ?? 0) * (rect.scaleX ?? 1)) / scale;
  const height = ((rect.height ?? 0) * (rect.scaleY ?? 1)) / scale;
  const cx = ((rect.left ?? 0) - imageOffsetX) / scale;
  const cy = ((rect.top ?? 0) - imageOffsetY) / scale;
  const angle = rect.angle ?? 0;

  return [cx, cy, width, height, angle];
}

/**
 * Fabric.js Rect에서 정확한 BB 좌표 추출 (strokeWidth 보정 포함)
 * BB는 originX: 'left', originY: 'top' 사용
 * strokeWidth가 중심에 그려지므로 실제 박스 크기에서 보정 필요
 */
export function getAccurateBBoxFromRect(
  rect: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    scaleX?: number;
    scaleY?: number;
    strokeWidth?: number;
  },
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): [number, number, number, number] {
  const strokeWidth = rect.strokeWidth ?? 2;
  
  // Fabric.js에서 strokeWidth는 경계 중심에 그려짐
  // 실제 픽셀 좌표에서 스트로크 두께의 절반만큼 보정
  const pixelLeft = (rect.left ?? 0) + strokeWidth / 2;
  const pixelTop = (rect.top ?? 0) + strokeWidth / 2;
  const pixelWidth = (rect.width ?? 0) * (rect.scaleX ?? 1) - strokeWidth;
  const pixelHeight = (rect.height ?? 0) * (rect.scaleY ?? 1) - strokeWidth;

  return screenToImage(
    { left: pixelLeft, top: pixelTop, width: pixelWidth, height: pixelHeight },
    scale,
    imageOffsetX,
    imageOffsetY
  );
}

/**
 * Fabric.js Rect에서 정확한 OBB 좌표 추출 (strokeWidth 보정 포함)
 * OBB는 originX: 'center', originY: 'center' 사용
 */
export function getAccurateOBBFromRect(
  rect: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    scaleX?: number;
    scaleY?: number;
    angle?: number;
    strokeWidth?: number;
  },
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): [number, number, number, number, number] {
  const strokeWidth = rect.strokeWidth ?? 2;
  
  // OBB는 center origin이므로 left/top이 중심점
  // width/height에서 스트로크 두께를 뺌
  const pixelWidth = (rect.width ?? 0) * (rect.scaleX ?? 1) - strokeWidth;
  const pixelHeight = (rect.height ?? 0) * (rect.scaleY ?? 1) - strokeWidth;
  
  const cx = ((rect.left ?? 0) - imageOffsetX) / scale;
  const cy = ((rect.top ?? 0) - imageOffsetY) / scale;
  const width = pixelWidth / scale;
  const height = pixelHeight / scale;
  const angle = rect.angle ?? 0;

  return [cx, cy, width, height, angle];
}
