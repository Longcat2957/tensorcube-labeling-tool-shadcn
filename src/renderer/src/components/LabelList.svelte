<script lang="ts">
  import { getContext } from "svelte";
  import { Eye, EyeOff, Trash2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);

  let labelVisibility = $state<Record<string, boolean>>({});

  function toggleLabelVisibility(labelId: string): void {
    labelVisibility[labelId] = !(labelVisibility[labelId] ?? true);
  }
</script>

<ScrollArea class="h-full">
  <div class="p-3">
    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Labels</h3>
    {#if workspaceManager.currentLabels.length > 0}
      <div class="space-y-1" role="list" aria-label="라벨 목록">
        {#each workspaceManager.currentLabels as label}
          {@const isVisible = labelVisibility[label.id] ?? true}
          {@const isSelected = workspaceManager.selectedLabelId === label.id}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors hover:bg-muted/50 border cursor-pointer {isSelected ? 'border-primary bg-primary/10' : 'border-transparent'}"
            role="listitem"
            onclick={() => workspaceManager.setSelectedLabelId(label.id)}
            onkeydown={(e) => e.key === 'Enter' && workspaceManager.setSelectedLabelId(label.id)}
            tabindex="0"
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
                onclick={(e) => { e.stopPropagation(); toggleLabelVisibility(label.id); }}
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
                onclick={(e) => { e.stopPropagation(); workspaceManager.deleteLabel(label.id); }}
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
