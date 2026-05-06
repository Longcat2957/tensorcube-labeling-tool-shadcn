<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getContext } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs/index.js'
  import { BarChart3, Filter, RefreshCw, X } from '@lucide/svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'

  const { children }: { children: Snippet } = $props()
  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  let open = $state(false)
  let activeTab = $state<'stats' | 'filter'>('stats')

  const stats = $derived(workspaceManager.workspaceStats)
  const filter = $derived(workspaceManager.imageFilter)
  const classes = $derived(workspaceManager.classList)

  const inputCls =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

  async function handleOpen(next: boolean) {
    open = next
    if (next && !stats) await workspaceManager.refreshStats()
  }

  function toggleStatus(s: 'none' | 'working' | 'completed') {
    const cur = filter.statuses
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
    workspaceManager.setImageFilter({ statuses: next })
  }

  function maxValue(bins: { count: number }[]): number {
    return Math.max(1, ...bins.map((b) => b.count))
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpen}>
  <Dialog.Trigger>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>통계 & 필터</Dialog.Title>
      <Dialog.Description>워크스페이스 라벨 통계와 이미지 리스트 필터.</Dialog.Description>
    </Dialog.Header>

    <Tabs value={activeTab} onValueChange={(v) => (activeTab = v as typeof activeTab)}>
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="stats"><BarChart3 class="size-4 mr-1" />통계</TabsTrigger>
        <TabsTrigger value="filter"><Filter class="size-4 mr-1" />필터</TabsTrigger>
      </TabsList>

      <ScrollArea class="h-[420px]">
        <!-- 통계 -->
        <TabsContent value="stats" class="space-y-4 p-1">
          <div class="flex items-center justify-between">
            <p class="text-xs text-muted-foreground">집계는 모든 라벨 파일을 스캔합니다.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={workspaceManager.statsLoading}
              onclick={() => workspaceManager.refreshStats()}
            >
              <RefreshCw class="size-4 mr-1" />
              새로고침
            </Button>
          </div>

          {#if !stats}
            <p class="text-sm text-muted-foreground">
              {workspaceManager.statsLoading ? '집계 중…' : '데이터가 없습니다.'}
            </p>
          {:else}
            <div class="grid grid-cols-4 gap-2 text-sm">
              <div class="border rounded-md p-2">
                <div class="text-xs text-muted-foreground">전체 이미지</div>
                <div class="text-lg font-semibold tabular-nums">{stats.totalImages}</div>
              </div>
              <div class="border rounded-md p-2">
                <div class="text-xs text-muted-foreground">전체 어노테이션</div>
                <div class="text-lg font-semibold tabular-nums">{stats.totalAnnotations}</div>
              </div>
              <div class="border rounded-md p-2">
                <div class="text-xs text-muted-foreground">빈 이미지</div>
                <div class="text-lg font-semibold tabular-nums">{stats.emptyImages}</div>
              </div>
              <div class="border rounded-md p-2">
                <div class="text-xs text-muted-foreground">완료 / 작업중 / 미작업</div>
                <div class="text-sm font-semibold tabular-nums">
                  {stats.status.completed} / {stats.status.working} / {stats.status.none}
                </div>
              </div>
            </div>

            <div>
              <h3 class="text-xs font-semibold mb-2 text-muted-foreground uppercase">
                클래스별 어노테이션
              </h3>
              <div class="space-y-1">
                {#each classes as cls (cls.id)}
                  {@const count = stats.perClassCounts[cls.id] ?? 0}
                  {@const max = Math.max(1, ...Object.values(stats.perClassCounts))}
                  <div class="flex items-center gap-2 text-sm">
                    <span class="w-32 truncate">{cls.name || `class ${cls.id}`}</span>
                    <div class="flex-1 h-3 bg-muted rounded overflow-hidden">
                      <div class="h-full bg-primary" style="width: {(count / max) * 100}%"></div>
                    </div>
                    <span class="w-12 text-right tabular-nums text-xs">{count}</span>
                  </div>
                {/each}
              </div>
            </div>

            <div>
              <h3 class="text-xs font-semibold mb-2 text-muted-foreground uppercase">
                박스 크기 분포 (px²)
              </h3>
              <div class="grid grid-cols-6 gap-1 items-end h-24">
                {#each stats.sizeHistogram as bin (bin.label)}
                  {@const m = maxValue(stats.sizeHistogram)}
                  <div class="flex flex-col items-center gap-1">
                    <div
                      class="w-full bg-primary/70 rounded-t"
                      style="height: {(bin.count / m) * 100}%; min-height: 1px;"
                      title="{bin.count}건"
                    ></div>
                    <div class="text-[10px] text-muted-foreground">{bin.label}</div>
                    <div class="text-[10px] tabular-nums">{bin.count}</div>
                  </div>
                {/each}
              </div>
            </div>

            <div>
              <h3 class="text-xs font-semibold mb-2 text-muted-foreground uppercase">
                Aspect ratio (w/h)
              </h3>
              <div class="grid grid-cols-5 gap-1 items-end h-24">
                {#each stats.aspectHistogram as bin (bin.label)}
                  {@const m = maxValue(stats.aspectHistogram)}
                  <div class="flex flex-col items-center gap-1">
                    <div
                      class="w-full bg-primary/70 rounded-t"
                      style="height: {(bin.count / m) * 100}%; min-height: 1px;"
                      title="{bin.count}건"
                    ></div>
                    <div class="text-[10px] text-muted-foreground">{bin.label}</div>
                    <div class="text-[10px] tabular-nums">{bin.count}</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </TabsContent>

        <!-- 필터 -->
        <TabsContent value="filter" class="space-y-4 p-1">
          <div class="space-y-2">
            <Label>이미지 상태</Label>
            <div class="flex gap-2">
              {#each ['none', 'working', 'completed'] as s (s)}
                <Button
                  variant={filter.statuses.includes(s as 'none' | 'working' | 'completed')
                    ? 'default'
                    : 'outline'}
                  size="sm"
                  onclick={() => toggleStatus(s as 'none' | 'working' | 'completed')}
                >
                  {s === 'none' ? '미작업' : s === 'working' ? '작업중' : '완료'}
                </Button>
              {/each}
            </div>
            <p class="text-[10px] text-muted-foreground">아무것도 선택하지 않으면 전체 표시.</p>
          </div>

          <div class="space-y-2">
            <Label>박스 개수</Label>
            <div class="flex gap-2">
              <Button
                variant={filter.boxesEmpty === null ? 'default' : 'outline'}
                size="sm"
                onclick={() => workspaceManager.setImageFilter({ boxesEmpty: null })}
              >
                모두
              </Button>
              <Button
                variant={filter.boxesEmpty === true ? 'default' : 'outline'}
                size="sm"
                onclick={() => workspaceManager.setImageFilter({ boxesEmpty: true })}
              >
                박스 0개만
              </Button>
              <Button
                variant={filter.boxesEmpty === false ? 'default' : 'outline'}
                size="sm"
                onclick={() => workspaceManager.setImageFilter({ boxesEmpty: false })}
              >
                박스 1개 이상만
              </Button>
            </div>
            {#if !stats}
              <p class="text-[10px] text-muted-foreground">
                통계를 먼저 로드해야 박스 필터가 동작합니다.
              </p>
            {/if}
          </div>

          <div class="space-y-2">
            <Label>특정 클래스 포함</Label>
            <select
              class={inputCls}
              value={filter.classId === null ? '' : String(filter.classId)}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value
                workspaceManager.setImageFilter({ classId: v === '' ? null : Number(v) })
              }}
            >
              <option value="">— 비활성 —</option>
              {#each classes as cls (cls.id)}
                <option value={String(cls.id)}>{cls.id}: {cls.name || `class ${cls.id}`}</option>
              {/each}
            </select>
          </div>

          <div class="flex justify-end">
            <Button variant="outline" size="sm" onclick={() => workspaceManager.clearImageFilter()}>
              <X class="size-4 mr-1" />
              필터 초기화
            </Button>
          </div>
        </TabsContent>
      </ScrollArea>
    </Tabs>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>닫기</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
