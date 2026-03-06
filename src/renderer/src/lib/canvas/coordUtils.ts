/**
 * 순수 좌표 변환 유틸리티
 * Fabric.js 의존성 없는 순수 함수들
 */

/**
 * 이미지 bbox 좌표를 스크린 좌표로 변환
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
 * 스크린 좌표를 이미지 bbox 좌표로 변환
 */
export function screenToImage(
  screenCoords: { left: number; top: number; width: number; height: number },
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): [number, number, number, number] {
  const xmin = Math.round((screenCoords.left - imageOffsetX) / scale);
  const ymin = Math.round((screenCoords.top - imageOffsetY) / scale);
  const xmax = Math.round((screenCoords.left + screenCoords.width - imageOffsetX) / scale);
  const ymax = Math.round((screenCoords.top + screenCoords.height - imageOffsetY) / scale);
  return [xmin, ymin, xmax, ymax];
}

/**
 * 두 점에서 bbox 좌표 정규화 (xmin < xmax, ymin < ymax 보장)
 */
export function normalizeBbox(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): [number, number, number, number] {
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

/**
 * bbox → OBB [cx, cy, w, h, angle] 변환
 */
export function bboxToObb(
  bbox: [number, number, number, number],
  angle = 0
): [number, number, number, number, number] {
  const [xmin, ymin, xmax, ymax] = bbox;
  return [
    Math.round((xmin + xmax) / 2),
    Math.round((ymin + ymax) / 2),
    Math.round(xmax - xmin),
    Math.round(ymax - ymin),
    angle,
  ];
}

/**
 * OBB [cx, cy, w, h, angle] → bbox 변환 (axis-aligned, 회전 미반영)
 */
export function obbToBbox(
  obb: [number, number, number, number, number]
): [number, number, number, number] {
  const [cx, cy, width, height] = obb;
  return [
    Math.round(cx - width / 2),
    Math.round(cy - height / 2),
    Math.round(cx + width / 2),
    Math.round(cy + height / 2),
  ];
}

/**
 * OBB 렌더링에서 뱃지 앵커(좌상단) 좌표 계산
 */
export function getObbBadgeAnchor(
  obb: [number, number, number, number, number],
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): { left: number; top: number } {
  const [cx, cy, width, height, angle] = obb;
  const centerX = cx * scale + imageOffsetX;
  const centerY = cy * scale + imageOffsetY;
  const halfWidth = (width * scale) / 2;
  const halfHeight = (height * scale) / 2;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotatePoint = (x: number, y: number) => ({
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos,
  });

  const corners = [
    rotatePoint(-halfWidth, -halfHeight),
    rotatePoint(halfWidth, -halfHeight),
    rotatePoint(halfWidth, halfHeight),
    rotatePoint(-halfWidth, halfHeight),
  ];

  const topY = Math.min(...corners.map((c) => c.y));
  const topCandidates = corners.filter((c) => Math.abs(c.y - topY) < 0.001);
  const anchor = topCandidates.sort((a, b) => a.x - b.x)[0] ?? corners[0];

  return { left: anchor.x, top: anchor.y };
}
