<script lang="ts">
  import type { Snippet } from "svelte";
  import { getContext } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { RadioGroup, RadioGroupItem } from "$lib/components/ui/radio-group/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { FolderOpen, Plus, Trash2 } from "@lucide/svelte";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";
  import { toast } from "svelte-sonner";

  let { children }: { children: Snippet } = $props();

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  let open = $state(false);
  let workspaceName = $state("");
  let sourceFolders = $state<{ id: number; path: string }[]>([]);
  let nextSourceFolderId = $state(1);
  let savePath = $state("");
  let labelingType = $state("1");
  let classes = $state([{ id: 0, name: "" }]);
  let nextClassId = $state(1);
  let isCreating = $state(false);

  function addClass() {
    classes = [...classes, { id: nextClassId, name: "" }];
    nextClassId++;
  }

  function removeClass(id: number) {
    if (classes.length > 1) {
      classes = classes.filter((c) => c.id !== id);
    }
  }

  async function addSourceFolder() {
    const selectedPath = await window.api.dialog.selectFolder();
    if (selectedPath) {
      sourceFolders = [...sourceFolders, { id: nextSourceFolderId, path: selectedPath }];
      nextSourceFolderId++;
    }
  }

  function removeSourceFolder(id: number) {
    sourceFolders = sourceFolders.filter((f) => f.id !== id);
  }

  async function selectSavePath() {
    const selectedPath = await window.api.dialog.selectFolder();
    if (selectedPath) {
      savePath = selectedPath;
    }
  }

  async function handleCreate() {
    // 유효성 검사
    if (!workspaceName.trim()) {
      toast.error("워크스페이스 이름을 입력하세요.");
      return;
    }
    if (sourceFolders.length === 0) {
      toast.error("원천데이터 폴더를 선택하세요.");
      return;
    }
    if (!savePath) {
      toast.error("프로젝트 저장 경로를 선택하세요.");
      return;
    }
    if (classes.some((c) => !c.name.trim())) {
      toast.error("모든 클래스 이름을 입력하세요.");
      return;
    }

    isCreating = true;

    const result = await window.api.workspace.create({
      name: workspaceName.trim(),
      sourceFolders: sourceFolders.map((f) => f.path),
      savePath,
      labelingType: parseInt(labelingType) as 1 | 2,
      classes: classes.map((c) => ({ id: c.id, name: c.name.trim() }))
    });

    isCreating = false;

    if (result.success && result.path) {
      toast.success("워크스페이스가 생성되었습니다.");
      open = false;
      resetForm();
      // 생성된 워크스페이스 열기
      await workspaceManager.openWorkspace(result.path);
    } else {
      toast.error(result.error || "워크스페이스 생성에 실패했습니다.");
    }
  }

  function resetForm() {
    workspaceName = "";
    sourceFolders = [];
    nextSourceFolderId = 1;
    savePath = "";
    labelingType = "1";
    classes = [{ id: 0, name: "" }];
    nextClassId = 1;
  }

  function handleCancel() {
    open = false;
    resetForm();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header>
      <Dialog.Title>새 프로젝트 생성</Dialog.Title>
      <Dialog.Description>새로운 라벨링 프로젝트를 생성합니다.</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6 py-4">
      <!-- 워크스페이스 이름 -->
      <div class="space-y-2">
        <Label for="workspace-name">워크스페이스 이름</Label>
        <input
          id="workspace-name"
          type="text"
          bind:value={workspaceName}
          placeholder="프로젝트 이름을 입력하세요"
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <!-- 원천데이터 폴더 선택 (다중 선택 가능) -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>원천데이터 폴더</Label>
          <Button variant="ghost" size="sm" onclick={addSourceFolder}>
            <Plus class="size-4 mr-1" />
            폴더 추가
          </Button>
        </div>
        <ScrollArea class="h-28 rounded-md border p-2">
          {#if sourceFolders.length === 0}
            <div class="flex items-center justify-center h-full text-sm text-muted-foreground">
              폴더를 추가하세요
            </div>
          {:else}
            <div class="space-y-2">
              {#each sourceFolders as folder (folder.id)}
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    value={folder.path}
                    readonly
                    class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => removeSourceFolder(folder.id)}
                    class="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 class="size-4" />
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </div>

      <!-- 프로젝트 저장 경로 -->
      <div class="space-y-2">
        <Label>프로젝트 저장 경로</Label>
        <div class="flex gap-2">
          <input
            type="text"
            value={savePath}
            readonly
            placeholder="저장할 위치를 선택하세요"
            class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button variant="outline" size="icon" onclick={selectSavePath}>
            <FolderOpen class="size-4" />
          </Button>
        </div>
      </div>

      <!-- 라벨링 타입 선택 -->
      <div class="space-y-2">
        <Label>라벨링 타입</Label>
        <RadioGroup bind:value={labelingType} class="flex gap-4">
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="1" id="type-bb" />
            <Label for="type-bb" class="font-normal">Bounding Box (BB)</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="2" id="type-obb" />
            <Label for="type-obb" class="font-normal">Oriented Bounding Box (OBB)</Label>
          </div>
        </RadioGroup>
      </div>

      <!-- 클래스 정의 -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>클래스 정의</Label>
          <Button variant="ghost" size="sm" onclick={addClass}>
            <Plus class="size-4 mr-1" />
            추가
          </Button>
        </div>
        <ScrollArea class="h-40 rounded-md border p-2">
          <div class="space-y-2">
            {#each classes as cls (cls.id)}
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground w-6">{cls.id}</span>
                <input
                  type="text"
                  bind:value={cls.name}
                  placeholder="클래스 이름"
                  class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onclick={() => removeClass(cls.id)}
                  disabled={classes.length === 1}
                  class="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            {/each}
          </div>
        </ScrollArea>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={handleCancel} disabled={isCreating}>취소</Button>
      <Button onclick={handleCreate} disabled={isCreating}>
        {isCreating ? '생성 중...' : '생성'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>