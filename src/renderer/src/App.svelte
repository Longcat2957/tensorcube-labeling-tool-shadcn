<script lang="ts">
  import { setContext } from 'svelte'
  import Navigation from './components/Navigation.svelte'
  import LeftSidebar from './components/LeftSidebar.svelte'
  import CanvasArea from './components/CanvasArea.svelte'
  import RightSidebar from './components/RightSidebar.svelte'
  import Footer from './components/Footer.svelte'
  import OpenWorkspaceDialog from './components/dialogs/OpenWorkspaceDialog.svelte'
  import CreateProjectDialog from './components/dialogs/CreateProjectDialog.svelte'
  import ToolsDialog from './components/dialogs/ToolsDialog.svelte'
  import RecentWorkspaces from './components/RecentWorkspaces.svelte'
  import Dashboard from './components/Dashboard.svelte'
  import ThumbnailGrid from './components/ThumbnailGrid.svelte'
  import ImageListPanel from './components/ImageListPanel.svelte'
  import * as Resizable from '$lib/components/ui/resizable/index.js'
  import { TooltipProvider } from '$lib/components/ui/tooltip/index.js'
  import { ModeWatcher } from 'mode-watcher'
  import {
    createKeyboardManager,
    KEYBOARD_MANAGER_KEY
  } from '$lib/stores/keyboardManager.svelte.js'
  import { createWorkspaceManager, WORKSPACE_MANAGER_KEY } from '$lib/stores/workspace.svelte.js'
  import { createToolManager, TOOL_MANAGER_KEY } from '$lib/stores/toolManager.svelte.js'
  import { createModeManager, MODE_MANAGER_KEY } from '$lib/stores/modeManager.svelte.js'

  // 키보드 매니저 생성 및 Context 제공
  const keyboardManager = createKeyboardManager()
  setContext(KEYBOARD_MANAGER_KEY, keyboardManager)

  // 워크스페이스 매니저 생성 및 Context 제공
  const workspaceManager = createWorkspaceManager()
  setContext(WORKSPACE_MANAGER_KEY, workspaceManager)

  // 도구 매니저 생성 및 Context 제공
  const toolManager = createToolManager()
  setContext(TOOL_MANAGER_KEY, toolManager)

  // 모드 매니저 생성 및 Context 제공 (Edit / Check / Preview)
  const modeManager = createModeManager()
  setContext(MODE_MANAGER_KEY, modeManager)

  // Tab / Shift+Tab 모드 순환
  $effect(() => {
    const cleanups = [
      keyboardManager.onAction('next-mode', () => modeManager.next()),
      keyboardManager.onAction('prev-mode', () => modeManager.prev())
    ]
    return () => cleanups.forEach((fn) => fn())
  })

  // 전역 키보드 이벤트 리스너
  $effect(() => {
    window.addEventListener('keydown', keyboardManager.handleKeyDown)
    return () => {
      window.removeEventListener('keydown', keyboardManager.handleKeyDown)
    }
  })
</script>

<ModeWatcher />
<TooltipProvider>
  <div
    class="h-screen flex flex-col font-sans overflow-hidden"
    role="application"
    aria-label="데이터 라벨링 도구"
  >
    {#if workspaceManager.isWorkspaceOpen}
      <Navigation />
      <div class="flex-1 flex overflow-hidden">
        {#if modeManager.current === 'preview'}
          <Dashboard />
        {:else}
          <LeftSidebar />
          <Resizable.PaneGroup direction="horizontal" class="flex-1">
            <Resizable.Pane defaultSize={12} minSize={8} maxSize={25}>
              <ImageListPanel />
            </Resizable.Pane>
            <Resizable.Handle />
            <Resizable.Pane>
              {#if workspaceManager.gridViewActive}
                <ThumbnailGrid />
              {:else}
                <CanvasArea />
              {/if}
            </Resizable.Pane>
            <Resizable.Handle />
            <Resizable.Pane defaultSize={15} minSize={5} maxSize={40}>
              <RightSidebar />
            </Resizable.Pane>
          </Resizable.PaneGroup>
        {/if}
      </div>
      <Footer />
    {:else}
      <div class="h-full flex items-center justify-center bg-muted/30 overflow-auto py-10">
        <div class="text-center space-y-4 w-full">
          <h1 class="text-2xl font-semibold">워크스페이스를 선택해주세요</h1>
          <p class="text-muted-foreground">
            시작하려면 기존 워크스페이스를 열거나 새 프로젝트를 생성하세요.
          </p>
          <div class="flex gap-3 justify-center">
            <OpenWorkspaceDialog>
              <button
                class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                워크스페이스 열기
              </button>
            </OpenWorkspaceDialog>
            <CreateProjectDialog>
              <button
                class="px-4 py-2 border border-input bg-background rounded-md hover:bg-accent hover:text-accent-foreground"
              >
                새 프로젝트 생성
              </button>
            </CreateProjectDialog>
            <ToolsDialog>
              <button
                class="px-4 py-2 border border-input bg-background rounded-md hover:bg-accent hover:text-accent-foreground"
              >
                데이터 준비 도구
              </button>
            </ToolsDialog>
          </div>
          <p class="text-xs text-muted-foreground">
            데이터 준비 도구는 워크스페이스 없이도 사용할 수 있습니다.
          </p>
          <RecentWorkspaces />
        </div>
      </div>
    {/if}
  </div>
</TooltipProvider>
