/**
 * SAM2 입력 전처리 + 좌표 변환 유틸.
 *
 * 중요: samexporter 가 export 하는 SAM2 ONNX 는 **단순 stretch resize (1024×1024 정사각으로
 * 비율 무시 강제 늘림)** 입력 가정으로 학습/export 되어 있다. letterbox(짧은 변 padding) 가
 * 아니다. samexporter/sam2_onnx.py 의 `prepare_input` 에 cv2.resize(img, (1024,1024)) 그대로.
 *
 * 따라서 X/Y 축 별로 **scale 이 다를 수 있고**, 점 좌표는 단순한 비율 스케일로 1024 좌표계에
 * 매핑한다. padding 은 없다.
 */

import sharp from 'sharp'

export const SAM2_INPUT_SIZE = 1024

/** ImageNet 평균/표준편차 — SAM2 의 image normalization 과 일치. */
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

export interface Sam2ResizeParams {
  /** 원본 X 좌표 → 1024 좌표계 변환 배수 (= 1024 / origWidth) */
  scaleX: number
  /** 원본 Y 좌표 → 1024 좌표계 변환 배수 (= 1024 / origHeight) */
  scaleY: number
  /** 원본 픽셀 폭 */
  origWidth: number
  /** 원본 픽셀 높이 */
  origHeight: number
}

/**
 * 원본 이미지를 1024×1024 stretch 로 변환해서 [1,3,1024,1024] float32 텐서 반환.
 * 좌표 변환에 필요한 X/Y 별 scale 도 함께 반환.
 */
export async function imageToTensor(imagePath: string): Promise<{
  tensor: Float32Array
  resize: Sam2ResizeParams
}> {
  // Fabric.Image 가 EXIF orientation 을 무시하고 raw 픽셀 그대로 표시하므로, 인코더 입력도
  // 동일하게 EXIF 무시해야 마스크 좌표계가 화면과 일치한다.
  // (`.rotate()` 를 호출하지 않음 — 호출하면 EXIF 회전이 적용됨)
  const img = sharp(imagePath)
  const meta = await img.metadata()
  const origWidth = meta.width ?? 0
  const origHeight = meta.height ?? 0
  if (origWidth <= 0 || origHeight <= 0) {
    throw new Error(`SAM preprocess: invalid image size ${origWidth}x${origHeight}`)
  }

  // SAM2 ONNX 학습 가정과 일치: 비율 무시하고 1024×1024 로 강제 stretch.
  const { data } = await img
    .resize(SAM2_INPUT_SIZE, SAM2_INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // [H,W,3] uint8 → [1,3,H,W] float32 + ImageNet normalize
  const tensor = new Float32Array(3 * SAM2_INPUT_SIZE * SAM2_INPUT_SIZE)
  const planeSize = SAM2_INPUT_SIZE * SAM2_INPUT_SIZE
  for (let i = 0; i < planeSize; i++) {
    const r = data[i * 3] / 255
    const g = data[i * 3 + 1] / 255
    const b = data[i * 3 + 2] / 255
    tensor[i] = (r - MEAN[0]) / STD[0]
    tensor[i + planeSize] = (g - MEAN[1]) / STD[1]
    tensor[i + 2 * planeSize] = (b - MEAN[2]) / STD[2]
  }

  return {
    tensor,
    resize: {
      scaleX: SAM2_INPUT_SIZE / origWidth,
      scaleY: SAM2_INPUT_SIZE / origHeight,
      origWidth,
      origHeight
    }
  }
}

/** 원본 픽셀 좌표 → 1024 입력 좌표 (X/Y 비율 다를 수 있음). */
export function origToInput(x: number, y: number, r: Sam2ResizeParams): [number, number] {
  return [x * r.scaleX, y * r.scaleY]
}
