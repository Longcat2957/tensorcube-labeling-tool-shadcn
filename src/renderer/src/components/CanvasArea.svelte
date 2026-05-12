<script lang="ts">
  import { getContext as getSvelteContext, onMount, onDestroy, tick } from 'svelte'
  import { Canvas, FabricImage, Rect, type Text as FabricText } from 'fabric'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { TOOL_MANAGER_KEY, type ToolManager } from '$lib/stores/toolManager.svelte.js'
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from '$lib/stores/keyboardManager.svelte.js'
  import { MODE_MANAGER_KEY, type ModeManager } from '$lib/stores/modeManager.svelte.js'
  import {
    SAM_ASSISTANT_KEY,
    type SamAssistantManager
  } from '$lib/stores/samAssistant.svelte.js'
  import {
    clearOverlay as clearSamOverlay,
    createEmptyOverlay,
    renderBboxPreview,
    renderBoxMarker,
    renderMask,
    renderPointMarkers,
    repositionOverlay,
    type SamOverlayObjects
  } from '$lib/canvas/sam/samOverlay.js'
  import { getClassColor } from '$lib/canvas/styles/boxStyles.js'

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
  import { fitImageToCanvas, loadImageToCanvas, zoomToBBox } from '$lib/canvas/core/imageLoader.js'

  // 인터랙션 모듈
  import { handleMouseWheel, handleOBBWheelRotation } from '$lib/canvas/interaction/zoomHandler.js'
  import {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    updateCursorForTool,
    commitPolygonDraft,
    cancelPolygonDraft,
    type MouseHandlerContext,
    type MouseHandlerState
  } from '$lib/canvas/interaction/mouseHandlers.js'

  // 라벨 관리 모듈
  import {
    clearCanvasOverlays,
    updateAllBoxPositions,
    renderLabels,
    syncLabelChanges,
    applyModeLocksToAll,
    type CanvasLabelObjects
  } from '$lib/canvas/labels/labelManager.js'
  import { applySelectedStyle } from '$lib/canvas/styles/boxStyles.js'

  const workspaceManager = getSvelteContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)
  const toolManager = getSvelteContext<ToolManager>(TOOL_MANAGER_KEY)
  const keyboardManager = getSvelteContext<KeyboardManager>(KEYBOARD_MANAGER_KEY)
  const modeManager = getSvelteContext<ModeManager>(MODE_MANAGER_KEY)
  const samAssistant = getSvelteContext<SamAssistantManager>(SAM_ASSISTANT_KEY)

  let canvasEl: HTMLCanvasElement
  let canvasContainer: HTMLDivElement
  let fabricCanvas: Canvas | null = null
  let currentImageObject: FabricImage | null = null
  let isInitialized = false

  // 드로잉 박스 상태
  const drawingBoxState = { value: null as Rect | null }
  // 그리는 중 W × H ghost 라벨 — mouseHandlers 가 동적으로 채운다.
  const dimensionLabelState = { value: null as FabricText | null }
  const mouseHandlerState: MouseHandlerState = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentClassId: 0,
    polygonPoints: [],
    polygonPreviewLine: null,
    polygonVertexMarkers: [],
    polygonLines: []
  }

  // 라벨 박스 맵 (labelId -> render objects)
  const labelBoxes = new Map<string, CanvasLabelObjects>()

  // SAM 오버레이 객체 묶음
  const samOverlay: SamOverlayObjects = createEmptyOverlay()
  // 마스크 렌더는 비동기라 race 방지용 토큰
  let samMaskRenderToken = 0
  // 직전 이미지 id 트래커 (effect 재실행 시 같은 이미지면 noop, 다른 이미지면 이전 임베딩 unload)
  let samPrevImageId: string | null = null

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

        // 박스 선택 상태에서 Ctrl 없이 휠 → 박스별 동작
        if (!e.ctrlKey && workspaceManager.selectedLabelId) {
          const objects = labelBoxes.get(workspaceManager.selectedLabelId)
          if (objects?.rect.data.shape === 'obb') {
            e.preventDefault()
            handleOBBWheelRotation(objects.rect, e.deltaY)
            fabricCanvas.requestRenderAll()
            return
          }
          if (objects?.rect.data.shape === 'bb') {
            // BB 휠 리사이즈 — 좌상단 고정, 휠 방향에 맞춰 우/하 변 이동
            // deltaY: 세로 휠 → bottom 변 (수직)
            // deltaX: 가로 휠 (MX Master 등) → right 변 (수평)
            // Shift = ±10px 큰 폭, 기본 ±1px
            const step = e.shiftKey ? 10 : 1
            const dy = e.deltaY !== 0 ? Math.sign(e.deltaY) * step : 0
            const dx = e.deltaX !== 0 ? Math.sign(e.deltaX) * step : 0
            if (dx !== 0 || dy !== 0) {
              e.preventDefault()
              workspaceManager.resizeSelectedBBBy(dx, dy)
              return
            }
          }
        }

        handleMouseWheel(event, fabricCanvas, currentImageObject, workspaceManager)
        updateAllBoxPositions(getContext(), labelBoxes)
        repositionSamIfActive()
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
      onMouseDblClick: () => {
        // Polygon 도구에서 더블클릭으로 그리기 종료
        if (toolManager.currentTool === 'polygon') {
          commitPolygonDraft(getMouseHandlerContext(), mouseHandlerState)
        }
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
      toolManager,
      appMode: modeManager.current,
      userBadgeScale: workspaceManager.labelBadgeScale
    }
  }

  /**
   * SAM 마스크 → BB/OBB 어노테이션 확정.
   * 만들어진 라벨을 자동 select 해서 사용자가 RightSidebar / 단축키로 클래스 변경할 수 있게 함.
   * SAM 도구는 유지 (다음 객체 라벨링 가능).
   */
  function confirmSamMaskAsBox(): void {
    const bbox = samAssistant.lastBbox
    if (!bbox) return
    const [x1, y1, x2, y2] = bbox
    if (x2 - x1 < 2 || y2 - y1 < 2) return

    const id = crypto.randomUUID()
    const classId = workspaceManager.selectedClassId ?? 0

    if (workspaceManager.isOBBMode) {
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2
      const w = x2 - x1
      const h = y2 - y1
      workspaceManager.addOBBAnnotation({ id, class_id: classId, obb: [cx, cy, w, h, 0] })
    } else {
      workspaceManager.addBBAnnotation({
        id,
        class_id: classId,
        bbox: [x1, y1, x2, y2]
      })
    }

    // 다음 객체를 위해 프롬프트/오버레이 클리어 (도구는 SAM 으로 유지)
    samAssistant.clearPrompts()
    if (fabricCanvas) clearSamOverlay(fabricCanvas, samOverlay)
    if (fabricCanvas) fabricCanvas.requestRenderAll()

    // 새 라벨 자동 select — 사용자가 RightSidebar 또는 단축키로 클래스 변경 가능.
    // syncLabelChanges 가 effect.pre 에서 새 rect 를 만든 후 실행되도록 microtask 로 미룸.
    queueMicrotask(() => {
      workspaceManager.setSelectedLabelId(id)
    })
  }

  function repositionSamIfActive(): void {
    if (toolManager.currentTool !== 'sam') return
    if (!currentImageObject) return
    repositionOverlay(
      currentImageObject,
      samOverlay,
      samAssistant.points,
      samAssistant.lastBbox,
      samAssistant.box
    )
  }

  function getMouseHandlerContext(): MouseHandlerContext {
    return {
      fabricCanvas: fabricCanvas!,
      imageObject: currentImageObject!,
      workspaceManager,
      toolManager,
      labelBoxes,
      drawingBox: drawingBoxState,
      dimensionLabel: dimensionLabelState,
      samAssistant
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
      clearCanvasOverlays(fabricCanvas!, labelBoxes, drawingBoxState, dimensionLabelState)

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
      renderLabels(getContext(), labelBoxes, drawingBoxState, dimensionLabelState)
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
      repositionSamIfActive()
      fabricCanvas.requestRenderAll()
    }
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

  // SAM: 이미지가 바뀌면 프롬프트/마스크/이전 이미지 임베딩만 정리.
  // 인코딩은 SAM 도구 진입 시점에 lazy 하게 트리거 (사용자가 SAM 안 쓰는데
  // 이미지 진입마다 ~500ms freeze 도는 비용 회피).
  $effect(() => {
    const img = workspaceManager.currentImage
    if (!img) return
    if (samPrevImageId === img.id) return
    const prev = samPrevImageId
    samPrevImageId = img.id
    samAssistant.resetForImageChange(prev)
    if (fabricCanvas) clearSamOverlay(fabricCanvas, samOverlay)
  })

  // SAM: 도구 ↔ 비-도구 전환 처리.
  //   - sam 진입: 현재 이미지 인코딩 시작 (이미 캐시 있으면 즉시 ready)
  //   - sam 이탈: 오버레이/프롬프트 정리
  $effect(() => {
    const tool = toolManager.currentTool
    if (tool === 'sam') {
      const img = workspaceManager.currentImage
      const wsPath = workspaceManager.workspacePath
      if (img && wsPath) {
        void samAssistant.ensureEncoded(wsPath, img.filename, img.id)
      }
    } else if (fabricCanvas) {
      clearSamOverlay(fabricCanvas, samOverlay)
      samAssistant.clearPrompts()
      fabricCanvas.requestRenderAll()
    }
  })

  // SAM 모드 ↔ 일반 모드 시 기존 라벨의 selectable/evented 토글.
  // SAM 동작 중 사용자 클릭/드래그가 기존 BB 라벨을 잡아끄는 사고를 차단한다.
  // currentLabels 가 변해도 (Enter 로 새 라벨 추가) 다시 반영되도록 의존성 명시.
  $effect(() => {
    const tool = toolManager.currentTool
    void workspaceManager.currentLabels.length
    if (!fabricCanvas || !isInitialized) return
    if (tool === 'sam') {
      for (const [, objects] of labelBoxes) {
        objects.rect.set({ selectable: false, evented: false })
      }
    } else {
      for (const [, objects] of labelBoxes) {
        objects.rect.set({ selectable: true, evented: true })
      }
      applyModeLocksToAll(fabricCanvas, labelBoxes, modeManager.current)
    }
    fabricCanvas.requestRenderAll()
  })

  // SAM: 점/박스 프롬프트 변경 → 마커 재렌더
  $effect(() => {
    const points = samAssistant.points
    const box = samAssistant.box
    if (!fabricCanvas || !currentImageObject) return
    if (toolManager.currentTool !== 'sam') return
    renderPointMarkers(fabricCanvas, currentImageObject, samOverlay, points)
    renderBoxMarker(fabricCanvas, currentImageObject, samOverlay, box)
    fabricCanvas.requestRenderAll()
  })

  // SAM: 마스크 결과 변경 → 마스크 + bbox 미리보기 재렌더
  $effect(() => {
    const mask = samAssistant.lastMask
    const bbox = samAssistant.lastBbox
    if (!fabricCanvas || !currentImageObject) return
    if (toolManager.currentTool !== 'sam') return
    const classId = workspaceManager.selectedClassId ?? 0
    const color = getClassColor(classId)
    renderBboxPreview(fabricCanvas, currentImageObject, samOverlay, bbox, color)
    if (mask) {
      const token = ++samMaskRenderToken
      void renderMask(fabricCanvas, currentImageObject, samOverlay, mask, color).then(() => {
        // 도중에 다른 prediction 이 들어왔거나 도구가 바뀌었으면 결과 무시
        if (token !== samMaskRenderToken) return
        if (!fabricCanvas) return
        fabricCanvas.requestRenderAll()
      })
    } else {
      // 마스크 없음 → 기존 마스크 제거
      if (samOverlay.maskImage) {
        fabricCanvas.remove(samOverlay.maskImage)
        samOverlay.maskImage = null
      }
      fabricCanvas.requestRenderAll()
    }
  })

  // 도구 변경 시 커서 업데이트
  $effect(() => {
    if (fabricCanvas && isInitialized) {
      updateCursorForTool(fabricCanvas, toolManager, labelBoxes)
    }
  })

  // 모드 변경 시 모든 라벨 박스 잠금 상태 재적용 (Check = resize-only)
  $effect(() => {
    const mode = modeManager.current
    if (!fabricCanvas || !isInitialized) return
    applyModeLocksToAll(fabricCanvas, labelBoxes, mode)
    // Check 모드 진입 시 활성 선택 해제 (이동 가능 상태가 잔존하지 않도록)
    if (mode !== 'edit') {
      fabricCanvas.discardActiveObject()
      fabricCanvas.requestRenderAll()
    }
  })

  // 라벨 뱃지 사용자 스케일 변경 시 모든 뱃지 크기/가시성 재계산
  $effect(() => {
    // 의존성 명시: labelBadgeScale
    void workspaceManager.labelBadgeScale
    if (!fabricCanvas || !isInitialized || !currentImageObject) return
    updateAllBoxPositions(getContext(), labelBoxes)
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
    repositionSamIfActive()
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
          repositionSamIfActive()
          fabricCanvas.requestRenderAll()
          console.log('Image centered')
        }
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('zoom-selection', () => {
        if (!currentImageObject || !fabricCanvas) return
        const data = workspaceManager.currentLabelData
        const selectedId = workspaceManager.selectedLabelId
        if (!data || !selectedId) return
        const ann = data.annotations.find((a) => a.id === selectedId)
        if (!ann) return

        // 어노테이션별 AABB 추출 — BB/OBB/Polygon 모두 image-pixel AABB 로 환산.
        let minX: number, minY: number, maxX: number, maxY: number
        if ('bbox' in ann && Array.isArray(ann.bbox)) {
          ;[minX, minY, maxX, maxY] = ann.bbox
        } else if ('obb' in ann) {
          const [cx, cy, w, h, angle] = ann.obb
          const rad = (angle * Math.PI) / 180
          const cos = Math.cos(rad)
          const sin = Math.sin(rad)
          const hw = w / 2
          const hh = h / 2
          const corners = [
            [cx + -hw * cos - -hh * sin, cy + -hw * sin + -hh * cos],
            [cx + hw * cos - -hh * sin, cy + hw * sin + -hh * cos],
            [cx + -hw * cos - hh * sin, cy + -hw * sin + hh * cos],
            [cx + hw * cos - hh * sin, cy + hw * sin + hh * cos]
          ]
          minX = Math.min(...corners.map((c) => c[0]))
          minY = Math.min(...corners.map((c) => c[1]))
          maxX = Math.max(...corners.map((c) => c[0]))
          maxY = Math.max(...corners.map((c) => c[1]))
        } else if ('polygon' in ann && Array.isArray(ann.polygon) && ann.polygon.length > 0) {
          minX = Math.min(...ann.polygon.map((p) => p[0]))
          minY = Math.min(...ann.polygon.map((p) => p[1]))
          maxX = Math.max(...ann.polygon.map((p) => p[0]))
          maxY = Math.max(...ann.polygon.map((p) => p[1]))
        } else {
          return
        }

        zoomToBBox(fabricCanvas, currentImageObject, workspaceManager, {
          minX,
          minY,
          maxX,
          maxY
        })
        updateAllBoxPositions(getContext(), labelBoxes)
        repositionSamIfActive()
        fabricCanvas.requestRenderAll()
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('pan-tool', () => {
        toolManager.setTool('pan')
        console.log('Pan tool selected')
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('select-class', (payload) => {
        // Edit 모드에서만 클래스 변경 허용
        if (modeManager.current !== 'edit') return
        if (!payload) return
        const digit = parseInt(payload, 10)
        if (Number.isNaN(digit)) return
        const idx = digit - 1
        const classes = workspaceManager.classList
        if (idx < 0 || idx >= classes.length) return
        const newClassId = classes[idx].id

        // 다음에 만들 박스 위해 selectedClassId 변경
        workspaceManager.setSelectedClassId(newClassId)

        // 선택된 라벨(들)이 있으면 그 라벨들의 class 도 함께 변경 (CVAT 패턴).
        // SAM 어시스턴트로 만든 박스 직후 클래스 빠르게 수정 + 다중 선택 일괄 reclass 둘 다 커버.
        const selectedIds = workspaceManager.selectedLabelIds
        if (selectedIds.length > 0) {
          workspaceManager.setLabelClasses(selectedIds, newClassId)
        }
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('delete', () => {
        // Check / Preview 모드에서는 삭제 차단
        if (modeManager.current !== 'edit') return
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
        // Check 모드에서도 복사는 허용 (붙여넣기만 Edit 전용)
        const n = workspaceManager.copySelectedLabels()
        if (n > 0) console.log(`[Clipboard] ${n}개 복사`)
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('paste', () => {
        if (modeManager.current !== 'edit') return
        const n = workspaceManager.pasteClipboard()
        if (n > 0) console.log(`[Clipboard] ${n}개 붙여넣기`)
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('replicate-prev', () => {
        if (modeManager.current !== 'edit') return
        void workspaceManager.replicatePreviousImageLabels().then((n) => {
          if (n > 0) console.log(`[Replicate] 직전 이미지 ${n}개 복제`)
        })
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('toggle-complete', () => {
        void workspaceManager.toggleCurrentCompletion().then(async (ok) => {
          if (!ok) return
          // Review 모드일 때는 자동으로 다음 이미지로 이동
          if (modeManager.current === 'check') {
            await workspaceManager.nextImage()
          }
        })
      })
    )

    cleanupHandlers.push(
      keyboardManager.onAction('resize-selected', (payload) => {
        // 키보드 크기 조절은 Check 모드에서만 (Edit는 마우스/일반 흐름이 충분)
        if (modeManager.current !== 'check') return
        if (!payload) return
        const m = payload.match(/^(w|h):(-?\d+)$/)
        if (!m) return
        const axis = m[1] as 'w' | 'h'
        const delta = parseInt(m[2], 10)
        if (!Number.isFinite(delta) || delta === 0) return
        workspaceManager.resizeSelectedBox(axis, delta)
      })
    )

    // Polygon 그리기 — Enter로 닫기, ESC로 취소 (window 리스너)
    const polygonKeyListener = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (toolManager.currentTool !== 'polygon') return
      if (event.key === 'Enter') {
        event.preventDefault()
        commitPolygonDraft(getMouseHandlerContext(), mouseHandlerState)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelPolygonDraft(getMouseHandlerContext(), mouseHandlerState)
      }
    }
    window.addEventListener('keydown', polygonKeyListener)
    cleanupHandlers.push(() => window.removeEventListener('keydown', polygonKeyListener))

    // SAM 어시스턴트 3-stage 키 (Space 한 키로 stage 진행):
    //   Stage 1 → 2: Space (마스크 없을 때 + 프롬프트 있음) — 추론 실행
    //   Stage 2 → 3: Space (마스크 있을 때)                — 라벨 확정 + 다음 객체로
    //                Esc                                   — 전체 취소 (프롬프트/마스크 클리어)
    //                Backspace                             — 마지막 프롬프트 제거 (마스크 invalidate)
    //
    // capture phase + stopImmediatePropagation 으로 keyboardManager 의 글로벌 매핑
    // (Space='toggle-complete', Backspace='delete') 가 같이 발사되는 것을 차단한다.
    const samKeyListener = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (toolManager.currentTool !== 'sam') return

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (samAssistant.lastMask) {
          // Stage 2 → 3: 마스크 → 라벨 확정
          confirmSamMaskAsBox()
        } else if (samAssistant.hasPrompts) {
          // Stage 1 → 2: 추론 실행
          void samAssistant.runPrediction()
        }
        // 프롬프트도 없고 마스크도 없으면 Space 는 no-op (toggle-complete 도 차단된 상태)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        samAssistant.clearPrompts()
        if (fabricCanvas) clearSamOverlay(fabricCanvas, samOverlay)
        if (fabricCanvas) fabricCanvas.requestRenderAll()
      } else if (event.key === 'Backspace') {
        if (!samAssistant.hasPrompts) return
        event.preventDefault()
        event.stopImmediatePropagation()
        samAssistant.removeLastPrompt()
      }
    }
    window.addEventListener('keydown', samKeyListener, { capture: true })
    cleanupHandlers.push(() =>
      window.removeEventListener('keydown', samKeyListener, { capture: true })
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

      <div class="h-4 w-px bg-border"></div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">라벨 크기</span>
        <Slider
          type="single"
          class="w-28"
          min={0}
          max={150}
          step={5}
          value={Math.round(workspaceManager.labelBadgeScale * 100)}
          onValueChange={(v) => workspaceManager.setLabelBadgeScale((v ?? 0) / 100)}
          disabled={workspaceManager.labelsHidden}
        />
        <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(workspaceManager.labelBadgeScale * 100)}%
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
