<script lang="ts">
  import { setContext } from "svelte";
  import Navigation from "./components/Navigation.svelte";
  import LeftSidebar from "./components/LeftSidebar.svelte";
  import CanvasArea from "./components/CanvasArea.svelte";
  import RightSidebar from "./components/RightSidebar.svelte";
  import Footer from "./components/Footer.svelte";
  import OpenWorkspaceDialog from "./components/dialogs/OpenWorkspaceDialog.svelte";
  import CreateProjectDialog from "./components/dialogs/CreateProjectDialog.svelte";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { createKeyboardManager, KEYBOARD_MANAGER_KEY } from "$lib/stores/keyboardManager.svelte.js";
  import { createWorkspaceManager, WORKSPACE_MANAGER_KEY } from "$lib/stores/workspace.svelte.js";

  // 키보드 매니저 생성 및 Context 제공
  const keyboardManager = createKeyboardManager();
  setContext(KEYBOARD_MANAGER_KEY, keyboardManager);

  // 워크스페이스 매니저 생성 및 Context 제공
  const workspaceManager = createWorkspaceManager();
  setContext(WORKSPACE_MANAGER_KEY, workspaceManager);

  // 워크스페이스가 없으면 다이얼로그 표시
  let showOpenDialog = $state(!workspaceManager.isWorkspaceOpen);

  // 워크스페이스 상태 변경 시 다이얼로그 표시 여부 업데이트
  $effect(() => {
    if (!workspaceManager.isWorkspaceOpen) {
      showOpenDialog = true;
    }
  });

  // 전역 키보드 이벤트 리스너
  $effect(() => {
    window.addEventListener("keydown", keyboardManager.handleKeyDown);
    return () => {
      window.removeEventListener("keydown", keyboardManager.handleKeyDown);
    };
  });
</script>

<div class="h-screen flex flex-col font-sans overflow-hidden" role="application" aria-label="데이터 라벨링 도구">
  {#if workspaceManager.isWorkspaceOpen}
    <Navigation />
    <div class="flex-1 flex overflow-hidden">
      <LeftSidebar />
      <Resizable.PaneGroup direction="horizontal" class="flex-1">
        <Resizable.Pane>
          <CanvasArea />
        </Resizable.Pane>
        <Resizable.Handle />
        <Resizable.Pane defaultSize={15} minSize={5} maxSize={40}>
          <RightSidebar />
        </Resizable.Pane>
      </Resizable.PaneGroup>
    </div>
    <Footer />
  {:else}
    <div class="h-full flex items-center justify-center bg-muted/30">
      <div class="text-center space-y-4">
        <h1 class="text-2xl font-semibold">워크스페이스를 선택해주세요</h1>
        <p class="text-muted-foreground">시작하려면 기존 워크스페이스를 열거나 새 프로젝트를 생성하세요.</p>
        <div class="flex gap-3 justify-center">
          <OpenWorkspaceDialog>
            <button class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              워크스페이스 열기
            </button>
          </OpenWorkspaceDialog>
          <CreateProjectDialog>
            <button class="px-4 py-2 border border-input bg-background rounded-md hover:bg-accent hover:text-accent-foreground">
              새 프로젝트 생성
            </button>
          </CreateProjectDialog>
        </div>
      </div>
    </div>
  {/if}
</div>
