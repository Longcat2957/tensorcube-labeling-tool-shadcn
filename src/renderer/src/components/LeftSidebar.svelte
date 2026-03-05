<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { ArrowLeft, ArrowRight, MousePointer2, Square, Undo, Redo, Trash2 } from "@lucide/svelte";
  import { KEYBOARD_MANAGER_KEY, type KeyboardAction, type KeyboardManager } from "$lib/stores/keyboardManager.svelte.js";

  // 키보드 매니저 Context 가져오기
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY);

  // 현재 선택된 도구 상태
  type ToolType = "select" | "box";
  let currentTool = $state<ToolType>("select");

  // 단축키 액션 핸들러
  function handlePrevImage() {
    console.log("이전 이미지 이동");
    // TODO: 이미지 이동 로직 구현
  }

  function handleNextImage() {
    console.log("다음 이미지 이동");
    // TODO: 이미지 이동 로직 구현
  }

  function handleSelectTool() {
    currentTool = "select";
    console.log("선택 도구 활성화");
  }

  function handleBoxTool() {
    currentTool = "box";
    console.log("박스 생성 도구 활성화");
  }

  function handleUndo() {
    console.log("실행 취소");
    // TODO: Undo 로직 구현
  }

  function handleRedo() {
    console.log("다시 실행");
    // TODO: Redo 로직 구현
  }

  function handleDelete() {
    console.log("선택된 라벨 삭제");
    // TODO: 삭제 로직 구현
  }

  // 단축키 핸들러 등록
  onMount(() => {
    const cleanupFns: (() => void)[] = [];

    cleanupFns.push(keyboardManager.onAction("prev-image" as KeyboardAction, handlePrevImage));
    cleanupFns.push(keyboardManager.onAction("next-image" as KeyboardAction, handleNextImage));
    cleanupFns.push(keyboardManager.onAction("select-tool" as KeyboardAction, handleSelectTool));
    cleanupFns.push(keyboardManager.onAction("box-tool" as KeyboardAction, handleBoxTool));
    cleanupFns.push(keyboardManager.onAction("undo" as KeyboardAction, handleUndo));
    cleanupFns.push(keyboardManager.onAction("redo" as KeyboardAction, handleRedo));
    cleanupFns.push(keyboardManager.onAction("delete" as KeyboardAction, handleDelete));

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
    };
  });
</script>

<aside 
  class="w-16 border-r flex flex-col items-center py-4 gap-2 bg-background"
  aria-label="도구 모음"
>
  <div class="space-y-2 flex flex-col items-center">
    <Button variant="ghost" size="icon" aria-label="이전 이미지 (A)" onclick={handlePrevImage}><ArrowLeft /></Button>
    <Button variant="ghost" size="icon" aria-label="다음 이미지 (D)" onclick={handleNextImage}><ArrowRight /></Button>
    <div class="h-px w-8 bg-border my-1" role="separator"></div>
    <Button 
      variant={currentTool === "select" ? "secondary" : "ghost"} 
      size="icon" 
      aria-label="선택 도구 (V)"
      onclick={handleSelectTool}
    >
      <MousePointer2 />
    </Button>
    <Button 
      variant={currentTool === "box" ? "secondary" : "ghost"} 
      size="icon" 
      aria-label="박스 생성 도구 (B)"
      onclick={handleBoxTool}
    >
      <Square />
    </Button>
    <div class="h-px w-8 bg-border my-1" role="separator"></div>
    <Button variant="ghost" size="icon" aria-label="실행 취소 (Ctrl+Z)" onclick={handleUndo}><Undo /></Button>
    <Button variant="ghost" size="icon" aria-label="다시 실행 (Ctrl+Y)" onclick={handleRedo}><Redo /></Button>
    <Button variant="ghost" size="icon" class="mt-auto text-destructive" aria-label="선택된 라벨 삭제 (Delete)" onclick={handleDelete}><Trash2 /></Button>
  </div>
</aside>