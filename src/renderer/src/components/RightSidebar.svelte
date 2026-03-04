<script lang="ts">
  import { Eye, EyeOff, Trash2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { RadioGroup, RadioGroupItem } from "$lib/components/ui/radio-group/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";

  // 샘플 클래스 데이터
  const classes = [
    { id: "0", name: "bicycle", color: "#3b82f6" },
    { id: "1", name: "car", color: "#ef4444" },
    { id: "2", name: "motorcycle", color: "#22c55e" },
    { id: "3", name: "airplane", color: "#f59e0b" },
  ];

  // 샘플 라벨 데이터
  const labels = [
    { id: 1, classId: "0", className: "bicycle", color: "#3b82f6", visible: true },
    { id: 2, classId: "1", className: "car", color: "#ef4444", visible: false },
  ];

  let selectedClass = $state("0");
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
      <div class="h-full overflow-auto">
        <!-- Classes Section -->
        <div class="p-3 border-b">
          <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Classes</h3>
          <RadioGroup bind:value={selectedClass} class="gap-1" aria-label="클래스 선택">
            {#each classes as cls, i}
              <div class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer">
                <RadioGroupItem value={cls.id} id={`class-${cls.id}`} aria-label="{cls.name} 클래스" />
                <Label for={`class-${cls.id}`} class="flex items-center gap-2 cursor-pointer flex-1 text-sm">
                  <span 
                    class="w-2.5 h-2.5 rounded-sm flex-shrink-0" 
                    style="background-color: {cls.color}"
                    aria-hidden="true"
                  ></span>
                  <span class="flex-1">{cls.name}</span>
                  <Kbd class="text-[10px] px-1.5 py-0.5">{i + 1}</Kbd>
                </Label>
              </div>
            {/each}
          </RadioGroup>
        </div>

        <!-- Labels Section -->
        <div class="p-3">
          <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Labels</h3>
          <div class="space-y-1" role="list" aria-label="라벨 목록">
            {#each labels as label}
              {@const isSelected = false}
              <div
                class="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors {isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'}"
                role="listitem"
              >
                <span 
                  class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-black/10" 
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
                  >
                    {#if label.visible}
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
        </div>
      </div>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</aside>