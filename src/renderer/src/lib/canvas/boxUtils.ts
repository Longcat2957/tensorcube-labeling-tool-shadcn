/**
 * 박스 유틸리티 함수
 * 위치 업데이트 및 기타 유틸리티
 */

import type { LabelBoxRect, LabelBadgeObjects } from "./boxFactory.js";
import { imageToScreen, screenToObb } from "./coordinates.js";

/**
 * 박스 위치 업데이트 (줌/패닝 후)
 */
export function updateBoxPosition(
  rect: LabelBoxRect,
  coords: [number, number, number, number] | [number, number, number, number, number],
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): void {
  if (rect.data.shape === 'obb' && coords.length === 5) {
    const [cx, cy, width, height, angle] = coords;
    rect.set({
      left: cx * scale + imageOffsetX,
      top: cy * scale + imageOffsetY,
      width: width * scale,
      height: height * scale,
      scaleX: 1,
      scaleY: 1,
      angle,
      originX: 'center',
      originY: 'center',
    });
  } else {
    const bbox = coords as [number, number, number, number];
    const screenCoords = imageToScreen(bbox, scale, imageOffsetX, imageOffsetY);
    rect.set({
      left: screenCoords.left,
      top: screenCoords.top,
      width: screenCoords.width,
      height: screenCoords.height,
      scaleX: 1,
      scaleY: 1,
      originX: 'left',
      originY: 'top',
      angle: 0,
    });
  }
  rect.setCoords();
}

/**
 * OBB 뱃지 앵커 위치 계산
 */
function getObbBadgeAnchor(
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

  const topY = Math.min(...corners.map((corner) => corner.y));
  const topCandidates = corners.filter((corner) => Math.abs(corner.y - topY) < 0.001);
  const anchor = topCandidates.sort((a, b) => a.x - b.x)[0] ?? corners[0];

  return {
    left: anchor.x,
    top: anchor.y,
  };
}

/**
 * 라벨 뱃지 위치 업데이트
 */
export function updateLabelBadgePosition(
  badge: LabelBadgeObjects,
  coords: [number, number, number, number] | [number, number, number, number, number],
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): void {
  const LABEL_BADGE_HEIGHT = 22;
  const LABEL_BADGE_HORIZONTAL_PADDING = 8;

  const screenAnchor = coords.length === 5
    ? getObbBadgeAnchor(coords, scale, imageOffsetX, imageOffsetY)
    : imageToScreen(coords, scale, imageOffsetX, imageOffsetY);
  const textWidth = badge.text.width ?? 0;

  badge.background.set({
    left: screenAnchor.left,
    top: screenAnchor.top - LABEL_BADGE_HEIGHT,
    width: Math.max(48, textWidth + LABEL_BADGE_HORIZONTAL_PADDING * 2),
  });

  badge.text.set({
    left: screenAnchor.left + LABEL_BADGE_HORIZONTAL_PADDING,
    top: screenAnchor.top - LABEL_BADGE_HEIGHT + 5,
  });

  badge.background.setCoords();
  badge.text.setCoords();
}

/**
 * OBB 박스 수정 후 정규화
 */
export function normalizeObbRectAfterModify(
  rect: LabelBoxRect,
  obb: [number, number, number, number, number],
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): void {
  const [cx, cy, width, height, angle] = obb;

  rect.set({
    left: cx * scale + imageOffsetX,
    top: cy * scale + imageOffsetY,
    width: width * scale,
    height: height * scale,
    scaleX: 1,
    scaleY: 1,
    angle,
    originX: 'center',
    originY: 'center',
  });

  rect.setCoords();
}