/**
 * SAM 어시스턴트 외부 인터페이스 (main process 측).
 *
 * 모든 ONNX 작업은 worker thread (samWorker.ts) 에서 실행된다. 이 모듈은 message 송신 +
 * Promise 매칭만 한다 — main 메인 스레드를 ONNX forward (수백 ms) 로 막지 않기 위함.
 *
 * Worker 는 첫 호출 시점에 lazy 로 띄운다. 한번 띄우면 앱 종료 시까지 유지.
 */

import { Worker } from 'worker_threads'
import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type {
  SamPrompt,
  SamPredictionResult,
  SamEncodeResult,
  SamModelInfo
} from '../../../shared/types.js'
import type { WorkerRequest, WorkerResponse } from './samWorker.js'
import { coreResolveImagePath } from './samCore.js'

let workerInstance: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (workerInstance) return workerInstance

  // 빌드 결과: out/main/sam-worker.js (electron.vite.config.ts 의 input 매핑)
  const workerPath = is.dev
    ? join(app.getAppPath(), 'out', 'main', 'sam-worker.js')
    : join(__dirname, 'sam-worker.js')

  // worker thread 는 electron `app` 모듈을 못 쓰므로 path 를 main 측에서 미리 결정해서 전달.
  const userDataDir = app.getPath('userData')
  const bundledModelDir = app.isPackaged
    ? join(process.resourcesPath, 'sam-models')
    : join(app.getAppPath(), 'resources', 'sam-models')

  const w = new Worker(workerPath, {
    workerData: { userDataDir, bundledModelDir }
  })
  w.on('message', (msg: WorkerResponse) => {
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.ok) entry.resolve(msg.result)
    else entry.reject(new Error(msg.error))
  })
  w.on('error', (err) => {
    console.error('[sam-worker] error', err)
    // 모든 pending request 에 에러 통보
    for (const [, entry] of pending) entry.reject(err)
    pending.clear()
    workerInstance = null
  })
  w.on('exit', (code) => {
    console.log('[sam-worker] exited code=' + code)
    if (workerInstance === w) workerInstance = null
  })
  workerInstance = w
  return w
}

function send<T>(req: WorkerRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(req.id, { resolve: resolve as (v: unknown) => void, reject })
    getWorker().postMessage(req)
  })
}

export async function encode(
  embeddingKey: string,
  imagePath: string
): Promise<SamEncodeResult> {
  return send<SamEncodeResult>({ id: nextRequestId++, type: 'encode', embeddingKey, imagePath })
}

export async function predict(
  embeddingKey: string,
  prompt: SamPrompt
): Promise<SamPredictionResult> {
  return send<SamPredictionResult>({
    id: nextRequestId++,
    type: 'predict',
    embeddingKey,
    prompt
  })
}

export async function unload(embeddingKey: string): Promise<void> {
  await send({ id: nextRequestId++, type: 'unload', embeddingKey })
}

export async function getModelInfo(): Promise<SamModelInfo & { ready: boolean }> {
  return send<SamModelInfo & { ready: boolean }>({ id: nextRequestId++, type: 'modelInfo' })
}

export async function checkModelFilesPresent(): Promise<{ ok: boolean; reason?: string }> {
  return send<{ ok: boolean; reason?: string }>({ id: nextRequestId++, type: 'checkFiles' })
}

export function resolveImagePath(workspacePath: string, imageFilename: string): string {
  return coreResolveImagePath(workspacePath, imageFilename)
}

/** 앱 종료 시 워커 정리 (선택적). */
export async function disposeWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate()
    workerInstance = null
  }
}
