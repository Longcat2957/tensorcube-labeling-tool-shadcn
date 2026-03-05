<script lang="ts">
  import { getContext } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Tabs, TabsList, TabsTrigger } from "$lib/components/ui/tabs/index.js";
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "$lib/components/ui/dropdown-menu/index.js";
  import { Menu, ArrowDownToLine, Plus, FolderOpen, Settings } from "@lucide/svelte";
  import CreateProjectDialog from "./dialogs/CreateProjectDialog.svelte";
  import OpenWorkspaceDialog from "./dialogs/OpenWorkspaceDialog.svelte";
  import ExportDialog from "./dialogs/ExportDialog.svelte";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  let currentMode = $state('edit');
</script>

<header class="h-14 border-b flex items-center px-4 justify-between">
  <div class="flex items-center gap-4">
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" aria-label="메뉴 열기"><Menu /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <CreateProjectDialog>
          {#snippet children()}
            <div class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
              <Plus class="size-4 mr-2" />
              새 프로젝트 생성
            </div>
          {/snippet}
        </CreateProjectDialog>
        <OpenWorkspaceDialog>
          {#snippet children()}
            <div class="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
              <FolderOpen class="size-4 mr-2" />
              워크스페이스 열기
            </div>
          {/snippet}
        </OpenWorkspaceDialog>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Settings class="size-4 mr-2" />
          프로젝트 설정
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div class="font-semibold text-sm">
      {workspaceManager.workspaceConfig?.workspace ?? '워크스페이스 없음'}
    </div>
  </div>

  <div class="flex items-center gap-4">
    <Tabs bind:value={currentMode}>
      <TabsList>
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="check">Check</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
    </Tabs>
    <ExportDialog>
      {#snippet children()}
        <Button variant="outline" size="icon" aria-label="내보내기"><ArrowDownToLine /></Button>
      {/snippet}
    </ExportDialog>
  </div>
</header>
