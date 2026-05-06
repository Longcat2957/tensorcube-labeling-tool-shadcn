<script lang="ts">
  import type { Snippet } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem
  } from '$lib/components/ui/select/index.js'
  import { Film, ImageDown, FileImage, Shuffle, FolderOpen, Copy, Gauge } from '@lucide/svelte'
  import { toast } from 'svelte-sonner'

  const { children }: { children: Snippet } = $props()

  type Tab = 'video' | 'resize' | 'convert' | 'sample' | 'dedupe' | 'quality'
  let open = $state(false)
  let activeTab = $state<Tab>('video')

  const inputCls =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

  const triggerCls = '!w-full !h-9'

  const videoModeLabels: Record<string, string> = {
    fps: '초당 N프레임 (fps)',
    every: 'N프레임마다 1장',
    all: '모든 프레임'
  }
  const videoFormatLabels: Record<string, string> = { jpg: 'JPG', png: 'PNG' }
  const resizeModeLabels: Record<string, string> = {
    maxSide: '긴 변 기준 (최대 N)',
    fixed: '고정 크기 (W × H)',
    scale: '배율 (×N)'
  }
  const convertFormatLabels: Record<string, string> = { jpg: 'JPG', png: 'PNG', webp: 'WebP' }

  // ── Video → Frame ──────────────────────────────
  let v_videoPath = $state('')
  let v_targetDir = $state('')
  let v_mode = $state<'fps' | 'every' | 'all'>('fps')
  let v_fps = $state(1)
  let v_everyN = $state(30)
  let v_startSec = $state<number | undefined>(undefined)
  let v_endSec = $state<number | undefined>(undefined)
  let v_format = $state<'jpg' | 'png'>('jpg')
  let v_quality = $state(2)
  let v_busy = $state(false)
  let v_progress = $state<{ frame: number; outTimeSec: number } | null>(null)
  let v_ffmpegStatus = $state<{ available: boolean; version?: string } | null>(null)

  async function checkFfmpeg() {
    try {
      const r = await window.api.utilities.probeFfmpeg()
      v_ffmpegStatus = { available: r.available, version: r.version }
    } catch {
      v_ffmpegStatus = { available: false }
    }
  }

  async function pickVideoFile() {
    const p = await window.api.dialog.selectVideoFile()
    if (p) v_videoPath = p
  }

  async function pickTargetDir(setter: (s: string) => void) {
    const p = await window.api.dialog.selectFolder()
    if (p) setter(p)
  }

  async function runVideoExtract() {
    if (!v_videoPath || !v_targetDir) {
      toast.error('비디오 파일과 출력 폴더를 모두 선택하세요.')
      return
    }
    v_busy = true
    v_progress = { frame: 0, outTimeSec: 0 }
    const requestId = `vid-${Date.now()}`
    const off = window.api.utilities.onVideoProgress((data) => {
      if (data.requestId === requestId) {
        v_progress = { frame: data.frame, outTimeSec: data.outTimeSec }
      }
    })
    try {
      const result = await window.api.utilities.extractVideoFrames(requestId, {
        videoPath: v_videoPath,
        targetDir: v_targetDir,
        mode: v_mode,
        fps: v_fps,
        everyN: v_everyN,
        startSec: v_startSec,
        endSec: v_endSec,
        format: v_format,
        quality: v_quality
      })
      toast.success(`프레임 추출 완료: ${result.extracted}장`)
    } catch (err) {
      toast.error('추출 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      off()
      v_busy = false
    }
  }

  // ── Batch Resize ───────────────────────────────
  let r_sourceDir = $state('')
  let r_targetDir = $state('')
  let r_mode = $state<'maxSide' | 'fixed' | 'scale'>('maxSide')
  let r_width = $state(1024)
  let r_height = $state(1024)
  let r_scale = $state(0.5)
  let r_quality = $state(90)
  let r_busy = $state(false)
  let r_result = $state<{ processed: number; failed: number; total: number } | null>(null)

  async function runResize() {
    if (!r_sourceDir || !r_targetDir) {
      toast.error('소스/타겟 폴더를 선택하세요.')
      return
    }
    r_busy = true
    r_result = null
    try {
      const res = await window.api.utilities.batchResize({
        sourceDir: r_sourceDir,
        targetDir: r_targetDir,
        mode: r_mode,
        width: r_width,
        height: r_height,
        scale: r_scale,
        quality: r_quality
      })
      r_result = { processed: res.processed, failed: res.failed, total: res.total }
      toast.success(`리사이즈 완료: ${res.processed}/${res.total}`)
    } catch (err) {
      toast.error('실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      r_busy = false
    }
  }

  // ── Format Convert ─────────────────────────────
  let c_sourceDir = $state('')
  let c_targetDir = $state('')
  let c_format = $state<'jpg' | 'png' | 'webp'>('jpg')
  let c_quality = $state(90)
  let c_applyExif = $state(true)
  let c_busy = $state(false)
  let c_result = $state<{ processed: number; failed: number; total: number } | null>(null)

  async function runConvert() {
    if (!c_sourceDir || !c_targetDir) {
      toast.error('소스/타겟 폴더를 선택하세요.')
      return
    }
    c_busy = true
    c_result = null
    try {
      const res = await window.api.utilities.convertFormat({
        sourceDir: c_sourceDir,
        targetDir: c_targetDir,
        format: c_format,
        quality: c_quality,
        applyExifRotation: c_applyExif
      })
      c_result = { processed: res.processed, failed: res.failed, total: res.total }
      toast.success(`변환 완료: ${res.processed}/${res.total}`)
    } catch (err) {
      toast.error('실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      c_busy = false
    }
  }

  // ── Dedupe ─────────────────────────────────────
  let d_sourceDir = $state('')
  let d_threshold = $state(5)
  let d_busy = $state(false)
  let d_result = $state<{
    groups: { hash: string; files: string[] }[]
    totalFiles: number
    duplicateFiles: number
  } | null>(null)

  async function runDedupe() {
    if (!d_sourceDir) {
      toast.error('소스 폴더를 선택하세요.')
      return
    }
    d_busy = true
    d_result = null
    try {
      const res = await window.api.utilities.dedupeImages({
        sourceDir: d_sourceDir,
        threshold: d_threshold
      })
      d_result = res
      toast.success(`그룹 ${res.groups.length}개, 중복 ${res.duplicateFiles}/${res.totalFiles}장`)
    } catch (err) {
      toast.error('실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      d_busy = false
    }
  }

  // ── Quality ────────────────────────────────────
  let q_sourceDir = $state('')
  let q_blurEnabled = $state(false)
  let q_blurThreshold = $state(50)
  let q_brightnessEnabled = $state(false)
  let q_brightnessMin = $state(20)
  let q_brightnessMax = $state(235)
  let q_stdevEnabled = $state(false)
  let q_stdevMin = $state(15)
  let q_minSideEnabled = $state(false)
  let q_minSide = $state(200)
  let q_busy = $state(false)
  let q_result = $state<{
    items: {
      file: string
      width: number
      height: number
      mean: number
      stdev: number
      laplacianVar: number
      flags: string[]
    }[]
    flagged: number
    total: number
  } | null>(null)

  async function runQuality() {
    if (!q_sourceDir) {
      toast.error('소스 폴더를 선택하세요.')
      return
    }
    q_busy = true
    q_result = null
    try {
      const res = await window.api.utilities.analyzeQuality({
        sourceDir: q_sourceDir,
        blurThreshold: q_blurEnabled ? q_blurThreshold : undefined,
        brightnessMin: q_brightnessEnabled ? q_brightnessMin : undefined,
        brightnessMax: q_brightnessEnabled ? q_brightnessMax : undefined,
        stdevMin: q_stdevEnabled ? q_stdevMin : undefined,
        minSide: q_minSideEnabled ? q_minSide : undefined
      })
      q_result = res
      toast.success(`분석 완료: 플래그 ${res.flagged}/${res.total}`)
    } catch (err) {
      toast.error('실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      q_busy = false
    }
  }

  // ── Sampling ───────────────────────────────────
  let s_sourceDir = $state('')
  let s_targetDir = $state('')
  let s_count = $state(100)
  let s_seed = $state<number | undefined>(undefined)
  let s_busy = $state(false)
  let s_result = $state<{ copied: number; total: number } | null>(null)

  async function runSample() {
    if (!s_sourceDir || !s_targetDir) {
      toast.error('소스/타겟 폴더를 선택하세요.')
      return
    }
    s_busy = true
    s_result = null
    try {
      const res = await window.api.utilities.sampleImages({
        sourceDir: s_sourceDir,
        targetDir: s_targetDir,
        count: s_count,
        seed: s_seed
      })
      s_result = { copied: res.copied, total: res.total }
      toast.success(`샘플링 완료: ${res.copied}/${res.total}`)
    } catch (err) {
      toast.error('실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      s_busy = false
    }
  }

  function handleOpenChange(next: boolean) {
    open = next
    if (next && activeTab === 'video' && !v_ffmpegStatus) void checkFfmpeg()
  }

  function onTabChange(v: string) {
    activeTab = v as Tab
    if (v === 'video' && !v_ffmpegStatus) void checkFfmpeg()
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Trigger>
    {@render children()}
  </Dialog.Trigger>
  <Dialog.Content class="!max-w-5xl w-[90vw]">
    <Dialog.Header>
      <Dialog.Title>도구</Dialog.Title>
      <Dialog.Description>데이터 준비를 위한 보조 유틸리티.</Dialog.Description>
    </Dialog.Header>

    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList class="grid w-full grid-cols-6">
        <TabsTrigger value="video"><Film class="size-4 mr-1" />Video</TabsTrigger>
        <TabsTrigger value="resize"><ImageDown class="size-4 mr-1" />리사이즈</TabsTrigger>
        <TabsTrigger value="convert"><FileImage class="size-4 mr-1" />변환</TabsTrigger>
        <TabsTrigger value="sample"><Shuffle class="size-4 mr-1" />샘플링</TabsTrigger>
        <TabsTrigger value="dedupe"><Copy class="size-4 mr-1" />중복</TabsTrigger>
        <TabsTrigger value="quality"><Gauge class="size-4 mr-1" />품질</TabsTrigger>
      </TabsList>

      <ScrollArea class="h-[70vh] max-h-[700px]">
        <!-- Video → Frame -->
        <TabsContent value="video" class="space-y-3 p-1">
          <p class="text-xs text-muted-foreground">
            ffmpeg:
            {#if v_ffmpegStatus === null}
              확인 중…
            {:else if v_ffmpegStatus.available}
              사용 가능 ({v_ffmpegStatus.version ?? '?'})
            {:else}
              사용 불가
            {/if}
          </p>

          <div class="space-y-1">
            <Label>비디오 파일</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={v_videoPath} placeholder="비디오 파일 경로" />
              <Button variant="outline" size="sm" onclick={pickVideoFile}>
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>

          <div class="space-y-1">
            <Label>출력 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={v_targetDir} placeholder="프레임 저장 폴더" />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (v_targetDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="space-y-1">
              <Label>모드</Label>
              <Select type="single" bind:value={v_mode}>
                <SelectTrigger class={triggerCls}>{videoModeLabels[v_mode]}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="fps">초당 N프레임 (fps)</SelectItem>
                  <SelectItem value="every">N프레임마다 1장</SelectItem>
                  <SelectItem value="all">모든 프레임</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {#if v_mode === 'fps'}
              <div class="space-y-1">
                <Label>FPS</Label>
                <input class={inputCls} type="number" min="0.1" step="0.1" bind:value={v_fps} />
              </div>
            {:else if v_mode === 'every'}
              <div class="space-y-1">
                <Label>N</Label>
                <input class={inputCls} type="number" min="1" bind:value={v_everyN} />
              </div>
            {:else}
              <div></div>
            {/if}
            <div class="space-y-1">
              <Label>포맷</Label>
              <Select type="single" bind:value={v_format}>
                <SelectTrigger class={triggerCls}>{videoFormatLabels[v_format]}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="jpg">JPG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="space-y-1">
              <Label>시작(초)</Label>
              <input class={inputCls} type="number" min="0" step="0.1" bind:value={v_startSec} />
            </div>
            <div class="space-y-1">
              <Label>종료(초)</Label>
              <input class={inputCls} type="number" min="0" step="0.1" bind:value={v_endSec} />
            </div>
            {#if v_format === 'jpg'}
              <div class="space-y-1">
                <Label>품질 (1=최고, 31=최저)</Label>
                <input class={inputCls} type="number" min="1" max="31" bind:value={v_quality} />
              </div>
            {/if}
          </div>

          {#if v_progress}
            <p class="text-sm text-muted-foreground">
              진행: {v_progress.frame}프레임 · {v_progress.outTimeSec.toFixed(1)}초 처리됨
            </p>
          {/if}

          <div class="flex justify-end">
            <Button onclick={runVideoExtract} disabled={v_busy || !v_ffmpegStatus?.available}>
              {v_busy ? '추출 중…' : '프레임 추출'}
            </Button>
          </div>
        </TabsContent>

        <!-- Resize -->
        <TabsContent value="resize" class="space-y-3 p-1">
          <div class="space-y-1">
            <Label>소스 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={r_sourceDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (r_sourceDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>
          <div class="space-y-1">
            <Label>타겟 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={r_targetDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (r_targetDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <Label>모드</Label>
              <Select type="single" bind:value={r_mode}>
                <SelectTrigger class={triggerCls}>{resizeModeLabels[r_mode]}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="maxSide">긴 변 기준 (최대 N)</SelectItem>
                  <SelectItem value="fixed">고정 크기 (W × H)</SelectItem>
                  <SelectItem value="scale">배율 (×N)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1">
              <Label>JPEG 품질 (1-100)</Label>
              <input class={inputCls} type="number" min="1" max="100" bind:value={r_quality} />
            </div>
          </div>

          {#if r_mode === 'maxSide'}
            <div class="space-y-1">
              <Label>최대 변 길이 (px)</Label>
              <input class={inputCls} type="number" min="1" bind:value={r_width} />
            </div>
          {:else if r_mode === 'fixed'}
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label>Width</Label>
                <input class={inputCls} type="number" min="1" bind:value={r_width} />
              </div>
              <div class="space-y-1">
                <Label>Height</Label>
                <input class={inputCls} type="number" min="1" bind:value={r_height} />
              </div>
            </div>
          {:else}
            <div class="space-y-1">
              <Label>배율 (예: 0.5)</Label>
              <input class={inputCls} type="number" min="0.01" step="0.01" bind:value={r_scale} />
            </div>
          {/if}

          {#if r_result}
            <p class="text-sm text-muted-foreground">
              결과: {r_result.processed}/{r_result.total} 처리, 실패 {r_result.failed}
            </p>
          {/if}

          <div class="flex justify-end">
            <Button onclick={runResize} disabled={r_busy}>
              {r_busy ? '처리 중…' : '리사이즈 시작'}
            </Button>
          </div>
        </TabsContent>

        <!-- Convert -->
        <TabsContent value="convert" class="space-y-3 p-1">
          <div class="space-y-1">
            <Label>소스 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={c_sourceDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (c_sourceDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>
          <div class="space-y-1">
            <Label>타겟 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={c_targetDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (c_targetDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <Label>출력 포맷</Label>
              <Select type="single" bind:value={c_format}>
                <SelectTrigger class={triggerCls}>{convertFormatLabels[c_format]}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="jpg">JPG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="webp">WebP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {#if c_format !== 'png'}
              <div class="space-y-1">
                <Label>품질 (1-100)</Label>
                <input class={inputCls} type="number" min="1" max="100" bind:value={c_quality} />
              </div>
            {/if}
          </div>

          <div class="flex items-center gap-2">
            <input type="checkbox" id="exif" bind:checked={c_applyExif} />
            <Label for="exif" class="cursor-pointer">EXIF orientation 자동 보정</Label>
          </div>

          {#if c_result}
            <p class="text-sm text-muted-foreground">
              결과: {c_result.processed}/{c_result.total} 처리, 실패 {c_result.failed}
            </p>
          {/if}

          <div class="flex justify-end">
            <Button onclick={runConvert} disabled={c_busy}>
              {c_busy ? '처리 중…' : '변환 시작'}
            </Button>
          </div>
        </TabsContent>

        <!-- Sampling -->
        <TabsContent value="sample" class="space-y-3 p-1">
          <div class="space-y-1">
            <Label>소스 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={s_sourceDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (s_sourceDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>
          <div class="space-y-1">
            <Label>타겟 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={s_targetDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (s_targetDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <Label>샘플 개수</Label>
              <input class={inputCls} type="number" min="1" bind:value={s_count} />
            </div>
            <div class="space-y-1">
              <Label>시드 (옵션)</Label>
              <input
                class={inputCls}
                type="number"
                bind:value={s_seed}
                placeholder="비워두면 매번 다름"
              />
            </div>
          </div>

          {#if s_result}
            <p class="text-sm text-muted-foreground">
              결과: 전체 {s_result.total}장 중 {s_result.copied}장 복사됨
            </p>
          {/if}

          <div class="flex justify-end">
            <Button onclick={runSample} disabled={s_busy}>
              {s_busy ? '처리 중…' : '샘플링 시작'}
            </Button>
          </div>
        </TabsContent>

        <!-- Dedupe -->
        <TabsContent value="dedupe" class="space-y-3 p-1">
          <p class="text-xs text-muted-foreground">
            aHash 기반 그룹화. Hamming 거리 ≤ 임계값이면 같은 그룹.
          </p>

          <div class="space-y-1">
            <Label>소스 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={d_sourceDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (d_sourceDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>
          <div class="space-y-1">
            <Label>유사도 임계값 (0=동일, 5=거의 동일, 10=유사)</Label>
            <input class={inputCls} type="number" min="0" max="32" bind:value={d_threshold} />
          </div>

          {#if d_result}
            <div class="border rounded-md p-2 space-y-1">
              <p class="text-sm">
                전체 {d_result.totalFiles}장 중 중복 {d_result.duplicateFiles}장 · 그룹 {d_result
                  .groups.length}개
              </p>
              <ScrollArea class="h-48 border rounded">
                <div class="divide-y">
                  {#each d_result.groups as g (g.hash)}
                    <div class="px-2 py-1.5">
                      <div class="text-[10px] font-mono text-muted-foreground">
                        {g.hash} · {g.files.length}장
                      </div>
                      <div class="text-xs truncate">{g.files.join(', ')}</div>
                    </div>
                  {/each}
                </div>
              </ScrollArea>
            </div>
          {/if}

          <div class="flex justify-end">
            <Button onclick={runDedupe} disabled={d_busy}>
              {d_busy ? '분석 중…' : '중복 분석 시작'}
            </Button>
          </div>
        </TabsContent>

        <!-- Quality -->
        <TabsContent value="quality" class="space-y-3 p-1">
          <p class="text-xs text-muted-foreground">
            grayscale 통계 + Laplacian 분산으로 저품질 후보를 표시합니다.
          </p>

          <div class="space-y-1">
            <Label>소스 폴더</Label>
            <div class="flex gap-2">
              <input class={inputCls} bind:value={q_sourceDir} />
              <Button
                variant="outline"
                size="sm"
                onclick={() => pickTargetDir((p) => (q_sourceDir = p))}
              >
                <FolderOpen class="size-4" />
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <input id="qb" type="checkbox" bind:checked={q_blurEnabled} />
              <Label for="qb" class="cursor-pointer">블러 임계 (Lap. var &lt;)</Label>
              <input
                type="number"
                class="{inputCls} w-32"
                min="0"
                bind:value={q_blurThreshold}
                disabled={!q_blurEnabled}
              />
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <input id="qbr" type="checkbox" bind:checked={q_brightnessEnabled} />
              <Label for="qbr" class="cursor-pointer">밝기 범위 [min, max]</Label>
              <input
                type="number"
                class="{inputCls} w-24"
                min="0"
                max="255"
                bind:value={q_brightnessMin}
                disabled={!q_brightnessEnabled}
              />
              <input
                type="number"
                class="{inputCls} w-24"
                min="0"
                max="255"
                bind:value={q_brightnessMax}
                disabled={!q_brightnessEnabled}
              />
            </div>
            <div class="flex items-center gap-2">
              <input id="qsd" type="checkbox" bind:checked={q_stdevEnabled} />
              <Label for="qsd" class="cursor-pointer">대비 (stdev) 최소</Label>
              <input
                type="number"
                class="{inputCls} w-32"
                min="0"
                bind:value={q_stdevMin}
                disabled={!q_stdevEnabled}
              />
            </div>
            <div class="flex items-center gap-2">
              <input id="qms" type="checkbox" bind:checked={q_minSideEnabled} />
              <Label for="qms" class="cursor-pointer">최소 짧은 변 (px)</Label>
              <input
                type="number"
                class="{inputCls} w-32"
                min="1"
                bind:value={q_minSide}
                disabled={!q_minSideEnabled}
              />
            </div>
          </div>

          {#if q_result}
            <div class="border rounded-md p-2 space-y-1">
              <p class="text-sm">전체 {q_result.total}장, 플래그 {q_result.flagged}장</p>
              <ScrollArea class="h-48 border rounded">
                <div class="divide-y">
                  {#each q_result.items.filter((x) => x.flags.length > 0) as it (it.file)}
                    <div class="px-2 py-1 text-xs">
                      <div class="font-mono">{it.file}</div>
                      <div class="text-[10px] text-muted-foreground">
                        {it.width}×{it.height} · mean={it.mean.toFixed(1)} · stdev={it.stdev.toFixed(
                          1
                        )} · lap.var={it.laplacianVar.toFixed(1)} · flags={it.flags.join(',')}
                      </div>
                    </div>
                  {/each}
                </div>
              </ScrollArea>
            </div>
          {/if}

          <div class="flex justify-end">
            <Button onclick={runQuality} disabled={q_busy}>
              {q_busy ? '분석 중…' : '품질 분석 시작'}
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
