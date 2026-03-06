<script lang="ts">
  import { getContext } from "svelte";
  import { RadioGroup, RadioGroupItem } from "$lib/components/ui/radio-group/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);
</script>

<ScrollArea class="h-full">
  <div class="p-3">
    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Classes</h3>
    {#if workspaceManager.classList.length > 0}
      <RadioGroup
        value={String(workspaceManager.selectedClassId)}
        onValueChange={(value) => workspaceManager.setSelectedClassId(parseInt(value))}
        class="gap-1"
        aria-label="클래스 선택"
      >
        {#each workspaceManager.classList as cls, i}
          <div class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors cursor-pointer {workspaceManager.selectedClassId === cls.id ? 'bg-muted border border-primary/50' : 'hover:bg-muted/50 border border-transparent'}">
            <RadioGroupItem value={String(cls.id)} id={`class-${cls.id}`} aria-label="{cls.name} 클래스" />
            <Label for={`class-${cls.id}`} class="flex items-center gap-2 cursor-pointer flex-1 text-sm">
              <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background-color: {cls.color}" aria-hidden="true"></span>
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
