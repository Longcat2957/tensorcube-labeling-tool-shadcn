<script lang="ts">
  import type { Snippet } from "svelte";
  import { getContext } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { FolderOpen, FileJson } from "@lucide/svelte";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  let { children }: { children: Snippet } = $props();

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  let open = $state(false);
  let workspacePath = $state("");
  let workspaceInfo = $state<{
    name: string;
    labelingType: string;
    imageCount: number;
    lastModified: string;
  } | null>(null);
  let isLoading = $state(false);

  async function selectWorkspace() {
    const selectedPath = await window.api.dialog.selectWorkspaceFolder();
    if (selectedPath) {
      workspacePath = selectedPath;
      // workspace.yaml에서 정보 로드
      const info = await window.api.workspace.getInfo(selectedPath);
      if (info) {
        workspaceInfo = info;
      } else {
        workspaceInfo = null;
      }
    }
  }

  async function handleOpen() {
    if (!workspacePath) return;
    
    isLoading = true;
    const success = await workspaceManager.openWorkspace(workspacePath);
    isLoading = false;
    
    if (success) {
      open = false;
      workspacePath = "";
      workspaceInfo = null;
    }
  }

  function handleCancel() {
    open = false;
    workspacePath = "";
    workspaceInfo = null;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>워크스페이스 열기</Dialog.Title>
      <Dialog.Description>기존 라벨링 프로젝트를 엽니다.</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-4">
      <!-- 워크스페이스 폴더 선택 -->
      <div class="space-y-2">
        <Label>워크스페이스 폴더</Label>
        <div class="flex gap-2">
          <input
            type="text"
            value={workspacePath}
            readonly
            placeholder="workspace.yaml이 있는 폴더를 선택하세요"
            class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button variant="outline" size="icon" onclick={selectWorkspace}>
            <FolderOpen class="size-4" />
          </Button>
        </div>
      </div>

      <!-- 워크스페이스 정보 표시 -->
      {#if workspaceInfo}
        <div class="rounded-lg border p-4 space-y-3 bg-muted/30">
          <div class="flex items-center gap-2">
            <FileJson class="size-5 text-muted-foreground" />
            <span class="font-semibold">{workspaceInfo.name}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div>
              <span class="block text-xs">라벨링 타입</span>
              <span class="font-medium text-foreground">{workspaceInfo.labelingType}</span>
            </div>
            <div>
              <span class="block text-xs">이미지 수</span>
              <span class="font-medium text-foreground">{workspaceInfo.imageCount.toLocaleString()}개</span>
            </div>
            <div class="col-span-2">
              <span class="block text-xs">마지막 수정</span>
              <span class="font-medium text-foreground">{workspaceInfo.lastModified}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={handleCancel}>취소</Button>
      <Button onclick={handleOpen} disabled={!workspaceInfo || isLoading}>
        {isLoading ? '로딩 중...' : '열기'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>