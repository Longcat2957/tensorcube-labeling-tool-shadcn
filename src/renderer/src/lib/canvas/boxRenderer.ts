/**
 * 박스 렌더링 유틸리티
 * Fabric.js 객체(라벨 박스, 뱃지, 드로잉 박스) 생성 및 스타일 조작
 */
import { Rect, Text, Shadow } from "fabric";
import type { BBAnnotation, OBBAnnotation } from "../stores/workspace.svelte.js";
import { getClassColor, hexToRgba } from "./colors.js";
import { imageToScreen, getObbBadgeAnchor } from "./coordUtils.js";

// 공통 유틸 re-export (외부에서 boxRenderer만 import하던 코드를 위해)
export { getClassColor } from "./colors.js";
export {
  imageToScreen,
  screenToImage,
  normalizeBbox,
  bboxToObb,
  obbToBbox,
} from "./coordUtils.js";

// ─── 타입 정의 ────────────────────────────────────────────────

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

export type LabelBoxRect = Rect & { data: LabelBoxData };

export interface LabelBadgeObjects {
  background: Rect;
  text: Text;
}

// ─── 내부 상수 ────────────────────────────────────────────────

const DEFAULT_STROKE_WIDTH = 2;
const LABEL_BADGE_HEIGHT = 22;
const LABEL_BADGE_HORIZONTAL_PADDING = 8;
const LABEL_BADGE_FONT_SIZE = 12;

// ─── 라벨 박스 생성 ───────────────────────────────────────────

/**
 * BB(Bounding Box) 라벨 박스 생성
 */
export function createLabelBox(
  annotation: BBAnnotation,
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  options: BoxStyleOptions = {}
): LabelBoxRect {
  const strokeWidth = options.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const color = getClassColor(annotation.class_id);
  const screenCoords = imageToScreen(annotation.bbox, scale, imageOffsetX, imageOffsetY);

  const rect = new Rect({
    left: screenCoords.left,
    top: screenCoords.top,
    width: screenCoords.width,
    height: screenCoords.height,
    originX: 'left',
    originY: 'top',
    stroke: color,
    strokeWidth,
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

/**
 * OBB(Oriented Bounding Box) 라벨 박스 생성
 */
export function createOBBLabelBox(
  annotation: OBBAnnotation,
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  options: BoxStyleOptions = {}
): LabelBoxRect {
  const strokeWidth = options.strokeWidth ?? DEFAULT_STROKE_WIDTH;
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
    strokeWidth,
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

/**
 * 라벨 뱃지(배경 + 텍스트) 생성
 */
export function createLabelBadge(
  annotation: BBAnnotation | OBBAnnotation,
  className: string,
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): LabelBadgeObjects {
  const color = getClassColor(annotation.class_id);
  const screenAnchor =
    'bbox' in annotation
      ? imageToScreen(annotation.bbox, scale, imageOffsetX, imageOffsetY)
      : getObbBadgeAnchor(annotation.obb, scale, imageOffsetX, imageOffsetY);
  const labelText = className.trim() || `Class ${annotation.class_id}`;

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

  text.set({ left: screenAnchor.left + LABEL_BADGE_HORIZONTAL_PADDING });

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
  const screenStart = { x: startPoint.x * scale + imageOffsetX, y: startPoint.y * scale + imageOffsetY };
  const screenEnd = { x: endPoint.x * scale + imageOffsetX, y: endPoint.y * scale + imageOffsetY };

  return new Rect({
    left: Math.min(screenStart.x, screenEnd.x),
    top: Math.min(screenStart.y, screenEnd.y),
    width: Math.abs(screenEnd.x - screenStart.x),
    height: Math.abs(screenEnd.y - screenStart.y),
    originX: 'left',
    originY: 'top',
    stroke: '#ffffff',
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    fill: hexToRgba(color, 0.15),
    opacity: 1,
    shadow: new Shadow({ color: hexToRgba(color, 0.6), blur: 8, offsetX: 0, offsetY: 0 }),
    selectable: false,
    evented: false,
    data: { type: "drawing", classId },
  });
}

// ─── 박스 위치/스타일 업데이트 ────────────────────────────────

/**
 * 줌/패닝 후 박스 위치 갱신
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
    rect.set({ ...screenCoords, scaleX: 1, scaleY: 1, originX: 'left', originY: 'top', angle: 0 });
  }
  rect.setCoords();
}

/**
 * 뱃지 위치 갱신
 */
export function updateLabelBadgePosition(
  badge: LabelBadgeObjects,
  coords: [number, number, number, number] | [number, number, number, number, number],
  scale: number,
  imageOffsetX: number,
  imageOffsetY: number
): void {
  const screenAnchor =
    coords.length === 5
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
 * 박스 선택/비선택 스타일 전환
 */
export function setBoxSelectedStyle(rect: LabelBoxRect, selected: boolean): void {
  const color = rect.data.color;

  if (selected) {
    rect.set({
      stroke: '#ffffff',
      strokeWidth: 2.5,
      fill: hexToRgba(color, 0.25),
      strokeDashArray: undefined,
      shadow: new Shadow({ color: hexToRgba(color, 0.8), blur: 12, offsetX: 0, offsetY: 0 }),
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

// ─── OBB 전용 유틸 ────────────────────────────────────────────

/**
 * Fabric Rect → OBB 픽셀 좌표로 역변환 (수정 완료 후 호출)
 */
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

/**
 * OBB 수정 후 Rect를 정규화된 좌표로 재설정
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
