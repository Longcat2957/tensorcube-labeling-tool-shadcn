/**
 * 박스 팩토리
 * Fabric.js Rect 객체 생성
 * 
 * 핵심 원칙:
 * - BB: originX='left', originY='top' (좌상단 기준)
 * - OBB: originX='center', originY='center' (중심 기준)
 * - 스트로크 보정 없이 정확한 좌표 사용
 */

import { Rect, Text } from "fabric";
import type { BBAnnotation, OBBAnnotation } from "../stores/workspace.svelte.js";
import {
  bboxToScreen,
  obbToScreen,
} from "./coordinates.js";
import {
  getClassColor,
  hexToRgba,
  BOX_STYLE,
  type BoxRect,
  type BadgeObjects,
  BADGE_HEIGHT,
  BADGE_PADDING,
  BADGE_FONT_SIZE,
} from "./styles/boxStyles.js";

// ============================================
// BB (Bounding Box) 생성
// ============================================

/**
 * BB Rect 생성
 */
export function createBBRect(
  annotation: BBAnnotation,
  scale: number,
  offsetX: number,
  offsetY: number
): BoxRect {
  const color = getClassColor(annotation.class_id);
  const screen = bboxToScreen(annotation.bbox, scale, offsetX, offsetY);
  
  const rect = new Rect({
    left: screen.left,
    top: screen.top,
    width: screen.width,
    height: screen.height,
    originX: 'left',
    originY: 'top',
    stroke: color,
    strokeWidth: BOX_STYLE.strokeWidth,
    fill: hexToRgba(color, BOX_STYLE.fillOpacity),
    selectable: true,
    hasControls: true,
    hasBorders: true,
    cornerColor: '#ffffff',
    cornerStrokeColor: color,
    cornerSize: 9,
    cornerStyle: 'circle',
    transparentCorners: false,
    hoverCursor: 'move',
    moveCursor: 'move',
  });
  
  // data 속성 직접 할당
  (rect as unknown as BoxRect).data = {
    id: annotation.id,
    classId: annotation.class_id,
    color,
    type: 'label',
    shape: 'bb',
  };
  
  return rect as unknown as BoxRect;
}

// ============================================
// OBB (Oriented Bounding Box) 생성
// ============================================

/**
 * OBB Rect 생성
 */
export function createOBBRect(
  annotation: OBBAnnotation,
  scale: number,
  offsetX: number,
  offsetY: number
): BoxRect {
  const color = getClassColor(annotation.class_id);
  const screen = obbToScreen(annotation.obb, scale, offsetX, offsetY);
  
  const rect = new Rect({
    left: screen.left,
    top: screen.top,
    width: screen.width,
    height: screen.height,
    angle: screen.angle,
    originX: 'center',
    originY: 'center',
    stroke: color,
    strokeWidth: BOX_STYLE.strokeWidth,
    fill: hexToRgba(color, BOX_STYLE.fillOpacity),
    selectable: true,
    hasControls: true,
    hasBorders: true,
    cornerColor: '#ffffff',
    cornerStrokeColor: color,
    cornerSize: 9,
    cornerStyle: 'circle',
    transparentCorners: false,
    hoverCursor: 'move',
    moveCursor: 'move',
  });
  
  // data 속성 직접 할당
  (rect as unknown as BoxRect).data = {
    id: annotation.id,
    classId: annotation.class_id,
    color,
    type: 'label',
    shape: 'obb',
  };
  
  return rect as unknown as BoxRect;
}

// ============================================
// 뱃지 생성
// ============================================

/**
 * 라벨 뱃지 생성 (클래스 이름 표시)
 * bbox의 left-top point 위쪽에 표시
 */
export function createLabelBadge(
  annotation: BBAnnotation | OBBAnnotation,
  className: string,
  scale: number,
  offsetX: number,
  offsetY: number
): BadgeObjects {
  const color = getClassColor(annotation.class_id);
  
  // 좌표 계산 - bbox의 left-top point 사용
  let leftX: number, topY: number;
  
  if ('bbox' in annotation) {
    // BB: left-top point
    leftX = annotation.bbox[0]; // xmin
    topY = annotation.bbox[1];  // ymin
  } else {
    // OBB: 중심점 사용 (회전된 박스의 경우)
    leftX = annotation.obb[0];  // cx
    topY = annotation.obb[1];   // cy
  }
  
  // 스크린 좌표로 변환
  const screenX = leftX * scale + offsetX;
  const screenY = topY * scale + offsetY - BADGE_HEIGHT * scale;
  
  // 텍스트 너비 계산
  const textWidth = className.length * BADGE_FONT_SIZE * 0.6 * scale;
  const badgeWidth = (BADGE_PADDING * 2 + textWidth) * scale;
  
  // 배경
  const background = new Rect({
    left: screenX,
    top: screenY,
    width: badgeWidth,
    height: BADGE_HEIGHT * scale,
    originX: 'left',
    originY: 'top',
    fill: color,
    rx: 4 * scale,
    ry: 4 * scale,
    selectable: false,
    evented: false,
  });
  
  // 텍스트
  const text = new Text(className, {
    left: screenX + BADGE_PADDING * scale,
    top: screenY + (BADGE_HEIGHT / 2) * scale,
    fontSize: BADGE_FONT_SIZE * scale,
    fill: '#ffffff',
    originX: 'left',
    originY: 'center',
    selectable: false,
    evented: false,
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'bold',
  });
  
  return { background, text };
}

// ============================================
// 통합 생성 함수
// ============================================

/**
 * 어노테이션 타입에 따라 적절한 Rect 생성
 */
export function createLabelBox(
  annotation: BBAnnotation | OBBAnnotation,
  scale: number,
  offsetX: number,
  offsetY: number
): BoxRect {
  if ('bbox' in annotation) {
    return createBBRect(annotation, scale, offsetX, offsetY);
  } else {
    return createOBBRect(annotation, scale, offsetX, offsetY);
  }
}