/**
 * 라벨 관리 (Canvas 내 라벨 객체 CRUD)
 */

import { Canvas, FabricImage } from "fabric";
import type { WorkspaceManager, BBAnnotation, OBBAnnotation } from "../../stores/workspace.svelte.js";
import type { ToolManager } from "../../stores/toolManager.svelte.js";
import {
  createLabelBox,
  createOBBLabelBox,
  createLabelBadge,
  type LabelBoxRect,
  type LabelBadgeObjects,
} from "../boxFactory.js";
import { setBoxSelectedStyle } from "../styles/boxStyles.js";
import { updateBoxPosition, updateLabelBadgePosition, normalizeObbRectAfterModify } from "../boxUtils.js";
import { screenToImage, getAccurateBBoxFromRect, getAccurateOBBFromRect } from "../coordinates.js";
import { getImageOffset } from "../core/imageLoader.js";

export interface CanvasLabelObjects {
  rect: LabelBoxRect;
  badge: LabelBadgeObjects;
}

export interface LabelManagerContext {
  fabricCanvas: Canvas;
  imageObject: FabricImage;
  workspaceManager: WorkspaceManager;
  toolManager: ToolManager;
}

/**
 * 캔버스 오버레이 정리 (드로잉 박스, 라벨 박스 모두)
 */
export function clearCanvasOverlays(
  fabricCanvas: Canvas,
  labelBoxes: Map<string, CanvasLabelObjects>,
  drawingBox: { value: any }
): void {
  if (!fabricCanvas) return;

  if (drawingBox.value) {
    fabricCanvas.remove(drawingBox.value);
    drawingBox.value = null;
  }

  labelBoxes.forEach((objects) => {
    fabricCanvas.remove(objects.rect);
    fabricCanvas.remove(objects.badge.background);
    fabricCanvas.remove(objects.badge.text);
  });
  labelBoxes.clear();
}

/**
 * 캔버스에 라벨 박스 추가
 */
export function addBoxToCanvas(
  annotation: BBAnnotation | OBBAnnotation,
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const { fabricCanvas, imageObject, workspaceManager, toolManager } = context;

  if (!fabricCanvas || !imageObject) return;

  const existingObjects = labelBoxes.get(annotation.id);
  if (existingObjects) {
    fabricCanvas.remove(existingObjects.rect);
    fabricCanvas.remove(existingObjects.badge.background);
    fabricCanvas.remove(existingObjects.badge.text);
    labelBoxes.delete(annotation.id);
  }

  const scale = imageObject.scaleX || 1;
  const offset = getImageOffset(imageObject);

  const className = workspaceManager.workspaceConfig?.names?.[annotation.class_id] ?? `Class ${annotation.class_id}`;
  const rect = 'bbox' in annotation
    ? createLabelBox(annotation, scale, offset.x, offset.y)
    : createOBBLabelBox(annotation, scale, offset.x, offset.y);
  const badge = createLabelBadge(annotation, className, scale, offset.x, offset.y);

  // 선택 이벤트 핸들러
  rect.on('selected', () => {
    // pan 모드에서는 박스 선택을 즉시 취소
    if (toolManager.currentTool === 'pan') {
      fabricCanvas?.discardActiveObject();
      fabricCanvas?.requestRenderAll();
      return;
    }
    workspaceManager.setSelectedLabelId(annotation.id);
    setBoxSelectedStyle(rect, true);
    fabricCanvas?.requestRenderAll();
  });

  rect.on('deselected', () => {
    if (workspaceManager.selectedLabelId === annotation.id) {
      workspaceManager.setSelectedLabelId(null);
    }
    setBoxSelectedStyle(rect, false);
    fabricCanvas?.requestRenderAll();
  });

  // 수정 이벤트 핸들러 (이동/리사이즈 완료 시)
  rect.on('modified', () => {
    if (!imageObject) return;
    const scale = imageObject.scaleX || 1;
    const offset = getImageOffset(imageObject);

    // rect의 현재 스크린 좌표 → 이미지 픽셀 좌표로 역변환
    if ('obb' in annotation) {
      // OBB: strokeWidth 보정 포함한 정확한 좌표 추출
      const strokeWidth = rect.strokeWidth ?? 2;
      console.log('[OBB Modified] BEFORE:', {
        id: annotation.id,
        rectLeft: rect.left,
        rectTop: rect.top,
        rectWidth: rect.width,
        rectHeight: rect.height,
        rectScaleX: rect.scaleX,
        rectScaleY: rect.scaleY,
        rectAngle: rect.angle,
        strokeWidth,
        scale,
        offset: { x: offset.x, y: offset.y }
      });
      
      const newObb = getAccurateOBBFromRect(rect, scale, offset.x, offset.y);
      
      console.log('[OBB Modified] AFTER:', {
        cx: newObb[0],
        cy: newObb[1],
        width: newObb[2],
        height: newObb[3],
        angle: newObb[4]
      });
      
      workspaceManager.updateOBBAnnotation(annotation.id, newObb);
      normalizeObbRectAfterModify(rect, newObb, scale, offset.x, offset.y);
    } else {
      // BB: strokeWidth 보정 포함한 정확한 좌표 추출
      const strokeWidth = rect.strokeWidth ?? 2;
      console.log('[BB Modified] BEFORE:', {
        id: annotation.id,
        rectLeft: rect.left,
        rectTop: rect.top,
        rectWidth: rect.width,
        rectHeight: rect.height,
        rectScaleX: rect.scaleX,
        rectScaleY: rect.scaleY,
        strokeWidth,
        getScaledWidth: rect.getScaledWidth(),
        getScaledHeight: rect.getScaledHeight(),
        scale,
        offset: { x: offset.x, y: offset.y }
      });
      
      const newBbox = getAccurateBBoxFromRect(rect, scale, offset.x, offset.y);

      console.log('[BB Modified] AFTER:', {
        xmin: newBbox[0],
        ymin: newBbox[1],
        xmax: newBbox[2],
        ymax: newBbox[3]
      });

      workspaceManager.updateBBAnnotation(annotation.id, newBbox);
    }

    // 뱃지 위치도 rect에 맞춰 동기화
    const objects = labelBoxes.get(annotation.id);
    if (objects) {
      if ('obb' in annotation) {
        const updated = workspaceManager.getOBBAnnotationById(annotation.id);
        if (updated) {
          updateLabelBadgePosition(objects.badge, updated.obb, scale, offset.x, offset.y);
        }
      } else {
        const updated = workspaceManager.getBBAnnotationById(annotation.id);
        if (updated) {
          updateLabelBadgePosition(objects.badge, updated.bbox, scale, offset.x, offset.y);
        }
      }
    }
    rect.setCoords();
    fabricCanvas?.requestRenderAll();
    console.log('Box modified:', annotation.id);
  });

  if (workspaceManager.selectedLabelId === annotation.id) {
    setBoxSelectedStyle(rect, true);
  }

  fabricCanvas.add(badge.background);
  fabricCanvas.add(badge.text);
  fabricCanvas.add(rect);
  fabricCanvas.bringObjectToFront(rect);
  labelBoxes.set(annotation.id, { rect, badge });

  // 현재 도구에 맞는 커서를 신규 박스에도 즉시 적용
  const currentTool = toolManager.currentTool;
  if (currentTool === 'box') {
    rect.hoverCursor = 'crosshair';
    rect.moveCursor = 'crosshair';
  } else if (currentTool === 'pan') {
    rect.hoverCursor = 'grab';
    rect.moveCursor = 'grab';
  } else {
    rect.hoverCursor = 'move';
    rect.moveCursor = 'move';
  }

  fabricCanvas.requestRenderAll();
}

/**
 * 캔버스에서 라벨 박스 제거
 */
export function removeBoxFromCanvas(
  labelId: string,
  fabricCanvas: Canvas,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  if (!fabricCanvas) return;

  const objects = labelBoxes.get(labelId);
  if (objects) {
    fabricCanvas.remove(objects.rect);
    fabricCanvas.remove(objects.badge.background);
    fabricCanvas.remove(objects.badge.text);
    labelBoxes.delete(labelId);
    fabricCanvas.requestRenderAll();
  }
}

/**
 * 모든 라벨 박스 위치 업데이트 (줌/패닝 후)
 */
export function updateAllBoxPositions(
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const { fabricCanvas, imageObject, workspaceManager } = context;

  if (!fabricCanvas || !imageObject) return;

  const scale = imageObject.scaleX || 1;
  const offset = getImageOffset(imageObject);

  labelBoxes.forEach((objects, labelId) => {
    const bbAnnotation = workspaceManager.getBBAnnotationById(labelId);
    const obbAnnotation = workspaceManager.getOBBAnnotationById(labelId);
    const annotation = bbAnnotation ?? obbAnnotation;

    if (annotation) {
      const coords = 'bbox' in annotation ? annotation.bbox : annotation.obb;
      updateBoxPosition(objects.rect, coords, scale, offset.x, offset.y);
      updateLabelBadgePosition(objects.badge, coords, scale, offset.x, offset.y);
    }
  });

  fabricCanvas.requestRenderAll();
}

/**
 * 저장된 라벨들을 캔버스에 렌더링
 */
export function renderLabels(
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>,
  drawingBox: { value: any }
): void {
  const { fabricCanvas, workspaceManager } = context;

  if (!fabricCanvas) return;

  clearCanvasOverlays(fabricCanvas, labelBoxes, drawingBox);

  // 현재 라벨 데이터에서 BBAnnotation만 렌더링
  const labelData = workspaceManager.currentLabelData;
  if (!labelData || !labelData.annotations) return;

  labelData.annotations.forEach((ann) => {
    // bbox가 있는 경우만 BB로 처리
    if ('bbox' in ann || 'obb' in ann) {
      addBoxToCanvas(ann as BBAnnotation | OBBAnnotation, context, labelBoxes);
    }
  });
}

/**
 * 라벨 데이터 변경 감지 후 캔버스 동기화
 */
export function syncLabelChanges(
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const { fabricCanvas, imageObject, workspaceManager } = context;

  const currentLabels = workspaceManager.currentLabels;
  if (!fabricCanvas || !imageObject) return;

  // 현재 캔버스에 있는 라벨 ID 집합 (스냅샷)
  const canvasLabelIds = new Set(labelBoxes.keys());

  // 새로운 라벨 ID 집합
  const newLabelIds = new Set(currentLabels.map(l => l.id));

  // 삭제된 라벨 제거
  canvasLabelIds.forEach(id => {
    if (!newLabelIds.has(id)) {
      removeBoxFromCanvas(id, fabricCanvas, labelBoxes);
    }
  });

  const labelData = workspaceManager.currentLabelData;
  if (!labelData?.annotations) return;

  const scale = imageObject.scaleX || 1;
  const offset = getImageOffset(imageObject);

  // 추가/갱신 동기화
  labelData.annotations.forEach((ann) => {
    if (!('bbox' in ann) && !('obb' in ann)) return;

    const annotation = ann as BBAnnotation | OBBAnnotation;
    const existingObjects = labelBoxes.get(annotation.id);

    if (!existingObjects) {
      addBoxToCanvas(annotation, context, labelBoxes);
      return;
    }

    const coords = 'bbox' in annotation ? annotation.bbox : annotation.obb;
    updateBoxPosition(existingObjects.rect, coords, scale, offset.x, offset.y);
    updateLabelBadgePosition(existingObjects.badge, coords, scale, offset.x, offset.y);
    setBoxSelectedStyle(existingObjects.rect, workspaceManager.selectedLabelId === annotation.id);
    existingObjects.rect.setCoords();
  });

  fabricCanvas.requestRenderAll();
}