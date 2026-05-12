<script lang="ts">
  import { getContext } from 'svelte'
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from '$lib/stores/keyboardManager.svelte.js'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { TOOL_MANAGER_KEY, type ToolManager } from '$lib/stores/toolManager.svelte.js'
  import {
    SAM_ASSISTANT_KEY,
    type SamAssistantManager
  } from '$lib/stores/samAssistant.svelte.js'

  // Context 가져오기
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY)
  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)
  const toolManager = getContext<ToolManager>(TOOL_MANAGER_KEY)
  const samAssistant = getContext<SamAssistantManager>(SAM_ASSISTANT_KEY)

  // 상태 구독
  const debugInfo = $derived(() => {
    const state = keyboardManager.state
    if (state.lastAction) {
      const description = keyboardManager.getActionDescription(state.lastAction)
      return `${state.lastKeyDisplay} (${description})`
    }
    return null
  })

  // 파일 상태 텍스트
  const fileStatusText = $derived(() => {
    const currentImage = workspaceManager.currentImage
    if (!currentImage) return '-'

    const statusSuffix =
      currentImage.status === 'completed' ? '_C' : currentImage.status === 'working' ? '_W' : ''
    return `${currentImage.id}${statusSuffix}.json [ ${workspaceManager.currentImageIndex + 1} / ${workspaceManager.imageList.length} ]`
  })

  // 저장 상태 메시지 (autosave/수동저장 인디케이터)
  let savedClock = $state(Date.now())
  $effect(() => {
    const interval = setInterval(() => {
      savedClock = Date.now()
    }, 30_000)
    return () => clearInterval(interval)
  })

  function formatSavedAt(ts: number, now: number): string {
    const diff = Math.max(0, now - ts)
    if (diff < 10_000) return '방금'
    if (diff < 60_000) return `${Math.floor(diff / 1000)}초 전`
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const statusMessage = $derived(() => {
    if (!workspaceManager.currentImage) return '준비'
    const status = workspaceManager.saveStatus
    if (status === 'saving') return '저장 중…'
    if (status === 'dirty') return '편집 중 (자동 저장 대기)'
    if (status === 'error') return '저장 실패'
    if (status === 'saved' && workspaceManager.lastSavedAt) {
      return `자동 저장됨 · ${formatSavedAt(workspaceManager.lastSavedAt, savedClock)}`
    }
    return '준비'
  })

  // 줌 퍼센트 계산
  const zoomPercent = $derived(() => {
    return Math.round(workspaceManager.zoomLevel * 100)
  })

  // SAM 상태 텍스트 — 3-stage 모델
  const samStatusText = $derived.by(() => {
    const m = samAssistant.modelStatus
    const e = samAssistant.encodeStatus
    const p = samAssistant.predictStatus
    const isSamTool = toolManager.currentTool === 'sam'

    if (m.kind === 'missing') return isSamTool ? 'SAM: 모델 없음' : null
    if (m.kind === 'error') return isSamTool ? 'SAM: 모델 오류' : null
    if (!isSamTool) return null

    if (e.kind === 'encoding') return 'SAM: encoding…'
    if (e.kind === 'error') return 'SAM: 인코딩 실패'

    // 인코딩 안됨 / 시작 전
    if (e.kind !== 'ready') return 'SAM: 준비 중'

    // 인코딩 ready 이후의 stage
    if (p.kind === 'predicting') return 'SAM: predicting…'
    if (p.kind === 'ready') {
      const score = (p.score * 100).toFixed(0)
      return `SAM: 미리보기 · IoU ${score}% · Space로 확정`
    }
    if (p.kind === 'error') return 'SAM: 추론 실패'

    // predict idle 상태에서 프롬프트 유무로 분기
    if (samAssistant.hasPrompts) return 'SAM: 프롬프트 입력됨 · Space로 미리보기'
    return e.cached ? 'SAM: ready (cached) · 클릭/드래그' : `SAM: ready (${e.ms}ms) · 클릭/드래그`
  })

  const samStatusClass = $derived.by(() => {
    const m = samAssistant.modelStatus
    if (m.kind === 'missing' || m.kind === 'error') return 'text-destructive'
    const p = samAssistant.predictStatus
    if (p.kind === 'error') return 'text-destructive'
    return ''
  })

  // 앱 버전 (한 번만 조회)
  let appVersion = $state<string | null>(null)
  $effect(() => {
    void window.api.app.getVersion().then((v) => {
      appVersion = v
    })
  })
</script>

<footer
  class="h-8 border-t flex items-center justify-between px-4 text-xs text-muted-foreground"
  aria-label="상태 표시줄"
>
  <div class="flex gap-4" aria-label="시스템 상태">
    <span aria-live="polite">{statusMessage()}</span>
    {#if samStatusText}
      <span aria-live="polite" class={samStatusClass}>{samStatusText}</span>
    {/if}
  </div>
  <div class="flex gap-4" aria-label="작업 진행 상태">
    <span>{fileStatusText()}</span>
  </div>
  <div class="flex gap-4" aria-label="좌표 및 확대 정보">
    {#if debugInfo()}
      <span class="text-primary font-medium" aria-label="마지막 단축키">
        {debugInfo()}
      </span>
    {/if}
    <span>X: {toolManager.mouseX}, Y: {toolManager.mouseY}</span>
    <span>Zoom: {zoomPercent()}%</span>
    {#if appVersion}
      <span aria-label="앱 버전">v{appVersion}</span>
    {/if}
  </div>
</footer>
