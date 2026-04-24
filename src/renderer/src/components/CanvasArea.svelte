<script lang="ts">
  import { getContext as getSvelteContext, onMount, onDestroy, tick } from 'svelte'
  import { Canvas, FabricImage, Rect } from 'fabric'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { TOOL_MANAGER_KEY, type ToolManager } from '$lib/stores/toolManager.svelte.js'
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from '$lib/stores/keyboardManager.svelte.js'

  import { Slider } from '$lib/components/ui/slider/index.js'
  import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Eye, EyeOff } from '@lucide/svelte'
  import { ACTION_SHORTCUTS } from '$lib/stores/keyboardManager.svelte.js'

  // 캔버스 코어 모듈
  import {
    initFabricCanvas,
    registerCanvasEvents,
    resizeCanvas
  } from '$lib/canvas/core/canvasSetup.js'
  import { updateViewportState } from '$lib/canvas/core/imageLoader.js'
  import { fitImageToCanvas, loadImageToCanvas } from '$lib/canvas/core/imageLoader.js'

  // 인터랙션 모듈
  import { handleMouseWheel, handleOBBWheelRotation } from '$lib/canvas/interaction/zoomHandler.js'
  import {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    updateCursorForTool,
    type MouseHandlerContext,
    type MouseHandlerState
  } from '$lib/canvas/interaction/mouseHandlers.js'

  // 라벨 관리 모듈
  import {
    clearCanvasOverlays,
    updateAllBoxPositions,
    renderLabels,
    syncLabelChanges,
    type CanvasLabelObjects
  } from '$lib/canvas/labels/labelManager.js'
  import { applySelectedStyle } from '$lib/canvas/styles/boxStyles.js'

  const workspaceManager = getSvelteContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)
  const toolManager = getSvelteContext<ToolManager>(TOOL_MANAGER_KEY)
  const keyboardManager = getSvelteContext<KeyboardManager>(KEYBOARD_MANAGER_KEY)

  let canvasEl: HTMLCanvasElement
  let canvasContainer: HTMLDivElement
  let fabricCanvas: Canvas | null = null
  let currentImageObject: FabricImage | null = null
  let isInitialized = false

  // 드로잉 박스 상태
  const drawingBoxState = { value: null as Rect | null }
  const mouseHandlerState: MouseHandlerState = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentClassId: 0
  }

  // 라벨 박스 맵 (labelId -> render objects)
  const labelBoxes = new Map<string, CanvasLabelObjects>()

  // 현재 로딩 요청 중인 이미지 ID (중복/선점 취소 패턴)
  let loadingImageId: string | null = null

  // 리사이즈 옵저버
  let resizeObserver: ResizeObserver | null = null

  // 키보드 핸들러 클린업 함수들
  let cleanupHandlers: (() => void)[] = []

  // ============================================
  // 캔버스 초기화
  // ============================================
  async function initCanvas(): Promise<void> {
    if (!canvasEl || !canvasContainer) {
      console.error('Canvas element or container not found')
      return
    }

    const width = canvasContainer.clientWidth
    const height = canvasContainer.clientHeight

    console.log('Initializing canvas with dimensions:', width, height)

    fabricCanvas = initFabricCanvas({
      canvasEl,
      width,
      height
    })

    workspaceManager.setCanvasSize(width, height)

    // 이벤트 핸들러 등록
    registerCanvasEvents(fabricCanvas, {
      onWheel: (event) => {
        if (!fabricCanvas || !currentImageObject) return

        const e = event.e

        // OBB 선택 상태에서 Ctrl 없이 휠 → 회전
        if (!e.ctrlKey && workspaceManager.selectedLabelId) {
          const objects = labelBoxes.get(workspaceManager.selectedLabelId)
          if (objects?.rect.data.shape === 'obb') {
            e.preventDefault()
            handleOBBWheelRotation(objects.rect, e.deltaY)
            fabricCanvas.requestRenderAll()
            return
          }
        }

        handleMouseWheel(event, fabricCanvas, currentImageObject, workspaceManager)
        updateAllBoxPositions(getContext(), labelBoxes)
        fabricCanvas.requestRenderAll()
      },
      onMouseDown: (opt) => {
        handleMouseDown(opt, getMouseHandlerContext(), mouseHandlerState)
      },
      onMouseMove: (opt) => {
        handleMouseMove(opt, getMouseHandlerContext(), mouseHandlerState)
      },
      onMouseUp: (opt) => {
        handleMouseUp(opt, getMouseHandlerContext(), mouseHandlerState)
      },
      onSelectionCleared: () => workspaceManager.setSelectedLabelId(null)
    })

    isInitialized = true
    console.log('Canvas initialized successfully')
  }

  // ============================================
  // Context 헬퍼 함수들
  // ============================================
  function getContext() {
    return {
      fabricCanvas: fabricCanvas!,
      imageObject: currentImageObject!,
      workspaceManager,
      toolManager
    }
  }

  function getMouseHandlerContext(): MouseHandlerContext {
    return {
      fabricCanvas: fabricCanvas!,
      imageObject: currentImageObject!,
      workspaceManager,
      toolManager,
      labelBoxes,
      drawingBox: drawingBoxState
    }
  }

  // ============================================
  // 이미지 로드
  // ============================================
  async function loadImage(): Promise<void> {
    if (!fabricCanvas || !workspaceManager.workspacePath || !workspaceManager.currentImage) return

    const targetId = workspaceManager.currentImage.id

    if (targetId === loadingImageId && currentImageObject) return

    loadingImageId = targetId

    try {
      clearCanvasOverlays(fabricCanvas!, labelBoxes, drawingBoxState)

      const result = await loadImageToCanvas(
        workspaceManager.workspacePath!,
        targetId,
        fabricCanvas,
        currentImageObject
      )

      if (loadingImageId !== targetId || !fabricCanvas || !result.imageObject) {
        return
      }

      currentImageObject = result.imageObject
      workspaceManager.setImageSize(result.imageObject.width || 0, result.imageObject.height || 0)

      fitImageToCanvas(fabricCanvas, currentImageObject, workspaceManager)
      renderLabels(getContext(), labelBoxes, drawingBoxState)
      fabricCanvas.requestRenderAll()

      console.log('Image loaded:', targetId)
    } catch (error) {
      console.error('이미지 로드 실패:', error)
    }
  }

  // ============================================
  // 캔버스 크기 조절
  // ============================================
  function handleResize(): void {
    if (!fabricCanvas || !canvasContainer) return

    const width = canvasContainer.clientWidth
    const height = canvasContainer.clientHeight

    if (width === 0 || height === 0) return

    resizeCanvas(fabricCanvas, width, height)
    workspaceManager.setCanvasSize(width, height)

    if (currentImageObject) {
      fitImageToCanvas(fabricCanvas, currentImageObject, workspaceManager)
      updateAllBoxPositions(getContext(), labelBoxes)
      fabricCanvas.requestRenderAll()
    }
  }

  // ============================================
  // 클래스 선택 헬퍼
  // ============================================
  function selectAdjacentClass(direction: -1 | 1): void {
    const classes = workspaceManager.classList
    if (classes.length === 0) return

    const currentIndex = classes.findIndex((cls) => cls.id === workspaceManager.selectedClassId)
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + classes.length) % classes.length

    workspaceManager.setSelectedClassId(classes[nextIndex].id)
  }

  // ============================================
  // 반응형 이펙트
  // ============================================
  // 현재 이미지 변경 감지
  $effect(() => {
    if (workspaceManager.currentImage && fabricCanvas && isInitialized) {
      loadImage()
    }
  })

  // 도구 변경 시 커서 업데이트
  $effect(() => {
    if (fabricCanvas && isInitialized) {
      updateCursorForTool(fabricCanvas, toolManager, labelBoxes)
    }
  })

  // 라벨 데이터 변경 감지 - $effect.pre로 DOM 업데이트 전 동기화
  $effect.pre(() => {
    // 의존성 명시: currentLabelData
    const labelData = workspaceManager.currentLabelData

    if (!fabricCanvas || !isInitialized || !currentImageObject || !labelData) return

    syncLabelChanges(getContext(), labelBoxes)
  })

  // 외부(Minimap)로부터의 팬 요청 감지 → fabric 이미지 위치 갱신
  $effect(() => {
    const tick = workspaceManager.panRequestTick
    if (tick === 0 || !fabricCanvas || !currentImageObject || !isInitialized) return

    const imageX = workspaceManager.panRequestImageX
    const imageY = workspaceManager.panRequestImageY
    const scale = currentImageObject.scaleX || 1
    const canvasWidth = fabricCanvas.width || 0
    const canvasHeight = fabricCanvas.height || 0
    const imgWidth = currentImageObject.width || 0
    const imgHeight = currentImageObject.height || 0

    // 이미지의 image-좌표계 지점이 캔버스 중앙에 오도록 imageObject center 배치
    // origin=center이므로 imageObject.left/top = 이미지 중심 스크린 좌표
    const newLeft = canvasWidth / 2 + (imgWidth / 2 - imageX) * scale
    const newTop = canvasHeight / 2 + (imgHeight / 2 - imageY) * scale

    currentImageObject.set({ left: newLeft, top: newTop })
    updateViewportState(currentImageObject, fabricCanvas, workspaceManager)
    updateAllBoxPositions(getContext(), labelBoxes)
    fabricCanvas.requestRenderAll()
  })

  // selectedLabelId 변경 → Fabric activeObject 동기화 (RightSidebar 클릭 → 캔버스 하이라이트)
  $effect(() => {
    const selectedId = workspaceManager.selectedLabelId
    if (!fabricCanvas || !isInitialized) return

    const currentActive = fabricCanvas.getActiveObject() as unknown as {
      data?: { id?: string }
    } | null
    if (selectedId) {
      const objects = labelBoxes.get(selectedId)
      if (objects && currentActive !== objects.rect) {
        fabricCanvas.setActiveObject(objects.rect)
        fabricCanvas.requestRenderAll()
      }
    } else if (currentActive?.data?.id) {
      fabricCanvas.discardActiveObject()
      fabricCanvas.requestRenderAll()
    }
  })

  // 다중 선택 세트 변경 → 모든 박스에 선택 스타일 재적용
  $effect(() => {
    const ids = workspaceManager.selectedLabelIds
    if (!fabricCanvas) return
    const idSet = new Set(ids)
    for (const [id, objects] of labelBoxes) {
      applySelectedStyle(objects.rect, idSet.has(id))
    }
    fabricCanvas.requestRenderAll()
  })

  // 라벨 불투명도 변경 감지 → 캔버스 객체 opacity 일괄 조정
  $effect(() => {
    const opacity = workspaceManager.labelOpacity
    if (!fabricCanvas) return
    for (const [, objects] of labelBoxes) {
      objects.rect.set({ opacity })
      objects.badge.background.set({ opacity })
      objects.badge.text.set({ opacity })
    }
    fabricCanvas.requestRenderAll()
  })

  // 라벨 가시성 변경 감지 → 캔버스 객체 visible 토글
  // (전역 labelsHidden이 true면 개별 visibility 무시)
  $effect(() => {
    const globallyHidden = workspaceManager.labelsHidden
    // 의존성 명시: currentLabels의 visible 프로퍼티 변화 감지
    if (workspaceManager.currentLabels.length === 0 && !globallyHidden) return
    if (!fabricCanvas) return

    for (const [labelId, objects] of labelBoxes) {
      const visible = !globallyHidden && workspaceManager.isLabelVisible(labelId)
      objects.rect.set({ visible })
      objects.badge.background.set({ visible })
      objects.badge.text.set({ visible })
    }

    fabricCanvas.requestRenderAll()
  })

  // ============================================
  // 생명주기
  // ============================================
  onMount(async () => {
    console.log('CanvasArea mounted')
    await tick()
    await initCanvas()

    // ResizeObserver로 컨테이너 크기 변화 감지
    if (canvasContainer) {
      resizeObserver = new ResizeObserver(() => {
        handleResize()
      })
      resizeObserver.observe(canvasContainer)
    }

    // 키보드 단축키 핸들러 등록
    cleanupHandlers.push(
      keyboardManager.onAction('center-image', () => {
        if (currentImageObject && fabricCanvas) {
          fitImageToCanvas(fabricCanvas, currentImageObject, workspaceManager)
          updateAllBoxPositions(getContext(), labelBoxes)
          fabricCanvas.requestRenderAll()
          console.log('Image centered')
        }
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('pan-tool', () => {
        toolManager.setTool('pan')
        console.log('Pan tool selected')
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('prev-class', () => {
        selectAdjacentClass(-1)
        console.log('Previous class selected:', workspaceManager.selectedClassId)
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('next-class', () => {
        selectAdjacentClass(1)
        console.log('Next class selected:', workspaceManager.selectedClassId)
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('delete', () => {
        const n = workspaceManager.deleteSelectedLabels()
        if (n > 0) console.log(`${n}개 라벨 삭제`)
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('undo', () => {
        workspaceManager.undo()
        console.log('Undo applied')
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('redo', () => {
        workspaceManager.redo()
        console.log('Redo applied')
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('save', () => {
        void workspaceManager.flushSave()
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('toggle-labels', () => {
        workspaceManager.toggleLabelsHidden()
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('copy', () => {
        const n = workspaceManager.copySelectedLabels()
        if (n > 0) console.log(`[Clipboard] ${n}개 복사`)
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('paste', () => {
        const n = workspaceManager.pasteClipboard()
        if (n > 0) console.log(`[Clipboard] ${n}개 붙여넣기`)
      })
    )

    // 워크스페이스가 열려있으면 이미지 로드
    if (workspaceManager.currentImage) {
      await loadImage()
    }
  })

  onDestroy(() => {
    console.log('CanvasArea destroyed')

    // 키보드 핸들러 클린업
    cleanupHandlers.forEach((cleanup) => cleanup())
    cleanupHandlers = []

    if (resizeObserver) {
      resizeObserver.disconnect()
    }
    if (fabricCanvas) {
      fabricCanvas.dispose()
      fabricCanvas = null
    }
  })
</script>

<main
  class="flex-1 h-full bg-muted/20 relative overflow-hidden"
  role="img"
  aria-label="이미지 캔버스"
>
  <div bind:this={canvasContainer} class="absolute inset-0 w-full h-full">
    <canvas bind:this={canvasEl}></canvas>
  </div>

  {#if workspaceManager.currentImage}
    <div
      class="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-md border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur"
    >
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant={workspaceManager.labelsHidden ? 'secondary' : 'ghost'}
              size="icon"
              class="h-7 w-7"
              aria-label={`라벨 보기/숨기기 (${ACTION_SHORTCUTS['toggle-labels']})`}
              onclick={() => workspaceManager.toggleLabelsHidden()}
            >
              {#if workspaceManager.labelsHidden}
                <EyeOff class="size-4" />
              {:else}
                <Eye class="size-4" />
              {/if}
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div class="flex items-center gap-2">
            <span>라벨 보기/숨기기</span>
            <kbd class="rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-[10px]"
              >{ACTION_SHORTCUTS['toggle-labels']}</kbd
            >
          </div>
        </TooltipContent>
      </Tooltip>

      <div class="h-4 w-px bg-border"></div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">불투명도</span>
        <Slider
          type="single"
          class="w-32"
          min={0}
          max={100}
          step={1}
          value={Math.round(workspaceManager.labelOpacity * 100)}
          onValueChange={(v) => workspaceManager.setLabelOpacity((v ?? 0) / 100)}
          disabled={workspaceManager.labelsHidden}
        />
        <span class="w-8 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(workspaceManager.labelOpacity * 100)}%
        </span>
      </div>
    </div>
  {/if}

  {#if !workspaceManager.currentImage}
    <div class="absolute inset-0 flex items-center justify-center text-muted-foreground">
      <p>이미지를 선택해주세요</p>
    </div>
  {/if}
</main>
