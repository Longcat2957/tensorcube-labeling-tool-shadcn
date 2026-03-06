<script lang="ts">
  import { getContext, onMount, onDestroy, tick } from "svelte";
  import { Canvas, FabricImage } from "fabric";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";
  import { TOOL_MANAGER_KEY, type ToolManager } from "$lib/stores/toolManager.svelte.js";
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from "$lib/stores/keyboardManager.svelte.js";
  import type { BBAnnotation, OBBAnnotation } from "$lib/stores/workspace.svelte.js";
  import { createViewportController } from "$lib/canvas/canvasViewport.js";
  import { createDrawingController } from "$lib/canvas/canvasDrawing.js";
  import { createLabelManager } from "$lib/canvas/canvasLabelManager.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);
  const toolManager = getContext<ToolManager>(TOOL_MANAGER_KEY);
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY);

  let canvasEl: HTMLCanvasElement;
  let canvasContainer: HTMLDivElement;
  let fabricCanvas: Canvas | null = null;
  let currentImageObject: FabricImage | null = null;
  let isInitialized = false;
  let loadingImageId: string | null = null;

  // 컨트롤러 초기화 (fabricCanvas가 준비된 후 사용)
  const viewport = createViewportController(
    () => fabricCanvas,
    () => currentImageObject,
    workspaceManager
  );
  const drawing = createDrawingController(
    () => fabricCanvas,
    () => currentImageObject,
    toolManager,
    workspaceManager
  );
  const labelManager = createLabelManager(
    () => fabricCanvas,
    () => currentImageObject,
    workspaceManager,
    toolManager
  );

  // ─── 이미지 관련 ────────────────────────────────────────────

  function fitImageToCanvas(): void {
    if (!fabricCanvas || !currentImageObject) return;
    const canvasWidth = fabricCanvas.width ?? 1;
    const canvasHeight = fabricCanvas.height ?? 1;
    const imgWidth = currentImageObject.width ?? 1;
    const imgHeight = currentImageObject.height ?? 1;
    const scale = Math.min((canvasWidth * 0.95) / imgWidth, (canvasHeight * 0.95) / imgHeight);
    currentImageObject.set({ scaleX: scale, scaleY: scale, left: canvasWidth / 2, top: canvasHeight / 2 });
    workspaceManager.setZoomLevel(scale);
    viewport.updateViewportState();
  }

  async function loadImage(): Promise<void> {
    if (!fabricCanvas) return;
    if (!workspaceManager.workspacePath || !workspaceManager.currentImage) return;

    const targetId = workspaceManager.currentImage.id;
    if (targetId === loadingImageId && currentImageObject) return;
    loadingImageId = targetId;

    try {
      labelManager.clearCanvasOverlays();
      if (currentImageObject) {
        fabricCanvas.remove(currentImageObject);
        currentImageObject = null;
      }

      const imagePath = await window.api.label.getImagePath(workspaceManager.workspacePath!, targetId);
      if (loadingImageId !== targetId || !fabricCanvas) return;
      if (!imagePath) return;

      const imageUrl = window.api.utils.getWorkspaceImageUrl(imagePath);
      const img = await FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });

      if (loadingImageId !== targetId || !fabricCanvas) return;

      if (currentImageObject) {
        fabricCanvas.remove(currentImageObject);
        currentImageObject = null;
      }

      currentImageObject = img;
      workspaceManager.setImageSize(img.width ?? 0, img.height ?? 0);
      img.set({ selectable: false, evented: false, originX: 'center', originY: 'center' });
      fabricCanvas.add(img);
      fitImageToCanvas();
      labelManager.renderLabels();
      fabricCanvas.requestRenderAll();
    } catch (error) {
      console.error("이미지 로드 실패:", error);
    }
  }

  // ─── 마우스 이벤트 핸들러 ────────────────────────────────────

  function screenToImagePixel(screenX: number, screenY: number): { x: number; y: number } {
    if (!currentImageObject) return { x: 0, y: 0 };
    const offset = labelManager.getImageOffset();
    const scale = currentImageObject.scaleX ?? 1;
    return {
      x: Math.round((screenX - offset.x) / scale),
      y: Math.round((screenY - offset.y) / scale),
    };
  }

  function handleMouseDown(opt: any): void {
    if (!fabricCanvas || !currentImageObject) return;
    const pointer = opt.scenePoint ?? { x: 0, y: 0 };
    const imageCoords = screenToImagePixel(pointer.x, pointer.y);
    const activeObject = fabricCanvas.getActiveObject();

    switch (toolManager.currentTool) {
      case 'select':
        if (!activeObject) viewport.startPan(pointer.x, pointer.y);
        break;
      case 'box':
        if (!activeObject || (activeObject as any).data?.type !== 'label') {
          toolManager.startDrawing(imageCoords);
        }
        break;
      case 'pan':
        viewport.startPan(pointer.x, pointer.y);
        break;
    }
  }

  function handleMouseMove(opt: any): void {
    if (!fabricCanvas || !currentImageObject) return;
    const pointer = opt.scenePoint ?? { x: 0, y: 0 };
    const imageCoords = screenToImagePixel(pointer.x, pointer.y);
    toolManager.updateMousePosition(imageCoords.x, imageCoords.y);

    if (viewport.isPanning()) {
      viewport.updatePan(pointer.x, pointer.y, labelManager.updateAllBoxPositions);
      return;
    }

    if (toolManager.isDrawing) {
      toolManager.updateDrawing(imageCoords);
      drawing.updateDrawingBox(labelManager.getImageOffset);
    }
  }

  function handleMouseUp(): void {
    if (!fabricCanvas || !currentImageObject) return;

    if (viewport.isPanning()) {
      viewport.endPan(toolManager.currentTool);
      return;
    }

    if (toolManager.isDrawing) {
      const result = toolManager.endDrawing();
      if (result.start && result.end && toolManager.currentTool === 'box') {
        drawing.createLabelFromDrawing(result.start, result.end);
      }
      drawing.removeDrawingBox();
    }
  }

  // ─── 캔버스 초기화 ──────────────────────────────────────────

  async function initCanvas(): Promise<void> {
    if (!canvasEl || !canvasContainer) return;
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    fabricCanvas = new Canvas(canvasEl, { backgroundColor: "#2a2a2a", selection: false });
    fabricCanvas.setDimensions({ width, height });
    workspaceManager.setCanvasSize(width, height);

    fabricCanvas.on("mouse:wheel", (e) => viewport.handleMouseWheel(e));
    fabricCanvas.on("mouse:down", handleMouseDown);
    fabricCanvas.on("mouse:move", handleMouseMove);
    fabricCanvas.on("mouse:up", handleMouseUp);
    fabricCanvas.on("selection:cleared", () => workspaceManager.setSelectedLabelId(null));

    isInitialized = true;
  }

  function resizeCanvas(): void {
    if (!fabricCanvas || !canvasContainer) return;
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    if (width === 0 || height === 0) return;
    fabricCanvas.setDimensions({ width, height });
    workspaceManager.setCanvasSize(width, height);
    if (currentImageObject) {
      fitImageToCanvas();
      labelManager.updateAllBoxPositions();
      fabricCanvas.requestRenderAll();
    }
  }

  function selectAdjacentClass(direction: -1 | 1): void {
    const classes = workspaceManager.classList;
    if (classes.length === 0) return;
    const currentIndex = classes.findIndex((cls) => cls.id === workspaceManager.selectedClassId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + direction + classes.length) % classes.length;
    workspaceManager.setSelectedClassId(classes[nextIndex].id);
  }

  // ─── 반응형 이펙트 ──────────────────────────────────────────

  // 이미지 변경 감지
  $effect(() => {
    if (workspaceManager.currentImage && fabricCanvas && isInitialized) {
      loadImage();
    }
  });

  // 도구 변경 시 커서 업데이트
  $effect(() => {
    if (fabricCanvas && isInitialized) {
      labelManager.updateCursor(toolManager.currentTool);
    }
  });

  // 라벨 데이터 변경 감지 (추가/삭제/수정)
  $effect(() => {
    const currentLabels = workspaceManager.currentLabels;
    if (!fabricCanvas || !isInitialized || !currentImageObject) return;

    const labelData = workspaceManager.currentLabelData;
    const annotations = (labelData?.annotations ?? []).filter(
      (ann): ann is BBAnnotation | OBBAnnotation => 'bbox' in ann || 'obb' in ann
    );

    labelManager.syncLabels(currentLabels, annotations);
  });

  // ─── 생명주기 ────────────────────────────────────────────────

  let resizeObserver: ResizeObserver | null = null;
  let cleanupHandlers: (() => void)[] = [];

  onMount(async () => {
    await tick();
    await initCanvas();

    if (canvasContainer) {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(canvasContainer);
    }

    cleanupHandlers.push(
      keyboardManager.onAction('center-image', () => {
        if (currentImageObject && fabricCanvas) {
          fitImageToCanvas();
          labelManager.updateAllBoxPositions();
          fabricCanvas.requestRenderAll();
        }
      }),
      keyboardManager.onAction('pan-tool', () => toolManager.setTool('pan')),
      keyboardManager.onAction('prev-class', () => selectAdjacentClass(-1)),
      keyboardManager.onAction('next-class', () => selectAdjacentClass(1)),
      keyboardManager.onAction('delete', () => {
        const selectedId = workspaceManager.selectedLabelId;
        if (selectedId) workspaceManager.deleteLabel(selectedId);
      }),
      keyboardManager.onAction('undo', () => workspaceManager.undo()),
      keyboardManager.onAction('redo', () => workspaceManager.redo())
    );

    if (workspaceManager.currentImage) {
      await loadImage();
    }
  });

  onDestroy(() => {
    cleanupHandlers.forEach((c) => c());
    cleanupHandlers = [];
    resizeObserver?.disconnect();
    fabricCanvas?.dispose();
    fabricCanvas = null;
  });
</script>

<main
  class="flex-1 h-full bg-muted/20 relative overflow-hidden"
  role="img"
  aria-label="이미지 캔버스"
>
  <div bind:this={canvasContainer} class="absolute inset-0 w-full h-full">
    <canvas bind:this={canvasEl}></canvas>
  </div>

  {#if !workspaceManager.currentImage}
    <div class="absolute inset-0 flex items-center justify-center text-muted-foreground">
      <p>이미지를 선택해주세요</p>
    </div>
  {/if}
</main>
