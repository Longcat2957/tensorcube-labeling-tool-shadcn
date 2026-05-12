/**
 * 인코더 출력(3개 텐서) LRU 캐시.
 *
 * SAM2 인코더는 한 이미지당 ~16MB 의 텐서를 반환한다 (image_embed + high_res_feats_0/1).
 * 인터랙티브 라벨링에서 같은 이미지에 여러 번 클릭하므로 캐싱이 필수.
 *
 * 기본 capacity 8 = 약 128MB 메모리 사용. Phase 18-C 에서 prefetch 동작 추가 예정.
 */

import type { Sam2ResizeParams } from './preprocess.js'

export interface CachedEmbedding {
  /** 인코더 출력 1: [1, 256, 64, 64] float32 */
  imageEmbed: Float32Array
  /** 인코더 출력 2: [1, 32, 256, 256] float32 */
  highResFeats0: Float32Array
  /** 인코더 출력 3: [1, 64, 128, 128] float32 */
  highResFeats1: Float32Array
  /** 디코더 입력 좌표 변환에 필요한 stretch resize 파라미터. */
  resize: Sam2ResizeParams
}

export class EmbeddingCache {
  private map = new Map<string, CachedEmbedding>()

  constructor(private capacity: number = 8) {}

  get(key: string): CachedEmbedding | undefined {
    const v = this.map.get(key)
    if (!v) return undefined
    // LRU touch
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  set(key: string, value: CachedEmbedding): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.capacity) {
      // 가장 오래된 항목 evict
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  delete(key: string): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  size(): number {
    return this.map.size
  }

  setCapacity(n: number): void {
    this.capacity = Math.max(1, n)
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }
}
