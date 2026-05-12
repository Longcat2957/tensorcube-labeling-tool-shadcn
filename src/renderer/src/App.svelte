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
  import { Toaster } from '$lib/components/ui/sonner/index.js'
  import { ModeWatcher } from 'mode-watcher'
  import { toast } from 'svelte-sonner'
  import {
    createKeyboardManager,
    KEYBOARD_MANAGER_KEY
  } from '$lib/stores/keyboardManager.svelte.js'
  import { createWorkspaceManager, WORKSPACE_MANAGER_KEY } from '$lib/stores/workspace.svelte.js'
  import { createToolManager, TOOL_MANAGER_KEY } from '$lib/stores/toolManager.svelte.js'
  import { createModeManager, MODE_MANAGER_KEY } from '$lib/stores/modeManager.svelte.js'
  import {
    createSamAssistantManager,
    SAM_ASSISTANT_KEY
  } from '$lib/stores/samAssistant.svelte.js'

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

  // SAM 어시스턴트 매니저 생성 및 Context 제공
  const samAssistant = createSamAssistantManager()
  setContext(SAM_ASSISTANT_KEY, samAssistant)
  // 모델 ready 상태 1회 조회
  $effect(() => {
    void samAssistant.refreshModelStatus()
  })

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

  // 자동 업데이트 이벤트 → 토스트.
  // - available: 다운로드 시작 안내
  // - downloaded: 재시작 액션 토스트(영구)
  // - not-available: 수동 체크 직후에만 노출 (자동 체크는 노이즈가 되어 무시)
  // - error: 에러
  // 'checking' / 'progress' 는 토스트하지 않음.
  $effect(() => {
    let manualCheckRequested = false

    const off = window.api.app.onUpdateEvent((ev) => {
      if (ev.type === 'available') {
        toast.info('업데이트 다운로드 중', {
          description: `새 버전 ${ev.version ?? ''}을(를) 백그라운드에서 받아요.`
        })
        return
      }
      if (ev.type === 'downloaded') {
        toast.success('업데이트 준비 완료', {
          description: `${ev.version ?? ''} 새 버전이 다운로드되었습니다. 지금 재시작하면 적용됩니다.`,
          duration: Infinity,
          action: {
            label: '지금 재시작',
            onClick: () => {
              void window.api.app.installUpdate()
            }
          }
        })
        return
      }
      if (ev.type === 'not-available' && manualCheckRequested) {
        manualCheckRequested = false
        toast.message('이미 최신 버전입니다.', {
          description: ev.version ? `현재 버전: ${ev.version}` : undefined
        })
        return
      }
      if (ev.type === 'error') {
        toast.error('업데이트 확인 실패', {
          description: ev.message
        })
        return
      }
    })

    function onManualCheck(): void {
      manualCheckRequested = true
    }
    window.addEventListener('app:manual-update-check', onManualCheck)

    return () => {
      off()
      window.removeEventListener('app:manual-update-check', onManualCheck)
    }
  })
</script>

<ModeWatcher />
<Toaster richColors closeButton />
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
