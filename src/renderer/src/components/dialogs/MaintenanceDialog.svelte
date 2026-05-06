<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getContext } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs/index.js'
  import { Camera, ShieldCheck, RotateCcw, Trash2, RefreshCw } from '@lucide/svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { toast } from 'svelte-sonner'
  import type { SnapshotInfo, IntegrityReport, IntegrityIssue } from '../../../../shared/types'

  const { children }: { children: Snippet } = $props()

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  let open = $state(false)
  let activeTab = $state<'snapshot' | 'integrity'>('snapshot')

  // Snapshot state
  let snapshots = $state<SnapshotInfo[]>([])
  let snapshotLoading = $state(false)
  let snapshotBusy = $state(false)

  // Integrity state
  let integrityReport = $state<IntegrityReport | null>(null)
  let integrityRunning = $state(false)
  let integrityFixing = $state(false)

  async function loadSnapshots() {
    if (!workspaceManager.workspacePath) return
    snapshotLoading = true
    try {
      snapshots = await window.api.workspace.listSnapshots(workspaceManager.workspacePath)
    } catch (err) {
      toast.error('스냅샷 목록 조회 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      snapshotLoading = false
    }
  }

  async function handleCreateSnapshot() {
    if (!workspaceManager.workspacePath) return
    snapshotBusy = true
    try {
      const info = await window.api.workspace.createSnapshot(workspaceManager.workspacePath)
      toast.success(`스냅샷 생성: ${info.id} (${info.fileCount}개 파일)`)
      await loadSnapshots()
    } catch (err) {
      toast.error('스냅샷 생성 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      snapshotBusy = false
    }
  }

  async function handleDeleteSnapshot(id: string) {
    if (!workspaceManager.workspacePath) return
    if (!confirm(`스냅샷 ${id} 을(를) 삭제하시겠습니까?`)) return
    snapshotBusy = true
    try {
      const ok = await window.api.workspace.deleteSnapshot(workspaceManager.workspacePath, id)
      if (ok) {
        toast.success('스냅샷 삭제됨')
        await loadSnapshots()
      } else {
        toast.error('삭제 실패')
      }
    } finally {
      snapshotBusy = false
    }
  }

  async function handleRestoreSnapshot(id: string) {
    if (!workspaceManager.workspacePath) return
    if (
      !confirm(`스냅샷 ${id} 으로 복원하시겠습니까?\n현재 라벨은 자동으로 새 스냅샷에 백업됩니다.`)
    )
      return
    snapshotBusy = true
    try {
      const ok = await window.api.workspace.restoreSnapshot(workspaceManager.workspacePath, id)
      if (ok) {
        toast.success('복원 완료. 워크스페이스를 다시 열어주세요.')
        await loadSnapshots()
      } else {
        toast.error('복원 실패')
      }
    } catch (err) {
      toast.error('복원 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      snapshotBusy = false
    }
  }

  async function handleIntegrityCheck() {
    if (!workspaceManager.workspacePath) return
    integrityRunning = true
    try {
      integrityReport = await window.api.workspace.integrityCheck(workspaceManager.workspacePath)
    } catch (err) {
      toast.error('무결성 검사 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      integrityRunning = false
    }
  }

  async function handleAutoFixAll() {
    if (!workspaceManager.workspacePath || !integrityReport) return
    const fixable = integrityReport.issues.filter((i) => i.autoFixable)
    if (fixable.length === 0) return
    if (!confirm(`자동 수정 가능한 ${fixable.length}건을 일괄 수정하시겠습니까?`)) return

    integrityFixing = true
    try {
      const result = await window.api.workspace.integrityAutoFix(
        workspaceManager.workspacePath,
        fixable
      )
      toast.success(`수정 ${result.fixed}건, 실패 ${result.failed}건`)
      await handleIntegrityCheck()
    } catch (err) {
      toast.error('자동 수정 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      integrityFixing = false
    }
  }

  async function handleAutoFixOne(issue: IntegrityIssue) {
    if (!workspaceManager.workspacePath) return
    integrityFixing = true
    try {
      const result = await window.api.workspace.integrityAutoFix(workspaceManager.workspacePath, [
        issue
      ])
      if (result.fixed > 0) {
        toast.success('수정됨')
      } else {
        const reason = result.details[0]?.reason ?? '알 수 없는 이유'
        toast.error('수정 실패: ' + reason)
      }
      await handleIntegrityCheck()
    } finally {
      integrityFixing = false
    }
  }

  function handleOpenChange(next: boolean) {
    open = next
    if (next) {
      void loadSnapshots()
      integrityReport = null
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(2)} MB`
  }

  function formatDate(ts: number): string {
    if (!ts) return '-'
    return new Date(ts).toLocaleString('ko-KR')
  }

  const issueKindLabel: Record<string, string> = {
    orphanLabel: '고아 라벨',
    missingLabel: '누락 라벨',
    badIdPattern: '잘못된 ID',
    schemaViolation: '스키마 오류'
  }

  const fixableCount = $derived(integrityReport?.issues.filter((i) => i.autoFixable).length ?? 0)
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Trigger>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>워크스페이스 유지보수</Dialog.Title>
      <Dialog.Description>스냅샷 백업과 무결성 검사를 수행합니다.</Dialog.Description>
    </Dialog.Header>

    <Tabs value={activeTab} onValueChange={(v) => (activeTab = v as typeof activeTab)}>
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="snapshot">
          <Camera class="size-4 mr-2" />
          스냅샷
        </TabsTrigger>
        <TabsTrigger value="integrity">
          <ShieldCheck class="size-4 mr-2" />
          무결성 검사
        </TabsTrigger>
      </TabsList>

      <TabsContent value="snapshot" class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            label/ 디렉토리를 .backups/ 아래에 복사합니다.
          </p>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onclick={loadSnapshots}
              disabled={snapshotLoading || snapshotBusy}
            >
              <RefreshCw class="size-4 mr-1" />
              새로고침
            </Button>
            <Button size="sm" onclick={handleCreateSnapshot} disabled={snapshotBusy}>
              <Camera class="size-4 mr-1" />
              지금 백업
            </Button>
          </div>
        </div>

        <ScrollArea class="h-72 border rounded-md">
          {#if snapshotLoading}
            <div class="p-4 text-sm text-muted-foreground text-center">로드 중…</div>
          {:else if snapshots.length === 0}
            <div class="p-4 text-sm text-muted-foreground text-center">스냅샷이 없습니다.</div>
          {:else}
            <div class="divide-y">
              {#each snapshots as snap (snap.id)}
                <div class="flex items-center justify-between px-3 py-2 text-sm">
                  <div class="flex flex-col">
                    <span class="font-mono">{snap.id}</span>
                    <span class="text-xs text-muted-foreground">
                      {formatDate(snap.createdAt)} · {snap.fileCount}개 파일 · {formatBytes(
                        snap.byteSize
                      )}
                    </span>
                  </div>
                  <div class="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => handleRestoreSnapshot(snap.id)}
                      disabled={snapshotBusy}
                    >
                      <RotateCcw class="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => handleDeleteSnapshot(snap.id)}
                      disabled={snapshotBusy}
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="integrity" class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            고아/누락 라벨, ID 패턴, JSON 스키마를 검사합니다.
          </p>
          <Button size="sm" onclick={handleIntegrityCheck} disabled={integrityRunning}>
            <ShieldCheck class="size-4 mr-1" />
            {integrityRunning ? '검사 중…' : '검사 시작'}
          </Button>
        </div>

        {#if integrityReport}
          <div class="text-sm text-muted-foreground">
            스캔: 이미지 {integrityReport.scanned.images}개 · 라벨 {integrityReport.scanned
              .labels}개 ·
            <span class="font-medium text-foreground">
              문제 {integrityReport.issues.length}건
            </span>
            {#if fixableCount > 0}
              <Button
                variant="default"
                size="sm"
                class="ml-2"
                onclick={handleAutoFixAll}
                disabled={integrityFixing}
              >
                자동 수정 {fixableCount}건
              </Button>
            {/if}
          </div>

          <ScrollArea class="h-64 border rounded-md">
            {#if integrityReport.issues.length === 0}
              <div class="p-4 text-sm text-muted-foreground text-center">문제 없음. 깨끗함.</div>
            {:else}
              <div class="divide-y">
                {#each integrityReport.issues as issue, i (i)}
                  <div class="flex items-center justify-between px-3 py-2 text-sm gap-2">
                    <div class="flex flex-col min-w-0">
                      <span class="text-xs font-medium"
                        >{issueKindLabel[issue.kind] ?? issue.kind}</span
                      >
                      <span class="truncate" title={issue.message}>{issue.message}</span>
                    </div>
                    {#if issue.autoFixable}
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => handleAutoFixOne(issue)}
                        disabled={integrityFixing}
                      >
                        수정
                      </Button>
                    {:else}
                      <span class="text-xs text-muted-foreground">수동</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </ScrollArea>
        {/if}
      </TabsContent>
    </Tabs>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>닫기</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
