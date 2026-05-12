/**
 * SAM 마스크 유틸리티 — binary mask 의 bbox 추출, ImageData 변환.
 */

import type { SamMask } from '../../../../../shared/types.js'

/** soft-alpha mask 에서 채워진 영역으로 간주할 임계값 (0–255 중) */
const MASK_BINARIZE_THRESHOLD = 128

/**
 * soft-alpha mask 의 axis-aligned bbox (이미지 픽셀 좌표).
 * `data[i] >= MASK_BINARIZE_THRESHOLD` 인 픽셀만 채워진 것으로 본다.
 * 마스크가 비었거나 너무 작으면 null.
 */
export function maskToBbox(mask: SamMask): [number, number, number, number] | null {
  const { width, height, data } = mask
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (data[row + x] >= MASK_BINARIZE_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return null
  return [minX, minY, maxX + 1, maxY + 1]
}

/**
 * soft-alpha mask + 색상 → ImageData (RGBA).
 * mask.data[i] 가 0–255 의 soft alpha 라고 가정 → multiplier `alpha` 와 곱해서 최종 alpha 산출.
 * 결과 = 가장자리는 부드러운 ramp, 안쪽은 균일한 색.
 */
export function maskToImageData(
  mask: SamMask,
  rgb: { r: number; g: number; b: number },
  alpha: number
): ImageData {
  const { width, height, data } = mask
  const out = new ImageData(width, height)
  const buf = out.data
  const alphaMul = Math.max(0, Math.min(1, alpha))
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (v === 0) continue
    const j = i * 4
    buf[j] = rgb.r
    buf[j + 1] = rgb.g
    buf[j + 2] = rgb.b
    buf[j + 3] = Math.round(v * alphaMul)
  }
  return out
}

/**
 * 마스크 컨투어(외곽선) 단순 추출 — 외부 인접 4-방향 픽셀 중 하나라도 임계값 미만이면 경계.
 * SVG path 가 아닌, 경계 픽셀들의 ImageData 를 반환 (Fabric Image 로 표시용).
 */
export function maskToContourImageData(
  mask: SamMask,
  rgb: { r: number; g: number; b: number },
  strokeAlpha: number
): ImageData {
  const { width, height, data } = mask
  const out = new ImageData(width, height)
  const buf = out.data
  const a = Math.max(0, Math.min(255, Math.round(strokeAlpha * 255)))
  const T = MASK_BINARIZE_THRESHOLD

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (data[i] < T) continue
      // 인접 4방향 중 하나라도 외부면 경계 픽셀
      const left = x > 0 ? data[i - 1] : 0
      const right = x < width - 1 ? data[i + 1] : 0
      const top = y > 0 ? data[i - width] : 0
      const bottom = y < height - 1 ? data[i + width] : 0
      if (left < T || right < T || top < T || bottom < T) {
        const j = i * 4
        buf[j] = rgb.r
        buf[j + 1] = rgb.g
        buf[j + 2] = rgb.b
        buf[j + 3] = a
      }
    }
  }
  return out
}

/** "#rrggbb" → {r,g,b}. 입력 검증 없이 보수적으로 0 이상 255 이하 보장. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '')
  const v = parseInt(cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned, 16)
  return {
    r: (v >> 16) & 0xff,
    g: (v >> 8) & 0xff,
    b: v & 0xff
  }
}
