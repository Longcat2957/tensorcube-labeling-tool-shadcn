<script lang="ts">
  import { getContext, onMount, onDestroy, tick } from "svelte";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  let minimapContainer: HTMLDivElement;
  let minimapCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  let thumbnailImage: HTMLImageElement | null = null;
  let loadingImageId: string | null = null;

  let minimapWidth = $state(0);
  let minimapHeight = $state(0);

  function calculateMinimapSize(): void {
    if (!minimapContainer || !minimapCanvas) return;

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

    minimapCanvas.width = minimapWidth;
    minimapCanvas.height = minimapHeight;
  }

  function drawMinimap(): void {
    if (!ctx || !thumbnailImage || minimapWidth === 0 || minimapHeight === 0) return;

    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, minimapWidth, minimapHeight);
    ctx.drawImage(thumbnailImage, 0, 0, minimapWidth, minimapHeight);
    drawViewportBox();
  }

  function drawViewportBox(): void {
    if (!ctx) return;

    const imgWidth = workspaceManager.imageWidth;
    const imgHeight = workspaceManager.imageHeight;
    if (!imgWidth || !imgHeight || minimapWidth === 0 || minimapHeight === 0) return;

    const canvasWidth = workspaceManager.canvasWidth || 1;
    const canvasHeight = workspaceManager.canvasHeight || 1;
    const zoom = workspaceManager.zoomLevel || 1;

    const visibleWidth = canvasWidth / zoom;
    const visibleHeight = canvasHeight / zoom;
    const scale = minimapWidth / imgWidth;

    const boxWidth = Math.min(minimapWidth, visibleWidth * scale);
    const boxHeight = Math.min(minimapHeight, visibleHeight * scale);
    const boxX = (minimapWidth - boxWidth) / 2;
    const boxY = (minimapHeight - boxHeight) / 2;

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, minimapWidth, Math.max(0, boxY));
    ctx.fillRect(0, boxY + boxHeight, minimapWidth, Math.max(0, minimapHeight - boxY - boxHeight));
    ctx.fillRect(0, boxY, Math.max(0, boxX), boxHeight);
    ctx.fillRect(boxX + boxWidth, boxY, Math.max(0, minimapWidth - boxX - boxWidth), boxHeight);

    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  }

  async function loadThumbnail(imageId: string): Promise<void> {
    if (!workspaceManager.workspacePath) return;

    // 이 로드가 최신 요청인지 추적 (race condition 방어)
    loadingImageId = imageId;

    try {
      const imagePath = await window.api.label.getImagePath(
        workspaceManager.workspacePath,
        imageId
      );

      if (!imagePath || loadingImageId !== imageId) return;

      const imageUrl = window.api.utils.getWorkspaceImageUrl(imagePath);
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      // 로드 완료 후에도 최신 요청인지 재확인
      if (loadingImageId !== imageId) return;

      thumbnailImage = img;
      calculateMinimapSize();
      drawMinimap();
    } catch (error) {
      console.error("미니맵 썸네일 로드 실패:", error);
    }
  }

  // 이미지 변경 감지 → 썸네일 새로 로드
  $effect(() => {
    const imageId = workspaceManager.currentImage?.id;

    if (imageId) {
      thumbnailImage = null;
      loadThumbnail(imageId);
    } else {
      thumbnailImage = null;
      loadingImageId = null;
      if (ctx) ctx.clearRect(0, 0, minimapWidth, minimapHeight);
    }
  });

  // 줌/캔버스 크기 변경 시 뷰포트 박스 다시 그리기
  $effect(() => {
    void workspaceManager.zoomLevel;
    void workspaceManager.canvasWidth;
    void workspaceManager.canvasHeight;

    if (thumbnailImage && ctx && minimapWidth > 0) {
      drawMinimap();
    }
  });

  let resizeObserver: ResizeObserver | null = null;

  onMount(async () => {
    await tick();

    // canvas는 항상 DOM에 존재하므로 ctx 초기화 보장
    ctx = minimapCanvas.getContext("2d");

    resizeObserver = new ResizeObserver(() => {
      if (thumbnailImage) {
        calculateMinimapSize();
        drawMinimap();
      }
    });
    resizeObserver.observe(minimapContainer);

    // 초기 이미지 로드
    if (workspaceManager.currentImage) {
      loadThumbnail(workspaceManager.currentImage.id);
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    thumbnailImage = null;
    loadingImageId = null;
    ctx = null;
  });
</script>

<div
  bind:this={minimapContainer}
  class="w-full h-full bg-muted flex items-center justify-center overflow-hidden p-1"
  role="img"
  aria-label="미니맵"
>
  <!-- canvas는 항상 DOM에 유지해야 onMount에서 ctx 초기화가 보장됨 -->
  <canvas
    bind:this={minimapCanvas}
    class="cursor-default"
    style="max-width: 100%; max-height: 100%; display: {workspaceManager.currentImage ? 'block' : 'none'};"
  ></canvas>

  {#if !workspaceManager.currentImage}
    <span class="text-xs text-muted-foreground">Minimap</span>
  {/if}
</div>
