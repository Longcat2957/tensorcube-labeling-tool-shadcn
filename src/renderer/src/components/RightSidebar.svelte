<script lang="ts">
  import { getContext } from "svelte";
  import { Eye, EyeOff, Trash2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { RadioGroup, RadioGroupItem } from "$lib/components/ui/radio-group/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  // 라벨 가시성 상태
  let labelVisibility = $state<Record<string, boolean>>({});

  function toggleLabelVisibility(labelId: string) {
    labelVisibility[labelId] = !labelVisibility[labelId];
  }

  function handleClassSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    workspaceManager.setSelectedClassId(parseInt(target.value));
  }
</script>

<aside class="h-full border-l flex flex-col" aria-label="인스펙터 패널">
  <Resizable.PaneGroup direction="vertical" class="h-full">
    <Resizable.Pane defaultSize={30} minSize={10}>
      <div 
        class="h-full bg-background p-2 flex items-center justify-center text-muted-foreground text-xs"
        role="img"
        aria-label="미니맵"
      >
        Minimap Placeholder
      </div>
    </Resizable.Pane>
    <Resizable.Handle />
    <Resizable.Pane>
      <Resizable.PaneGroup direction="vertical" class="h-full">
        <!-- Classes Section -->
        <Resizable.Pane defaultSize={50} minSize={20}>
          <ScrollArea class="h-full">
            <div class="p-3">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Classes</h3>
              {#if workspaceManager.classList.length > 0}
                <RadioGroup 
                  value={String(workspaceManager.selectedClassId)} 
                  onchange={handleClassSelect}
                  class="gap-1" 
                  aria-label="클래스 선택"
                >
                  {#each workspaceManager.classList as cls, i}
                    <div class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors cursor-pointer {workspaceManager.selectedClassId === cls.id ? 'bg-muted border border-primary/50' : 'hover:bg-muted/50 border border-transparent'}">
                      <RadioGroupItem value={String(cls.id)} id={`class-${cls.id}`} aria-label="{cls.name} 클래스" />
                      <Label for={`class-${cls.id}`} class="flex items-center gap-2 cursor-pointer flex-1 text-sm">
                        <span 
                          class="w-2.5 h-2.5 rounded-sm shrink-0" 
                          style="background-color: {cls.color}"
                          aria-hidden="true"
                        ></span>
                        <span class="flex-1">{cls.name}</span>
                        <Kbd class="text-[10px] px-1.5 py-0.5">{i + 1}</Kbd>
                      </Label>
                    </div>
                  {/each}
                </RadioGroup>
              {:else}
                <p class="text-xs text-muted-foreground">클래스가 없습니다</p>
              {/if}
            </div>
          </ScrollArea>
        </Resizable.Pane>
        <Resizable.Handle />
        <!-- Labels Section -->
        <Resizable.Pane>
          <ScrollArea class="h-full">
            <div class="p-3">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Labels</h3>
              {#if workspaceManager.currentLabels.length > 0}
                <div class="space-y-1" role="list" aria-label="라벨 목록">
                  {#each workspaceManager.currentLabels as label}
                    {@const isVisible = labelVisibility[label.id] ?? true}
                    <div
                      class="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors hover:bg-muted/50 border border-transparent"
                      role="listitem"
                    >
                      <span 
                        class="w-3 h-3 rounded-sm shrink-0 ring-1 ring-black/10" 
                        style="background-color: {label.color}"
                        aria-hidden="true"
                      ></span>
                      <span class="flex-1 truncate">{label.className}</span>
                      <div class="flex items-center gap-0.5 ml-auto">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          class="h-6 w-6 text-muted-foreground hover:text-foreground"
                          aria-label="{label.className} 라벨 보이기/숨기기"
                          onclick={() => toggleLabelVisibility(label.id)}
                        >
                          {#if isVisible}
                            <Eye class="h-3.5 w-3.5" />
                          {:else}
                            <EyeOff class="h-3.5 w-3.5" />
                          {/if}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          class="h-6 w-6 text-muted-foreground hover:text-destructive"
                          aria-label="{label.className} 라벨 삭제"
                        >
                          <Trash2 class="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-xs text-muted-foreground">라벨이 없습니다</p>
              {/if}
            </div>
          </ScrollArea>
        </Resizable.Pane>
      </Resizable.PaneGroup>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</aside>