/**
 * ONNX 세션 로더 — encoder/decoder 두 개를 lazy 하게 로드한다.
 *
 * 모델 경로 결정 우선순위:
 *   1) 환경변수 SAM_MODEL_DIR    (dev 시 강제 override)
 *   2) userData/sam-models/      (사용자가 수동 설치한 모델 — 다른 변형 swap 시 사용)
 *   3) 번들 위치 (기본값, 항상 동봉됨)
 *      - dev:  <projectRoot>/resources/sam-models/
 *      - prod: <process.resourcesPath>/sam-models/   (electron-builder.yml 의 extraResources)
 *
 * 즉 "기본 모델은 항상 동봉" 이 보장되며, 사용자가 다른 변형을 쓰고 싶을 때만
 * userData 에 파일을 떨궈서 우선 사용하게 한다.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { workerData } from 'worker_threads'
import { InferenceSession } from 'onnxruntime-node'

const ENCODER_FILENAME = 'sam2.1_hiera_tiny.encoder.onnx'
const DECODER_FILENAME = 'sam2.1_hiera_tiny.decoder.onnx'

let encoderSession: InferenceSession | null = null
let decoderSession: InferenceSession | null = null

export interface ResolvedModelPaths {
  dir: string
  encoder: string
  decoder: string
  /** 어느 소스에서 결정됐는지 — 디버그/Footer 표시용 */
  source: 'env' | 'user' | 'bundled' | 'missing'
}

/**
 * Worker thread 안에서 electron `app` 모듈을 직접 쓰면 안되므로
 * main 측이 spawn 시 workerData 로 미리 결정한 경로를 넘긴다.
 */
interface SamWorkerData {
  userDataDir: string
  bundledModelDir: string
}

function getWorkerPaths(): SamWorkerData {
  if (!workerData) {
    throw new Error('modelLoader: workerData is null — must be invoked from samWorker')
  }
  return workerData as SamWorkerData
}

/** 후보 경로를 우선순위대로 검사하고 첫 번째로 두 파일이 모두 존재하는 곳을 반환. */
export function resolveModelPaths(): ResolvedModelPaths & { ready: boolean } {
  const wd = getWorkerPaths()
  const candidates: { dir: string; source: ResolvedModelPaths['source'] }[] = []

  if (process.env.SAM_MODEL_DIR) {
    candidates.push({ dir: process.env.SAM_MODEL_DIR, source: 'env' })
  }
  candidates.push({ dir: join(wd.userDataDir, 'sam-models'), source: 'user' })
  candidates.push({ dir: wd.bundledModelDir, source: 'bundled' })

  for (const c of candidates) {
    const encoder = join(c.dir, ENCODER_FILENAME)
    const decoder = join(c.dir, DECODER_FILENAME)
    if (existsSync(encoder) && existsSync(decoder)) {
      return { dir: c.dir, encoder, decoder, source: c.source, ready: true }
    }
  }

  // 다 미스 — bundled 경로를 안내용으로 반환
  return {
    dir: wd.bundledModelDir,
    encoder: join(wd.bundledModelDir, ENCODER_FILENAME),
    decoder: join(wd.bundledModelDir, DECODER_FILENAME),
    source: 'missing',
    ready: false
  }
}

/** 인코더/디코더 세션을 로드. 이미 로드되어 있으면 재사용. */
export async function loadSessions(): Promise<{
  encoder: InferenceSession
  decoder: InferenceSession
}> {
  if (encoderSession && decoderSession) {
    return { encoder: encoderSession, decoder: decoderSession }
  }
  const paths = resolveModelPaths()
  if (!paths.ready) {
    throw new Error(
      `SAM 모델 파일이 없습니다. 다음 위치에 두 파일을 두세요:\n  ${paths.encoder}\n  ${paths.decoder}`
    )
  }

  // 주의: onnxruntime-node 1.25.x 는 SAM2 Hiera 인코더에서 출력이 NaN 으로 나오는 호환성
  // 버그가 있다 (Python ORT 1.24.2 + 동일 ONNX 는 정상). package.json 에서 1.24.2 로 핀해야
  // 한다. 그 위 버전으로 올릴 땐 반드시 sanity check.
  const sessionOptions: InferenceSession.SessionOptions = {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 3 // warning 이상만
  }

  const t0 = Date.now()
  try {
    const [enc, dec] = await Promise.all([
      InferenceSession.create(paths.encoder, sessionOptions),
      InferenceSession.create(paths.decoder, sessionOptions)
    ])
    encoderSession = enc
    decoderSession = dec
    console.log(
      `[sam] loaded ${paths.source} models from ${paths.dir} in ${Date.now() - t0}ms`
    )
    return { encoder: enc, decoder: dec }
  } catch (err) {
    console.error('[sam] loadSessions failed', err)
    throw err
  }
}

/** 세션 해제 — 메모리 회수가 필요할 때. */
export async function disposeSessions(): Promise<void> {
  if (encoderSession) {
    await encoderSession.release()
    encoderSession = null
  }
  if (decoderSession) {
    await decoderSession.release()
    decoderSession = null
  }
}

export function isLoaded(): boolean {
  return encoderSession !== null && decoderSession !== null
}
