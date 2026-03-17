/**
 * 줌 핸들러
 */

import { Canvas, FabricImage } from "fabric";
import type { WorkspaceManager } from "../../stores/workspace.svelte.js";
import { updateViewportState } from "../core/imageLoader.js";
import type { BoxRect } from "../styles/boxStyles.js";

// 줌 범위 설정
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5.0;
export const ZOOM_STEP = 0.1;
export const ROTATION_STEP = 1; // 도 단위

/**
 * 줌 적용
 */
export function applyZoom(
  newZoom: number,
  fabricCanvas: Canvas,
  imageObject: FabricImage,
  workspaceManager: WorkspaceManager
): void {
  const canvasWidth = fabricCanvas.width || 1;
  const canvasHeight = fabricCanvas.height || 1;
  const oldZoom = imageObject.scaleX || 1;
  const oldLeft = imageObject.left ?? canvasWidth / 2;
  const oldTop = imageObject.top ?? canvasHeight / 2;

  // 패닝 오프셋을 스케일 비율에 맞게 보정 (화면 중심 기준)
  const ratio = newZoom / oldZoom;
  const newLeft = canvasWidth / 2 + (oldLeft - canvasWidth / 2) * ratio;
  const newTop = canvasHeight / 2 + (oldTop - canvasHeight / 2) * ratio;

  workspaceManager.setZoomLevel(newZoom);

  imageObject.set({
    scaleX: newZoom,
    scaleY: newZoom,
    left: newLeft,
    top: newTop,
  });

  updateViewportState(imageObject, fabricCanvas, workspaceManager);
}

/**
 * 마우스 휠 핸들러 (Ctrl + 휠로 줌)
 */
export function handleMouseWheel(
  event: { e: WheelEvent },
  fabricCanvas: Canvas,
  imageObject: FabricImage,
  workspaceManager: WorkspaceManager
): void {
  const e = event.e;

  // Ctrl 키가 눌려있을 때만 줌 동작
  if (!e.ctrlKey) return;

  e.preventDefault();

  const delta = e.deltaY;
  const currentZoom = workspaceManager.zoomLevel;

  let newZoom: number;
  if (delta < 0) {
    // 위로 스크롤 = 확대
    newZoom = Math.min(MAX_ZOOM, currentZoom + ZOOM_STEP);
  } else {
    // 아래로 스크롤 = 축소
    newZoom = Math.max(MIN_ZOOM, currentZoom - ZOOM_STEP);
  }

  applyZoom(newZoom, fabricCanvas, imageObject, workspaceManager);
}

/**
 * OBB 마우스 휠 회전 (선택된 OBB 박스를 휠로 회전)
 */
export function handleOBBWheelRotation(
  rect: BoxRect,
  deltaY: number
): void {
  const direction = deltaY > 0 ? ROTATION_STEP : -ROTATION_STEP;
  rect.set({ angle: (rect.angle + direction) % 360 });
  rect.setCoords();
  rect.fire('modified');
}
