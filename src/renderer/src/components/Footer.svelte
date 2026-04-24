<script lang="ts">
  import { getContext } from 'svelte'
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from '$lib/stores/keyboardManager.svelte.js'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { TOOL_MANAGER_KEY, type ToolManager } from '$lib/stores/toolManager.svelte.js'

  // Context 가져오기
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY)
  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)
  const toolManager = getContext<ToolManager>(TOOL_MANAGER_KEY)

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
</script>

<footer
  class="h-8 border-t flex items-center justify-between px-4 text-xs text-muted-foreground"
  aria-label="상태 표시줄"
>
  <div class="flex gap-4" aria-label="시스템 상태">
    <span aria-live="polite">{statusMessage()}</span>
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
  </div>
</footer>
