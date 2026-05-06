<script lang="ts">
  import { getContext } from 'svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Tabs, TabsList, TabsTrigger } from '$lib/components/ui/tabs/index.js'
  import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip/index.js'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuSeparator
  } from '$lib/components/ui/dropdown-menu/index.js'
  import {
    Menu,
    ArrowDownToLine,
    Plus,
    FolderOpen,
    Settings,
    Sun,
    Moon,
    Wrench,
    Hammer,
    BarChart3,
    ShieldAlert
  } from '@lucide/svelte'
  import { mode, toggleMode } from 'mode-watcher'
  import CreateProjectDialog from './dialogs/CreateProjectDialog.svelte'
  import OpenWorkspaceDialog from './dialogs/OpenWorkspaceDialog.svelte'
  import ExportDialog from './dialogs/ExportDialog.svelte'
  import ProjectSettingsDialog from './dialogs/ProjectSettingsDialog.svelte'
  import MaintenanceDialog from './dialogs/MaintenanceDialog.svelte'
  import ToolsDialog from './dialogs/ToolsDialog.svelte'
  import StatsFilterDialog from './dialogs/StatsFilterDialog.svelte'
  import ValidationDialog from './dialogs/ValidationDialog.svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import {
    MODE_MANAGER_KEY,
    type ModeManager,
    type AppMode
  } from '$lib/stores/modeManager.svelte.js'

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)
  const modeManager = getContext<ModeManager>(MODE_MANAGER_KEY)
</script>

<header class="h-14 border-b flex items-center px-4 justify-between">
  <div class="flex items-center gap-4">
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" aria-label="메뉴 열기"><Menu /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="flex flex-col">
        <CreateProjectDialog>
          <div
            class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          >
            <Plus class="size-4 mr-2" />
            새 프로젝트 생성
          </div>
        </CreateProjectDialog>
        <OpenWorkspaceDialog>
          <div
            class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          >
            <FolderOpen class="size-4 mr-2" />
            워크스페이스 열기
          </div>
        </OpenWorkspaceDialog>
        {#if workspaceManager.isWorkspaceOpen}
          <DropdownMenuSeparator />
          <ProjectSettingsDialog>
            <div
              class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <Settings class="size-4 mr-2" />
              프로젝트 설정
            </div>
          </ProjectSettingsDialog>
          <MaintenanceDialog>
            <div
              class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <Wrench class="size-4 mr-2" />
              워크스페이스 유지보수
            </div>
          </MaintenanceDialog>
          <StatsFilterDialog>
            <div
              class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <BarChart3 class="size-4 mr-2" />
              통계 & 필터
            </div>
          </StatsFilterDialog>
          <ValidationDialog>
            <div
              class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <ShieldAlert class="size-4 mr-2" />
              Validation 검사
            </div>
          </ValidationDialog>
        {/if}
        <DropdownMenuSeparator />
        <ToolsDialog>
          <div
            class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          >
            <Hammer class="size-4 mr-2" />
            데이터 준비 도구
          </div>
        </ToolsDialog>
      </DropdownMenuContent>
    </DropdownMenu>
    <div class="font-semibold text-sm">
      {workspaceManager.workspaceConfig?.workspace ?? '워크스페이스 없음'}
    </div>
  </div>

  <div class="flex items-center gap-4">
    <Tabs value={modeManager.current} onValueChange={(v) => modeManager.setMode(v as AppMode)}>
      <TabsList>
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="check">Check</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
    </Tabs>
    <Tooltip>
      <TooltipTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label="테마 전환"
            onclick={() => toggleMode()}
          >
            {#if mode.current === 'dark'}
              <Sun />
            {:else}
              <Moon />
            {/if}
          </Button>
        {/snippet}
      </TooltipTrigger>
      <TooltipContent side="bottom">테마 전환</TooltipContent>
    </Tooltip>
    <ExportDialog>
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="icon"
              aria-label="내보내기"
              disabled={!workspaceManager.isWorkspaceOpen}
            >
              <ArrowDownToLine />
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {workspaceManager.isWorkspaceOpen
            ? '데이터셋 내보내기'
            : '워크스페이스를 먼저 열어주세요'}
        </TooltipContent>
      </Tooltip>
    </ExportDialog>
  </div>
</header>
