<script lang="ts">
  import { getContext, onMount, tick } from 'svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  // 그리드 가상 스크롤 — 행 단위로 렌더링
  const THUMB_SIZE = 140 // 셀 한 변 (이미지 + 라벨 공간)
  const ROW_HEIGHT = THUMB_SIZE + 28 // 썸네일 + 캡션
  const COL_GAP = 8
  const ROW_GAP = 8
  const OVERSCAN_ROWS = 2

  let scrollEl: HTMLDivElement
  let viewportHeight = $state(0)
  let viewportWidth = $state(0)
  let scrollTop = $state(0)

  const list = $derived(workspaceManager.filteredImageList)
  const total = $derived(list.length)

  const colsPerRow = $derived(
    Math.max(1, Math.floor((viewportWidth + COL_GAP) / (THUMB_SIZE + COL_GAP)))
  )
  const totalRows = $derived(Math.ceil(total / colsPerRow))
  const visibleRows = $derived(
    Math.ceil(viewportHeight / (ROW_HEIGHT + ROW_GAP)) + OVERSCAN_ROWS * 2
  )
  const startRow = $derived(
    Math.max(0, Math.floor(scrollTop / (ROW_HEIGHT + ROW_GAP)) - OVERSCAN_ROWS)
  )
  const endRow = $derived(Math.min(totalRows, startRow + visibleRows))
  const startIdx = $derived(startRow * colsPerRow)
  const endIdx = $derived(Math.min(total, endRow * colsPerRow))

  const padTop = $derived(startRow * (ROW_HEIGHT + ROW_GAP))
  const padBottom = $derived(Math.max(0, (totalRows - endRow) * (ROW_HEIGHT + ROW_GAP)))

  const visibleItems = $derived.by(() => {
    const out: { idx: number; id: string; filename: string; status: string }[] = []
    const fullList = workspaceManager.imageList
    for (let i = startIdx; i < endIdx; i++) {
      const img = list[i]
      if (!img) continue
      // currentImageIndex 비교용으로 원본 idx 매핑
      const fullIdx = fullList.findIndex((x) => x.id === img.id)
      out.push({
        idx: fullIdx >= 0 ? fullIdx : i,
        id: img.id,
        filename: img.filename,
        status: img.status
      })
    }
    return out
  })

  // 썸네일 URL 캐시
  const thumbUrls = $state<Record<string, string>>({})
  // 진행 중인 요청 큐 (중복 호출 방지) — 비반응 캐시이므로 일반 Set 사용
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pending = new Set<string>()

  async function ensureThumb(id: string): Promise<void> {
    if (thumbUrls[id] || pending.has(id)) return
    pending.add(id)
    try {
      const wp = workspaceManager.workspacePath
      if (!wp) return
      const result = await window.api.workspace.ensureThumbnail(wp, id)
      // workspace:// 프로토콜로 노출
      thumbUrls[id] = window.api.utils.getWorkspaceImageUrl(result.thumbPath)
    } catch (err) {
      console.warn('[Thumbnail] 생성 실패', id, err)
    } finally {
      pending.delete(id)
    }
  }

  // 워크스페이스 전환 시 stale URL 캐시 비우기
  $effect(() => {
    // workspacePath 의존성 — 변경 시 effect 재실행
    void workspaceManager.workspacePath
    for (const k of Object.keys(thumbUrls)) delete thumbUrls[k]
    pending.clear()
  })

  // 보이는 항목들의 썸네일을 보장
  $effect(() => {
    for (const item of visibleItems) {
      void ensureThumb(item.id)
    }
  })

  function handleScroll() {
    scrollTop = scrollEl.scrollTop
  }

  async function goto(idx: number) {
    workspaceManager.setGridViewActive(false)
    await workspaceManager.goToImage(idx)
  }

  function statusBadgeClass(status: string): string {
    if (status === 'completed') return 'bg-green-500'
    if (status === 'working') return 'bg-amber-500'
    return 'bg-muted-foreground/40'
  }

  let resizeObserver: ResizeObserver | null = null

  onMount(async () => {
    await tick()
    if (!scrollEl) return
    viewportHeight = scrollEl.clientHeight
    viewportWidth = scrollEl.clientWidth
    resizeObserver = new ResizeObserver(() => {
      if (scrollEl) {
        viewportHeight = scrollEl.clientHeight
        viewportWidth = scrollEl.clientWidth
      }
    })
    resizeObserver.observe(scrollEl)
    return () => resizeObserver?.disconnect()
  })
</script>

<div class="flex-1 h-full flex flex-col bg-background">
  <div class="flex items-center justify-between border-b px-3 py-2">
    <h2 class="text-sm font-semibold">
      썸네일 그리드 ({total}{total !== workspaceManager.imageList.length
        ? ` / ${workspaceManager.imageList.length}`
        : ''})
    </h2>
    <button
      class="text-xs px-2 py-1 border rounded hover:bg-accent"
      onclick={() => workspaceManager.setGridViewActive(false)}
    >
      그리드 닫기
    </button>
  </div>

  <div bind:this={scrollEl} onscroll={handleScroll} class="flex-1 overflow-y-auto p-3">
    {#if total === 0}
      <p class="text-sm text-muted-foreground">표시할 이미지가 없습니다.</p>
    {:else}
      <div style="padding-top: {padTop}px; padding-bottom: {padBottom}px;">
        <div
          class="grid"
          style="grid-template-columns: repeat({colsPerRow}, minmax(0, {THUMB_SIZE}px)); gap: {ROW_GAP}px {COL_GAP}px;"
        >
          {#each visibleItems as item (item.id)}
            <button
              class="relative flex flex-col items-stretch text-left rounded-md border overflow-hidden hover:ring-2 hover:ring-primary {workspaceManager.currentImageIndex ===
              item.idx
                ? 'ring-2 ring-primary'
                : ''}"
              style="width: {THUMB_SIZE}px;"
              onclick={() => goto(item.idx)}
              title={item.filename}
            >
              <div
                class="bg-muted/50 flex items-center justify-center"
                style="width: {THUMB_SIZE}px; height: {THUMB_SIZE}px;"
              >
                {#if thumbUrls[item.id]}
                  <img
                    src={thumbUrls[item.id]}
                    alt={item.id}
                    class="max-w-full max-h-full object-contain"
                    loading="lazy"
                  />
                {:else}
                  <span class="text-xs text-muted-foreground">…</span>
                {/if}
              </div>
              <div class="px-2 py-1 flex items-center gap-1 text-[10px]">
                <span
                  class="size-2 rounded-full shrink-0 {statusBadgeClass(item.status)}"
                  aria-label={item.status}
                ></span>
                <span class="font-mono tabular-nums truncate">{item.id}</span>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
