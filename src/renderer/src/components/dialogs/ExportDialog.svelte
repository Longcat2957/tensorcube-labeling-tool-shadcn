<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getContext } from 'svelte'
  import { toast } from 'svelte-sonner'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'
  import { ArrowDownToLine } from '@lucide/svelte'

  const { children }: { children: Snippet } = $props()

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  const exportFormats = $derived(
    workspaceManager.isOBBMode
      ? [
          {
            value: 'yolo-obb',
            id: 'format-yolo-obb',
            title: 'YOLO-OBB',
            description: '.txt (회전 박스)'
          },
          {
            value: 'dota',
            id: 'format-dota',
            title: 'DOTA',
            description: '.txt (OBB 전용)'
          }
        ]
      : [
          {
            value: 'yolo',
            id: 'format-yolo',
            title: 'YOLO',
            description: '.txt (정규화된 좌표)'
          },
          {
            value: 'coco',
            id: 'format-coco',
            title: 'COCO',
            description: '.json (표준 포맷)'
          }
        ]
  )

  let open = $state(false)
  let exportFormat = $state('yolo')
  let resizeEnabled = $state(false)
  let resizeWidth = $state(640)
  let resizeHeight = $state(640)
  let trainRatio = $state(80)
  let valRatio = $state(10)
  let testRatio = $state(10)
  let includeCompletedOnly = $state(false)
  let requireAnnotations = $state(false)
  let outOfBounds = $state<'clip' | 'skip' | 'none'>('clip')
  let exporting = $state(false)
  let exportName = $state('')

  // 프리플라이트 상태
  interface PreflightResult {
    totalItems: number
    totalAnnotations: number
    outOfBoundsCount: number
    skippedCount: number
    splitCounts: { train: number; val: number; test: number }
    perClassCounts: Record<number, number>
    warnings: string[]
  }
  let preflight = $state<PreflightResult | null>(null)
  let pendingOutputPath = $state<string | null>(null)
  let checkingPreflight = $state(false)

  function createDefaultExportName(): string {
    const workspaceName = workspaceManager.workspaceConfig?.workspace ?? 'workspace'
    const formatName = exportFormat
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    return `${workspaceName}-${formatName}-${yyyy}${mm}${dd}-${hh}${mi}`
  }

  /** 1단계: 설정 검증 + 프리플라이트 집계 → 확인 단계로 진입 */
  async function handlePreflight() {
    if (!workspaceManager.workspacePath) {
      toast.error('열려 있는 워크스페이스가 없습니다.')
      return
    }

    if (trainRatio + valRatio + testRatio !== 100) {
      toast.error('분할 비율의 합이 100%가 되어야 합니다.')
      return
    }

    if (resizeEnabled && (resizeWidth < 1 || resizeHeight < 1)) {
      toast.error('리사이즈 크기는 1 이상이어야 합니다.')
      return
    }

    if (!exportName.trim()) {
      toast.error('export 이름을 입력하세요.')
      return
    }

    const outputPath = await window.api.dialog.selectExportFolder()
    if (!outputPath) return

    checkingPreflight = true
    try {
      const result = await window.api.workspace.exportPreflight(workspaceManager.workspacePath, {
        includeCompletedOnly,
        requireAnnotations,
        outOfBounds,
        split: { train: trainRatio, val: valRatio, test: testRatio }
      })
      preflight = result
      pendingOutputPath = outputPath
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '프리플라이트 실패')
    } finally {
      checkingPreflight = false
    }
  }

  /** 2단계: 사용자 확인 후 실제 내보내기 실행 */
  async function handleExportConfirmed() {
    if (!pendingOutputPath) return

    exporting = true

    const result = await workspaceManager.exportDataset({
      format: exportFormat as 'yolo' | 'coco' | 'yolo-obb' | 'dota',
      outputPath: pendingOutputPath,
      exportName,
      includeCompletedOnly,
      requireAnnotations,
      resize: {
        enabled: resizeEnabled,
        width: resizeWidth,
        height: resizeHeight
      },
      outOfBounds,
      split: {
        train: trainRatio,
        val: valRatio,
        test: testRatio
      }
    })

    exporting = false

    if (result.success) {
      toast.success(`내보내기가 완료되었습니다. (${result.exportedCount ?? 0}개)`)
      preflight = null
      pendingOutputPath = null
      open = false
      return
    }

    toast.error(result.error || '내보내기에 실패했습니다.')
  }

  function cancelPreflight() {
    preflight = null
    pendingOutputPath = null
  }

  $effect(() => {
    const allowedFormats = exportFormats.map((format) => format.value)

    if (!allowedFormats.includes(exportFormat)) {
      exportFormat = workspaceManager.isOBBMode ? 'yolo-obb' : 'yolo'
    }
  })

  $effect(() => {
    if (!open) return
    if (!exportName.trim()) {
      exportName = createDefaultExportName()
    }
  })

  $effect(() => {
    if (open) return
    // 닫힐 때 프리플라이트 상태 리셋
    preflight = null
    pendingOutputPath = null
  })
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>데이터셋 내보내기</Dialog.Title>
      <Dialog.Description>완료된 라벨링 데이터를 AI 학습용 포맷으로 내보냅니다.</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6 py-4">
      <div class="space-y-2">
        <Label for="export-name">Export 이름</Label>
        <input
          id="export-name"
          type="text"
          bind:value={exportName}
          placeholder="예: car-dataset-v1"
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p class="text-xs text-muted-foreground">
          선택한 폴더 아래에 <code>{exportName || 'export-name'}</code> 디렉토리를 새로 만들어 결과를
          저장합니다.
        </p>
      </div>

      <!-- 내보내기 포맷 선택 -->
      <div class="space-y-2">
        <Label>내보내기 포맷</Label>
        <RadioGroup bind:value={exportFormat} class="grid grid-cols-2 gap-2">
          {#each exportFormats as format (format.value)}
            <div
              class="flex items-center space-x-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
            >
              <RadioGroupItem value={format.value} id={format.id} />
              <Label for={format.id} class="cursor-pointer font-normal">
                <span class="block font-medium">{format.title}</span>
                <span class="text-xs text-muted-foreground">{format.description}</span>
              </Label>
            </div>
          {/each}
        </RadioGroup>
      </div>

      <!-- 이미지 리사이즈 옵션 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <Label>이미지 리사이즈</Label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={resizeEnabled}
              class="size-4 rounded border-input"
            />
            <span class="text-sm text-muted-foreground">사용</span>
          </label>
        </div>
        {#if resizeEnabled}
          <div class="grid grid-cols-2 gap-4 pl-2">
            <div class="space-y-1">
              <Label for="resize-width" class="text-xs text-muted-foreground">너비 (px)</Label>
              <input
                id="resize-width"
                type="number"
                bind:value={resizeWidth}
                min="1"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div class="space-y-1">
              <Label for="resize-height" class="text-xs text-muted-foreground">높이 (px)</Label>
              <input
                id="resize-height"
                type="number"
                bind:value={resizeHeight}
                min="1"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        {/if}
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <Label>내보내기 대상</Label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={includeCompletedOnly}
              class="size-4 rounded border-input"
            />
            <span class="text-sm text-muted-foreground">검수 완료만</span>
          </label>
        </div>
        <p class="text-xs text-muted-foreground">
          활성화하면 <code>_C.json</code> 상태만 내보냅니다. 비활성화하면 작업 중 라벨도 포함합니다.
        </p>

        <div class="flex items-center justify-between pt-2">
          <Label>라벨 있는 이미지만</Label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={requireAnnotations}
              class="size-4 rounded border-input"
            />
            <span class="text-sm text-muted-foreground">강제 적용</span>
          </label>
        </div>
        <p class="text-xs text-muted-foreground">
          활성화하면 어노테이션이 1개 이상 있는 이미지만 내보냅니다. 검수 완료 여부와 독립적으로
          동작합니다.
        </p>
      </div>

      <!-- 범위 초과 박스 처리 -->
      <div class="space-y-2">
        <Label>범위 초과 박스 처리</Label>
        <RadioGroup bind:value={outOfBounds} class="grid grid-cols-3 gap-2">
          <div
            class="flex items-center space-x-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
          >
            <RadioGroupItem value="clip" id="oob-clip" />
            <Label for="oob-clip" class="cursor-pointer font-normal">
              <span class="block font-medium">잘라내기</span>
              <span class="text-xs text-muted-foreground">경계로 clamp</span>
            </Label>
          </div>
          <div
            class="flex items-center space-x-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
          >
            <RadioGroupItem value="skip" id="oob-skip" />
            <Label for="oob-skip" class="cursor-pointer font-normal">
              <span class="block font-medium">건너뛰기</span>
              <span class="text-xs text-muted-foreground">해당 박스 제외</span>
            </Label>
          </div>
          <div
            class="flex items-center space-x-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
          >
            <RadioGroupItem value="none" id="oob-none" />
            <Label for="oob-none" class="cursor-pointer font-normal">
              <span class="block font-medium">무시</span>
              <span class="text-xs text-muted-foreground">원본 유지</span>
            </Label>
          </div>
        </RadioGroup>
        <p class="text-xs text-muted-foreground">
          이미지 범위를 벗어나는 박스 좌표의 처리 방식을 선택합니다.
        </p>
      </div>

      <!-- 데이터셋 분할 비율 -->
      <div class="space-y-3">
        <Label>데이터셋 분할 비율</Label>
        <div class="grid grid-cols-3 gap-4">
          <div class="space-y-1">
            <Label for="train-ratio" class="text-xs text-muted-foreground">Train (%)</Label>
            <input
              id="train-ratio"
              type="number"
              bind:value={trainRatio}
              min="0"
              max="100"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div class="space-y-1">
            <Label for="val-ratio" class="text-xs text-muted-foreground">Validation (%)</Label>
            <input
              id="val-ratio"
              type="number"
              bind:value={valRatio}
              min="0"
              max="100"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div class="space-y-1">
            <Label for="test-ratio" class="text-xs text-muted-foreground">Test (%)</Label>
            <input
              id="test-ratio"
              type="number"
              bind:value={testRatio}
              min="0"
              max="100"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        {#if trainRatio + valRatio + testRatio !== 100}
          <p class="text-xs text-destructive">
            비율의 합이 100%가 되어야 합니다. (현재: {trainRatio + valRatio + testRatio}%)
          </p>
        {/if}
      </div>
    </div>

    {#if preflight}
      <div class="space-y-4 rounded-md border bg-muted/40 p-4 text-sm">
        <div>
          <h3 class="mb-2 font-semibold">프리플라이트 요약</h3>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded border bg-background p-2">
              <div class="text-xs text-muted-foreground">이미지</div>
              <div class="text-lg font-semibold tabular-nums">{preflight.totalItems}</div>
            </div>
            <div class="rounded border bg-background p-2">
              <div class="text-xs text-muted-foreground">어노테이션</div>
              <div class="text-lg font-semibold tabular-nums">{preflight.totalAnnotations}</div>
            </div>
            <div class="rounded border bg-background p-2">
              <div class="text-xs text-muted-foreground">범위 초과</div>
              <div
                class="text-lg font-semibold tabular-nums {preflight.outOfBoundsCount > 0
                  ? 'text-amber-500'
                  : ''}"
              >
                {preflight.outOfBoundsCount}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="mb-1 text-xs text-muted-foreground">분할 분포</div>
          <div class="flex items-center gap-3 text-sm tabular-nums">
            <span>Train <b>{preflight.splitCounts.train}</b></span>
            <span>Val <b>{preflight.splitCounts.val}</b></span>
            <span>Test <b>{preflight.splitCounts.test}</b></span>
          </div>
        </div>

        {#if Object.keys(preflight.perClassCounts).length > 0}
          <div>
            <div class="mb-1 text-xs text-muted-foreground">클래스별 어노테이션</div>
            <div class="flex flex-wrap gap-2 text-xs">
              {#each Object.entries(preflight.perClassCounts) as [cid, count] (cid)}
                <span class="rounded bg-background px-2 py-0.5 font-mono">
                  #{cid} · {count}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        {#if preflight.warnings.length > 0}
          <ul
            class="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300"
          >
            {#each preflight.warnings as warn (warn)}
              <li>⚠ {warn}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      {#if preflight}
        <Button variant="outline" onclick={cancelPreflight} disabled={exporting}>뒤로</Button>
        <Button onclick={handleExportConfirmed} disabled={exporting || preflight.totalItems === 0}>
          <ArrowDownToLine class="size-4 mr-1" />
          {exporting ? '내보내는 중...' : `확인 후 내보내기 (${preflight.totalItems}장)`}
        </Button>
      {:else}
        <Button variant="outline" onclick={() => (open = false)} disabled={checkingPreflight}
          >취소</Button
        >
        <Button
          onclick={handlePreflight}
          disabled={checkingPreflight || trainRatio + valRatio + testRatio !== 100}
        >
          <ArrowDownToLine class="size-4 mr-1" />
          {checkingPreflight ? '집계 중...' : '미리 확인'}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
