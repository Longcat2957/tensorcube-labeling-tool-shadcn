/**
 * 캔버스 초기화 및 설정
 */

import { Canvas } from "fabric";

export interface CanvasInitOptions {
  canvasEl: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface CanvasEventHandlers {
  onWheel: (event: { e: WheelEvent }) => void;
  onMouseDown: (opt: any) => void;
  onMouseMove: (opt: any) => void;
  onMouseUp: () => void;
  onSelectionCleared: () => void;
}

/**
 * Fabric.js 캔버스 초기화
 */
export function initFabricCanvas(options: CanvasInitOptions): Canvas {
  const { canvasEl, width, height } = options;

  const fabricCanvas = new Canvas(canvasEl, {
    backgroundColor: "#2a2a2a",
    selection: false, // 드래그 선택 박스 비활성화
  });

  fabricCanvas.setDimensions({ width, height });

  return fabricCanvas;
}

/**
 * 캔버스 이벤트 핸들러 등록
 */
export function registerCanvasEvents(
  fabricCanvas: Canvas,
  handlers: CanvasEventHandlers
): void {
  fabricCanvas.on("mouse:wheel", handlers.onWheel);
  fabricCanvas.on("mouse:down", handlers.onMouseDown);
  fabricCanvas.on("mouse:move", handlers.onMouseMove);
  fabricCanvas.on("mouse:up", handlers.onMouseUp);
  fabricCanvas.on("selection:cleared", handlers.onSelectionCleared);
}

/**
 * 캔버스 크기 조절
 */
export function resizeCanvas(
  fabricCanvas: Canvas,
  width: number,
  height: number
): void {
  if (width === 0 || height === 0) return;
  fabricCanvas.setDimensions({ width, height });
}