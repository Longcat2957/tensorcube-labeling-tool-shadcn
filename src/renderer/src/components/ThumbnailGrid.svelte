<script lang="ts">
  import { getContext, onMount, tick, untrack } from 'svelte'
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

  // imageList 의 id → fullIdx 인덱스. visibleItems 계산 시 O(1) 룩업으로 사용.
  // 기존 findIndex 는 O(n) 이라 1만 장 × 50 가시 항목 = 50만 비교/스크롤이 주요 렉 원인.
  const fullIdxById = $derived.by(() => {
    // 반응성 안 됨 — derived 안에서 즉시 채워 즉시 사용하는 lookup 테이블이라 plain Map 사용.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, number>()
    const fullList = workspaceManager.imageList
    for (let i = 0; i < fullList.length; i++) {
      map.set(fullList[i].id, i)
    }
    return map
  })

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
    for (let i = startIdx; i < endIdx; i++) {
      const img = list[i]
      if (!img) continue
      out.push({
        idx: fullIdxById.get(img.id) ?? i,
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

  // 워크스페이스 전환 시 stale URL 캐시 비우기.
  //
  // CRITICAL: 캐시 정리 작업은 untrack 로 감싸야 함.
  // $effect 안에서 Object.keys(thumbUrls) / thumbUrls[k] 읽기는 Svelte 5 proxy 의
  // ownKeys 트랩을 통해 thumbUrls 의 키 변경 전체를 구독해버린다.
  // 그러면 ensureThumb 가 thumbUrls[id] = url 로 키를 추가하는 순간 effect 가
  // 재실행되어 방금 추가한 키를 삭제 → 무한 사이클 + lag + 썸네일 미표시.
  $effect(() => {
    void workspaceManager.workspacePath // 유일한 reactive dep
    untrack(() => {
      for (const k of Object.keys(thumbUrls)) delete thumbUrls[k]
      pending.clear()
    })
  })

  // 보이는 항목들의 썸네일을 보장
  $effect(() => {
    for (const item of visibleItems) {
      void ensureThumb(item.id)
    }
  })

  function handleScroll(): void {
    scrollTop = scrollEl.scrollTop
  }

  async function goto(idx: number): Promise<void> {
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
                class="bg-muted/50 flex items-center justify-center relative"
                style="width: {THUMB_SIZE}px; height: {THUMB_SIZE}px;"
              >
                {#if thumbUrls[item.id]}
                  <img
                    src={thumbUrls[item.id]}
                    alt={item.id}
                    class="max-w-full max-h-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                {:else}
                  <!-- Skeleton: animate-pulse 그라디언트로 로딩 표시 -->
                  <div
                    class="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 via-muted/60 to-muted/40"
                    aria-hidden="true"
                  ></div>
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
