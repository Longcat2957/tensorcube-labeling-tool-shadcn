/**
 * 캔버스 드로잉 컨트롤러
 * 박스 드로잉 임시 렌더링 및 라벨 생성 로직
 */
import type { Canvas, FabricImage, Rect } from 'fabric';
import type { WorkspaceManager } from '../stores/workspace.svelte.js';
import type { ToolManager } from '../stores/toolManager.svelte.js';
import type { BBAnnotation, OBBAnnotation } from '../stores/workspace.svelte.js';
import { normalizeBbox, bboxToObb } from './coordUtils.js';
import { createDrawingBox } from './boxRenderer.js';

export interface DrawingController {
  updateDrawingBox: (getImageOffset: () => { x: number; y: number }) => void;
  removeDrawingBox: () => void;
  createLabelFromDrawing: (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => void;
}

export function createDrawingController(
  getCanvas: () => Canvas | null,
  getCurrentImage: () => FabricImage | null,
  toolManager: ToolManager,
  workspaceManager: WorkspaceManager
): DrawingController {
  let drawingBox: Rect | null = null;

  function updateDrawingBox(getImageOffset: () => { x: number; y: number }): void {
    const canvas = getCanvas();
    const img = getCurrentImage();
    if (!canvas || !img || !toolManager.drawingStart || !toolManager.drawingCurrent) return;

    if (drawingBox) {
      canvas.remove(drawingBox);
    }

    const scale = img.scaleX ?? 1;
    const offset = getImageOffset();

    drawingBox = createDrawingBox(
      toolManager.drawingStart,
      toolManager.drawingCurrent,
      scale,
      offset.x,
      offset.y,
      workspaceManager.selectedClassId
    );

    canvas.add(drawingBox);
    canvas.requestRenderAll();
  }

  function removeDrawingBox(): void {
    const canvas = getCanvas();
    if (!drawingBox || !canvas) return;
    canvas.remove(drawingBox);
    drawingBox = null;
    canvas.requestRenderAll();
  }

  function createLabelFromDrawing(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 3 || height < 3) return;

    const bbox = normalizeBbox(start.x, start.y, end.x, end.y);
    const id = `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (workspaceManager.isOBBMode) {
      const annotation: OBBAnnotation = {
        id,
        class_id: workspaceManager.selectedClassId,
        obb: bboxToObb(bbox),
      };
      workspaceManager.addOBBAnnotation(annotation);
      return;
    }

    const annotation: BBAnnotation = {
      id,
      class_id: workspaceManager.selectedClassId,
      bbox,
    };
    workspaceManager.addBBAnnotation(annotation);
  }

  return { updateDrawingBox, removeDrawingBox, createLabelFromDrawing };
}
