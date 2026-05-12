/**
 * SAM 어시스턴트 상태 매니저 — 3-stage 인터랙션 모델.
 *
 *   Stage 1 (compose): 클릭/드래그 → 프롬프트 누적. 마스크/추론 없음.
 *   Stage 2 (preview): Space 누르면 명시적 추론 → 마스크 + bbox 미리보기.
 *   Stage 3 (commit):  Enter 누르면 bbox/obb 가 라벨로 추가 + 모든 SAM 상태 클리어.
 *
 * 프롬프트가 변경되면 (stage 2 후에 추가/제거 등) 마스크는 stale 로 간주하고 invalidate.
 * 사용자는 다시 Space 를 눌러 미리보기를 갱신한다.
 */

import { toast } from 'svelte-sonner'
import type { SamMask, SamModelInfo, SamPredictionResult } from '../../../../shared/types.js'
import { maskToBbox } from '../canvas/sam/maskUtils.js'

export type SamPromptPoint = { x: number; y: number; label: 0 | 1 }
export type SamPromptBox = [number, number, number, number] // x1,y1,x2,y2 원본 픽셀

export type SamModelStatus =
  | { kind: 'unknown' }
  | { kind: 'missing'; reason: string }
  | { kind: 'ready'; info: SamModelInfo }
  | { kind: 'error'; reason: string }

export type SamEncodeStatus =
  | { kind: 'idle' }
  | { kind: 'encoding'; imageId: string }
  | { kind: 'ready'; imageId: string; ms: number; cached: boolean }
  | { kind: 'error'; imageId: string; reason: string }

export type SamPredictStatus =
  | { kind: 'idle' }
  | { kind: 'predicting' }
  | { kind: 'ready'; ms: number; score: number; bbox: [number, number, number, number] | null }
  | { kind: 'error'; reason: string }

export function createSamAssistantManager() {
  let modelStatus = $state<SamModelStatus>({ kind: 'unknown' })
  let encodeStatus = $state<SamEncodeStatus>({ kind: 'idle' })
  let predictStatus = $state<SamPredictStatus>({ kind: 'idle' })

  // 현재 이미지의 누적 프롬프트
  let points = $state<SamPromptPoint[]>([])
  let box = $state<SamPromptBox | null>(null)

  // 마지막 prediction 결과
  let lastMask = $state<SamMask | null>(null)
  let lastBbox = $state<[number, number, number, number] | null>(null)

  /** 모델 파일 ready 여부를 main process 에 물어본다. dev 진입 시 1회 호출. */
  async function refreshModelStatus(): Promise<void> {
    try {
      const r = await window.api.sam.checkReady()
      if (!r.filesOk.ok) {
        modelStatus = { kind: 'missing', reason: r.filesOk.reason ?? 'model files not found' }
      } else {
        modelStatus = {
          kind: 'ready',
          info: {
            id: r.id,
            displayName: r.displayName,
            encoderPath: r.encoderPath,
            decoderPath: r.decoderPath,
            inputSize: r.inputSize,
            loaded: r.loaded,
            source: r.source
          }
        }
      }
    } catch (err) {
      modelStatus = { kind: 'error', reason: String(err) }
    }
  }

  /** 이미지 진입 시점에 백그라운드 인코딩 시작. 이미 캐시되어 있으면 즉시 ready. */
  async function ensureEncoded(
    workspacePath: string,
    imageFilename: string,
    imageId: string
  ): Promise<void> {
    if (modelStatus.kind !== 'ready') return
    if (encodeStatus.kind === 'encoding' && encodeStatus.imageId === imageId) return
    if (encodeStatus.kind === 'ready' && encodeStatus.imageId === imageId) return

    encodeStatus = { kind: 'encoding', imageId }
    try {
      const r = await window.api.sam.encode(workspacePath, imageFilename, imageId)
      // 도중에 다른 이미지로 넘어갔으면 결과 무시
      if (encodeStatus.kind !== 'encoding' || encodeStatus.imageId !== imageId) return
      encodeStatus = { kind: 'ready', imageId, ms: r.ms, cached: r.cached }
    } catch (err) {
      console.error('[sam] encode failed', err)
      if (encodeStatus.kind === 'encoding' && encodeStatus.imageId === imageId) {
        encodeStatus = { kind: 'error', imageId, reason: String(err) }
      }
      toast.error('SAM 인코딩 실패', { description: String(err).slice(0, 200) })
    }
  }

  /** 이미지가 바뀌면 프롬프트/마스크 초기화 + 이전 임베딩 unload. */
  function resetForImageChange(prevImageId: string | null): void {
    points = []
    box = null
    lastMask = null
    lastBbox = null
    predictStatus = { kind: 'idle' }
    if (prevImageId) {
      void window.api.sam.unload(prevImageId)
    }
    encodeStatus = { kind: 'idle' }
  }

  /** 마스크가 stage 2 결과로 떠 있을 때 프롬프트가 바뀌면 마스크는 stale → 클리어. */
  function invalidateMask(): void {
    if (lastMask !== null || lastBbox !== null || predictStatus.kind !== 'idle') {
      lastMask = null
      lastBbox = null
      predictStatus = { kind: 'idle' }
    }
  }

  function addPoint(x: number, y: number, label: 0 | 1): void {
    points = [...points, { x, y, label }]
    invalidateMask()
  }

  function setBox(b: SamPromptBox | null): void {
    box = b
    invalidateMask()
  }

  function removeLastPrompt(): void {
    if (box) {
      box = null
    } else if (points.length > 0) {
      points = points.slice(0, -1)
    } else {
      return
    }
    invalidateMask()
  }

  function clearPrompts(): void {
    points = []
    box = null
    lastMask = null
    lastBbox = null
    predictStatus = { kind: 'idle' }
  }

  /**
   * Stage 2 — 명시적 추론 트리거. Space 키로 호출됨.
   * 프롬프트가 없거나 모델/임베딩이 준비 안 됐으면 no-op (Promise<false>).
   */
  async function runPrediction(): Promise<boolean> {
    if (encodeStatus.kind !== 'ready') {
      toast.warning('SAM: 인코딩이 아직 끝나지 않음', {
        description: '잠시 후 다시 시도하세요.'
      })
      return false
    }
    if (points.length === 0 && !box) return false
    const embeddingKey = encodeStatus.imageId

    // Svelte 5 $state Proxy 가 IPC clone 에서 막히지 않도록 평면 재구성.
    const snapshot = {
      points: points.map((p) => ({ x: p.x, y: p.y, label: p.label })),
      box: box ? ([box[0], box[1], box[2], box[3]] as SamPromptBox) : undefined
    }
    predictStatus = { kind: 'predicting' }
    try {
      const result: SamPredictionResult = await window.api.sam.predict(embeddingKey, snapshot)
      lastMask = result.mask
      lastBbox = maskToBbox(result.mask)
      predictStatus = { kind: 'ready', ms: result.ms, score: result.score, bbox: lastBbox }
      return true
    } catch (err) {
      console.error('[sam] predict failed', err)
      predictStatus = { kind: 'error', reason: String(err) }
      toast.error('SAM 추론 실패', { description: String(err).slice(0, 200) })
      return false
    }
  }

  /** 현재 stage. UI 분기 / 키 핸들러용. */
  function getStage(): 'idle' | 'compose' | 'preview' | 'predicting' {
    if (predictStatus.kind === 'predicting') return 'predicting'
    if (lastMask !== null) return 'preview'
    if (points.length > 0 || box !== null) return 'compose'
    return 'idle'
  }

  return {
    // state getters
    get modelStatus() {
      return modelStatus
    },
    get encodeStatus() {
      return encodeStatus
    },
    get predictStatus() {
      return predictStatus
    },
    get points() {
      return points
    },
    get box() {
      return box
    },
    get lastMask() {
      return lastMask
    },
    get lastBbox() {
      return lastBbox
    },
    get hasPrompts() {
      return points.length > 0 || box !== null
    },

    // actions
    refreshModelStatus,
    ensureEncoded,
    resetForImageChange,
    addPoint,
    setBox,
    removeLastPrompt,
    clearPrompts,
    runPrediction,
    getStage
  }
}

export const SAM_ASSISTANT_KEY = Symbol('samAssistantManager')
export type SamAssistantManager = ReturnType<typeof createSamAssistantManager>
