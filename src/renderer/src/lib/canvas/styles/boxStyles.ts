/**
 * 박스 스타일 유틸리티
 * 색상, 스타일 관련 함수
 */

import { Shadow, Rect } from "fabric";

/** 클래스별 색상 반환 */
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
export function hexToRgba(hex: string, alpha: number): string {
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

// 기본 박스 스타일 (normal)
export const DEFAULT_BOX_STYLE: BoxStyleOptions = {
  strokeWidth: 2,
  opacity: 1,
  fillOpacity: 0.12,
};

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

// 라벨 뱃지 스타일 상수
export const LABEL_BADGE_HEIGHT = 22;
export const LABEL_BADGE_HORIZONTAL_PADDING = 8;
export const LABEL_BADGE_FONT_SIZE = 12;