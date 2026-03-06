/**
 * 캔버스 줌/패닝 컨트롤러
 * CanvasArea.svelte 에서 줌・패닝 관련 로직을 분리한 모듈
 */
import type { Canvas, FabricImage } from 'fabric';
import type { WorkspaceManager } from '../stores/workspace.svelte.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.1;

export interface ViewportController {
  isPanning: () => boolean;
  startPan: (pointerX: number, pointerY: number) => void;
  updatePan: (pointerX: number, pointerY: number, onMove: () => void) => void;
  endPan: (currentTool: string) => void;
  handleMouseWheel: (event: { e: WheelEvent }) => void;
  applyZoom: (newZoom: number) => void;
  updateViewportState: () => void;
}

export function createViewportController(
  getCanvas: () => Canvas | null,
  getCurrentImage: () => FabricImage | null,
  workspaceManager: WorkspaceManager
): ViewportController {
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let imgStartLeft = 0;
  let imgStartTop = 0;

  function startPan(pointerX: number, pointerY: number): void {
    const img = getCurrentImage();
    if (!img) return;
    isPanning = true;
    panStartX = pointerX;
    panStartY = pointerY;
    imgStartLeft = img.left ?? 0;
    imgStartTop = img.top ?? 0;
    const canvas = getCanvas();
    if (canvas) {
      canvas.defaultCursor = 'grabbing';
      canvas.hoverCursor = 'grabbing';
    }
  }

  function updatePan(pointerX: number, pointerY: number, onMove: () => void): void {
    const canvas = getCanvas();
    const img = getCurrentImage();
    if (!canvas || !img || !isPanning) return;

    img.set({
      left: imgStartLeft + (pointerX - panStartX),
      top: imgStartTop + (pointerY - panStartY),
    });

    updateViewportState();
    onMove();
    canvas.requestRenderAll();
  }

  function endPan(currentTool: string): void {
    if (!isPanning) return;
    isPanning = false;
    const canvas = getCanvas();
    if (!canvas) return;
    if (currentTool === 'pan') {
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
    } else {
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'default';
    }
  }

  function handleMouseWheel(event: { e: WheelEvent }): void {
    const e = event.e;
    if (!e.ctrlKey) return;
    e.preventDefault();

    const delta = e.deltaY;
    let newZoom = workspaceManager.zoomLevel;
    if (delta < 0) {
      newZoom = Math.min(MAX_ZOOM, newZoom + ZOOM_STEP);
    } else {
      newZoom = Math.max(MIN_ZOOM, newZoom - ZOOM_STEP);
    }
    applyZoom(newZoom);
  }

  function applyZoom(newZoom: number): void {
    const canvas = getCanvas();
    const img = getCurrentImage();
    if (!canvas || !img) return;

    const canvasWidth = canvas.width ?? 1;
    const canvasHeight = canvas.height ?? 1;
    const oldZoom = img.scaleX ?? 1;
    const oldLeft = img.left ?? canvasWidth / 2;
    const oldTop = img.top ?? canvasHeight / 2;

    const ratio = newZoom / oldZoom;
    const newLeft = canvasWidth / 2 + (oldLeft - canvasWidth / 2) * ratio;
    const newTop = canvasHeight / 2 + (oldTop - canvasHeight / 2) * ratio;

    workspaceManager.setZoomLevel(newZoom);
    img.set({ scaleX: newZoom, scaleY: newZoom, left: newLeft, top: newTop });

    updateViewportState();
  }

  function updateViewportState(): void {
    const img = getCurrentImage();
    if (!img) return;
    const imgWidth = img.width ?? 0;
    const imgHeight = img.height ?? 0;
    const scale = img.scaleX ?? 1;
    const imgCenterX = img.left ?? 0;
    const imgCenterY = img.top ?? 0;
    workspaceManager.setViewport(
      imgCenterX - (imgWidth * scale) / 2,
      imgCenterY - (imgHeight * scale) / 2
    );
  }

  return {
    isPanning: () => isPanning,
    startPan,
    updatePan,
    endPan,
    handleMouseWheel,
    applyZoom,
    updateViewportState,
  };
}
