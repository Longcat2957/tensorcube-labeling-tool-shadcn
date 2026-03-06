/**
 * 박스 생성 팩토리
 * Fabric.js 기반 Bounding Box 및 OBB 생성
 */

import { Rect, Text, Shadow } from "fabric";
import type { BBAnnotation, OBBAnnotation } from "../stores/workspace.svelte.js";
import { imageToScreen } from "./coordinates.js";
import {
  getClassColor,
  hexToRgba,
  DEFAULT_BOX_STYLE,
  type BoxStyleOptions,
  type LabelBoxRect,
  type LabelBoxData,
  LABEL_BADGE_HEIGHT,
  LABEL_BADGE_HORIZONTAL_PADDING,
  LABEL_BADGE_FONT_SIZE,
} from "./styles/boxStyles.js";

export type { LabelBoxRect, LabelBoxData };

export interface LabelBadgeObjects {
  background: Rect;
  text: Text;
}

/** 라벨 텍스트 생성 */
function buildLabelText(className: string, classId: number): string {
  return className.trim() || `Class ${classId}`;
}

/** OBB 뱃지 앵커 위치 계산 */
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
 * Bounding Box (BB) Fabric.js Rect 객체 생성
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
 * Oriented Bounding Box (OBB) Fabric.js Rect 객체 생성
 */
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

/**
 * 라벨 뱃지 (클래스명 표시) 생성
 */
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