<script lang="ts">
  import { getContext, onMount, type Snippet } from 'svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip/index.js'
  import { ArrowLeft, ArrowRight, MousePointer2, Square, Undo, Redo, Trash2 } from '@lucide/svelte'
  import {
    KEYBOARD_MANAGER_KEY,
    type KeyboardAction,
    type KeyboardManager,
    ACTION_SHORTCUTS
  } from '$lib/stores/keyboardManager.svelte.js'
  import { TOOL_MANAGER_KEY, type ToolManager } from '$lib/stores/toolManager.svelte.js'
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from '$lib/stores/workspace.svelte.js'

  // Context 가져오기
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY)
  const toolManager = getContext<ToolManager>(TOOL_MANAGER_KEY)
  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY)

  // 단축키 액션 핸들러
  function handlePrevImage() {
    workspaceManager.prevImage()
  }

  function handleNextImage() {
    workspaceManager.nextImage()
  }

  function handleSelectTool() {
    toolManager.setTool('select')
  }

  function handleBoxTool() {
    toolManager.setTool('box')
  }

  const boxToolLabel = $derived(
    workspaceManager.isOBBMode ? '회전 바운딩 박스 생성 도구' : '바운딩 박스 생성 도구'
  )

  function handleUndo() {
    workspaceManager.undo()
  }

  function handleRedo() {
    workspaceManager.redo()
  }

  function handleDelete() {
    workspaceManager.deleteSelectedLabels()
  }

  // 단축키 핸들러 등록
  onMount(() => {
    const cleanupFns: (() => void)[] = []

    cleanupFns.push(keyboardManager.onAction('prev-image' as KeyboardAction, handlePrevImage))
    cleanupFns.push(keyboardManager.onAction('next-image' as KeyboardAction, handleNextImage))
    cleanupFns.push(keyboardManager.onAction('select-tool' as KeyboardAction, handleSelectTool))
    cleanupFns.push(keyboardManager.onAction('box-tool' as KeyboardAction, handleBoxTool))
    cleanupFns.push(keyboardManager.onAction('undo' as KeyboardAction, handleUndo))
    cleanupFns.push(keyboardManager.onAction('redo' as KeyboardAction, handleRedo))
    cleanupFns.push(keyboardManager.onAction('delete' as KeyboardAction, handleDelete))

    return () => {
      cleanupFns.forEach((cleanup) => cleanup())
    }
  })
</script>

{#snippet hintedButton(
  action: KeyboardAction,
  label: string,
  onClick: () => void,
  icon: Snippet,
  opts: { active?: boolean; disabled?: boolean; className?: string } = {}
)}
  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant={opts.active ? 'secondary' : 'ghost'}
          size="icon"
          class={opts.className}
          aria-label={`${label} (${ACTION_SHORTCUTS[action]})`}
          onclick={onClick}
          disabled={opts.disabled}
        >
          {@render icon()}
        </Button>
      {/snippet}
    </TooltipTrigger>
    <TooltipContent side="right">
      <div class="flex items-center gap-2">
        <span>{label}</span>
        <kbd class="rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-[10px]"
          >{ACTION_SHORTCUTS[action]}</kbd
        >
      </div>
    </TooltipContent>
  </Tooltip>
{/snippet}

{#snippet arrowLeftIcon()}<ArrowLeft />{/snippet}
{#snippet arrowRightIcon()}<ArrowRight />{/snippet}
{#snippet selectIcon()}<MousePointer2 />{/snippet}
{#snippet boxIcon()}<Square />{/snippet}
{#snippet undoIcon()}<Undo />{/snippet}
{#snippet redoIcon()}<Redo />{/snippet}
{#snippet trashIcon()}<Trash2 />{/snippet}

<aside
  class="w-16 border-r flex flex-col items-center py-4 gap-2 bg-background"
  aria-label="도구 모음"
>
  <div class="space-y-2 flex flex-col items-center">
    {@render hintedButton('prev-image', '이전 이미지', handlePrevImage, arrowLeftIcon)}
    {@render hintedButton('next-image', '다음 이미지', handleNextImage, arrowRightIcon)}
    <div class="h-px w-8 bg-border my-1" role="separator"></div>
    {@render hintedButton('select-tool', '선택 도구', handleSelectTool, selectIcon, {
      active: toolManager.currentTool === 'select'
    })}
    {@render hintedButton('box-tool', boxToolLabel, handleBoxTool, boxIcon, {
      active: toolManager.currentTool === 'box'
    })}
    <div class="h-px w-8 bg-border my-1" role="separator"></div>
    {@render hintedButton('undo', '실행 취소', handleUndo, undoIcon, {
      disabled: !workspaceManager.canUndo
    })}
    {@render hintedButton('redo', '다시 실행', handleRedo, redoIcon, {
      disabled: !workspaceManager.canRedo
    })}
    {@render hintedButton('delete', '선택된 라벨 삭제', handleDelete, trashIcon, {
      disabled: workspaceManager.selectedLabelIds.length === 0,
      className: 'mt-auto text-destructive'
    })}
  </div>
</aside>
