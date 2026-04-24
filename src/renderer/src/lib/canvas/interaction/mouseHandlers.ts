/**
 * 마우스 이벤트 핸들러
 * 박스 드로잉 및 상호작용
 *
 * 핵심 원칙:
 * - 모든 좌표는 이미지 픽셀 단위 (실수)
 * - 스크린 변환은 렌더링 시에만 수행
 */

import { Rect } from 'fabric'
import type { Canvas, FabricImage, Object as FabricObject } from 'fabric'
import type { WorkspaceManager } from '../../stores/workspace.svelte.js'
import type { ToolManager } from '../../stores/toolManager.svelte.js'
import { getClassColor, hexToRgba, BOX_STYLE, type BoxRect } from '../styles/boxStyles.js'
import { pixelToImage, createBboxFromPoints, bboxToObb } from '../coordinates.js'
import { getImageOffset } from '../core/imageLoader.js'
import type { CanvasLabelObjects } from '../labels/labelManager.js'

// ============================================
// 타입 정의
// ============================================

export interface MouseHandlerContext {
  fabricCanvas: Canvas
  imageObject: FabricImage
  workspaceManager: WorkspaceManager
  toolManager: ToolManager
  drawingBox: { value: FabricObject | null }
  labelBoxes: Map<string, CanvasLabelObjects>
}

export interface MouseHandlerState {
  isDrawing: boolean
  startX: number
  startY: number
  currentClassId: number
}

// ============================================
// 모디파이어 키 유틸
// ============================================

/**
 * 박스 드로잉 중 Shift/Alt 모디파이어를 적용해 실제 (start, end) 이미지 좌표를 산출한다.
 * - Shift: 정사각형 (단축 축에 맞춤 + 포인터 방향 유지)
 * - Alt:   start를 중심점으로 간주 (중심 기준 리사이즈)
 */
export function applyDrawModifiers(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  shift: boolean,
  alt: boolean
): { startX: number; startY: number; endX: number; endY: number } {
  const dx = currentX - startX
  const dy = currentY - startY

  if (alt) {
    // start = 중심
    let hw = Math.abs(dx)
    let hh = Math.abs(dy)
    if (shift) {
      const side = Math.max(hw, hh)
      hw = side
      hh = side
    }
    return {
      startX: startX - hw,
      startY: startY - hh,
      endX: startX + hw,
      endY: startY + hh
    }
  }

  if (shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    const sx = dx >= 0 ? 1 : -1
    const sy = dy >= 0 ? 1 : -1
    return {
      startX,
      startY,
      endX: startX + sx * side,
      endY: startY + sy * side
    }
  }

  return { startX, startY, endX: currentX, endY: currentY }
}

// ============================================
// 마우스 이벤트 핸들러
// ============================================

/**
 * 마우스 다운 이벤트 - 박스 드로잉 시작
 */
export function handleMouseDown(
  e: { e: MouseEvent },
  context: MouseHandlerContext,
  state: MouseHandlerState
): void {
  const { fabricCanvas, imageObject, toolManager, drawingBox, workspaceManager } = context

  // 박스 도구가 아니면 무시
  if (toolManager.currentTool !== 'box') return
  if (!imageObject) return

  // 이미 선택된 박스가 있으면 새 박스 생성하지 않음 (선택 모드)
  if (workspaceManager.selectedLabelId) return

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  // 캔버스 좌표 계산
  const pointer = fabricCanvas.getScenePoint(e.e)
  const imageCoords = pixelToImage(pointer.x, pointer.y, scale, offset.x, offset.y)

  state.isDrawing = true
  state.startX = imageCoords.x
  state.startY = imageCoords.y
  state.currentClassId = context.workspaceManager.selectedClassId ?? 0

  // 드로잉 박스 생성
  const color = getClassColor(state.currentClassId)
  const screenX = pointer.x
  const screenY = pointer.y

  const rect = new Rect({
    left: screenX,
    top: screenY,
    width: 0,
    height: 0,
    originX: 'left',
    originY: 'top',
    stroke: color,
    strokeWidth: BOX_STYLE.strokeWidth,
    fill: hexToRgba(color, BOX_STYLE.fillOpacity),
    selectable: false,
    evented: false
  })

  ;(rect as unknown as BoxRect).data = {
    id: 'drawing',
    classId: state.currentClassId,
    color,
    type: 'label',
    shape: 'bb'
  }

  drawingBox.value = rect
  fabricCanvas.add(rect)
  fabricCanvas.requestRenderAll()
}

/**
 * 마우스 무브 이벤트 - 박스 드로잉 업데이트
 */
export function handleMouseMove(
  e: { e: MouseEvent },
  context: MouseHandlerContext,
  state: MouseHandlerState
): void {
  const { fabricCanvas, imageObject, drawingBox } = context

  if (!state.isDrawing || !drawingBox.value || !imageObject) return

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  // 캔버스 좌표 계산
  const pointer = fabricCanvas.getScenePoint(e.e)
  const imageCoords = pixelToImage(pointer.x, pointer.y, scale, offset.x, offset.y)

  // 모디파이어 적용 (Shift: 정사각형, Alt: 중심 기준)
  const modified = applyDrawModifiers(
    state.startX,
    state.startY,
    imageCoords.x,
    imageCoords.y,
    e.e.shiftKey,
    e.e.altKey
  )

  // 드로잉 박스 크기 업데이트 (스크린 좌표)
  const startScreenX = modified.startX * scale + offset.x
  const startScreenY = modified.startY * scale + offset.y
  const endScreenX = modified.endX * scale + offset.x
  const endScreenY = modified.endY * scale + offset.y

  const width = Math.abs(endScreenX - startScreenX)
  const height = Math.abs(endScreenY - startScreenY)
  const left = Math.min(startScreenX, endScreenX)
  const top = Math.min(startScreenY, endScreenY)

  drawingBox.value.set({
    left,
    top,
    width,
    height
  })

  drawingBox.value.setCoords()
  fabricCanvas.requestRenderAll()
}

/**
 * 마우스 업 이벤트 - 박스 드로잉 완료
 */
export function handleMouseUp(
  e: { e: MouseEvent },
  context: MouseHandlerContext,
  state: MouseHandlerState
): void {
  const { fabricCanvas, imageObject, workspaceManager, drawingBox } = context

  if (!state.isDrawing || !drawingBox.value || !imageObject) {
    state.isDrawing = false
    return
  }

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  // 캔버스 좌표 계산
  const pointer = fabricCanvas.getScenePoint(e.e)
  const imageCoords = pixelToImage(pointer.x, pointer.y, scale, offset.x, offset.y)

  // 모디파이어 적용 (Shift: 정사각형, Alt: 중심 기준)
  const modified = applyDrawModifiers(
    state.startX,
    state.startY,
    imageCoords.x,
    imageCoords.y,
    e.e.shiftKey,
    e.e.altKey
  )

  // 최소 크기 체크
  const width = Math.abs(modified.endX - modified.startX)
  const height = Math.abs(modified.endY - modified.startY)

  if (width < 5 || height < 5) {
    // 너무 작으면 취소
    fabricCanvas.remove(drawingBox.value)
    drawingBox.value = null
    state.isDrawing = false
    fabricCanvas.requestRenderAll()
    return
  }

  // 이미지 좌표로 BBox 생성
  const bbox = createBboxFromPoints(modified.startX, modified.startY, modified.endX, modified.endY)

  // UUID 생성
  const id = crypto.randomUUID()

  // 라벨링 타입에 따라 적절한 어노테이션 추가
  if (workspaceManager.isOBBMode) {
    // OBB 모드: bbox를 obb로 변환 (중심점, 너비, 높이, 각도=0)
    const obb = bboxToObb(bbox, 0)
    console.log('[Draw] OBB created:', {
      cx: obb[0],
      cy: obb[1],
      w: obb[2],
      h: obb[3],
      angle: obb[4]
    })
    workspaceManager.addOBBAnnotation({
      id,
      class_id: state.currentClassId,
      obb
    })
  } else {
    // BB 모드
    console.log('[Draw] BBox created:', {
      xmin: bbox[0],
      ymin: bbox[1],
      xmax: bbox[2],
      ymax: bbox[3]
    })
    workspaceManager.addBBAnnotation({
      id,
      class_id: state.currentClassId,
      bbox
    })
  }

  // 드로잉 박스 제거
  fabricCanvas.remove(drawingBox.value)
  drawingBox.value = null
  state.isDrawing = false
  fabricCanvas.requestRenderAll()
}

/**
 * 마우스 휠 이벤트 - 줌
 */
export function handleWheel(_e: { e: WheelEvent }, _context: MouseHandlerContext): void {
  // 줌 핸들러는 zoomHandler.ts에서 별도 처리 (사전 정의만 유지)
}

// ============================================
// 커서 설정
// ============================================

/**
 * 도구에 따른 커서 설정
 */
export function updateCursorForTool(
  fabricCanvas: Canvas,
  toolManager: ToolManager,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const currentTool = toolManager.currentTool

  labelBoxes.forEach((objects) => {
    if (currentTool === 'box') {
      objects.rect.hoverCursor = 'crosshair'
      objects.rect.moveCursor = 'crosshair'
    } else if (currentTool === 'pan') {
      objects.rect.hoverCursor = 'grab'
      objects.rect.moveCursor = 'grab'
    } else {
      objects.rect.hoverCursor = 'move'
      objects.rect.moveCursor = 'move'
    }
  })

  if (currentTool === 'pan') {
    fabricCanvas.defaultCursor = 'grab'
    fabricCanvas.hoverCursor = 'grab'
  } else if (currentTool === 'box') {
    fabricCanvas.defaultCursor = 'crosshair'
    fabricCanvas.hoverCursor = 'crosshair'
  } else {
    fabricCanvas.defaultCursor = 'default'
    fabricCanvas.hoverCursor = 'default'
  }

  fabricCanvas.requestRenderAll()
}
