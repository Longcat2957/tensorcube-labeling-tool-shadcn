<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getContext } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import { Play } from '@lucide/svelte'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { toast } from 'svelte-sonner'
  import type { ValidationRules, ValidationReport } from '../../../../shared/types'

  const { children }: { children: Snippet } = $props()
  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  let open = $state(false)
  let running = $state(false)
  let report = $state<ValidationReport | null>(null)

  let minBoxAreaEnabled = $state(false)
  let minBoxArea = $state(100)
  let minBoxSideEnabled = $state(false)
  let minBoxSide = $state(8)
  let allowOutOfBounds = $state(true) // true = 허용 (검사 안함)
  let duplicateEnabled = $state(false)
  let duplicateIou = $state(0.95)
  let minBoxesPerClassEnabled = $state(false)
  let minBoxesPerClass = $state(10)

  const inputCls =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

  function buildRules(): ValidationRules {
    return {
      minBoxArea: minBoxAreaEnabled ? minBoxArea : undefined,
      minBoxSide: minBoxSideEnabled ? minBoxSide : undefined,
      allowOutOfBounds,
      duplicateIou: duplicateEnabled ? duplicateIou : undefined,
      minBoxesPerClass: minBoxesPerClassEnabled ? minBoxesPerClass : undefined
    }
  }

  async function runCheck() {
    if (!workspaceManager.workspacePath) return
    running = true
    try {
      report = await window.api.workspace.runValidation(
        workspaceManager.workspacePath,
        buildRules()
      )
      const total = report.violations.length
      if (total === 0) toast.success('위반 사항 없음')
      else toast.warning(`위반 ${total}건 발견`)
    } catch (err) {
      toast.error('Validation 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      running = false
    }
  }

  async function jumpToImage(imageId: string) {
    if (!imageId) return
    const idx = workspaceManager.imageList.findIndex((i) => i.id === imageId)
    if (idx >= 0) {
      open = false
      await workspaceManager.goToImage(idx)
    }
  }

  const kindLabel: Record<string, string> = {
    tooSmall: '면적 미달',
    tooThin: '변 길이 미달',
    outOfBounds: '경계 초과',
    duplicate: '중복 박스',
    classUnderMin: '클래스 샘플 부족'
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Validation 규칙 검사</Dialog.Title>
      <Dialog.Description>라벨 품질 검사 후 Export 전 위반 사항을 확인합니다.</Dialog.Description>
    </Dialog.Header>

    <ScrollArea class="h-[480px]">
      <div class="space-y-4 p-1">
        <!-- 규칙 -->
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <input id="r1" type="checkbox" bind:checked={minBoxAreaEnabled} />
            <Label for="r1" class="cursor-pointer">최소 박스 면적 (px²)</Label>
            <input
              type="number"
              class="{inputCls} w-32"
              min="1"
              bind:value={minBoxArea}
              disabled={!minBoxAreaEnabled}
            />
          </div>
          <div class="flex items-center gap-2">
            <input id="r2" type="checkbox" bind:checked={minBoxSideEnabled} />
            <Label for="r2" class="cursor-pointer">최소 변 길이 (px)</Label>
            <input
              type="number"
              class="{inputCls} w-32"
              min="1"
              bind:value={minBoxSide}
              disabled={!minBoxSideEnabled}
            />
          </div>
          <div class="flex items-center gap-2">
            <input id="r3" type="checkbox" bind:checked={allowOutOfBounds} />
            <Label for="r3" class="cursor-pointer">경계 초과 허용 (체크 해제 시 위반 처리)</Label>
          </div>
          <div class="flex items-center gap-2">
            <input id="r4" type="checkbox" bind:checked={duplicateEnabled} />
            <Label for="r4" class="cursor-pointer">동일 클래스 중복 (IoU ≥)</Label>
            <input
              type="number"
              class="{inputCls} w-32"
              min="0"
              max="1"
              step="0.01"
              bind:value={duplicateIou}
              disabled={!duplicateEnabled}
            />
          </div>
          <div class="flex items-center gap-2">
            <input id="r5" type="checkbox" bind:checked={minBoxesPerClassEnabled} />
            <Label for="r5" class="cursor-pointer">클래스별 최소 박스 수</Label>
            <input
              type="number"
              class="{inputCls} w-32"
              min="1"
              bind:value={minBoxesPerClass}
              disabled={!minBoxesPerClassEnabled}
            />
          </div>
        </div>

        <div class="flex justify-end">
          <Button onclick={runCheck} disabled={running}>
            <Play class="size-4 mr-1" />
            {running ? '검사 중…' : '검사 실행'}
          </Button>
        </div>

        {#if report}
          <div class="border rounded-md p-3 space-y-2">
            <div class="text-sm">
              스캔: 이미지 {report.scanned.images}개 / 어노테이션 {report.scanned.annotations}개
            </div>
            <div class="text-sm font-medium">
              위반: {report.violations.length}건
              {#if report.violations.length > 0}
                <span class="text-xs text-muted-foreground">
                  (
                  {#each Object.entries(report.byKind).filter((e) => e[1] > 0) as entry, i (entry[0])}
                    {i > 0 ? ', ' : ''}{kindLabel[entry[0]] ?? entry[0]}: {entry[1]}
                  {/each}
                  )
                </span>
              {/if}
            </div>

            {#if report.violations.length > 0}
              <ScrollArea class="h-56 border rounded">
                <div class="divide-y">
                  {#each report.violations.slice(0, 200) as v, i (i)}
                    <button
                      class="flex w-full items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-accent"
                      onclick={() => jumpToImage(v.imageId)}
                      disabled={!v.imageId}
                    >
                      <div class="flex flex-col min-w-0">
                        <span class="text-[10px] font-semibold uppercase">
                          {kindLabel[v.kind] ?? v.kind}
                        </span>
                        <span class="truncate">
                          {v.imageId ? `${v.imageId} · ` : ''}{v.message}
                        </span>
                      </div>
                      {#if v.imageId}
                        <span class="text-[10px] text-primary shrink-0 ml-2">→ 이동</span>
                      {/if}
                    </button>
                  {/each}
                  {#if report.violations.length > 200}
                    <p class="px-3 py-2 text-xs text-muted-foreground">
                      {report.violations.length - 200}건 더 있음 (상위 200건만 표시)
                    </p>
                  {/if}
                </div>
              </ScrollArea>
            {/if}
          </div>
        {/if}
      </div>
    </ScrollArea>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>닫기</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
