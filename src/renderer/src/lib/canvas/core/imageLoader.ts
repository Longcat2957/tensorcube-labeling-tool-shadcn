/**
 * 이미지 로딩 및 뷰포트 관리
 */

import { Canvas, FabricImage } from 'fabric'
import type { WorkspaceManager } from '../../stores/workspace.svelte.js'

export interface ImageLoadResult {
  success: boolean
  imageObject: FabricImage | null
}

/**
 * 이미지를 캔버스에 맞게 조절 (fit)
 */
export function fitImageToCanvas(
  fabricCanvas: Canvas,
  imageObject: FabricImage,
  workspaceManager: WorkspaceManager
): void {
  const canvasWidth = fabricCanvas.width || 1
  const canvasHeight = fabricCanvas.height || 1
  const imgWidth = imageObject.width || 1
  const imgHeight = imageObject.height || 1

  // 이미지가 캔버스에 꽉 차도록 스케일 계산 (여백 5%)
  const scaleX = (canvasWidth * 0.95) / imgWidth
  const scaleY = (canvasHeight * 0.95) / imgHeight
  const scale = Math.min(scaleX, scaleY)

  // 이미지 스케일 및 중앙 위치 적용
  // originX, originY가 'center'이므로 left, top은 이미지 중앙 좌표
  imageObject.set({
    scaleX: scale,
    scaleY: scale,
    left: canvasWidth / 2,
    top: canvasHeight / 2
  })

  // 줌 레벨 설정
  workspaceManager.setZoomLevel(scale)

  // 이미지 크기 저장
  workspaceManager.setImageSize(imgWidth, imgHeight)
}

/**
 * 이미지-픽셀 단위 AABB 가 캔버스에 들어차도록 줌 + 패닝.
 * - bbox 가 너무 작아도 최대 20x 까지만 줌인 (그 이상은 픽셀 깨짐 + 길 잃기 쉬움).
 * - 여백 20% 두고 fit. 박스 가장자리에 바로 붙으면 핸들 조작이 힘들어서.
 * - 선택 라벨이 OBB / Polygon 이면 호출자가 미리 AABB(minX, minY, maxX, maxY) 로 변환해 전달.
 */
export function zoomToBBox(
  fabricCanvas: Canvas,
  imageObject: FabricImage,
  workspaceManager: WorkspaceManager,
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
): void {
  const canvasWidth = fabricCanvas.width || 1
  const canvasHeight = fabricCanvas.height || 1
  const imgWidth = imageObject.width || 1
  const imgHeight = imageObject.height || 1

  const bboxW = Math.max(1, bbox.maxX - bbox.minX)
  const bboxH = Math.max(1, bbox.maxY - bbox.minY)

  const targetScale = Math.min(
    (canvasWidth * 0.8) / bboxW,
    (canvasHeight * 0.8) / bboxH,
    20
  )

  // bbox 중심 (이미지 픽셀) → 캔버스 정중앙 으로 옮기는 image.left/top 계산.
  // origin = center 이므로 image.left/top 은 "캔버스 좌표계에서 이미지 중앙의 위치".
  const bboxCenterImgX = (bbox.minX + bbox.maxX) / 2
  const bboxCenterImgY = (bbox.minY + bbox.maxY) / 2
  // image-pixel offset from image center: (bboxCenter - imgCenter) * scale → 화면 픽셀
  const offsetFromImgCenterX = (bboxCenterImgX - imgWidth / 2) * targetScale
  const offsetFromImgCenterY = (bboxCenterImgY - imgHeight / 2) * targetScale

  imageObject.set({
    scaleX: targetScale,
    scaleY: targetScale,
    left: canvasWidth / 2 - offsetFromImgCenterX,
    top: canvasHeight / 2 - offsetFromImgCenterY
  })

  workspaceManager.setZoomLevel(targetScale)
  workspaceManager.setImageSize(imgWidth, imgHeight)
}

/**
 * 이미지의 화면상 좌상단 좌표 계산
 */
export function getImageOffset(imageObject: FabricImage): { x: number; y: number } {
  const imgWidth = imageObject.width || 1
  const imgHeight = imageObject.height || 1
  const scale = imageObject.scaleX || 1
  const imgCenterX = imageObject.left || 0
  const imgCenterY = imageObject.top || 0

  // origin이 center이므로 좌상단 좌표 계산
  const imgLeft = imgCenterX - (imgWidth * scale) / 2
  const imgTop = imgCenterY - (imgHeight * scale) / 2

  return { x: imgLeft, y: imgTop }
}

/**
 * 스크린 좌표를 원본 이미지 픽셀 좌표로 변환
 */
export function screenToImagePixel(
  screenX: number,
  screenY: number,
  imageObject: FabricImage
): { x: number; y: number } {
  const imgWidth = imageObject.width || 1
  const imgHeight = imageObject.height || 1
  const scale = imageObject.scaleX || 1
  const imgCenterX = imageObject.left || 0
  const imgCenterY = imageObject.top || 0

  // 이미지 좌상단 좌표 계산 (origin이 center이므로)
  const imgLeft = imgCenterX - (imgWidth * scale) / 2
  const imgTop = imgCenterY - (imgHeight * scale) / 2

  // 스크린 좌표를 원본 픽셀 좌표로 변환
  const imageX = Math.round((screenX - imgLeft) / scale)
  const imageY = Math.round((screenY - imgTop) / scale)

  return { x: imageX, y: imageY }
}

/**
 * 뷰포트 상태 업데이트
 */
export function updateViewportState(
  imageObject: FabricImage,
  fabricCanvas: Canvas,
  workspaceManager: WorkspaceManager
): void {
  const imgWidth = imageObject.width || 0
  const imgHeight = imageObject.height || 0
  const scale = imageObject.scaleX || 1

  // 이미지 중심 기준으로 뷰포트 계산
  // originX, originY가 center이므로 left, top은 이미지 중심
  const imgCenterX = imageObject.left || 0
  const imgCenterY = imageObject.top || 0

  // 이미지 좌상단 좌표 (미니맵에서 사용)
  const imgLeft = imgCenterX - (imgWidth * scale) / 2
  const imgTop = imgCenterY - (imgHeight * scale) / 2

  workspaceManager.setViewport(imgLeft, imgTop)
}

/**
 * 이미지 로드
 */
export async function loadImageToCanvas(
  workspacePath: string,
  imageId: string,
  fabricCanvas: Canvas,
  currentImageObject: FabricImage | null
): Promise<{ imageObject: FabricImage | null; cancelled: boolean }> {
  try {
    // 이미지 경로 가져오기 (비동기)
    const imagePath = await window.api.label.getImagePath(workspacePath, imageId)

    if (!imagePath) {
      console.error('이미지 경로를 찾을 수 없습니다.')
      return { imageObject: null, cancelled: false }
    }

    const imageUrl = window.api.utils.getWorkspaceImageUrl(imagePath)

    // 이미지 로드 (비동기)
    const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })

    img.set({
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center'
    })

    // 기존 이미지 제거
    if (currentImageObject && fabricCanvas) {
      fabricCanvas.remove(currentImageObject)
    }

    fabricCanvas.add(img)

    return { imageObject: img, cancelled: false }
  } catch (error) {
    console.error('이미지 로드 실패:', error)
    return { imageObject: null, cancelled: false }
  }
}
