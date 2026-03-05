<script lang="ts">
  import { getContext } from "svelte";
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from "$lib/stores/keyboardManager.svelte.js";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  // 키보드 매니저 Context 가져오기
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY);
  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  // 상태 구독
  let debugInfo = $derived(() => {
    const state = keyboardManager.state;
    if (state.lastAction) {
      const description = keyboardManager.getActionDescription(state.lastAction);
      return `${state.lastKeyDisplay} (${description})`;
    }
    return null;
  });

  // 파일 상태 텍스트
  let fileStatusText = $derived(() => {
    const currentImage = workspaceManager.currentImage;
    if (!currentImage) return '-';
    
    const statusSuffix = currentImage.status === 'completed' ? '_C' : 
                         currentImage.status === 'working' ? '_W' : '';
    return `${currentImage.id}${statusSuffix}.json [ ${workspaceManager.currentImageIndex + 1} / ${workspaceManager.imageList.length} ]`;
  });

  // 상태 메시지
  let statusMessage = $state('준비');
</script>

<footer class="h-8 border-t flex items-center justify-between px-4 text-xs text-muted-foreground" aria-label="상태 표시줄">
  <div class="flex gap-4" aria-label="시스템 상태">
    <span aria-live="polite">{statusMessage}</span>
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
    <span>X: -, Y: -</span>
    <span>Zoom: 100%</span>
  </div>
</footer>
