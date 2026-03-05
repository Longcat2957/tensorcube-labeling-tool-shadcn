<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { RadioGroup, RadioGroupItem } from "$lib/components/ui/radio-group/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { FolderOpen, Plus, Trash2 } from "@lucide/svelte";

  let { children }: { children: Snippet } = $props();

  let open = $state(false);
  let workspaceName = $state("");
  let sourceFolderPath = $state("");
  let labelingType = $state("1");
  let classes = $state([{ id: 0, name: "" }]);
  let nextClassId = $state(1);

  function addClass() {
    classes = [...classes, { id: nextClassId, name: "" }];
    nextClassId++;
  }

  function removeClass(id: number) {
    if (classes.length > 1) {
      classes = classes.filter((c) => c.id !== id);
    }
  }

  function selectFolder() {
    // TODO: Electron IPC로 폴더 선택 다이얼로그 호출
    sourceFolderPath = "/selected/folder/path";
  }

  function handleCreate() {
    // TODO: 프로젝트 생성 로직
    open = false;
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

      <!-- 원천데이터 폴더 선택 -->
      <div class="space-y-2">
        <Label>원천데이터 폴더</Label>
        <div class="flex gap-2">
          <input
            type="text"
            value={sourceFolderPath}
            readonly
            placeholder="폴더를 선택하세요"
            class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button variant="outline" size="icon" onclick={selectFolder}>
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
      <Button variant="outline" onclick={() => {}}>취소</Button>
      <Button onclick={handleCreate}>생성</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>