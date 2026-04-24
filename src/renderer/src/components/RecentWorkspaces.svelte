<script lang="ts">
  import { getContext, onMount } from 'svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Clock, X } from '@lucide/svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'

  interface RecentItem {
    path: string
    name: string
    lastOpened: number
  }

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  let recent = $state<RecentItem[]>([])
  let loading = $state(false)

  async function refresh(): Promise<void> {
    recent = await window.api.workspace.getRecent()
  }

  async function open(path: string): Promise<void> {
    if (loading) return
    loading = true
    const ok = await workspaceManager.openWorkspace(path)
    loading = false
    if (!ok) {
      // 실패 시 목록에서 제거 (경로가 이동/삭제된 경우 대응)
      await window.api.workspace.removeRecent(path)
      await refresh()
    }
  }

  async function removeOne(e: MouseEvent, path: string): Promise<void> {
    e.stopPropagation()
    await window.api.workspace.removeRecent(path)
    await refresh()
  }

  function formatTime(ts: number): string {
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  onMount(() => {
    void refresh()
  })
</script>

{#if recent.length > 0}
  <div class="mt-8 mx-auto w-full max-w-md text-left">
    <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      <Clock class="size-4" />
      최근 워크스페이스
    </h2>
    <ul class="space-y-1 rounded-md border bg-background">
      {#each recent as item (item.path)}
        <li>
          <button
            class="group flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
            onclick={() => open(item.path)}
            disabled={loading}
          >
            <div class="flex-1 overflow-hidden">
              <div class="truncate font-medium">{item.name}</div>
              <div class="truncate text-xs text-muted-foreground">{item.path}</div>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatTime(item.lastOpened)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="목록에서 제거"
              onclick={(e) => removeOne(e, item.path)}
            >
              <X class="size-3.5" />
            </Button>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}
