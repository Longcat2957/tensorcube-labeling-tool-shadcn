<script lang="ts">
  import { getContext } from "svelte";
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from "$lib/stores/keyboardManager.svelte.js";

  // 키보드 매니저 Context 가져오기
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY);

  // 상태 구독
  let debugInfo = $derived(() => {
    const state = keyboardManager.state;
    if (state.lastAction) {
      const description = keyboardManager.getActionDescription(state.lastAction);
      return `${state.lastKeyDisplay} (${description})`;
    }
    return null;
  });
</script>

<footer class="h-8 border-t flex items-center justify-between px-4 text-xs text-muted-foreground" aria-label="상태 표시줄">
  <div class="flex gap-4" aria-label="시스템 상태">
    <span aria-live="polite">자동 저장됨 (10:35)</span>
  </div>
  <div class="flex gap-4" aria-label="작업 진행 상태">
    <span>0000000002_W.json [ 2 / 5000 ]</span>
  </div>
  <div class="flex gap-4" aria-label="좌표 및 확대 정보">
    {#if debugInfo()}
      <span class="text-primary font-medium" aria-label="마지막 단축키">
        {debugInfo()}
      </span>
    {/if}
    <span>X: 1450, Y: 920</span>
    <span>Zoom: 150%</span>
  </div>
</footer>