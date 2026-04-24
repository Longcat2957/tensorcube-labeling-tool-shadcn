<script lang="ts">
  import { getContext, onMount, tick } from 'svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  // 수동 가상 스크롤: 수천 장 리스트에서도 DOM 노드 수를 일정하게 유지
  const ROW_HEIGHT = 28
  const OVERSCAN = 6

  let scrollEl: HTMLDivElement
  let viewportHeight = $state(0)
  let scrollTop = $state(0)

  const total = $derived(workspaceManager.imageList.length)
  const visibleCount = $derived(Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2)
  const startIndex = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN))
  const endIndex = $derived(Math.min(total, startIndex + visibleCount))
  const visibleItems = $derived.by(() => {
    const list = workspaceManager.imageList
    const out: { idx: number; id: string; filename: string; status: string }[] = []
    for (let i = startIndex; i < endIndex; i++) {
      const img = list[i]
      if (!img) continue
      out.push({ idx: i, id: img.id, filename: img.filename, status: img.status })
    }
    return out
  })
  const padTop = $derived(startIndex * ROW_HEIGHT)
  const padBottom = $derived(Math.max(0, (total - endIndex) * ROW_HEIGHT))

  function handleScroll(): void {
    scrollTop = scrollEl.scrollTop
  }

  async function goto(index: number): Promise<void> {
    await workspaceManager.goToImage(index)
  }

  function statusDotClass(status: string): string {
    if (status === 'completed') return 'bg-green-500'
    if (status === 'working') return 'bg-amber-500'
    return 'bg-muted-foreground/40'
  }

  // 현재 이미지로 스크롤 (이미지 변경 시)
  $effect(() => {
    const idx = workspaceManager.currentImageIndex
    if (idx < 0 || !scrollEl) return
    const targetTop = idx * ROW_HEIGHT
    const targetBottom = targetTop + ROW_HEIGHT
    if (targetTop < scrollEl.scrollTop || targetBottom > scrollEl.scrollTop + viewportHeight) {
      scrollEl.scrollTop = Math.max(0, targetTop - viewportHeight / 2 + ROW_HEIGHT / 2)
    }
  })

  let resizeObserver: ResizeObserver | null = null

  onMount(async () => {
    await tick()
    if (!scrollEl) return
    viewportHeight = scrollEl.clientHeight
    resizeObserver = new ResizeObserver(() => {
      if (scrollEl) viewportHeight = scrollEl.clientHeight
    })
    resizeObserver.observe(scrollEl)
    return () => resizeObserver?.disconnect()
  })
</script>

<aside class="h-full flex flex-col border-r bg-background" aria-label="이미지 리스트">
  <div class="flex items-center justify-between border-b px-3 py-2">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Images</h2>
    <span class="text-[10px] text-muted-foreground tabular-nums">
      {workspaceManager.currentImageIndex + 1} / {total}
    </span>
  </div>

  <div
    bind:this={scrollEl}
    onscroll={handleScroll}
    class="flex-1 overflow-y-auto overflow-x-hidden"
  >
    {#if total === 0}
      <p class="p-3 text-xs text-muted-foreground">이미지가 없습니다.</p>
    {:else}
      <div style="padding-top: {padTop}px; padding-bottom: {padBottom}px;">
        {#each visibleItems as item (item.id)}
          <button
            class="flex w-full items-center gap-2 px-3 text-left text-xs transition-colors hover:bg-accent {workspaceManager.currentImageIndex ===
            item.idx
              ? 'bg-primary/10 text-primary'
              : ''}"
            style="height: {ROW_HEIGHT}px;"
            onclick={() => goto(item.idx)}
            title={item.filename}
          >
            <span
              class="size-2 shrink-0 rounded-full {statusDotClass(item.status)}"
              aria-label={item.status}
            ></span>
            <span class="flex-1 truncate font-mono tabular-nums">
              {item.id}
            </span>
            <span class="text-[9px] text-muted-foreground uppercase">
              {item.status === 'completed' ? 'C' : item.status === 'working' ? 'W' : ''}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</aside>
