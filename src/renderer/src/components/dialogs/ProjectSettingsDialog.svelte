<script lang="ts">
  import type { Snippet } from "svelte";
  import { getContext } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { Plus, Trash2, Settings } from "@lucide/svelte";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";
  import { toast } from "svelte-sonner";

  let { children }: { children: Snippet } = $props();

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  let open = $state(false);
  let workspaceName = $state("");
  let labelingType = $state("1");
  let classes = $state<{ id: number; name: string }[]>([]);
  let nextClassId = $state(0);
  let isSaving = $state(false);

  function syncFormFromWorkspace() {
    const config = workspaceManager.workspaceConfig;

    if (!config) {
      workspaceName = "";
      labelingType = "1";
      classes = [];
      nextClassId = 0;
      return;
    }

    workspaceName = config.workspace;
    labelingType = String(config.labeling_type);

    const nextClasses = Object.entries(config.names)
      .map(([id, name]) => ({ id: Number(id), name }))
      .sort((a, b) => a.id - b.id);

    classes = nextClasses.length > 0 ? nextClasses : [{ id: 0, name: "" }];
    nextClassId = classes.reduce((maxId, item) => Math.max(maxId, item.id), -1) + 1;
  }

  const currentLabelingTypeLabel = $derived(
    workspaceManager.workspaceConfig?.labeling_type === 2 ? "Oriented Bounding Box (OBB)" : "Bounding Box (BB)"
  );

  function handleOpenChange(nextOpen: boolean) {
    open = nextOpen;

    if (nextOpen) {
      syncFormFromWorkspace();
    }
  }

  function addClass() {
    classes = [...classes, { id: nextClassId, name: "" }];
    nextClassId += 1;
  }

  function removeClass(id: number) {
    if (classes.length === 1) {
      return;
    }

    classes = classes.filter((item) => item.id !== id);
  }

  async function handleSave() {
    if (!workspaceManager.workspacePath) {
      toast.error("열려 있는 워크스페이스가 없습니다.");
      return;
    }

    if (!workspaceName.trim()) {
      toast.error("워크스페이스 이름을 입력하세요.");
      return;
    }

    if (classes.length === 0) {
      toast.error("최소 1개의 클래스를 정의해야 합니다.");
      return;
    }

    if (classes.some((item) => !item.name.trim())) {
      toast.error("모든 클래스 이름을 입력하세요.");
      return;
    }

    const normalizedNames = classes.map((item) => item.name.trim().toLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      toast.error("클래스 이름은 중복될 수 없습니다.");
      return;
    }

    isSaving = true;

    const success = await workspaceManager.updateWorkspaceConfigFile({
      workspace: workspaceName.trim(),
      labelingType: workspaceManager.workspaceConfig?.labeling_type ?? 1,
      classes: classes
        .map((item) => ({ id: item.id, name: item.name.trim() }))
        .sort((a, b) => a.id - b.id)
    });

    isSaving = false;

    if (success) {
      toast.success("프로젝트 설정이 저장되었습니다.");
      open = false;
    } else {
      toast.error("프로젝트 설정 저장에 실패했습니다.");
    }
  }
</script>

<Dialog.Root open={open} onOpenChange={handleOpenChange}>
  <Dialog.Trigger disabled={!workspaceManager.isWorkspaceOpen}>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Settings class="size-4" />
        프로젝트 설정
      </Dialog.Title>
      <Dialog.Description>
        현재 워크스페이스의 이름, 라벨링 타입, 클래스 구성을 수정합니다.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6 py-4">
      <div class="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4 text-sm">
        <div>
          <div class="text-xs text-muted-foreground">이미지 수</div>
          <div class="font-medium">{workspaceManager.workspaceConfig?.image_count ?? 0}개</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">생성일</div>
          <div class="font-medium">{workspaceManager.workspaceConfig?.created_at ?? '-'}</div>
        </div>
      </div>

      <div class="space-y-2">
        <Label for="project-settings-workspace-name">워크스페이스 이름</Label>
        <input
          id="project-settings-workspace-name"
          type="text"
          bind:value={workspaceName}
          placeholder="워크스페이스 이름을 입력하세요"
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-2">
        <Label>라벨링 타입</Label>
        <div class="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div class="font-medium">{currentLabelingTypeLabel}</div>
          <div class="mt-1 text-xs text-muted-foreground">
            워크스페이스 생성 후 라벨링 타입은 변경할 수 없습니다.
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>클래스 정의</Label>
          <Button variant="ghost" size="sm" onclick={addClass}>
            <Plus class="size-4 mr-1" />
            추가
          </Button>
        </div>
        <ScrollArea class="h-48 rounded-md border p-2">
          <div class="space-y-2">
            {#each classes as cls (cls.id)}
              <div class="flex items-center gap-2">
                <span class="w-8 text-sm text-muted-foreground">{cls.id}</span>
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
      <Button variant="outline" onclick={() => handleOpenChange(false)} disabled={isSaving}>취소</Button>
      <Button onclick={handleSave} disabled={isSaving || !workspaceManager.isWorkspaceOpen}>
        {isSaving ? '저장 중...' : '저장'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>