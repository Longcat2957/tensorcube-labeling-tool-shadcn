<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getContext } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import { Plus, Trash2, Settings } from '@lucide/svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { toast } from 'svelte-sonner'

  const { children }: { children: Snippet } = $props()

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  let open = $state(false)
  let workspaceName = $state('')
  let classes = $state<{ id: number; name: string }[]>([])
  let nextClassId = $state(0)
  let isSaving = $state(false)

  // 클래스별 어노테이션 개수 (scanClassUsage 결과)
  let classUsage = $state<Record<number, number>>({})

  // 고아 처리 모달 상태
  let orphanDialog = $state<{
    open: boolean
    classId: number
    className: string
    count: number
    action: 'delete' | 'reassign'
    targetClassId: number | null
  }>({ open: false, classId: -1, className: '', count: 0, action: 'delete', targetClassId: null })

  // 일괄 재지정 UI 상태
  let bulkFrom = $state<number | null>(null)
  let bulkTo = $state<number | null>(null)
  let bulkRunning = $state(false)

  function syncFormFromWorkspace() {
    const config = workspaceManager.workspaceConfig

    if (!config) {
      workspaceName = ''
      classes = []
      nextClassId = 0
      return
    }

    workspaceName = config.workspace

    const nextClasses = Object.entries(config.names)
      .map(([id, name]) => ({ id: Number(id), name }))
      .sort((a, b) => a.id - b.id)

    classes = nextClasses.length > 0 ? nextClasses : [{ id: 0, name: '' }]
    nextClassId = classes.reduce((maxId, item) => Math.max(maxId, item.id), -1) + 1
  }

  const currentLabelingTypeLabel = $derived(
    workspaceManager.workspaceConfig?.labeling_type === 2
      ? 'Oriented Bounding Box (OBB)'
      : 'Bounding Box (BB)'
  )

  async function handleOpenChange(nextOpen: boolean) {
    open = nextOpen

    if (nextOpen) {
      syncFormFromWorkspace()
      // 클래스 사용량 스캔
      if (workspaceManager.workspacePath) {
        try {
          classUsage = await window.api.workspace.scanClassUsage(workspaceManager.workspacePath)
        } catch {
          classUsage = {}
        }
      }
    }
  }

  function addClass() {
    classes = [...classes, { id: nextClassId, name: '' }]
    nextClassId += 1
  }

  function removeClass(id: number) {
    if (classes.length === 1) return

    const count = classUsage[id] ?? 0
    if (count > 0) {
      // 어노테이션이 있으면 고아 처리 다이얼로그 표시
      const cls = classes.find((c) => c.id === id)
      orphanDialog = {
        open: true,
        classId: id,
        className: cls?.name ?? `Class ${id}`,
        count,
        action: 'delete',
        targetClassId: null
      }
      return
    }

    // 사용 중이지 않으면 즉시 제거
    classes = classes.filter((item) => item.id !== id)
  }

  async function confirmOrphanHandling() {
    if (!workspaceManager.workspacePath) return
    const { classId, action, targetClassId } = orphanDialog

    if (action === 'reassign' && (targetClassId === null || targetClassId === classId)) {
      toast.error('재할당할 대상 클래스를 선택하세요.')
      return
    }

    const toId = action === 'delete' ? null : targetClassId
    const result = await window.api.workspace.reassignClass(
      workspaceManager.workspacePath,
      classId,
      toId
    )

    classes = classes.filter((item) => item.id !== classId)
    // classUsage 갱신
    const nextUsage = { ...classUsage }
    delete nextUsage[classId]
    if (toId !== null) {
      nextUsage[toId] = (nextUsage[toId] ?? 0) + result.updatedAnnotations
    }
    classUsage = nextUsage

    orphanDialog = { ...orphanDialog, open: false }

    // 현재 이미지 라벨 다시 읽어와 반영
    await workspaceManager.loadCurrentImageLabel()

    if (action === 'delete') {
      toast.success(`${result.deletedAnnotations}개 어노테이션이 삭제되었습니다.`)
    } else {
      toast.success(`${result.updatedAnnotations}개 어노테이션이 재지정되었습니다.`)
    }
  }

  async function runBulkReassign() {
    if (!workspaceManager.workspacePath) return
    if (bulkFrom === null) {
      toast.error('원본 클래스를 선택하세요.')
      return
    }
    if (bulkTo === null) {
      toast.error('대상 클래스를 선택하세요.')
      return
    }
    if (bulkFrom === bulkTo) {
      toast.error('원본과 대상이 같습니다.')
      return
    }
    bulkRunning = true
    try {
      const result = await window.api.workspace.reassignClass(
        workspaceManager.workspacePath,
        bulkFrom,
        bulkTo
      )
      // classUsage 갱신
      const nextUsage = { ...classUsage }
      const moved = nextUsage[bulkFrom] ?? 0
      nextUsage[bulkFrom] = 0
      nextUsage[bulkTo] = (nextUsage[bulkTo] ?? 0) + moved
      classUsage = nextUsage
      await workspaceManager.loadCurrentImageLabel()
      toast.success(`${result.updatedAnnotations}개 어노테이션을 재지정했습니다.`)
      bulkFrom = null
      bulkTo = null
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '재지정 실패')
    } finally {
      bulkRunning = false
    }
  }

  async function handleSave() {
    if (!workspaceManager.workspacePath) {
      toast.error('열려 있는 워크스페이스가 없습니다.')
      return
    }

    if (!workspaceName.trim()) {
      toast.error('워크스페이스 이름을 입력하세요.')
      return
    }

    if (classes.length === 0) {
      toast.error('최소 1개의 클래스를 정의해야 합니다.')
      return
    }

    if (classes.some((item) => !item.name.trim())) {
      toast.error('모든 클래스 이름을 입력하세요.')
      return
    }

    const normalizedNames = classes.map((item) => item.name.trim().toLowerCase())
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      toast.error('클래스 이름은 중복될 수 없습니다.')
      return
    }

    isSaving = true

    const success = await workspaceManager.updateWorkspaceConfigFile({
      workspace: workspaceName.trim(),
      labelingType: workspaceManager.workspaceConfig?.labeling_type ?? 1,
      classes: classes
        .map((item) => ({ id: item.id, name: item.name.trim() }))
        .sort((a, b) => a.id - b.id)
    })

    isSaving = false

    if (success) {
      toast.success('프로젝트 설정이 저장되었습니다.')
      open = false
    } else {
      toast.error('프로젝트 설정 저장에 실패했습니다.')
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Trigger disabled={!workspaceManager.isWorkspaceOpen}>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Settings class="size-4" />
        프로젝트 설정
      </Dialog.Title>
      <Dialog.Description>
        현재 워크스페이스의 이름, 라벨링 타입, 클래스 구성을 수정합니다.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6 py-4">
      <div class="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4 text-sm">
        <div>
          <div class="text-xs text-muted-foreground">이미지 수</div>
          <div class="font-medium">{workspaceManager.workspaceConfig?.image_count ?? 0}개</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">생성일</div>
          <div class="font-medium">{workspaceManager.workspaceConfig?.created_at ?? '-'}</div>
        </div>
      </div>

      <div class="space-y-2">
        <Label for="project-settings-workspace-name">워크스페이스 이름</Label>
        <input
          id="project-settings-workspace-name"
          type="text"
          bind:value={workspaceName}
          placeholder="워크스페이스 이름을 입력하세요"
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-2">
        <Label>라벨링 타입</Label>
        <div class="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div class="font-medium">{currentLabelingTypeLabel}</div>
          <div class="mt-1 text-xs text-muted-foreground">
            워크스페이스 생성 후 라벨링 타입은 변경할 수 없습니다.
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>클래스 정의</Label>
          <Button variant="ghost" size="sm" onclick={addClass}>
            <Plus class="size-4 mr-1" />
            추가
          </Button>
        </div>
        <ScrollArea class="h-48 rounded-md border p-2">
          <div class="space-y-2">
            {#each classes as cls (cls.id)}
              {@const usage = classUsage[cls.id] ?? 0}
              <div class="flex items-center gap-2">
                <span class="w-8 text-sm text-muted-foreground">{cls.id}</span>
                <input
                  type="text"
                  bind:value={cls.name}
                  placeholder="클래스 이름"
                  class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span
                  class="w-14 text-right text-xs tabular-nums text-muted-foreground"
                  title="이 클래스의 어노테이션 개수"
                >
                  {usage > 0 ? `${usage}개` : '—'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onclick={() => removeClass(cls.id)}
                  disabled={classes.length === 1}
                  class="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            {/each}
          </div>
        </ScrollArea>
      </div>

      <!-- 클래스 일괄 재지정 -->
      <div class="space-y-2">
        <Label>클래스 일괄 재지정</Label>
        <p class="text-xs text-muted-foreground">
          특정 클래스의 모든 어노테이션을 다른 클래스로 이동합니다. 워크스페이스 전체 라벨 파일에
          즉시 반영됩니다.
        </p>
        <div class="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <select
            bind:value={bulkFrom}
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value={null}>원본 클래스</option>
            {#each classes as cls (cls.id)}
              <option value={cls.id}>#{cls.id} {cls.name} ({classUsage[cls.id] ?? 0})</option>
            {/each}
          </select>
          <select
            bind:value={bulkTo}
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value={null}>대상 클래스</option>
            {#each classes as cls (cls.id)}
              <option value={cls.id}>#{cls.id} {cls.name}</option>
            {/each}
          </select>
          <Button
            onclick={runBulkReassign}
            disabled={bulkRunning || bulkFrom === null || bulkTo === null}
          >
            {bulkRunning ? '처리 중...' : '재지정'}
          </Button>
        </div>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => handleOpenChange(false)} disabled={isSaving}
        >취소</Button
      >
      <Button onclick={handleSave} disabled={isSaving || !workspaceManager.isWorkspaceOpen}>
        {isSaving ? '저장 중...' : '저장'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- 고아 처리 다이얼로그 (클래스 삭제 시 사용 중인 어노테이션 처리) -->
<Dialog.Root
  open={orphanDialog.open}
  onOpenChange={(v) => (orphanDialog = { ...orphanDialog, open: v })}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>클래스 삭제 — 어노테이션 처리</Dialog.Title>
      <Dialog.Description>
        <b>{orphanDialog.className}</b> (#{orphanDialog.classId}) 클래스가
        <b>{orphanDialog.count}개</b> 어노테이션에 사용 중입니다. 어떻게 처리할지 선택하세요.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 py-2 text-sm">
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="orphan-action"
          value="delete"
          checked={orphanDialog.action === 'delete'}
          onchange={() => (orphanDialog = { ...orphanDialog, action: 'delete' })}
        />
        어노테이션 모두 삭제
      </label>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="orphan-action"
          value="reassign"
          checked={orphanDialog.action === 'reassign'}
          onchange={() => (orphanDialog = { ...orphanDialog, action: 'reassign' })}
        />
        다른 클래스로 재지정
      </label>
      {#if orphanDialog.action === 'reassign'}
        <select
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={orphanDialog.targetClassId}
          onchange={(e) => {
            const raw = (e.target as HTMLSelectElement).value
            orphanDialog = { ...orphanDialog, targetClassId: raw === '' ? null : Number(raw) }
          }}
        >
          <option value="">대상 클래스 선택</option>
          {#each classes.filter((c) => c.id !== orphanDialog.classId) as cls (cls.id)}
            <option value={cls.id}>#{cls.id} {cls.name}</option>
          {/each}
        </select>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (orphanDialog = { ...orphanDialog, open: false })}>
        취소
      </Button>
      <Button onclick={confirmOrphanHandling}>확인</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
