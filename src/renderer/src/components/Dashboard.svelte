<script lang="ts">
  import { getContext } from 'svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { CheckCircle2, Clock, Circle } from '@lucide/svelte'

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  const stats = $derived.by(() => {
    const list = workspaceManager.imageList
    const total = list.length
    let completed = 0
    let working = 0
    let untouched = 0
    for (const img of list) {
      if (img.status === 'completed') completed++
      else if (img.status === 'working') working++
      else untouched++
    }
    return { total, completed, working, untouched }
  })

  function pct(n: number, total: number): number {
    if (total === 0) return 0
    return Math.round((n / total) * 1000) / 10
  }

  const info = $derived(workspaceManager.workspaceInfo)
  const config = $derived(workspaceManager.workspaceConfig)
  const classes = $derived(workspaceManager.classList)
</script>

<div class="h-full overflow-auto p-8">
  <div class="mx-auto max-w-4xl space-y-8">
    <header>
      <h1 class="text-3xl font-bold tracking-tight">
        {info?.name ?? '-'}
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {info?.labelingType ?? '-'} 라벨링 · 최근 수정 {info?.lastModified ?? '-'}
      </p>
    </header>

    <!-- 진척도 -->
    <section class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        작업 진행 상황
      </h2>

      <div class="grid grid-cols-3 gap-4">
        <div class="rounded-lg border bg-card p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 class="size-4 text-green-500" />
            완료 (_C)
          </div>
          <div class="mt-2 text-2xl font-semibold tabular-nums">{stats.completed}</div>
          <div class="text-xs text-muted-foreground">{pct(stats.completed, stats.total)}%</div>
        </div>
        <div class="rounded-lg border bg-card p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock class="size-4 text-amber-500" />
            작업 중 (_W)
          </div>
          <div class="mt-2 text-2xl font-semibold tabular-nums">{stats.working}</div>
          <div class="text-xs text-muted-foreground">{pct(stats.working, stats.total)}%</div>
        </div>
        <div class="rounded-lg border bg-card p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Circle class="size-4 text-muted-foreground" />
            미작업
          </div>
          <div class="mt-2 text-2xl font-semibold tabular-nums">{stats.untouched}</div>
          <div class="text-xs text-muted-foreground">{pct(stats.untouched, stats.total)}%</div>
        </div>
      </div>

      <!-- 누적 바 -->
      <div class="space-y-2">
        <div class="flex h-3 overflow-hidden rounded-full bg-muted">
          <div
            class="bg-green-500 transition-all"
            style="width: {pct(stats.completed, stats.total)}%"
            aria-label="완료 비율"
          ></div>
          <div
            class="bg-amber-500 transition-all"
            style="width: {pct(stats.working, stats.total)}%"
            aria-label="작업 중 비율"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>총 {stats.total}장</span>
          <span>완료율 {pct(stats.completed, stats.total)}%</span>
        </div>
      </div>
    </section>

    <!-- 클래스 -->
    <section class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        클래스 ({classes.length}종)
      </h2>

      {#if classes.length === 0}
        <p class="text-sm text-muted-foreground">정의된 클래스가 없습니다.</p>
      {:else}
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {#each classes as cls (cls.id)}
            <div class="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
              <span
                class="size-3 shrink-0 rounded-sm"
                style="background-color: {cls.color}"
                aria-hidden="true"
              ></span>
              <span class="truncate text-sm">{cls.name}</span>
              <span class="ml-auto text-xs text-muted-foreground tabular-nums">#{cls.id}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- 메타 -->
    <section class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        메타 정보
      </h2>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">경로</dt>
        <dd class="truncate font-mono text-xs" title={info?.path ?? ''}>{info?.path ?? '-'}</dd>
        <dt class="text-muted-foreground">생성일</dt>
        <dd>{config?.created_at ?? '-'}</dd>
        <dt class="text-muted-foreground">최근 수정</dt>
        <dd>{config?.last_modified_at ?? '-'}</dd>
      </dl>
    </section>

    <p class="text-xs text-muted-foreground">
      참고: 클래스별 어노테이션 집계와 상세 차트는 추후 버전에서 제공됩니다.
    </p>
  </div>
</div>
