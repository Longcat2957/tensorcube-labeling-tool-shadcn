/**
 * 캔버스 라벨 박스 매니저
 * Fabric.js 객체(라벨 박스 + 뱃지)의 생성/삭제/동기화를 담당
 */
import type { Canvas, FabricImage } from 'fabric';
import type { WorkspaceManager } from '../stores/workspace.svelte.js';
import type { ToolManager } from '../stores/toolManager.svelte.js';
import type { BBAnnotation, OBBAnnotation } from '../stores/workspace.svelte.js';
import {
  createLabelBox,
  createOBBLabelBox,
  createLabelBadge,
  updateBoxPosition,
  updateLabelBadgePosition,
  setBoxSelectedStyle,
  screenToObb,
  normalizeObbRectAfterModify,
  type LabelBadgeObjects,
  type LabelBoxRect,
} from './boxRenderer.js';
import { screenToImage } from './coordUtils.js';

interface CanvasLabelObjects {
  rect: LabelBoxRect;
  badge: LabelBadgeObjects;
}

export interface LabelManager {
  getImageOffset: () => { x: number; y: number };
  addBoxToCanvas: (annotation: BBAnnotation | OBBAnnotation) => void;
  removeBoxFromCanvas: (labelId: string) => void;
  updateAllBoxPositions: () => void;
  renderLabels: () => void;
  clearCanvasOverlays: () => void;
  syncLabels: (
    currentLabels: { id: string }[],
    annotations: (BBAnnotation | OBBAnnotation)[]
  ) => void;
  updateCursor: (currentTool: string) => void;
}

export function createLabelManager(
  getCanvas: () => Canvas | null,
  getCurrentImage: () => FabricImage | null,
  workspaceManager: WorkspaceManager,
  toolManager: ToolManager
): LabelManager {
  const labelBoxes = new Map<string, CanvasLabelObjects>();

  function getImageOffset(): { x: number; y: number } {
    const img = getCurrentImage();
    if (!img) return { x: 0, y: 0 };
    const imgWidth = img.width ?? 1;
    const imgHeight = img.height ?? 1;
    const scale = img.scaleX ?? 1;
    const imgCenterX = img.left ?? 0;
    const imgCenterY = img.top ?? 0;
    return {
      x: imgCenterX - (imgWidth * scale) / 2,
      y: imgCenterY - (imgHeight * scale) / 2,
    };
  }

  function clearCanvasOverlays(): void {
    const canvas = getCanvas();
    if (!canvas) return;
    labelBoxes.forEach((objects) => {
      canvas.remove(objects.rect);
      canvas.remove(objects.badge.background);
      canvas.remove(objects.badge.text);
    });
    labelBoxes.clear();
  }

  function addBoxToCanvas(annotation: BBAnnotation | OBBAnnotation): void {
    const canvas = getCanvas();
    const img = getCurrentImage();
    if (!canvas || !img) return;

    // 기존 박스가 있으면 교체
    const existing = labelBoxes.get(annotation.id);
    if (existing) {
      canvas.remove(existing.rect);
      canvas.remove(existing.badge.background);
      canvas.remove(existing.badge.text);
      labelBoxes.delete(annotation.id);
    }

    const scale = img.scaleX ?? 1;
    const offset = getImageOffset();
    const className =
      workspaceManager.workspaceConfig?.names?.[annotation.class_id] ??
      `Class ${annotation.class_id}`;

    const rect =
      'bbox' in annotation
        ? createLabelBox(annotation, scale, offset.x, offset.y)
        : createOBBLabelBox(annotation, scale, offset.x, offset.y);

    const badge = createLabelBadge(annotation, className, scale, offset.x, offset.y);

    // 선택 이벤트
    rect.on('selected', () => {
      if (toolManager.currentTool === 'pan') {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        return;
      }
      workspaceManager.setSelectedLabelId(annotation.id);
      setBoxSelectedStyle(rect, true);
      canvas.requestRenderAll();
    });

    rect.on('deselected', () => {
      if (workspaceManager.selectedLabelId === annotation.id) {
        workspaceManager.setSelectedLabelId(null);
      }
      setBoxSelectedStyle(rect, false);
      canvas.requestRenderAll();
    });

    // 수정(이동/리사이즈) 완료 이벤트
    rect.on('modified', () => {
      const currentImg = getCurrentImage();
      if (!currentImg) return;
      const s = currentImg.scaleX ?? 1;
      const off = getImageOffset();

      if ('obb' in annotation) {
        const newObb = screenToObb(rect, s, off.x, off.y);
        workspaceManager.updateOBBAnnotation(annotation.id, newObb);
        normalizeObbRectAfterModify(rect, newObb, s, off.x, off.y);
      } else {
        const newBbox = screenToImage(
          {
            left: rect.left,
            top: rect.top,
            width: rect.getScaledWidth(),
            height: rect.getScaledHeight(),
          },
          s,
          off.x,
          off.y
        );
        workspaceManager.updateBBAnnotation(annotation.id, newBbox);
      }

      const objects = labelBoxes.get(annotation.id);
      if (objects) {
        if ('obb' in annotation) {
          const updated = workspaceManager.getOBBAnnotationById(annotation.id);
          if (updated) updateLabelBadgePosition(objects.badge, updated.obb, s, off.x, off.y);
        } else {
          const updated = workspaceManager.getBBAnnotationById(annotation.id);
          if (updated) updateLabelBadgePosition(objects.badge, updated.bbox, s, off.x, off.y);
        }
      }
      rect.setCoords();
      canvas.requestRenderAll();
    });

    if (workspaceManager.selectedLabelId === annotation.id) {
      setBoxSelectedStyle(rect, true);
    }

    // 현재 도구에 맞는 커서 즉시 적용
    applyCursorToRect(rect, toolManager.currentTool);

    canvas.add(badge.background);
    canvas.add(badge.text);
    canvas.add(rect);
    canvas.bringObjectToFront(rect);
    labelBoxes.set(annotation.id, { rect, badge });
    canvas.requestRenderAll();
  }

  function removeBoxFromCanvas(labelId: string): void {
    const canvas = getCanvas();
    if (!canvas) return;
    const objects = labelBoxes.get(labelId);
    if (!objects) return;
    canvas.remove(objects.rect);
    canvas.remove(objects.badge.background);
    canvas.remove(objects.badge.text);
    labelBoxes.delete(labelId);
    canvas.requestRenderAll();
  }

  function updateAllBoxPositions(): void {
    const canvas = getCanvas();
    const img = getCurrentImage();
    if (!canvas || !img) return;

    const scale = img.scaleX ?? 1;
    const offset = getImageOffset();

    labelBoxes.forEach((objects, labelId) => {
      const bbAnnotation = workspaceManager.getBBAnnotationById(labelId);
      const obbAnnotation = workspaceManager.getOBBAnnotationById(labelId);
      const annotation = bbAnnotation ?? obbAnnotation;
      if (!annotation) return;
      const coords = 'bbox' in annotation ? annotation.bbox : annotation.obb;
      updateBoxPosition(objects.rect, coords, scale, offset.x, offset.y);
      updateLabelBadgePosition(objects.badge, coords, scale, offset.x, offset.y);
    });

    canvas.requestRenderAll();
  }

  function renderLabels(): void {
    clearCanvasOverlays();
    const labelData = workspaceManager.currentLabelData;
    if (!labelData?.annotations) return;
    labelData.annotations.forEach((ann) => {
      if ('bbox' in ann || 'obb' in ann) {
        addBoxToCanvas(ann as BBAnnotation | OBBAnnotation);
      }
    });
  }

  /**
   * 라벨 데이터 변경 시 캔버스 박스 목록을 동기화 (추가/삭제/위치 갱신)
   */
  function syncLabels(
    currentLabels: { id: string }[],
    annotations: (BBAnnotation | OBBAnnotation)[]
  ): void {
    const canvas = getCanvas();
    const img = getCurrentImage();
    if (!canvas || !img) return;

    const newLabelIds = new Set(currentLabels.map((l) => l.id));

    // 삭제된 라벨 제거
    [...labelBoxes.keys()].forEach((id) => {
      if (!newLabelIds.has(id)) removeBoxFromCanvas(id);
    });

    const scale = img.scaleX ?? 1;
    const offset = getImageOffset();

    // 추가/갱신
    annotations.forEach((ann) => {
      const existingObjects = labelBoxes.get(ann.id);
      if (!existingObjects) {
        addBoxToCanvas(ann);
        return;
      }
      const coords = 'bbox' in ann ? ann.bbox : ann.obb;
      updateBoxPosition(existingObjects.rect, coords, scale, offset.x, offset.y);
      updateLabelBadgePosition(existingObjects.badge, coords, scale, offset.x, offset.y);
      setBoxSelectedStyle(
        existingObjects.rect,
        workspaceManager.selectedLabelId === ann.id
      );
      existingObjects.rect.setCoords();
    });

    canvas.requestRenderAll();
  }

  function applyCursorToRect(rect: LabelBoxRect, tool: string): void {
    if (tool === 'box') {
      rect.hoverCursor = 'crosshair';
      rect.moveCursor = 'crosshair';
    } else if (tool === 'pan') {
      rect.hoverCursor = 'grab';
      rect.moveCursor = 'grab';
    } else {
      rect.hoverCursor = 'move';
      rect.moveCursor = 'move';
    }
  }

  function updateCursor(currentTool: string): void {
    const canvas = getCanvas();
    if (!canvas) return;

    let canvasCursor: string;
    switch (currentTool) {
      case 'pan':
        canvasCursor = 'grab';
        break;
      case 'box':
        canvasCursor = 'crosshair';
        break;
      default:
        canvasCursor = 'default';
    }

    canvas.defaultCursor = canvasCursor;
    canvas.hoverCursor = canvasCursor;

    labelBoxes.forEach(({ rect }) => {
      applyCursorToRect(rect, currentTool);
    });
  }

  return {
    getImageOffset,
    addBoxToCanvas,
    removeBoxFromCanvas,
    updateAllBoxPositions,
    renderLabels,
    clearCanvasOverlays,
    syncLabels,
    updateCursor,
  };
}
