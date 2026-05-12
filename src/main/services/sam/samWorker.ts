/**
 * SAM worker thread entry.
 *
 * main process 의 메인 스레드를 막지 않기 위해 인코딩/디코딩을 이 워커에서 처리한다.
 * 통신 프로토콜: main → worker = WorkerRequest, worker → main = WorkerResponse.
 *
 * 모든 state (ONNX 세션, embedding cache) 는 이 워커에 보유된다. 한번 띄우면 영구 유지.
 */

import { parentPort } from 'worker_threads'
import {
  coreEncode,
  corePredict,
  coreUnload,
  coreGetModelInfo,
  coreCheckModelFiles
} from './samCore.js'
import type { SamPrompt } from '../../../shared/types.js'

export type WorkerRequest =
  | { id: number; type: 'encode'; embeddingKey: string; imagePath: string }
  | { id: number; type: 'predict'; embeddingKey: string; prompt: SamPrompt }
  | { id: number; type: 'unload'; embeddingKey: string }
  | { id: number; type: 'modelInfo' }
  | { id: number; type: 'checkFiles' }

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

if (!parentPort) {
  throw new Error('samWorker: parentPort is null — must be spawned as worker_thread')
}

parentPort.on('message', async (msg: WorkerRequest) => {
  try {
    let result: unknown
    switch (msg.type) {
      case 'encode':
        result = await coreEncode(msg.embeddingKey, msg.imagePath)
        break
      case 'predict': {
        const r = await corePredict(msg.embeddingKey, msg.prompt)
        // mask.data 는 Uint8Array — postMessage 가 structured clone 으로 알아서 복사.
        // 큰 데이터 (수MB) 라면 transferList 사용으로 최적화 가능. 일단 clone 으로.
        result = r
        break
      }
      case 'unload':
        coreUnload(msg.embeddingKey)
        result = { ok: true }
        break
      case 'modelInfo':
        result = coreGetModelInfo()
        break
      case 'checkFiles':
        result = coreCheckModelFiles()
        break
      default: {
        const exhaustive: never = msg
        throw new Error('unknown message type: ' + JSON.stringify(exhaustive))
      }
    }
    const response: WorkerResponse = { id: msg.id, ok: true, result }
    parentPort!.postMessage(response)
  } catch (err) {
    const response: WorkerResponse = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
    parentPort!.postMessage(response)
  }
})
