<script lang="ts">
  import { getContext, onMount, onDestroy, tick } from "svelte";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  let minimapContainer: HTMLDivElement;
  let minimapCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  let thumbnailImage: HTMLImageElement | null = null;
  let isDragging = false;
  let isInitialized = false;

  // 미니맵 크기
  let minimapWidth = 0;
  let minimapHeight = 0;

  // 썸네일 이미지 로드
  async function loadThumbnail(): Promise<void> {
    if (!workspaceManager.workspacePath || !workspaceManager.currentImage) return;

    try {
      const imagePath = await window.api.label.getImagePath(
        workspaceManager.workspacePath,
        workspaceManager.currentImage.id
      );

      if (!imagePath) return;

      const imageUrl = window.api.utils.getWorkspaceImageUrl(imagePath);

      const img = new Image();
      img.onload = () => {
        thumbnailImage = img;
        calculateMinimapSize();
        drawMinimap();
      };
      img.onerror = (e) => {
        console.error("Minimap image load error:", e);
      };
      img.src = imageUrl;
    } catch (error) {
      console.error("썸네일 로드 실패:", error);
    }
  }

  // 미니맵 크기 계산
  function calculateMinimapSize(): void {
    if (!minimapContainer) return;

    const containerWidth = minimapContainer.clientWidth;
    const containerHeight = minimapContainer.clientHeight;

    if (containerWidth === 0 || containerHeight === 0) return;

    const imgWidth = workspaceManager.imageWidth || 1;
    const imgHeight = workspaceManager.imageHeight || 1;
    const imgAspect = imgWidth / imgHeight;
    const containerAspect = containerWidth / containerHeight;

    if (imgAspect > containerAspect) {
      minimapWidth = containerWidth;
      minimapHeight = containerWidth / imgAspect;
    } else {
      minimapHeight = containerHeight;
      minimapWidth = containerHeight * imgAspect;
    }

    if (minimapCanvas) {
      minimapCanvas.width = minimapWidth;
      minimapCanvas.height = minimapHeight;
    }

    console.log("Minimap size:", minimapWidth, minimapHeight, "Container:", containerWidth, containerHeight);
  }

  // 미니맵 그리기
  function drawMinimap(): void {
    if (!ctx || !thumbnailImage || minimapWidth === 0 || minimapHeight === 0) return;

    // 캔버스 클리어
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, minimapWidth, minimapHeight);

    // 썸네일 그리기
    ctx.drawImage(thumbnailImage, 0, 0, minimapWidth, minimapHeight);

    // 뷰포트 박스 계산 및 그리기
    drawViewportBox();
  }

  // 뷰포트 박스 그리기
  function drawViewportBox(): void {
    if (!ctx) return;

    const imgWidth = workspaceManager.imageWidth;
    const imgHeight = workspaceManager.imageHeight;
    
    if (!imgWidth || !imgHeight || minimapWidth === 0 || minimapHeight === 0) return;

    const canvasWidth = workspaceManager.canvasWidth || 1;
    const canvasHeight = workspaceManager.canvasHeight || 1;
    const zoom = workspaceManager.zoomLevel || 1;

    // 현재 캔버스에서 보이는 영역의 크기 (이미지 픽셀 기준)
    const visibleWidth = canvasWidth / zoom;
    const visibleHeight = canvasHeight / zoom;

    // 미니맵에서의 스케일 (미니맵 픽셀 / 이미지 픽셀)
    const scale = minimapWidth / imgWidth;

    // 뷰포트 박스 크기 (미니맵 좌표)
    // 이미지 범위를 넘어서지 않도록 최대 크기 제한
    const boxWidth = Math.min(minimapWidth, visibleWidth * scale);
    const boxHeight = Math.min(minimapHeight, visibleHeight * scale);

    // 이미지가 캔버스 중앙에 위치하므로, 미니맵에서도 중앙에 박스 배치
    const boxX = (minimapWidth - boxWidth) / 2;
    const boxY = (minimapHeight - boxHeight) / 2;

    console.log("Viewport box - x:", boxX, "y:", boxY, "width:", boxWidth, "height:", boxHeight);

    // 반투명 오버레이 (뷰포트 외부 영역)
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    
    // 위쪽
    ctx.fillRect(0, 0, minimapWidth, Math.max(0, boxY));
    // 아래쪽
    ctx.fillRect(0, boxY + boxHeight, minimapWidth, Math.max(0, minimapHeight - boxY - boxHeight));
    // 왼쪽
    ctx.fillRect(0, boxY, Math.max(0, boxX), boxHeight);
    // 오른쪽
    ctx.fillRect(boxX + boxWidth, boxY, Math.max(0, minimapWidth - boxX - boxWidth), boxHeight);

    // 빨간색 테두리
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  }

  // 마우스 이벤트 핸들러
  function handleMouseDown(event: MouseEvent): void {
    isDragging = true;
    handleDrag(event);
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!isDragging) return;
    handleDrag(event);
  }

  function handleMouseUp(): void {
    isDragging = false;
  }

  function handleDrag(_event: MouseEvent): void {
    // 미니맵에서는 현재 뷰포트 이동 기능 비활성화
    // (이미지가 항상 중앙에 고정되어 있으므로)
  }

  // 리사이즈 옵저버
  let resizeObserver: ResizeObserver | null = null;

  // 상태 변경 감지
  $effect(() => {
    if (workspaceManager.currentImage && isInitialized) {
      loadThumbnail();
    }
  });

  $effect(() => {
    // zoomLevel 변경 시 미니맵 업데이트
    workspaceManager.zoomLevel;
    workspaceManager.canvasWidth;
    workspaceManager.canvasHeight;
    
    if (thumbnailImage && ctx && minimapWidth > 0) {
      drawMinimap();
    }
  });

  onMount(async () => {
    await tick();
    
    if (minimapCanvas) {
      ctx = minimapCanvas.getContext("2d");
    }

    // ResizeObserver로 컨테이너 크기 변화 감지
    if (minimapContainer) {
      resizeObserver = new ResizeObserver(() => {
        calculateMinimapSize();
        if (thumbnailImage) {
          drawMinimap();
        }
      });
      resizeObserver.observe(minimapContainer);
    }

    isInitialized = true;

    if (workspaceManager.currentImage) {
      loadThumbnail();
    }
  });

  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    thumbnailImage = null;
    ctx = null;
  });
</script>

<div
  bind:this={minimapContainer}
  class="w-full h-full bg-muted flex items-center justify-center overflow-hidden p-1"
  role="img"
  aria-label="미니맵"
>
  {#if workspaceManager.currentImage}
    <canvas
      bind:this={minimapCanvas}
      class="cursor-move"
      style="max-width: 100%; max-height: 100%;"
      onmousedown={handleMouseDown}
      onmousemove={handleMouseMove}
      onmouseup={handleMouseUp}
      onmouseleave={handleMouseUp}
    ></canvas>
  {:else}
    <span class="text-xs text-muted-foreground">Minimap</span>
  {/if}
</div>