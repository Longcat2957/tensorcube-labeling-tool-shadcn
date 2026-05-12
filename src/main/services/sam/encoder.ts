/**
 * 이미지 → SAM2 인코더 → 3개 임베딩 텐서.
 *
 * 한 이미지당 ~500ms (CPU). 결과는 embeddingCache 에 보관해서 디코더 호출 때 재사용한다.
 */

import { Tensor } from 'onnxruntime-node'
import type { InferenceSession } from 'onnxruntime-node'
import { imageToTensor, SAM2_INPUT_SIZE, type Sam2ResizeParams } from './preprocess.js'
import type { CachedEmbedding } from './embeddingCache.js'

export async function runEncoder(
  session: InferenceSession,
  imagePath: string
): Promise<{ embedding: CachedEmbedding; ms: number }> {
  const t0 = Date.now()
  const { tensor, resize } = await imageToTensor(imagePath)
  const input = new Tensor('float32', tensor, [1, 3, SAM2_INPUT_SIZE, SAM2_INPUT_SIZE])
  const out = await session.run({ image: input })

  const imageEmbed = out['image_embed']
  const highRes0 = out['high_res_feats_0']
  const highRes1 = out['high_res_feats_1']
  if (!imageEmbed || !highRes0 || !highRes1) {
    throw new Error('SAM encoder: missing output tensor')
  }

  const embedding: CachedEmbedding = {
    imageEmbed: imageEmbed.data as Float32Array,
    highResFeats0: highRes0.data as Float32Array,
    highResFeats1: highRes1.data as Float32Array,
    resize: resize satisfies Sam2ResizeParams
  }
  return { embedding, ms: Date.now() - t0 }
}
