<script lang="ts">
  import { getContext as getSvelteContext, onMount, onDestroy, tick } from "svelte";
  import { Canvas, FabricImage, Rect } from "fabric";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";
  import { TOOL_MANAGER_KEY, type ToolManager } from "$lib/stores/toolManager.svelte.js";
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from "$lib/stores/keyboardManager.svelte.js";

  // 캔버스 코어 모듈
  import { initFabricCanvas, registerCanvasEvents, resizeCanvas } from "$lib/canvas/core/canvasSetup.js";
  import { 
    fitImageToCanvas, 
    loadImageToCanvas
  } from "$lib/canvas/core/imageLoader.js";

  // 인터랙션 모듈
  import { handleMouseWheel } from "$lib/canvas/interaction/zoomHandler.js";
  import { 
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    updateDrawingBoxRender,
    removeDrawingBoxRender,
    createLabelFromDrawingCoords,
    updateCursor,
    type CanvasLabelObjects
  } from "$lib/canvas/interaction/mouseHandlers.js";

  // 라벨 관리 모듈
  import { 
    clearCanvasOverlays, 
    updateAllBoxPositions,
    renderLabels,
    syncLabelChanges
  } from "$lib/canvas/labels/labelManager.js";

  const workspaceManager = getSvelteContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);
  const toolManager = getSvelteContext<ToolManager>(TOOL_MANAGER_KEY);
  const keyboardManager = getSvelteContext<KeyboardManager>(KEYBOARD_MANAGER_KEY);

  let canvasEl: HTMLCanvasElement;
  let canvasContainer: HTMLDivElement;
  let fabricCanvas: Canvas | null = null;
  let currentImageObject: FabricImage | null = null;
  let isInitialized = false;

  // 드로잉 박스 상태
  let drawingBoxState = { value: null as Rect | null };

  // 라벨 박스 맵 (labelId -> render objects)
  let labelBoxes = new Map<string, CanvasLabelObjects>();

  // 현재 로딩 요청 중인 이미지 ID (중복/선점 취소 패턴)
  let loadingImageId: string | null = null;

  // 리사이즈 옵저버
  let resizeObserver: ResizeObserver | null = null;

  // 키보드 핸들러 클린업 함수들
  let cleanupHandlers: (() => void)[] = [];

  // ============================================
  // 캔버스 초기화
  // ============================================
  async function initCanvas(): Promise<void> {
    if (!canvasEl || !canvasContainer) {
      console.error("Canvas element or container not found");
      return;
    }

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    console.log("Initializing canvas with dimensions:", width, height);

    fabricCanvas = initFabricCanvas({
      canvasEl,
      width,
      height,
    });

    workspaceManager.setCanvasSize(width, height);

    // 이벤트 핸들러 등록
    registerCanvasEvents(fabricCanvas, {
      onWheel: (event) => {
        if (fabricCanvas && currentImageObject) {
          handleMouseWheel(event, fabricCanvas, currentImageObject, workspaceManager);
          updateAllBoxPositions(getContext(), labelBoxes);
          fabricCanvas.requestRenderAll();
        }
      },
      onMouseDown: (opt) => handleMouseDown(opt, getMouseHandlerContext(), updateAllBoxPositionsCallback),
      onMouseMove: (opt) => handleMouseMove(opt, getMouseHandlerContext(), updateAllBoxPositionsCallback, updateDrawingBoxCallback),
      onMouseUp: () => handleMouseUp(getMouseHandlerContext(), createLabelFromDrawingCallback, removeDrawingBoxCallback),
      onSelectionCleared: () => workspaceManager.setSelectedLabelId(null),
    });

    isInitialized = true;
    console.log("Canvas initialized successfully");
  }

  // ============================================
  // Context 헬퍼 함수들
  // ============================================
  function getContext() {
    return {
      fabricCanvas: fabricCanvas!,
      imageObject: currentImageObject!,
      workspaceManager,
      toolManager,
    };
  }

  function getMouseHandlerContext() {
    return {
      fabricCanvas: fabricCanvas!,
      imageObject: currentImageObject,
      workspaceManager,
      toolManager,
      labelBoxes,
      drawingBox: drawingBoxState.value,
    };
  }

  // ============================================
  // 콜백 함수들
  // ============================================
  const updateAllBoxPositionsCallback = () => {
    if (fabricCanvas && currentImageObject) {
      updateAllBoxPositions(getContext(), labelBoxes);
    }
  };

  const updateDrawingBoxCallback = () => {
    if (fabricCanvas) {
      const result = updateDrawingBoxRender(getMouseHandlerContext());
      drawingBoxState.value = result;
    }
  };

  const removeDrawingBoxCallback = () => {
    if (fabricCanvas) {
      drawingBoxState.value = removeDrawingBoxRender(fabricCanvas, drawingBoxState.value);
    }
  };

  const createLabelFromDrawingCallback = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    createLabelFromDrawingCoords(start, end, workspaceManager);
  };

  // ============================================
  // 이미지 로드
  // ============================================
  async function loadImage(): Promise<void> {
    if (!fabricCanvas || !workspaceManager.workspacePath || !workspaceManager.currentImage) return;

    const targetId = workspaceManager.currentImage.id;

    if (targetId === loadingImageId && currentImageObject) return;

    loadingImageId = targetId;

    try {
      clearCanvasOverlays(fabricCanvas!, labelBoxes, drawingBoxState);

      const result = await loadImageToCanvas(
        workspaceManager.workspacePath!,
        targetId,
        fabricCanvas,
        currentImageObject
      );

      if (loadingImageId !== targetId || !fabricCanvas || !result.imageObject) {
        return;
      }

      currentImageObject = result.imageObject;
      workspaceManager.setImageSize(result.imageObject.width || 0, result.imageObject.height || 0);

      fitImageToCanvas(fabricCanvas, currentImageObject, workspaceManager);
      renderLabels(getContext(), labelBoxes, drawingBoxState);
      fabricCanvas.requestRenderAll();

      console.log("Image loaded:", targetId);
    } catch (error) {
      console.error("이미지 로드 실패:", error);
    }
  }

  // ============================================
  // 캔버스 크기 조절
  // ============================================
  function handleResize(): void {
    if (!fabricCanvas || !canvasContainer) return;

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    if (width === 0 || height === 0) return;

    resizeCanvas(fabricCanvas, width, height);
    workspaceManager.setCanvasSize(width, height);

    if (currentImageObject) {
      fitImageToCanvas(fabricCanvas, currentImageObject, workspaceManager);
      updateAllBoxPositions(getContext(), labelBoxes);
      fabricCanvas.requestRenderAll();
    }
  }

  // ============================================
  // 클래스 선택 헬퍼
  // ============================================
  function selectAdjacentClass(direction: -1 | 1): void {
    const classes = workspaceManager.classList;
    if (classes.length === 0) return;

    const currentIndex = classes.findIndex((cls) => cls.id === workspaceManager.selectedClassId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + direction + classes.length) % classes.length;

    workspaceManager.setSelectedClassId(classes[nextIndex].id);
  }

  // ============================================
  // 반응형 이펙트
  // ============================================
  // 현재 이미지 변경 감지
  $effect(() => {
    if (workspaceManager.currentImage && fabricCanvas && isInitialized) {
      loadImage();
    }
  });

  // 도구 변경 시 커서 업데이트
  $effect(() => {
    if (fabricCanvas && isInitialized) {
      updateCursor(fabricCanvas, labelBoxes, toolManager.currentTool);
    }
  });

  // 라벨 데이터 변경 감지 - $effect.pre로 DOM 업데이트 전 동기화
  $effect.pre(() => {
    // 의존성 명시: currentLabelData
    const labelData = workspaceManager.currentLabelData;
    
    if (!fabricCanvas || !isInitialized || !currentImageObject || !labelData) return;
    
    syncLabelChanges(getContext(), labelBoxes);
  });

  // ============================================
  // 생명주기
  // ============================================
  onMount(async () => {
    console.log("CanvasArea mounted");
    await tick();
    await initCanvas();

    // ResizeObserver로 컨테이너 크기 변화 감지
    if (canvasContainer) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(canvasContainer);
    }

    // 키보드 단축키 핸들러 등록
    cleanupHandlers.push(
      keyboardManager.onAction('center-image', () => {
        if (currentImageObject && fabricCanvas) {
          fitImageToCanvas(fabricCanvas, currentImageObject, workspaceManager);
          updateAllBoxPositions(getContext(), labelBoxes);
          fabricCanvas.requestRenderAll();
          console.log('Image centered');
        }
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('pan-tool', () => {
        toolManager.setTool('pan');
        console.log('Pan tool selected');
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('prev-class', () => {
        selectAdjacentClass(-1);
        console.log('Previous class selected:', workspaceManager.selectedClassId);
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('next-class', () => {
        selectAdjacentClass(1);
        console.log('Next class selected:', workspaceManager.selectedClassId);
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('delete', () => {
        const selectedId = workspaceManager.selectedLabelId;
        if (selectedId) {
          workspaceManager.deleteLabel(selectedId);
          console.log('Label deleted:', selectedId);
        }
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('undo', () => {
        workspaceManager.undo();
        console.log('Undo applied');
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('redo', () => {
        workspaceManager.redo();
        console.log('Redo applied');
      })
    );

    // 워크스페이스가 열려있으면 이미지 로드
    if (workspaceManager.currentImage) {
      await loadImage();
    }
  });

  onDestroy(() => {
    console.log("CanvasArea destroyed");

    // 키보드 핸들러 클린업
    cleanupHandlers.forEach(cleanup => cleanup());
    cleanupHandlers = [];

    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (fabricCanvas) {
      fabricCanvas.dispose();
      fabricCanvas = null;
    }
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