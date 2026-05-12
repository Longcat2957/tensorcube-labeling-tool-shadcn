/**
 * SAM 어시스턴트의 캔버스 오버레이 객체 관리.
 *
 * 한 묶음의 Fabric 객체:
 *   - maskImage: 반투명 마스크 (FabricImage, 이미지 픽셀 → 캔버스 변환 적용)
 *   - bboxPreview: 점선 박스 (마스크의 axis-aligned bbox)
 *   - pointMarkers: 사용자 클릭한 점 (positive/negative 색상)
 */

import { Circle, FabricImage, Rect, Shadow } from 'fabric'
import type { Canvas, FabricImage as FabricImageType, Object as FabricObject } from 'fabric'
import type { SamMask } from '../../../../../shared/types.js'
import type { SamPromptPoint } from '../../stores/samAssistant.svelte.js'
import { getImageOffset } from '../core/imageLoader.js'
import { hexToRgb, maskToContourImageData, maskToImageData } from './maskUtils.js'

const MASK_FILL_ALPHA = 0.4
const MASK_CONTOUR_ALPHA = 0.95
const POSITIVE_COLOR = '#22c55e' // tailwind green-500
const NEGATIVE_COLOR = '#ef4444' // tailwind red-500
const POINT_RADIUS_SCREEN = 7 // px (z-fighting 방지 위해 stroke 0.5 더 크게)
const BBOX_DASH = [6, 4]

export interface SamOverlayObjects {
  maskImage: FabricImage | null
  contourImage: FabricImage | null
  bboxPreview: Rect | null
  pointMarkers: Circle[]
  boxMarker: Rect | null // 사용자 박스 프롬프트 (실선)
}

export function createEmptyOverlay(): SamOverlayObjects {
  return {
    maskImage: null,
    contourImage: null,
    bboxPreview: null,
    pointMarkers: [],
    boxMarker: null
  }
}

/** 모든 SAM 오버레이 객체를 캔버스에서 제거. */
export function clearOverlay(fabricCanvas: Canvas, overlay: SamOverlayObjects): void {
  if (overlay.maskImage) fabricCanvas.remove(overlay.maskImage)
  if (overlay.contourImage) fabricCanvas.remove(overlay.contourImage)
  if (overlay.bboxPreview) fabricCanvas.remove(overlay.bboxPreview)
  if (overlay.boxMarker) fabricCanvas.remove(overlay.boxMarker)
  for (const m of overlay.pointMarkers) fabricCanvas.remove(m)
  overlay.maskImage = null
  overlay.contourImage = null
  overlay.bboxPreview = null
  overlay.boxMarker = null
  overlay.pointMarkers = []
}

/**
 * 마스크 + 컨투어를 캔버스에 표시. 두 레이어 분리:
 *   - maskImage:    soft alpha 채움 (반투명)
 *   - contourImage: 외곽선 (불투명에 가까운 stroke)
 *
 * 둘 다 imageObject 의 scale/offset 에 정렬된다.
 */
export async function renderMask(
  fabricCanvas: Canvas,
  imageObject: FabricImageType,
  overlay: SamOverlayObjects,
  mask: SamMask,
  classColorHex: string
): Promise<void> {
  if (overlay.maskImage) {
    fabricCanvas.remove(overlay.maskImage)
    overlay.maskImage = null
  }
  if (overlay.contourImage) {
    fabricCanvas.remove(overlay.contourImage)
    overlay.contourImage = null
  }

  const rgb = hexToRgb(classColorHex)
  const fillData = maskToImageData(mask, rgb, MASK_FILL_ALPHA)
  // 컨투어는 약간 밝게 — 흰색으로 픽셀 톤 다운, 클래스 색은 그대로 사용
  const contourData = maskToContourImageData(mask, rgb, MASK_CONTOUR_ALPHA)

  const fillUrl = imageDataToDataUrl(fillData)
  const contourUrl = imageDataToDataUrl(contourData)
  if (!fillUrl || !contourUrl) return

  const [fillImg, contourImg] = await Promise.all([
    FabricImage.fromURL(fillUrl),
    FabricImage.fromURL(contourUrl)
  ])
  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  for (const img of [fillImg, contourImg]) {
    img.set({
      left: offset.x,
      top: offset.y,
      originX: 'left',
      originY: 'top',
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
      excludeFromExport: true,
      objectCaching: false
    })
  }
  ;(fillImg as unknown as { data: { type: string } }).data = { type: 'sam-mask' }
  ;(contourImg as unknown as { data: { type: string } }).data = { type: 'sam-contour' }

  // 채움 → 컨투어 순으로 추가 (컨투어가 위에)
  fabricCanvas.add(fillImg)
  fabricCanvas.add(contourImg)
  overlay.maskImage = fillImg
  overlay.contourImage = contourImg
}

function imageDataToDataUrl(imageData: ImageData): string | null {
  const off = document.createElement('canvas')
  off.width = imageData.width
  off.height = imageData.height
  const ctx = off.getContext('2d')
  if (!ctx) return null
  ctx.putImageData(imageData, 0, 0)
  return off.toDataURL()
}

/** bbox 점선 미리보기 갱신. */
export function renderBboxPreview(
  fabricCanvas: Canvas,
  imageObject: FabricImageType,
  overlay: SamOverlayObjects,
  bbox: [number, number, number, number] | null,
  classColorHex: string
): void {
  if (overlay.bboxPreview) {
    fabricCanvas.remove(overlay.bboxPreview)
    overlay.bboxPreview = null
  }
  if (!bbox) return

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)
  const [x1, y1, x2, y2] = bbox
  const rect = new Rect({
    left: x1 * scale + offset.x,
    top: y1 * scale + offset.y,
    originX: 'left',
    originY: 'top',
    width: (x2 - x1) * scale,
    height: (y2 - y1) * scale,
    fill: 'transparent',
    stroke: classColorHex,
    strokeWidth: 2,
    strokeDashArray: BBOX_DASH,
    selectable: false,
    evented: false,
    excludeFromExport: true,
    objectCaching: false
  })
  ;(rect as unknown as { data: { type: string } }).data = { type: 'sam-bbox-preview' }
  fabricCanvas.add(rect)
  overlay.bboxPreview = rect
}

/** 점 마커들 재렌더 (스크린 좌표 기준 — zoom 영향 안 받게 화면 px 고정 크기). */
export function renderPointMarkers(
  fabricCanvas: Canvas,
  imageObject: FabricImageType,
  overlay: SamOverlayObjects,
  points: SamPromptPoint[]
): void {
  for (const m of overlay.pointMarkers) fabricCanvas.remove(m)
  overlay.pointMarkers = []

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)
  for (const p of points) {
    const cx = p.x * scale + offset.x
    const cy = p.y * scale + offset.y
    const circle = new Circle({
      left: cx - POINT_RADIUS_SCREEN,
      top: cy - POINT_RADIUS_SCREEN,
      radius: POINT_RADIUS_SCREEN,
      fill: p.label === 1 ? POSITIVE_COLOR : NEGATIVE_COLOR,
      stroke: '#ffffff',
      strokeWidth: 2,
      shadow: new Shadow({
        color: 'rgba(0,0,0,0.45)',
        blur: 4,
        offsetX: 0,
        offsetY: 1
      }),
      selectable: false,
      evented: false,
      excludeFromExport: true,
      objectCaching: false
    })
    ;(circle as unknown as { data: { type: string; label: number } }).data = {
      type: 'sam-point',
      label: p.label
    }
    fabricCanvas.add(circle)
    overlay.pointMarkers.push(circle)
  }
}

/** 박스 프롬프트 마커 (사용자 드래그 박스). 실선 흰테두리. */
export function renderBoxMarker(
  fabricCanvas: Canvas,
  imageObject: FabricImageType,
  overlay: SamOverlayObjects,
  box: [number, number, number, number] | null
): void {
  if (overlay.boxMarker) {
    fabricCanvas.remove(overlay.boxMarker)
    overlay.boxMarker = null
  }
  if (!box) return

  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)
  const [x1, y1, x2, y2] = box
  const rect = new Rect({
    left: x1 * scale + offset.x,
    top: y1 * scale + offset.y,
    width: (x2 - x1) * scale,
    height: (y2 - y1) * scale,
    fill: 'transparent',
    stroke: '#ffffff',
    strokeWidth: 2,
    selectable: false,
    evented: false,
    excludeFromExport: true,
    objectCaching: false
  })
  ;(rect as unknown as { data: { type: string } }).data = { type: 'sam-box-marker' }
  fabricCanvas.add(rect)
  overlay.boxMarker = rect
}

/**
 * 줌/팬 변경 시 오버레이를 재배치 (scale + offset 갱신만, 콘텐츠 재생성 X).
 * 모든 객체는 imageObject 의 scale/offset 에 맞춰 left/top/scale 을 다시 잡는다.
 */
export function repositionOverlay(
  imageObject: FabricImageType,
  overlay: SamOverlayObjects,
  points: SamPromptPoint[],
  bboxPreview: [number, number, number, number] | null,
  boxPrompt: [number, number, number, number] | null
): void {
  const scale = imageObject.scaleX || 1
  const offset = getImageOffset(imageObject)

  if (overlay.maskImage) {
    overlay.maskImage.set({
      left: offset.x,
      top: offset.y,
      scaleX: scale,
      scaleY: scale
    })
    overlay.maskImage.setCoords()
  }

  if (overlay.contourImage) {
    overlay.contourImage.set({
      left: offset.x,
      top: offset.y,
      scaleX: scale,
      scaleY: scale
    })
    overlay.contourImage.setCoords()
  }

  if (overlay.bboxPreview && bboxPreview) {
    const [x1, y1, x2, y2] = bboxPreview
    overlay.bboxPreview.set({
      left: x1 * scale + offset.x,
      top: y1 * scale + offset.y,
      width: (x2 - x1) * scale,
      height: (y2 - y1) * scale
    })
    overlay.bboxPreview.setCoords()
  }

  if (overlay.boxMarker && boxPrompt) {
    const [x1, y1, x2, y2] = boxPrompt
    overlay.boxMarker.set({
      left: x1 * scale + offset.x,
      top: y1 * scale + offset.y,
      width: (x2 - x1) * scale,
      height: (y2 - y1) * scale
    })
    overlay.boxMarker.setCoords()
  }

  for (let i = 0; i < overlay.pointMarkers.length && i < points.length; i++) {
    const p = points[i]
    const cx = p.x * scale + offset.x
    const cy = p.y * scale + offset.y
    overlay.pointMarkers[i].set({
      left: cx - POINT_RADIUS_SCREEN,
      top: cy - POINT_RADIUS_SCREEN
    })
    overlay.pointMarkers[i].setCoords()
  }
}

/** 캔버스에 추가된 객체가 SAM 오버레이인지 판별 (mouseHandlers 에서 활용). */
export function isSamOverlayObject(obj: FabricObject | null | undefined): boolean {
  if (!obj) return false
  const data = (obj as unknown as { data?: { type?: string } }).data
  if (!data?.type) return false
  return data.type.startsWith('sam-')
}
