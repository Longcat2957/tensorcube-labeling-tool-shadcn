<script lang="ts">
  import { getContext, onMount, onDestroy, tick } from 'svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  let minimapContainer: HTMLDivElement
  let minimapCanvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null

  let thumbnailImage: HTMLImageElement | null = null
  let loadingImageId: string | null = null

  let minimapWidth = $state(0)
  let minimapHeight = $state(0)

  function calculateMinimapSize(): void {
    if (!minimapContainer || !minimapCanvas) return

    const containerWidth = minimapContainer.clientWidth
    const containerHeight = minimapContainer.clientHeight
    if (containerWidth === 0 || containerHeight === 0) return

    const imgWidth = thumbnailImage?.naturalWidth || workspaceManager.imageWidth || 1
    const imgHeight = thumbnailImage?.naturalHeight || workspaceManager.imageHeight || 1
    const imgAspect = imgWidth / imgHeight
    const containerAspect = containerWidth / containerHeight

    if (imgAspect > containerAspect) {
      minimapWidth = containerWidth
      minimapHeight = containerWidth / imgAspect
    } else {
      minimapHeight = containerHeight
      minimapWidth = containerHeight * imgAspect
    }

    minimapCanvas.width = minimapWidth
    minimapCanvas.height = minimapHeight
  }

  function drawMinimap(): void {
    if (!ctx || !thumbnailImage || minimapWidth === 0 || minimapHeight === 0) return

    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(0, 0, minimapWidth, minimapHeight)
    ctx.drawImage(thumbnailImage, 0, 0, minimapWidth, minimapHeight)
    drawViewportBox()
  }

  /**
   * 현재 캔버스 viewport를 minimap 좌표계로 환산한 박스를 반환.
   * - viewportX/Y: 이미지 좌상단의 캔버스상 스크린 좌표
   * - zoomLevel: 이미지 스케일
   * - 스크린 (0,0) ~ (canvasWidth, canvasHeight)에 대응하는 이미지 영역을 구해 minimap에 매핑
   */
  function getViewportBoxRect(): { x: number; y: number; w: number; h: number } | null {
    const imgWidth = workspaceManager.imageWidth
    const imgHeight = workspaceManager.imageHeight
    if (!imgWidth || !imgHeight || minimapWidth === 0 || minimapHeight === 0) return null

    const canvasWidth = workspaceManager.canvasWidth || 1
    const canvasHeight = workspaceManager.canvasHeight || 1
    const zoom = workspaceManager.zoomLevel || 1
    const viewportX = workspaceManager.viewportX
    const viewportY = workspaceManager.viewportY

    const imgViewLeft = -viewportX / zoom
    const imgViewTop = -viewportY / zoom
    const imgViewRight = (canvasWidth - viewportX) / zoom
    const imgViewBottom = (canvasHeight - viewportY) / zoom

    // minimap 매핑
    const sx = minimapWidth / imgWidth
    const sy = minimapHeight / imgHeight

    const boxX = Math.max(0, imgViewLeft * sx)
    const boxY = Math.max(0, imgViewTop * sy)
    const boxRight = Math.min(minimapWidth, imgViewRight * sx)
    const boxBottom = Math.min(minimapHeight, imgViewBottom * sy)
    return {
      x: boxX,
      y: boxY,
      w: Math.max(0, boxRight - boxX),
      h: Math.max(0, boxBottom - boxY)
    }
  }

  function drawViewportBox(): void {
    if (!ctx) return
    const rect = getViewportBoxRect()
    if (!rect) return

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(0, 0, minimapWidth, rect.y)
    ctx.fillRect(0, rect.y + rect.h, minimapWidth, Math.max(0, minimapHeight - rect.y - rect.h))
    ctx.fillRect(0, rect.y, rect.x, rect.h)
    ctx.fillRect(rect.x + rect.w, rect.y, Math.max(0, minimapWidth - rect.x - rect.w), rect.h)

    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.w - 2), Math.max(0, rect.h - 2))
  }

  // 드래그 팬
  let isDragging = $state(false)

  function minimapToImagePoint(ex: number, ey: number): { x: number; y: number } | null {
    const imgWidth = workspaceManager.imageWidth
    const imgHeight = workspaceManager.imageHeight
    if (!imgWidth || !imgHeight || minimapWidth === 0 || minimapHeight === 0) return null
    const rect = minimapCanvas.getBoundingClientRect()
    const localX = ex - rect.left
    const localY = ey - rect.top
    const imageX = (localX / minimapWidth) * imgWidth
    const imageY = (localY / minimapHeight) * imgHeight
    return { x: imageX, y: imageY }
  }

  function handlePointerDown(e: PointerEvent): void {
    if (!workspaceManager.currentImage) return
    const point = minimapToImagePoint(e.clientX, e.clientY)
    if (!point) return
    isDragging = true
    minimapCanvas.setPointerCapture(e.pointerId)
    workspaceManager.requestPanToImagePoint(point.x, point.y)
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!isDragging) return
    const point = minimapToImagePoint(e.clientX, e.clientY)
    if (!point) return
    workspaceManager.requestPanToImagePoint(point.x, point.y)
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!isDragging) return
    isDragging = false
    try {
      minimapCanvas.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  async function loadThumbnail(imageId: string): Promise<void> {
    if (!workspaceManager.workspacePath) return

    // 이 로드가 최신 요청인지 추적 (race condition 방어)
    loadingImageId = imageId

    if (ctx && minimapCanvas) {
      minimapCanvas.width = 0
      minimapCanvas.height = 0
      minimapWidth = 0
      minimapHeight = 0
    }

    try {
      const imagePath = await window.api.label.getImagePath(workspaceManager.workspacePath, imageId)

      if (!imagePath || loadingImageId !== imageId) return

      const imageUrl = window.api.utils.getWorkspaceImageUrl(imagePath)
      const img = new Image()

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = imageUrl
      })

      // 로드 완료 후에도 최신 요청인지 재확인
      if (loadingImageId !== imageId) return

      thumbnailImage = img
      calculateMinimapSize()
      drawMinimap()
    } catch (error) {
      console.error('미니맵 썸네일 로드 실패:', error)
    }
  }

  // 이미지 변경 감지 → 썸네일 새로 로드
  $effect(() => {
    const imageId = workspaceManager.currentImage?.id

    if (imageId) {
      thumbnailImage = null
      loadThumbnail(imageId)
    } else {
      thumbnailImage = null
      loadingImageId = null
      if (ctx) ctx.clearRect(0, 0, minimapWidth, minimapHeight)
    }
  })

  // 줌/캔버스 크기 변경 시 뷰포트 박스 다시 그리기
  $effect(() => {
    void workspaceManager.imageWidth
    void workspaceManager.imageHeight
    void workspaceManager.zoomLevel
    void workspaceManager.canvasWidth
    void workspaceManager.canvasHeight

    if (thumbnailImage && ctx && minimapWidth > 0) {
      calculateMinimapSize()
      drawMinimap()
    }
  })

  let resizeObserver: ResizeObserver | null = null

  onMount(async () => {
    await tick()

    // canvas는 항상 DOM에 존재하므로 ctx 초기화 보장
    ctx = minimapCanvas.getContext('2d')

    resizeObserver = new ResizeObserver(() => {
      if (thumbnailImage) {
        calculateMinimapSize()
        drawMinimap()
      }
    })
    resizeObserver.observe(minimapContainer)

    // 초기 이미지 로드
    if (workspaceManager.currentImage) {
      loadThumbnail(workspaceManager.currentImage.id)
    }
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    thumbnailImage = null
    loadingImageId = null
    ctx = null
  })
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
    class="touch-none {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
    style="max-width: 100%; max-height: 100%; display: {workspaceManager.currentImage
      ? 'block'
      : 'none'};"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
  ></canvas>

  {#if !workspaceManager.currentImage}
    <span class="text-xs text-muted-foreground">Minimap</span>
  {/if}
</div>
