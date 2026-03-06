/**
 * 마우스 이벤트 핸들러
 */

import { Canvas, FabricImage, Rect } from "fabric";
import type { WorkspaceManager, BBAnnotation, OBBAnnotation } from "../../stores/workspace.svelte.js";
import type { ToolManager } from "../../stores/toolManager.svelte.js";
import { screenToImagePixel, getImageOffset, updateViewportState } from "../core/imageLoader.js";
import {
  createLabelBox,
  createOBBLabelBox,
  createLabelBadge,
  createDrawingBox,
  type LabelBoxRect,
  type LabelBadgeObjects,
} from "../boxFactory.js";
import { setBoxSelectedStyle } from "../styles/boxStyles.js";
import { normalizeBbox, bboxToObb, screenToImage } from "../coordinates.js";
import { updateBoxPosition, updateLabelBadgePosition, normalizeObbRectAfterModify } from "../boxUtils.js";

export interface CanvasLabelObjects {
  rect: LabelBoxRect;
  badge: LabelBadgeObjects;
}

export interface MouseHandlerContext {
  fabricCanvas: Canvas;
  imageObject: FabricImage | null;
  workspaceManager: WorkspaceManager;
  toolManager: ToolManager;
  labelBoxes: Map<string, CanvasLabelObjects>;
  drawingBox: Rect | null;
}

// 패닝 상태
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let imgStartLeft = 0;
let imgStartTop = 0;

/**
 * 이미지 이동 (패닝)
 */
function panImage(
  pointerX: number,
  pointerY: number,
  imageObject: FabricImage,
  fabricCanvas: Canvas,
  workspaceManager: WorkspaceManager,
  updateAllBoxPositions: () => void
): void {
  const deltaX = pointerX - panStartX;
  const deltaY = pointerY - panStartY;

  imageObject.set({
    left: imgStartLeft + deltaX,
    top: imgStartTop + deltaY,
  });

  updateViewportState(imageObject, fabricCanvas, workspaceManager);
  updateAllBoxPositions();
  fabricCanvas.requestRenderAll();
}

/**
 * 마우스 다운 핸들러
 */
export function handleMouseDown(
  opt: any,
  context: MouseHandlerContext,
  updateAllBoxPositions: () => void
): void {
  const { fabricCanvas, imageObject, workspaceManager, toolManager } = context;

  if (!fabricCanvas || !imageObject) return;

  // Fabric.js v7: scenePoint를 사용하여 캔버스 좌표 가져오기
  const pointer = opt.scenePoint || { x: 0, y: 0 };
  const imageCoords = screenToImagePixel(pointer.x, pointer.y, imageObject);

  // 현재 선택된 객체가 있는지 확인 (박스 수정 중인지 체크)
  const activeObject = fabricCanvas.getActiveObject();
  const isModifyingBox = activeObject && (activeObject as any).data?.type === 'label';

  switch (toolManager.currentTool) {
    case 'select':
      // select 도구에서도 패닝 동작 (기본 동작)
      // 하지만 박스가 선택되어 있으면 패닝하지 않음 (박스 이동/크기조절 허용)
      if (!activeObject) {
        isPanning = true;
        panStartX = pointer.x;
        panStartY = pointer.y;
        imgStartLeft = imageObject.left || 0;
        imgStartTop = imageObject.top || 0;
        fabricCanvas.defaultCursor = 'grabbing';
        fabricCanvas.hoverCursor = 'grabbing';
      }
      break;

    case 'box':
      // 박스 수정 중이면 새 박스 생성 방지
      if (isModifyingBox) {
        console.log('Box modification in progress, skipping new box creation');
        return;
      }
      // 박스 그리기 시작
      toolManager.startDrawing(imageCoords);
      break;

    case 'pan':
      // 패닝 시작
      isPanning = true;
      panStartX = pointer.x;
      panStartY = pointer.y;
      imgStartLeft = imageObject.left || 0;
      imgStartTop = imageObject.top || 0;
      fabricCanvas.defaultCursor = 'grabbing';
      fabricCanvas.hoverCursor = 'grabbing';
      break;
  }
}

/**
 * 마우스 이동 핸들러
 */
export function handleMouseMove(
  opt: any,
  context: MouseHandlerContext,
  updateAllBoxPositions: () => void,
  updateDrawingBox: () => void
): void {
  const { fabricCanvas, imageObject, toolManager } = context;

  if (!fabricCanvas || !imageObject) return;

  // Fabric.js v7: scenePoint를 사용하여 캔버스 좌표 가져오기
  const pointer = opt.scenePoint || { x: 0, y: 0 };
  const imageCoords = screenToImagePixel(pointer.x, pointer.y, imageObject);

  // 현재 마우스 위치 업데이트 (toolManager에 저장 - Footer에서 사용)
  toolManager.updateMousePosition(imageCoords.x, imageCoords.y);

  // 패닝 중이면 이미지 이동
  if (isPanning) {
    panImage(pointer.x, pointer.y, imageObject, fabricCanvas, context.workspaceManager, updateAllBoxPositions);
    return;
  }

  // 드로잉 중이면 좌표 업데이트 및 박스 렌더링
  if (toolManager.isDrawing) {
    toolManager.updateDrawing(imageCoords);
    updateDrawingBox();
  }
}

/**
 * 마우스 업 핸들러
 */
export function handleMouseUp(
  context: MouseHandlerContext,
  createLabelFromDrawing: (start: { x: number; y: number }, end: { x: number; y: number }) => void,
  removeDrawingBox: () => void
): void {
  const { fabricCanvas, imageObject, toolManager } = context;

  if (!fabricCanvas || !imageObject) return;

  // 패닝 종료
  if (isPanning) {
    isPanning = false;
    // pan 도구일 때 커서 복원
    if (toolManager.currentTool === 'pan') {
      fabricCanvas.defaultCursor = 'grab';
      fabricCanvas.hoverCursor = 'grab';
    } else {
      fabricCanvas.defaultCursor = 'default';
      fabricCanvas.hoverCursor = 'default';
    }
    return;
  }

  if (toolManager.isDrawing) {
    const result = toolManager.endDrawing();

    // 박스 생성 완료
    if (result.start && result.end && toolManager.currentTool === 'box') {
      createLabelFromDrawing(result.start, result.end);
    }

    // 드로잉 박스 제거
    removeDrawingBox();
  }
}

/**
 * 드로잉 박스 업데이트
 */
export function updateDrawingBoxRender(
  context: MouseHandlerContext
): Rect | null {
  const { fabricCanvas, imageObject, toolManager, workspaceManager, drawingBox } = context;

  if (!fabricCanvas || !toolManager.drawingStart || !toolManager.drawingCurrent) return null;

  const scale = imageObject?.scaleX || 1;
  const offset = getImageOffset(imageObject!);

  // 기존 드로잉 박스 제거
  if (drawingBox) {
    fabricCanvas.remove(drawingBox);
  }

  // 새 드로잉 박스 생성
  const newDrawingBox = createDrawingBox(
    toolManager.drawingStart,
    toolManager.drawingCurrent,
    scale,
    offset.x,
    offset.y,
    workspaceManager.selectedClassId
  );

  fabricCanvas.add(newDrawingBox);
  fabricCanvas.requestRenderAll();

  return newDrawingBox;
}

/**
 * 드로잉 박스 제거
 */
export function removeDrawingBoxRender(
  fabricCanvas: Canvas,
  drawingBox: Rect | null
): null {
  if (drawingBox && fabricCanvas) {
    fabricCanvas.remove(drawingBox);
    fabricCanvas.requestRenderAll();
  }
  return null;
}

/**
 * 드로잉 완료 후 라벨 생성
 */
export function createLabelFromDrawingCoords(
  start: { x: number; y: number },
  end: { x: number; y: number },
  workspaceManager: WorkspaceManager
): (BBAnnotation | OBBAnnotation) | null {
  // 최소 크기 체크 (3픽셀 이상)
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 3 || height < 3) {
    console.log('Box too small, ignoring');
    return null;
  }

  // bbox 정규화
  const bbox = normalizeBbox(start.x, start.y, end.x, end.y);

  // 고유 ID 생성
  const id = `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (workspaceManager.isOBBMode) {
    const annotation: OBBAnnotation = {
      id,
      class_id: workspaceManager.selectedClassId,
      obb: bboxToObb(bbox),
    };

    workspaceManager.addOBBAnnotation(annotation);
    return annotation;
  }

  const annotation: BBAnnotation = {
    id,
    class_id: workspaceManager.selectedClassId,
    bbox,
  };

  workspaceManager.addBBAnnotation(annotation);
  return annotation;
}

/**
 * 도구 변경 시 커서 업데이트 (캔버스 + 모든 라벨 박스)
 */
export function updateCursor(
  fabricCanvas: Canvas,
  labelBoxes: Map<string, CanvasLabelObjects>,
  currentTool: string
): void {
  let canvasCursor: string;
  let boxHoverCursor: string;
  let boxMoveCursor: string;

  switch (currentTool) {
    case 'pan':
      canvasCursor = 'grab';
      boxHoverCursor = 'grab';
      boxMoveCursor = 'grab';
      break;
    case 'box':
      canvasCursor = 'crosshair';
      boxHoverCursor = 'crosshair';
      boxMoveCursor = 'crosshair';
      break;
    default:
      canvasCursor = 'default';
      boxHoverCursor = 'move';
      boxMoveCursor = 'move';
  }

  fabricCanvas.defaultCursor = canvasCursor;
  fabricCanvas.hoverCursor = canvasCursor;

  // 모든 라벨 박스의 커서도 동기화
  labelBoxes.forEach(({ rect }) => {
    rect.hoverCursor = boxHoverCursor;
    rect.moveCursor = boxMoveCursor;
  });
}