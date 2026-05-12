/**
 * SAM2 디코더 — 임베딩 + 프롬프트 → 마스크.
 *
 * 출력 마스크는 [1, 3, 256, 256] (multimask 후보 3개). IoU 점수가 가장 높은 후보를
 * 선택하고, 원본 픽셀 해상도로 업샘플링해서 binary mask 로 반환한다.
 */

import { Tensor } from 'onnxruntime-node'
import type { InferenceSession } from 'onnxruntime-node'
import type { SamPrompt, SamMask } from '../../../shared/types.js'
import type { CachedEmbedding } from './embeddingCache.js'
import { origToInput } from './preprocess.js'

const MASK_SIZE = 256

export async function runDecoder(
  session: InferenceSession,
  embedding: CachedEmbedding,
  prompt: SamPrompt
): Promise<{ mask: SamMask; score: number; ms: number }> {
  const t0 = Date.now()
  const { coords, labels } = buildPromptTensors(prompt, embedding)
  const numPoints = coords.length / 2

  const inputs: Record<string, Tensor> = {
    image_embed: new Tensor('float32', embedding.imageEmbed, [1, 256, 64, 64]),
    high_res_feats_0: new Tensor('float32', embedding.highResFeats0, [1, 32, 256, 256]),
    high_res_feats_1: new Tensor('float32', embedding.highResFeats1, [1, 64, 128, 128]),
    point_coords: new Tensor('float32', coords, [1, numPoints, 2]),
    point_labels: new Tensor('float32', labels, [1, numPoints]),
    mask_input: new Tensor('float32', new Float32Array(MASK_SIZE * MASK_SIZE), [
      1,
      1,
      MASK_SIZE,
      MASK_SIZE
    ]),
    has_mask_input: new Tensor('float32', new Float32Array([0]), [1])
  }

  const out = await session.run(inputs)
  const masks = out['masks']
  const iou = out['iou_predictions']
  if (!masks || !iou) throw new Error('SAM decoder: missing output tensor')

  // masks: [1, 3, 256, 256] float32. iou: [1, 3].
  const iouArr = iou.data as Float32Array
  let bestIdx = 0
  let bestScore = iouArr[0]
  for (let i = 1; i < iouArr.length; i++) {
    if (iouArr[i] > bestScore) {
      bestScore = iouArr[i]
      bestIdx = i
    }
  }

  const masksArr = masks.data as Float32Array
  const planeSize = MASK_SIZE * MASK_SIZE
  const lowResMask = masksArr.subarray(bestIdx * planeSize, (bestIdx + 1) * planeSize)

  // 1024 stretched 좌표계의 mask 를 원본 픽셀 해상도로 업샘플.
  const mask = upsampleMaskToOrig(lowResMask, embedding)

  return { mask, score: bestScore, ms: Date.now() - t0 }
}

/** SAM2 prompt encoder 입력 텐서 빌드. point + box 통합, label encoding 포함. */
function buildPromptTensors(
  prompt: SamPrompt,
  embedding: CachedEmbedding
): { coords: Float32Array; labels: Float32Array } {
  const points: { x: number; y: number; label: number }[] = []

  for (const p of prompt.points) {
    const [lx, ly] = origToInput(p.x, p.y, embedding.resize)
    points.push({ x: lx, y: ly, label: p.label })
  }
  if (prompt.box) {
    const [x1, y1, x2, y2] = prompt.box
    const [bx1, by1] = origToInput(x1, y1, embedding.resize)
    const [bx2, by2] = origToInput(x2, y2, embedding.resize)
    // SAM2: box 는 좌상=2, 우하=3 라벨 두 점으로 인코딩.
    points.push({ x: bx1, y: by1, label: 2 })
    points.push({ x: bx2, y: by2, label: 3 })
  }
  if (points.length === 0) {
    throw new Error('SAM predict: at least one point or box required')
  }

  const coords = new Float32Array(points.length * 2)
  const labels = new Float32Array(points.length)
  for (let i = 0; i < points.length; i++) {
    coords[i * 2] = points[i].x
    coords[i * 2 + 1] = points[i].y
    labels[i] = points[i].label
  }
  return { coords, labels }
}

/**
 * 256×256 (1024 입력 좌표계의 mask) → 원본 픽셀 해상도 soft-alpha mask (0–255).
 *
 * SAM2 ONNX 가 stretch 입력 가정이므로 mask 256×256 도 stretched 1024 좌표에 1:1 대응.
 * 원본 (x, y) → mask 좌표 (x * MASK/origW, y * MASK/origH) 로 직접 매핑.
 *
 * 바이리니어 보간 + soft threshold 로 anti-aliased 알파 ramp 생성.
 * bbox 추출 시 임계값(>= 128) 으로 binarize.
 */
function upsampleMaskToOrig(lowResMask: Float32Array, embedding: CachedEmbedding): SamMask {
  const r = embedding.resize
  const W = Math.round(r.origWidth)
  const H = Math.round(r.origHeight)
  const data = new Uint8Array(W * H)

  const xToMask = MASK_SIZE / r.origWidth
  const yToMask = MASK_SIZE / r.origHeight
  // soft threshold ramp: logit 이 -EDGE 부터 +EDGE 사이에서 0→1 로 부드럽게 올라감.
  const EDGE = 1.5

  for (let y = 0; y < H; y++) {
    const my = Math.max(0, Math.min(MASK_SIZE - 1.001, y * yToMask))
    const my0 = Math.floor(my)
    const my1 = Math.min(MASK_SIZE - 1, my0 + 1)
    const fy = my - my0

    for (let x = 0; x < W; x++) {
      const mx = Math.max(0, Math.min(MASK_SIZE - 1.001, x * xToMask))
      const mx0 = Math.floor(mx)
      const mx1 = Math.min(MASK_SIZE - 1, mx0 + 1)
      const fx = mx - mx0

      const v00 = lowResMask[my0 * MASK_SIZE + mx0]
      const v01 = lowResMask[my0 * MASK_SIZE + mx1]
      const v10 = lowResMask[my1 * MASK_SIZE + mx0]
      const v11 = lowResMask[my1 * MASK_SIZE + mx1]
      const v =
        (1 - fx) * (1 - fy) * v00 +
        fx * (1 - fy) * v01 +
        (1 - fx) * fy * v10 +
        fx * fy * v11

      let a: number
      if (v >= EDGE) a = 255
      else if (v <= -EDGE) a = 0
      else a = Math.round(((v + EDGE) / (2 * EDGE)) * 255)
      data[y * W + x] = a
    }
  }

  return { width: W, height: H, data }
}
