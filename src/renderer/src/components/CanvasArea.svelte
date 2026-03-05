<script lang="ts">
  import { getContext, onMount, onDestroy, tick } from "svelte";
  import { Canvas, FabricImage } from "fabric";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";
  import { TOOL_MANAGER_KEY, type ToolManager } from "$lib/stores/toolManager.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);
  const toolManager = getContext<ToolManager>(TOOL_MANAGER_KEY);

  let canvasEl: HTMLCanvasElement;
  let canvasContainer: HTMLDivElement;
  let fabricCanvas: Canvas | null = null;
  let currentImageObject: FabricImage | null = null;
  let isInitialized = false;

  // 줌 범위 설정
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 5.0;
  const ZOOM_STEP = 0.1;

  /**
   * 스크린 좌표를 원본 이미지 픽셀 좌표로 변환
   */
  function screenToImagePixel(screenX: number, screenY: number): { x: number; y: number } {
    if (!currentImageObject) {
      return { x: 0, y: 0 };
    }

    const imgWidth = currentImageObject.width || 1;
    const imgHeight = currentImageObject.height || 1;
    const scale = currentImageObject.scaleX || 1;
    const imgCenterX = currentImageObject.left || 0;
    const imgCenterY = currentImageObject.top || 0;

    // 이미지 좌상단 좌표 계산 (origin이 center이므로)
    const imgLeft = imgCenterX - (imgWidth * scale) / 2;
    const imgTop = imgCenterY - (imgHeight * scale) / 2;

    // 스크린 좌표를 원본 픽셀 좌표로 변환
    const imageX = Math.round((screenX - imgLeft) / scale);
    const imageY = Math.round((screenY - imgTop) / scale);

    return { x: imageX, y: imageY };
  }

  /**
   * 도구에 따른 마우스 다운 핸들러
   */
  function handleMouseDown(opt: any): void {
    if (!fabricCanvas || !currentImageObject) return;

    // Fabric.js v7: scenePoint를 사용하여 캔버스 좌표 가져오기
    const pointer = opt.scenePoint || { x: 0, y: 0 };
    const imageCoords = screenToImagePixel(pointer.x, pointer.y);

    console.log(`Mouse down at canvas (${pointer.x.toFixed(1)}, ${pointer.y.toFixed(1)}) -> image (${imageCoords.x}, ${imageCoords.y})`);

    switch (toolManager.currentTool) {
      case 'select':
        // TODO: 객체 선택 로직
        console.log('Select tool: 클릭 위치에서 객체 선택 시도');
        break;
      
      case 'box':
        // 박스 그리기 시작
        toolManager.startDrawing(imageCoords);
        console.log('Box tool: 드로잉 시작', imageCoords);
        break;
      
      case 'pan':
        // TODO: 패닝 시작
        console.log('Pan tool: 패닝 시작');
        break;
    }
  }

  /**
   * 마우스 이동 핸들러
   */
  function handleMouseMove(opt: any): void {
    if (!fabricCanvas || !currentImageObject) return;

    // Fabric.js v7: scenePoint를 사용하여 캔버스 좌표 가져오기
    const pointer = opt.scenePoint || { x: 0, y: 0 };
    const imageCoords = screenToImagePixel(pointer.x, pointer.y);

    // 현재 마우스 위치 업데이트 (toolManager에 저장 - Footer에서 사용)
    toolManager.updateMousePosition(imageCoords.x, imageCoords.y);

    // 드로잉 중이면 좌표 업데이트
    if (toolManager.isDrawing) {
      toolManager.updateDrawing(imageCoords);
    }
  }

  /**
   * 마우스 업 핸들러
   */
  function handleMouseUp(): void {
    if (!fabricCanvas || !currentImageObject) return;

    if (toolManager.isDrawing) {
      const result = toolManager.endDrawing();
      console.log('Drawing ended:', result);
      
      // TODO: 여기서 실제 라벨 생성 로직 호출
      if (result.start && result.end && toolManager.currentTool === 'box') {
        console.log('Box created from', result.start, 'to', result.end);
      }
    }
  }

  // 캔버스 초기화
  async function initCanvas(): Promise<void> {
    if (!canvasEl || !canvasContainer) {
      console.error("Canvas element or container not found");
      return;
    }

    // 컨테이너 크기 가져오기
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    console.log("Initializing canvas with dimensions:", width, height);

    fabricCanvas = new Canvas(canvasEl, {
      backgroundColor: "#2a2a2a",
    });

    fabricCanvas.setDimensions({ width, height });
    workspaceManager.setCanvasSize(width, height);

    // 마우스 이벤트 등록
    fabricCanvas.on("mouse:wheel", handleMouseWheel);
    fabricCanvas.on("mouse:down", handleMouseDown);
    fabricCanvas.on("mouse:move", handleMouseMove);
    fabricCanvas.on("mouse:up", handleMouseUp);

    isInitialized = true;
    console.log("Canvas initialized successfully");
  }

  // 캔버스 크기 조절
  function resizeCanvas(): void {
    if (!fabricCanvas || !canvasContainer) return;

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    if (width === 0 || height === 0) return;

    console.log("Resizing canvas to:", width, height);

    fabricCanvas.setDimensions({ width, height });
    workspaceManager.setCanvasSize(width, height);

    // 이미지가 있으면 다시 맞춤
    if (currentImageObject) {
      fitImageToCanvas();
      fabricCanvas.requestRenderAll();
    }
  }

  // 이미지 로드
  async function loadImage(): Promise<void> {
    if (!fabricCanvas) {
      console.error("Canvas not initialized");
      return;
    }

    if (!workspaceManager.workspacePath || !workspaceManager.currentImage) {
      console.error("Workspace or current image not available");
      return;
    }

    try {
      console.log("Loading image for:", workspaceManager.currentImage.id);

      // 기존 이미지 제거
      if (currentImageObject) {
        fabricCanvas.remove(currentImageObject);
        currentImageObject = null;
      }

      // 이미지 경로 가져오기
      const imagePath = await window.api.label.getImagePath(
        workspaceManager.workspacePath,
        workspaceManager.currentImage.id
      );

      console.log("Image path:", imagePath);

      if (!imagePath) {
        console.error("이미지 경로를 찾을 수 없습니다.");
        return;
      }

      // workspace:// 프로토콜 URL 생성
      const imageUrl = window.api.utils.getWorkspaceImageUrl(imagePath);
      console.log("Image URL:", imageUrl);

      // 이미지 로드 (fabric v7 방식)
      const img = await FabricImage.fromURL(imageUrl, {
        crossOrigin: "anonymous"
      });

      if (!fabricCanvas) return;

      console.log("Image loaded - original size:", img.width, img.height);

      currentImageObject = img;

      // 이미지 크기 저장 (원본 크기)
      workspaceManager.setImageSize(img.width || 0, img.height || 0);

      // 이미지 설정 - 중앙 기준으로 설정
      img.set({
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
      });

      fabricCanvas.add(img);

      // 이미지를 캔버스에 맞게 조절하고 중앙 정렬
      fitImageToCanvas();

      fabricCanvas.requestRenderAll();

      console.log("Image added to canvas successfully");
    } catch (error) {
      console.error("이미지 로드 실패:", error);
    }
  }

  // 이미지를 캔버스에 맞게 조절
  function fitImageToCanvas(): void {
    if (!fabricCanvas || !currentImageObject) return;

    const canvasWidth = fabricCanvas.width || 1;
    const canvasHeight = fabricCanvas.height || 1;
    const imgWidth = currentImageObject.width || 1;
    const imgHeight = currentImageObject.height || 1;

    console.log("Fitting image - canvas:", canvasWidth, canvasHeight, "image:", imgWidth, imgHeight);

    // 이미지가 캔버스에 꽉 차도록 스케일 계산 (여백 5%)
    const scaleX = (canvasWidth * 0.95) / imgWidth;
    const scaleY = (canvasHeight * 0.95) / imgHeight;
    const scale = Math.min(scaleX, scaleY);

    console.log("Calculated scale:", scale);

    // 이미지 스케일 및 중앙 위치 적용
    // originX, originY가 'center'이므로 left, top은 이미지 중앙 좌표
    currentImageObject.set({
      scaleX: scale,
      scaleY: scale,
      left: canvasWidth / 2,
      top: canvasHeight / 2,
    });

    // 줌 레벨 설정
    workspaceManager.setZoomLevel(scale);
    
    // 뷰포트 상태 업데이트
    updateViewportState();
  }

  // 마우스 휠 핸들러 (Ctrl + 휠로 줌)
  function handleMouseWheel(event: { e: WheelEvent }): void {
    if (!fabricCanvas) return;

    const e = event.e;

    // Ctrl 키가 눌려있을 때만 줌 동작
    if (!e.ctrlKey) return;

    e.preventDefault();

    const delta = e.deltaY;
    let newZoom = workspaceManager.zoomLevel;

    if (delta < 0) {
      // 위로 스크롤 = 확대
      newZoom = Math.min(MAX_ZOOM, newZoom + ZOOM_STEP);
    } else {
      // 아래로 스크롤 = 축소
      newZoom = Math.max(MIN_ZOOM, newZoom - ZOOM_STEP);
    }

    console.log("Zoom:", newZoom);
    applyZoom(newZoom);
  }

  // 줌 적용
  function applyZoom(newZoom: number): void {
    if (!fabricCanvas || !currentImageObject) return;

    const canvasWidth = fabricCanvas.width || 1;
    const canvasHeight = fabricCanvas.height || 1;

    workspaceManager.setZoomLevel(newZoom);

    // 이미지 스케일 업데이트 (중앙 유지)
    currentImageObject.set({
      scaleX: newZoom,
      scaleY: newZoom,
      left: canvasWidth / 2,
      top: canvasHeight / 2,
    });

    updateViewportState();
    fabricCanvas.requestRenderAll();
  }

  // 뷰포트 상태 업데이트
  function updateViewportState(): void {
    if (!currentImageObject || !fabricCanvas) return;

    const imgWidth = currentImageObject.width || 0;
    const imgHeight = currentImageObject.height || 0;
    const scale = currentImageObject.scaleX || 1;

    // 이미지 중심 기준으로 뷰포트 계산
    // originX, originY가 center이므로 left, top은 이미지 중심
    const imgCenterX = currentImageObject.left || 0;
    const imgCenterY = currentImageObject.top || 0;

    // 이미지 좌상단 좌표 (미니맵에서 사용)
    const imgLeft = imgCenterX - (imgWidth * scale) / 2;
    const imgTop = imgCenterY - (imgHeight * scale) / 2;

    workspaceManager.setViewport(imgLeft, imgTop);
  }

  // 리사이즈 옵저버
  let resizeObserver: ResizeObserver | null = null;

  // 현재 이미지 변경 감지
  $effect(() => {
    if (workspaceManager.currentImage && fabricCanvas && isInitialized) {
      loadImage();
    }
  });

  onMount(async () => {
    console.log("CanvasArea mounted");
    await tick();
    await initCanvas();
    
    // ResizeObserver로 컨테이너 크기 변화 감지
    if (canvasContainer) {
      resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
      });
      resizeObserver.observe(canvasContainer);
    }

    // 워크스페이스가 열려있으면 이미지 로드
    if (workspaceManager.currentImage) {
      await loadImage();
    }
  });

  onDestroy(() => {
    console.log("CanvasArea destroyed");
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