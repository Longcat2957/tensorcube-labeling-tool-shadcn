/**
 * 라벨 관리 (Canvas 내 라벨 객체 CRUD)
 *
 * 핵심 원칙:
 * - 모든 좌표는 이미지 픽셀 단위 (실수)
 * - 스크린 변환은 렌더링 시에만 수행
 * - modified 이벤트에서 정확한 좌표 추출
 */

import { Canvas, FabricImage } from 'fabric'
import type {
  WorkspaceManager,
  BBAnnotation,
  OBBAnnotation,
  PolygonAnnotation
} from '../../stores/workspace.svelte.js'
import type { ToolManager } from '../../stores/toolManager.svelte.js'
import type { AppMode } from '../../stores/modeManager.svelte.js'
import { createLabelBox, createLabelBadge } from '../boxFactory.js'
import {
  createPolygonObject,
  extractPolygonFromObject,
  updatePolygonPosition
} from '../polygonFactory.js'
import {
  updateBoxPosition,
  updateBadgePosition,
  extractBBoxFromRect,
  extractOBBFromRect
} from '../boxUtils.js'
import { applySelectedStyle, type BoxRect, type BadgeObjects } from '../styles/boxStyles.js'
import { getImageOffset } from '../core/imageLoader.js'

// ============================================
// 타입 정의
// ============================================

export interface CanvasLabelObjects {
  rect: BoxRect
  badge: BadgeObjects
}

export interface LabelManagerContext {
  fabricCanvas: Canvas
  imageObject: FabricImage
  workspaceManager: WorkspaceManager
  toolManager: ToolManager
  /** 현재 앱 모드. Check 모드에서는 박스 이동/회전이 잠기고 크기 조절만 허용된다. */
  appMode: AppMode
}

/**
 * Check 모드 = 검수(resize-only). 박스 이동/회전 잠금, 크기 조절만 허용.
 * Polygon은 이미 scale/rotate 잠겨있으므로 movement까지 추가로 잠가 완전 read-only.
 * Edit / Preview 모드는 일반 동작.
 */
export function applyModeLocksToBox(rect: BoxRect, mode: AppMode): void {
  const isCheck = mode === 'check'
  const shape = rect.data?.shape
  if (shape === 'bb') {
    rect.set({
      lockMovementX: isCheck,
      lockMovementY: isCheck,
      lockRotation: true // BB는 항상 회전 잠금
    })
  } else if (shape === 'obb') {
    rect.set({
      lockMovementX: isCheck,
      lockMovementY: isCheck,
      lockRotation: isCheck // Check에서는 회전도 잠금
    })
  } else if (shape === 'polygon') {
    rect.set({
      lockMovementX: isCheck,
      lockMovementY: isCheck
      // scale/rotation은 polygonFactory에서 이미 잠금
    })
  }
}

/**
 * 캔버스의 모든 라벨 박스에 현재 모드 기준 잠금 상태를 적용.
 */
export function applyModeLocksToAll(
  fabricCanvas: Canvas | null,
  labelBoxes: Map<string, CanvasLabelObjects>,
  mode: AppMode
): void {
  if (!fabricCanvas) return
  labelBoxes.forEach((objects) => {
    applyModeLocksToBox(objects.rect, mode)
  })
  fabricCanvas.requestRenderAll()
}

// ============================================
// 캔버스 오버레이 정리
// ============================================

/**
 * 캔버스 오버레이 정리 (드로잉 박스, 라벨 박스 모두)
 */
export function clearCanvasOverlays(
  fabricCanvas: Canvas,
  labelBoxes: Map<string, CanvasLabelObjects>,
  drawingBox: { value: any }
): void {
  if (!fabricCanvas) return

  if (drawingBox.value) {
    fabricCanvas.remove(drawingBox.value)
    drawingBox.value = null
  }

  labelBoxes.forEach((objects) => {
    fabricCanvas.remove(objects.rect)
    fabricCanvas.remove(objects.badge.background)
    fabricCanvas.remove(objects.badge.text)
  })
  labelBoxes.clear()
}

// ============================================
// 라벨 박스 캔버스 추가
// ============================================

/**
 * 캔버스에 라벨 박스 추가
 */
export function addBoxToCanvas(
  annotation: BBAnnotation | OBBAnnotation,
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const { fabricCanvas, imageObject, workspaceManager, toolManager } = context

  if (!fabricCanvas || !imageObject) return

  const existingObjects = labelBoxes.get(annotation.id)
  if (existingObjects) {
    fabricCanvas.remove(existingObjects.rect)
    fabricCanvas.remove(existingObjects.badge.background)
    fabricCanvas.remove(existingObjects.badge.text)
    labelBoxes.delete(annotation.id)
  }

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  const className =
    workspaceManager.workspaceConfig?.names?.[String(annotation.class_id)] ??
    `Class ${annotation.class_id}`
  const rect = createLabelBox(annotation, scale, offset.x, offset.y)
  const badge = createLabelBadge(annotation, className, scale, offset.x, offset.y)

  // 선택 이벤트 핸들러 (Shift-click 다중 선택 지원)
  rect.on('selected', (evt) => {
    // pan 도구일 때는 선택 불가 (패닝만 가능)
    if (toolManager.currentTool === 'pan') {
      fabricCanvas?.discardActiveObject()
      fabricCanvas?.requestRenderAll()
      return
    }
    const native = (evt as unknown as { e?: MouseEvent })?.e
    if (native?.shiftKey) {
      workspaceManager.toggleLabelSelection(annotation.id)
    } else {
      workspaceManager.setSelectedLabelId(annotation.id)
    }
    applySelectedStyle(rect, true)
    fabricCanvas?.requestRenderAll()
  })

  rect.on('deselected', () => {
    // 다중 선택 세트에 남아있다면 스타일과 상태를 유지 (Fabric는 activeObject만 바뀌어도 deselected를 쏜다)
    if (workspaceManager.selectedLabelIds.includes(annotation.id)) {
      applySelectedStyle(rect, true)
      fabricCanvas?.requestRenderAll()
      return
    }
    if (workspaceManager.selectedLabelId === annotation.id) {
      workspaceManager.setSelectedLabelId(null)
    }
    applySelectedStyle(rect, false)
    fabricCanvas?.requestRenderAll()
  })

  // 수정 이벤트 핸들러 (이동/리사이즈 완료 시)
  rect.on('modified', () => {
    if (!imageObject) return
    const scale = imageObject.scaleX || 1
    const offset = getImageOffset(imageObject)

    console.log('[Modified] BEFORE:', {
      id: annotation.id,
      shape: rect.data.shape,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      scaleX: rect.scaleX,
      scaleY: rect.scaleY,
      angle: rect.angle
    })

    if (rect.data.shape === 'obb') {
      // OBB: center origin 기준
      const newObb = extractOBBFromRect(rect, scale, offset.x, offset.y)
      console.log('[Modified] OBB AFTER:', {
        cx: newObb[0],
        cy: newObb[1],
        w: newObb[2],
        h: newObb[3],
        angle: newObb[4]
      })
      workspaceManager.updateOBBAnnotation(annotation.id, newObb)
    } else {
      // BB: left/top origin 기준
      const newBbox = extractBBoxFromRect(rect, scale, offset.x, offset.y)
      console.log('[Modified] BB AFTER:', {
        xmin: newBbox[0],
        ymin: newBbox[1],
        xmax: newBbox[2],
        ymax: newBbox[3]
      })
      workspaceManager.updateBBAnnotation(annotation.id, newBbox)
    }

    // 뱃지 위치 동기화
    const objects = labelBoxes.get(annotation.id)
    const className =
      workspaceManager.workspaceConfig?.names?.[String(annotation.class_id)] ??
      `Class ${annotation.class_id}`
    if (objects) {
      if (rect.data.shape === 'obb') {
        const updated = workspaceManager.getOBBAnnotationById(annotation.id)
        if (updated) {
          updateBadgePosition(
            objects.badge,
            updated.obb,
            scale,
            offset.x,
            offset.y,
            false,
            className
          )
        }
      } else {
        const updated = workspaceManager.getBBAnnotationById(annotation.id)
        if (updated) {
          updateBadgePosition(
            objects.badge,
            updated.bbox,
            scale,
            offset.x,
            offset.y,
            true,
            className
          )
        }
      }
    }

    // 리사이즈 후 scaleX/scaleY 초기화
    rect.set({ scaleX: 1, scaleY: 1 })
    rect.setCoords()
    fabricCanvas?.requestRenderAll()
    console.log('Box modified:', annotation.id)
  })

  if (workspaceManager.selectedLabelId === annotation.id) {
    applySelectedStyle(rect, true)
  }

  fabricCanvas.add(badge.background)
  fabricCanvas.add(badge.text)
  fabricCanvas.add(rect)
  fabricCanvas.bringObjectToFront(rect)
  labelBoxes.set(annotation.id, { rect, badge })

  // 모드별 잠금 상태 적용 (Check 모드 = resize-only)
  applyModeLocksToBox(rect, context.appMode)

  // 현재 도구에 맞는 커서 설정
  const currentTool = toolManager.currentTool
  if (currentTool === 'box') {
    rect.hoverCursor = 'crosshair'
    rect.moveCursor = 'crosshair'
  } else if (currentTool === 'pan') {
    rect.hoverCursor = 'grab'
    rect.moveCursor = 'grab'
  } else {
    rect.hoverCursor = 'move'
    rect.moveCursor = 'move'
  }

  fabricCanvas.requestRenderAll()
}

// ============================================
// Polygon 라벨 캔버스 추가
// ============================================

/**
 * Polygon 어노테이션을 캔버스에 추가.
 * - move 후 modified 이벤트에서 새 polygon 좌표 추출
 * - selection 이벤트는 BB/OBB와 동일 처리
 */
export function addPolygonToCanvas(
  annotation: PolygonAnnotation,
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const { fabricCanvas, imageObject, workspaceManager, toolManager } = context

  if (!fabricCanvas || !imageObject) return

  const existingObjects = labelBoxes.get(annotation.id)
  if (existingObjects) {
    fabricCanvas.remove(existingObjects.rect)
    fabricCanvas.remove(existingObjects.badge.background)
    fabricCanvas.remove(existingObjects.badge.text)
    labelBoxes.delete(annotation.id)
  }

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)
  const className =
    workspaceManager.workspaceConfig?.names?.[String(annotation.class_id)] ??
    `Class ${annotation.class_id}`

  const polygonObj = createPolygonObject(annotation, scale, offset.x, offset.y)
  const badge = createLabelBadge(annotation, className, scale, offset.x, offset.y)

  polygonObj.on('selected', (evt) => {
    if (toolManager.currentTool === 'pan') {
      fabricCanvas?.discardActiveObject()
      fabricCanvas?.requestRenderAll()
      return
    }
    const native = (evt as unknown as { e?: MouseEvent })?.e
    if (native?.shiftKey) {
      workspaceManager.toggleLabelSelection(annotation.id)
    } else {
      workspaceManager.setSelectedLabelId(annotation.id)
    }
    applySelectedStyle(polygonObj, true)
    fabricCanvas?.requestRenderAll()
  })

  polygonObj.on('deselected', () => {
    if (workspaceManager.selectedLabelIds.includes(annotation.id)) {
      applySelectedStyle(polygonObj, true)
      fabricCanvas?.requestRenderAll()
      return
    }
    if (workspaceManager.selectedLabelId === annotation.id) {
      workspaceManager.setSelectedLabelId(null)
    }
    applySelectedStyle(polygonObj, false)
    fabricCanvas?.requestRenderAll()
  })

  polygonObj.on('modified', () => {
    if (!imageObject) return
    const s = imageObject.scaleX || 1
    const o = getImageOffset(imageObject)
    const newPolygon = extractPolygonFromObject(polygonObj, s, o.x, o.y)
    workspaceManager.updatePolygonAnnotation(annotation.id, newPolygon)

    // 뱃지 위치 동기화 (AABB 기준 top-left)
    const objects = labelBoxes.get(annotation.id)
    if (objects && newPolygon.length > 0) {
      const xs = newPolygon.map((p) => p[0])
      const ys = newPolygon.map((p) => p[1])
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const maxX = Math.max(...xs)
      const maxY = Math.max(...ys)
      // 가짜 bbox로 badge 위치 갱신
      updateBadgePosition(objects.badge, [minX, minY, maxX, maxY], s, o.x, o.y, true, className)
    }
    fabricCanvas?.requestRenderAll()
  })

  if (workspaceManager.selectedLabelId === annotation.id) {
    applySelectedStyle(polygonObj, true)
  }

  fabricCanvas.add(badge.background)
  fabricCanvas.add(badge.text)
  fabricCanvas.add(polygonObj)
  fabricCanvas.bringObjectToFront(polygonObj)
  labelBoxes.set(annotation.id, { rect: polygonObj, badge })

  // 모드별 잠금 상태 적용 (Check 모드 = polygon read-only)
  applyModeLocksToBox(polygonObj, context.appMode)

  const currentTool = toolManager.currentTool
  if (currentTool === 'polygon') {
    polygonObj.hoverCursor = 'crosshair'
  } else if (currentTool === 'pan') {
    polygonObj.hoverCursor = 'grab'
  } else {
    polygonObj.hoverCursor = 'move'
  }

  fabricCanvas.requestRenderAll()
}

// ============================================
// 라벨 박스 캔버스 제거
// ============================================

/**
 * 캔버스에서 라벨 박스 제거
 */
export function removeBoxFromCanvas(
  labelId: string,
  fabricCanvas: Canvas,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  if (!fabricCanvas) return

  const objects = labelBoxes.get(labelId)
  if (objects) {
    fabricCanvas.remove(objects.rect)
    fabricCanvas.remove(objects.badge.background)
    fabricCanvas.remove(objects.badge.text)
    labelBoxes.delete(labelId)
    fabricCanvas.requestRenderAll()
  }
}

// ============================================
// 모든 라벨 박스 위치 업데이트
// ============================================

/**
 * 모든 라벨 박스 위치 업데이트 (줌/패닝 후)
 */
export function updateAllBoxPositions(
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const { fabricCanvas, imageObject, workspaceManager } = context

  if (!fabricCanvas || !imageObject) return

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  labelBoxes.forEach((objects, labelId) => {
    const bbAnnotation = workspaceManager.getBBAnnotationById(labelId)
    const obbAnnotation = workspaceManager.getOBBAnnotationById(labelId)
    const polyAnnotation = workspaceManager.getPolygonAnnotationById(labelId)
    const annotation = bbAnnotation ?? obbAnnotation ?? polyAnnotation

    if (!annotation) return

    const className =
      workspaceManager.workspaceConfig?.names?.[String(annotation.class_id)] ??
      `Class ${annotation.class_id}`

    if ('polygon' in annotation) {
      updatePolygonPosition(objects.rect, annotation.polygon, scale, offset.x, offset.y)
      if (annotation.polygon.length > 0) {
        const xs = annotation.polygon.map((p) => p[0])
        const ys = annotation.polygon.map((p) => p[1])
        updateBadgePosition(
          objects.badge,
          [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
          scale,
          offset.x,
          offset.y,
          true,
          className
        )
      }
    } else {
      const coords = 'bbox' in annotation ? annotation.bbox : annotation.obb
      updateBoxPosition(objects.rect, coords, scale, offset.x, offset.y)
      updateBadgePosition(
        objects.badge,
        coords,
        scale,
        offset.x,
        offset.y,
        'bbox' in annotation,
        className
      )
    }
  })

  fabricCanvas.requestRenderAll()
}

// ============================================
// 라벨 렌더링
// ============================================

/**
 * 저장된 라벨들을 캔버스에 렌더링
 */
export function renderLabels(
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>,
  drawingBox: { value: any }
): void {
  const { fabricCanvas, workspaceManager } = context

  if (!fabricCanvas) return

  clearCanvasOverlays(fabricCanvas, labelBoxes, drawingBox)

  const labelData = workspaceManager.currentLabelData
  if (!labelData || !labelData.annotations) return

  labelData.annotations.forEach((ann) => {
    if (!ann || typeof ann !== 'object') return
    if ('keypoints' in ann) {
      // Keypoint 는 Phase 15b에서 추가
      return
    }
    if ('polygon' in ann) {
      addPolygonToCanvas(ann as PolygonAnnotation, context, labelBoxes)
      return
    }
    if ('bbox' in ann || 'obb' in ann) {
      addBoxToCanvas(ann as BBAnnotation | OBBAnnotation, context, labelBoxes)
    }
  })
}

// ============================================
// 라벨 데이터 변경 동기화
// ============================================

/**
 * 라벨 데이터 변경 감지 후 캔버스 동기화
 */
export function syncLabelChanges(
  context: LabelManagerContext,
  labelBoxes: Map<string, CanvasLabelObjects>
): void {
  const { fabricCanvas, imageObject, workspaceManager } = context

  const currentLabels = workspaceManager.currentLabels
  if (!fabricCanvas || !imageObject) return

  // 현재 캔버스에 있는 라벨 ID 집합 (스냅샷)
  const canvasLabelIds = new Set(labelBoxes.keys())

  // 새로운 라벨 ID 집합
  const newLabelIds = new Set(currentLabels.map((l) => l.id))

  // 삭제된 라벨 제거
  canvasLabelIds.forEach((id) => {
    if (!newLabelIds.has(id)) {
      removeBoxFromCanvas(id, fabricCanvas, labelBoxes)
    }
  })

  const labelData = workspaceManager.currentLabelData
  if (!labelData?.annotations) return

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  labelData.annotations.forEach((ann) => {
    if (!ann || typeof ann !== 'object') return
    if ('keypoints' in ann) return // Phase 15b

    const className =
      workspaceManager.workspaceConfig?.names?.[String(ann.class_id)] ?? `Class ${ann.class_id}`

    if ('polygon' in ann) {
      const annotation = ann as PolygonAnnotation
      const existingObjects = labelBoxes.get(annotation.id)
      if (!existingObjects) {
        addPolygonToCanvas(annotation, context, labelBoxes)
        return
      }
      updatePolygonPosition(existingObjects.rect, annotation.polygon, scale, offset.x, offset.y)
      // 뱃지: AABB 기준
      if (annotation.polygon.length > 0) {
        const xs = annotation.polygon.map((p) => p[0])
        const ys = annotation.polygon.map((p) => p[1])
        updateBadgePosition(
          existingObjects.badge,
          [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
          scale,
          offset.x,
          offset.y,
          true,
          className
        )
      }
      applySelectedStyle(existingObjects.rect, workspaceManager.selectedLabelId === annotation.id)
      existingObjects.rect.setCoords()
      return
    }

    if ('bbox' in ann || 'obb' in ann) {
      const annotation = ann as BBAnnotation | OBBAnnotation
      const existingObjects = labelBoxes.get(annotation.id)
      if (!existingObjects) {
        addBoxToCanvas(annotation, context, labelBoxes)
        return
      }
      const coords = 'bbox' in annotation ? annotation.bbox : annotation.obb
      updateBoxPosition(existingObjects.rect, coords, scale, offset.x, offset.y)
      updateBadgePosition(
        existingObjects.badge,
        coords,
        scale,
        offset.x,
        offset.y,
        'bbox' in annotation,
        className
      )
      applySelectedStyle(existingObjects.rect, workspaceManager.selectedLabelId === annotation.id)
      existingObjects.rect.setCoords()
    }
  })

  fabricCanvas.requestRenderAll()
}

/**
 * 전역 라벨 가시성 토글 (H 단축키용)
 */
export function setLabelsVisibility(
  fabricCanvas: Canvas,
  labelBoxes: Map<string, CanvasLabelObjects>,
  visible: boolean
): void {
  labelBoxes.forEach((objects) => {
    objects.rect.visible = visible
    objects.badge.background.visible = visible
    objects.badge.text.visible = visible
  })
  fabricCanvas.requestRenderAll()
}
