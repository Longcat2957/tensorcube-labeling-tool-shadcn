<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { RadioGroup, RadioGroupItem } from "$lib/components/ui/radio-group/index.js";
  import { ArrowDownToLine, Settings } from "@lucide/svelte";

  let { children }: { children: Snippet } = $props();

  let open = $state(false);
  let exportFormat = $state("yolo");
  let resizeEnabled = $state(false);
  let resizeWidth = $state(640);
  let resizeHeight = $state(640);
  let trainRatio = $state(80);
  let valRatio = $state(10);
  let testRatio = $state(10);

  function handleExport() {
    // TODO: 내보내기 로직
    open = false;
  }

  function handleSettingsClick() {
    // TODO: 추가 설정 패널 토글 또는 설정 모달 열기
  }
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
      <!-- 내보내기 포맷 선택 -->
      <div class="space-y-2">
        <Label>내보내기 포맷</Label>
        <RadioGroup bind:value={exportFormat} class="grid grid-cols-2 gap-2">
          <div class="flex items-center space-x-2 p-3 rounded-md border hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="yolo" id="format-yolo" />
            <Label for="format-yolo" class="font-normal cursor-pointer">
              <span class="block font-medium">YOLO</span>
              <span class="text-xs text-muted-foreground">.txt (정규화된 좌표)</span>
            </Label>
          </div>
          <div class="flex items-center space-x-2 p-3 rounded-md border hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="yolo-obb" id="format-yolo-obb" />
            <Label for="format-yolo-obb" class="font-normal cursor-pointer">
              <span class="block font-medium">YOLO-OBB</span>
              <span class="text-xs text-muted-foreground">.txt (회전 박스)</span>
            </Label>
          </div>
          <div class="flex items-center space-x-2 p-3 rounded-md border hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="coco" id="format-coco" />
            <Label for="format-coco" class="font-normal cursor-pointer">
              <span class="block font-medium">COCO</span>
              <span class="text-xs text-muted-foreground">.json (표준 포맷)</span>
            </Label>
          </div>
          <div class="flex items-center space-x-2 p-3 rounded-md border hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="dota" id="format-dota" />
            <Label for="format-dota" class="font-normal cursor-pointer">
              <span class="block font-medium">DOTA</span>
              <span class="text-xs text-muted-foreground">.txt (OBB 전용)</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <!-- 이미지 리사이즈 옵션 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <Label>이미지 리사이즈</Label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={resizeEnabled} class="size-4 rounded border-input" />
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
          <p class="text-xs text-destructive">비율의 합이 100%가 되어야 합니다. (현재: {trainRatio + valRatio + testRatio}%)</p>
        {/if}
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={handleSettingsClick}>
        <Settings class="size-4 mr-1" />
        추가 설정
      </Button>
      <Button variant="outline" onclick={() => (open = false)}>취소</Button>
      <Button onclick={handleExport}>
        <ArrowDownToLine class="size-4 mr-1" />
        내보내기
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>