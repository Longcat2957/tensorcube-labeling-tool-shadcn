/**
 * SAM 코어 — ONNX 세션 + cache + encode/predict 의 *실제 구현*.
 *
 * 이 파일은 main process 가 아닌 **worker thread** 안에서 실행된다 (samWorker.ts 가 import).
 * main 측에선 직접 import 하지 말고 samService (index.ts) 의 worker proxy 를 통하라.
 */

import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { loadSessions, resolveModelPaths, isLoaded } from './modelLoader.js'
import { runEncoder } from './encoder.js'
import { runDecoder } from './decoder.js'
import { EmbeddingCache } from './embeddingCache.js'
import type { SamPrompt, SamPredictionResult, SamModelInfo } from '../../../shared/types.js'

const cache = new EmbeddingCache(8)

export async function coreEncode(
  embeddingKey: string,
  imagePath: string
): Promise<{ embeddingKey: string; ms: number; cached: boolean }> {
  if (cache.has(embeddingKey)) {
    return { embeddingKey, ms: 0, cached: true }
  }
  if (!existsSync(imagePath)) {
    throw new Error(`SAM encode: 이미지 파일 없음: ${imagePath}`)
  }
  const { encoder } = await loadSessions()
  const { embedding, ms } = await runEncoder(encoder, imagePath)
  cache.set(embeddingKey, embedding)
  return { embeddingKey, ms, cached: false }
}

export async function corePredict(
  embeddingKey: string,
  prompt: SamPrompt
): Promise<SamPredictionResult> {
  const embedding = cache.get(embeddingKey)
  if (!embedding) {
    throw new Error(`SAM predict: 캐시 미스 (${embeddingKey}). encode() 를 먼저 호출하세요.`)
  }
  const { decoder } = await loadSessions()
  const { mask, score, ms } = await runDecoder(decoder, embedding, prompt)
  return { mask, score, ms }
}

export function coreUnload(embeddingKey: string): void {
  cache.delete(embeddingKey)
}

export function coreGetModelInfo(): SamModelInfo & { ready: boolean } {
  const paths = resolveModelPaths()
  return {
    id: 'sam2.1_hiera_tiny',
    displayName: 'SAM 2.1 Hiera-Tiny',
    encoderPath: paths.encoder,
    decoderPath: paths.decoder,
    inputSize: 1024,
    loaded: isLoaded(),
    source: paths.source,
    ready: paths.ready
  }
}

export function coreCheckModelFiles(): { ok: boolean; reason?: string } {
  const paths = resolveModelPaths()
  if (!existsSync(paths.encoder)) return { ok: false, reason: `encoder 없음: ${paths.encoder}` }
  if (!existsSync(paths.decoder)) return { ok: false, reason: `decoder 없음: ${paths.decoder}` }
  const encSize = statSync(paths.encoder).size
  const decSize = statSync(paths.decoder).size
  if (encSize < 50 * 1024 * 1024)
    return { ok: false, reason: `encoder 파일 크기 비정상: ${encSize}B` }
  if (decSize < 5 * 1024 * 1024)
    return { ok: false, reason: `decoder 파일 크기 비정상: ${decSize}B` }
  return { ok: true }
}

export function coreResolveImagePath(workspacePath: string, imageFilename: string): string {
  return join(workspacePath, 'src', imageFilename)
}
