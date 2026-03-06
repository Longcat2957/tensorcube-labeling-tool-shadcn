/**
 * 박스 렌더링 유틸리티
 * Fabric.js 기반 Bounding Box 생성 및 좌표 변환
 */

import { Rect, Text, Shadow } from "fabric";
import type { BBAnnotation, OBBAnnotation } from "../stores/workspace.svelte.js";

// 클래스별 색상 반환
export function getClassColor(classId: number): string {
  const colors = [
    "#3b82f6",
    "#ef4444",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
    "#f97316",
    "#6366f1",
  ];
  return colors[classId % colors.length];
}

/** hex 색상 + 알파 → rgba 문자열 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 박스 스타일 옵션
export interface BoxStyleOptions {
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
}

export interface LabelBoxData {
  id: string;
  classId: number;
  color: string;
  type: "label";
  shape: "bb" | "obb";
}

export type LabelBoxRect = Rect & {
  data: LabelBoxData;
};

export interface LabelBadgeObjects {
  background: Rect;
  text: Text;
}

// 기본 박스 스타일 (normal)
const DEFAULT_BOX_STYLE: BoxStyleOptions = {
  strokeWidth: 2,
  opacity: 1,
  fillOpacity: 0.12,
};

const LABEL_BADGE_HEIGHT = 22;
const LABEL_BADGE_HORIZONTAL_PADDING = 8;
const LABEL_BADGE_FONT_SIZE = 12;

function buildLabelText(className: string, classId: number): string {
  return className.trim() || `Class ${classId}`;
}

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
  const xmin = Math.round((screenCoords.left - imageOffsetX) / scale);
  const ymin = Math.round((screenCoords.top - imageOffsetY) / scale);
  const xmax = Math.round((screenCoords.left + screenCoords.width - imageOffsetX) / scale);
  const ymax = Math.round((screenCoords.top + screenCoords.height - imageOffsetY) / scale);
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

export function obbToBbox(
  obb: [number, number, number, number, number]
): [number, number, number, number] {
  const [cx, cy, width, height] = obb;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return [
    Math.round(cx - halfWidth),
    Math.round(cy - halfHeight),
    Math.round(cx + halfWidth),
    Math.round(cy + halfHeight),
  ];
}

/**
 * Fabric.js Rect 객체 생성 (저장된 라벨용)
 */
export function createLabelBox(
  annotation: BBAnnotation,
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  options: BoxStyleOptions = {}
): LabelBoxRect {
  const style = { ...DEFAULT_BOX_STYLE, ...options };
  const color = getClassColor(annotation.class_id);
  const screenCoords = imageToScreen(annotation.bbox, scale, imageOffsetX, imageOffsetY);

  const rect = new Rect({
    left: screenCoords.left,
    top: screenCoords.top,
    width: screenCoords.width,
    height: screenCoords.height,
    originX: 'left',
    originY: 'top',
    // Normal state: class color border + translucent fill (opacity must stay 1)
    stroke: color,
    strokeWidth: style.strokeWidth!,
    fill: hexToRgba(color, 0.12),
    opacity: 1,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: false,
    // Corner handle: white fill + class color border for visual clarity
    cornerColor: '#ffffff',
    cornerStrokeColor: color,
    cornerSize: 9,
    cornerStyle: 'circle',
    transparentCorners: false,
    lockRotation: true,
  });

  (rect as LabelBoxRect).data = {
    id: annotation.id,
    classId: annotation.class_id,
    color,
    type: "label",
    shape: "bb",
  };

  return rect as LabelBoxRect;
}

export function createOBBLabelBox(
  annotation: OBBAnnotation,
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  options: BoxStyleOptions = {}
): LabelBoxRect {
  const style = { ...DEFAULT_BOX_STYLE, ...options };
  const color = getClassColor(annotation.class_id);
  const [cx, cy, width, height, angle] = annotation.obb;

  const rect = new Rect({
    left: cx * scale + imageOffsetX,
    top: cy * scale + imageOffsetY,
    width: width * scale,
    height: height * scale,
    originX: 'center',
    originY: 'center',
    angle,
    stroke: color,
    strokeWidth: style.strokeWidth!,
    fill: hexToRgba(color, 0.12),
    opacity: 1,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: color,
    cornerSize: 9,
    cornerStyle: 'circle',
    transparentCorners: false,
    lockRotation: false,
  });

  (rect as LabelBoxRect).data = {
    id: annotation.id,
    classId: annotation.class_id,
    color,
    type: 'label',
    shape: 'obb',
  };

  return rect as LabelBoxRect;
}

export function createLabelBadge(
  annotation: BBAnnotation | OBBAnnotation,
  className: string,
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): LabelBadgeObjects {
  const color = getClassColor(annotation.class_id);
  const screenAnchor = 'bbox' in annotation
    ? imageToScreen(annotation.bbox, scale, imageOffsetX, imageOffsetY)
    : getObbBadgeAnchor(annotation.obb, scale, imageOffsetX, imageOffsetY);
  const labelText = buildLabelText(className, annotation.class_id);

  const text = new Text(labelText, {
    left: LABEL_BADGE_HORIZONTAL_PADDING,
    top: screenAnchor.top - LABEL_BADGE_HEIGHT + 5,
    originX: 'left',
    originY: 'top',
    fontSize: LABEL_BADGE_FONT_SIZE,
    fontWeight: '600',
    fill: '#ffffff',
    selectable: false,
    evented: false,
  });

  const textWidth = text.width ?? 0;
  const badgeWidth = Math.max(48, textWidth + LABEL_BADGE_HORIZONTAL_PADDING * 2);

  const background = new Rect({
    left: screenAnchor.left,
    top: screenAnchor.top - LABEL_BADGE_HEIGHT,
    width: badgeWidth,
    height: LABEL_BADGE_HEIGHT,
    originX: 'left',
    originY: 'top',
    fill: color,
    rx: 4,
    ry: 4,
    selectable: false,
    evented: false,
  });

  text.set({
    left: screenAnchor.left + LABEL_BADGE_HORIZONTAL_PADDING,
  });

  return { background, text };
}

/**
 * 드로잉 중인 임시 박스 생성
 */
export function createDrawingBox(
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  classId: number
): Rect {
  const color = getClassColor(classId);

  // 이미지 좌표를 스크린 좌표로 변환
  const screenStart = {
    x: startPoint.x * scale + imageOffsetX,
    y: startPoint.y * scale + imageOffsetY,
  };
  const screenEnd = {
    x: endPoint.x * scale + imageOffsetX,
    y: endPoint.y * scale + imageOffsetY,
  };

  const left = Math.min(screenStart.x, screenEnd.x);
  const top = Math.min(screenStart.y, screenEnd.y);
  const width = Math.abs(screenEnd.x - screenStart.x);
  const height = Math.abs(screenEnd.y - screenStart.y);

  return new Rect({
    left,
    top,
    width,
    height,
    originX: 'left',
    originY: 'top',
    // 드로잉 중: 흰색 점선 테두리 + 클래스 색상 반투명 fill
    stroke: '#ffffff',
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    fill: hexToRgba(color, 0.15),
    opacity: 1,
    shadow: new Shadow({
      color: hexToRgba(color, 0.6),
      blur: 8,
      offsetX: 0,
      offsetY: 0,
    }),
    selectable: false,
    evented: false,
    data: {
      type: "drawing",
      classId,
    },
  });
}

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
      originX: 'left',
      originY: 'top',
      angle: 0,
    });
  }
  rect.setCoords();
}

export function updateLabelBadgePosition(
  badge: LabelBadgeObjects,
  coords: [number, number, number, number] | [number, number, number, number, number],
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): void {
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
 * 박스 선택 상태 스타일 적용
 *
 * Normal:   class color stroke / 12% fill / 작은 손잡이
 * Selected: 흰색 stroke + class color glow / 25% fill / 흰색 손잡이
 */
export function setBoxSelectedStyle(rect: LabelBoxRect, selected: boolean): void {
  const color = rect.data.color;

  if (selected) {
    rect.set({
      stroke: '#ffffff',
      strokeWidth: 2.5,
      fill: hexToRgba(color, 0.25),
      strokeDashArray: undefined,
      shadow: new Shadow({
        color: hexToRgba(color, 0.8),
        blur: 12,
        offsetX: 0,
        offsetY: 0,
      }),
      cornerColor: '#ffffff',
      cornerStrokeColor: color,
      cornerSize: 11,
    });
  } else {
    rect.set({
      stroke: color,
      strokeWidth: 2,
      fill: hexToRgba(color, 0.12),
      strokeDashArray: undefined,
      shadow: null,
      cornerColor: '#ffffff',
      cornerStrokeColor: color,
      cornerSize: 9,
    });
  }

  rect.setCoords();
}

export function screenToObb(
  rect: LabelBoxRect,
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): [number, number, number, number, number] {
  const width = ((rect.width ?? 0) * (rect.scaleX ?? 1)) / scale;
  const height = ((rect.height ?? 0) * (rect.scaleY ?? 1)) / scale;
  const cx = Math.round(((rect.left ?? 0) - imageOffsetX) / scale);
  const cy = Math.round(((rect.top ?? 0) - imageOffsetY) / scale);
  const angle = Math.round(rect.angle ?? 0);

  return [cx, cy, Math.round(width), Math.round(height), angle];
}

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
