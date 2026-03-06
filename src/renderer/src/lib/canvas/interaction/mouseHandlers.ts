/**
 * 마우스 이벤트 핸들러
 * 박스 드로잉 및 상호작용
 * 
 * 핵심 원칙:
 * - 모든 좌표는 이미지 픽셀 단위 (실수)
 * - 스크린 변환은 렌더링 시에만 수행
 */

import { Rect } from "fabric";
import type { Canvas, FabricImage, Object as FabricObject } from "fabric";
import type { WorkspaceManager } from "../../stores/workspace.svelte.js";
import type { ToolManager } from "../../stores/toolManager.svelte.js";
import { getClassColor, hexToRgba, BOX_STYLE, type BoxRect } from "../styles/boxStyles.js";
import { pixelToImage, createBboxFromPoints } from "../coordinates.js";
import { getImageOffset } from "../core/imageLoader.js";
import type { CanvasLabelObjects } from "../labels/labelManager.js";

// ============================================
// 타입 정의
// ============================================

export interface MouseHandlerContext {
  fabricCanvas: Canvas;
  imageObject: FabricImage;
  workspaceManager: WorkspaceManager;
  toolManager: ToolManager;
  drawingBox: { value: FabricObject | null };
  labelBoxes: Map<string, CanvasLabelObjects>;
}

export interface MouseHandlerState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentClassId: number;
}

// ============================================
// 마우스 이벤트 핸들러
// ============================================

/**
 * 마우스 다운 이벤트 - 박스 드로잉 시작
 */
export function handleMouseDown(
  e: { e: MouseEvent },
  context: MouseHandlerContext,
  state: MouseHandlerState
): void {
  const { fabricCanvas, imageObject, toolManager, drawingBox, workspaceManager } = context;

  // 박스 도구가 아니면 무시
  if (toolManager.currentTool !== 'box') return;
  if (!imageObject) return;
  
  // 이미 선택된 박스가 있으면 새 박스 생성하지 않음 (선택 모드)
  if (workspaceManager.selectedLabelId) return;

  const scale = imageObject.scaleX || 1;
  const offset = getImageOffset(imageObject);

  // 캔버스 좌표 계산
  const pointer = fabricCanvas.getScenePoint(e.e);
  const imageCoords = pixelToImage(pointer.x, pointer.y, scale, offset.x, offset.y);

  state.isDrawing = true;
  state.startX = imageCoords.x;
  state.startY = imageCoords.y;
  state.currentClassId = context.workspaceManager.selectedClassId ?? 0;

  // 드로잉 박스 생성
  const color = getClassColor(state.currentClassId);
  const screenX = pointer.x;
  const screenY = pointer.y;

  const rect = new Rect({
    left: screenX,
    top: screenY,
    width: 0,
    height: 0,
    originX: 'left',
    originY: 'top',
    stroke: color,
    strokeWidth: BOX_STYLE.strokeWidth,
    fill: hexToRgba(color, BOX_STYLE.fillOpacity),
    selectable: false,
    evented: false,
  });

  (rect as unknown as BoxRect).data = {
    id: 'drawing',
    classId: state.currentClassId,
    color,
    type: 'label',
    shape: 'bb',
  };

  drawingBox.value = rect;
  fabricCanvas.add(rect);
  fabricCanvas.requestRenderAll();
}

/**
 * 마우스 무브 이벤트 - 박스 드로잉 업데이트
 */
export function handleMouseMove(
  e: { e: MouseEvent },
  context: MouseHandlerContext,
  state: MouseHandlerState
): void {
  const { fabricCanvas, imageObject, drawingBox } = context;

  if (!state.isDrawing || !drawingBox.value || !imageObject) return;

  const scale = imageObject.scaleX || 1;
  const offset = getImageOffset(imageObject);

  // 캔버스 좌표 계산
  const pointer = fabricCanvas.getScenePoint(e.e);
  const imageCoords = pixelToImage(pointer.x, pointer.y, scale, offset.x, offset.y);

  // 드로잉 박스 크기 업데이트 (스크린 좌표)
  const startScreenX = state.startX * scale + offset.x;
  const startScreenY = state.startY * scale + offset.y;
  const currentScreenX = imageCoords.x * scale + offset.x;
  const currentScreenY = imageCoords.y * scale + offset.y;

  const width = Math.abs(currentScreenX - startScreenX);
  const height = Math.abs(currentScreenY - startScreenY);
  const left = Math.min(startScreenX, currentScreenX);
  const top = Math.min(startScreenY, currentScreenY);

  drawingBox.value.set({
    left,
    top,
    width,
    height,
  });

  drawingBox.value.setCoords();
  fabricCanvas.requestRenderAll();
}

/**
 * 마우스 업 이벤트 - 박스 드로잉 완료
 */
export function handleMouseUp(
  e: { e: MouseEvent },
  context: MouseHandlerContext,
  state: MouseHandlerState
): void {
  const { fabricCanvas, imageObject, workspaceManager, drawingBox } = context;

  if (!state.isDrawing || !drawingBox.value || !imageObject) {
    state.isDrawing = false;
    return;
  }

  const scale = imageObject.scaleX || 1;
  const offset = getImageOffset(imageObject);

  // 캔버스 좌표 계산
  const pointer = fabricCanvas.getScenePoint(e.e);
  const imageCoords = pixelToImage(pointer.x, pointer.y, scale, offset.x, offset.y);

  // 최소 크기 체크
  const width = Math.abs(imageCoords.x - state.startX);
  const height = Math.abs(imageCoords.y - state.startY);
  
  if (width < 5 || height < 5) {
    // 너무 작으면 취소
    fabricCanvas.remove(drawingBox.value);
    drawingBox.value = null;
    state.isDrawing = false;
    fabricCanvas.requestRenderAll();
    return;
  }

  // 이미지 좌표로 BBox 생성
  const bbox = createBboxFromPoints(state.startX, state.startY, imageCoords.x, imageCoords.y);

  console.log('[Draw] BBox created:', { xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3] });

  // UUID 생성
  const id = crypto.randomUUID();

  // 워크스페이스에 추가
  workspaceManager.addBBAnnotation({
    id,
    class_id: state.currentClassId,
    bbox,
  });

  // 드로잉 박스 제거
  fabricCanvas.remove(drawingBox.value);
  drawingBox.value = null;
  state.isDrawing = false;
  fabricCanvas.requestRenderAll();
}

/**
 * 마우스 휠 이벤트 - 줌
 */
export function handleWheel(
  e: { e: WheelEvent },
  context: MouseHandlerContext
): void {
  // 줌 핸들러는 zoomHandler.ts에서 별도 처리
}

// ============================================
// 커서 설정
// ============================================

/**
 * 도구에 따른 커서 설정
 */
export function updateCursorForTool(
  fabricCanvas: Canvas,
  toolManager: ToolManager,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const currentTool = toolManager.currentTool;

  labelBoxes.forEach((objects) => {
    if (currentTool === 'box') {
      objects.rect.hoverCursor = 'crosshair';
      objects.rect.moveCursor = 'crosshair';
    } else if (currentTool === 'pan') {
      objects.rect.hoverCursor = 'grab';
      objects.rect.moveCursor = 'grab';
    } else {
      objects.rect.hoverCursor = 'move';
      objects.rect.moveCursor = 'move';
    }
  });

  if (currentTool === 'pan') {
    fabricCanvas.defaultCursor = 'grab';
    fabricCanvas.hoverCursor = 'grab';
  } else if (currentTool === 'box') {
    fabricCanvas.defaultCursor = 'crosshair';
    fabricCanvas.hoverCursor = 'crosshair';
  } else {
    fabricCanvas.defaultCursor = 'default';
    fabricCanvas.hoverCursor = 'default';
  }

  fabricCanvas.requestRenderAll();
}