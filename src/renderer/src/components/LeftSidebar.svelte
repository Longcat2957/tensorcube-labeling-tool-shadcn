<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { ArrowLeft, ArrowRight, MousePointer2, Square, Undo, Redo, Trash2 } from "@lucide/svelte";
</script>

<aside 
  class="w-16 border-r flex flex-col items-center py-4 gap-2 bg-background"
  aria-label="도구 모음"
>
  <div class="space-y-2 flex flex-col items-center">
    <Button variant="ghost" size="icon" aria-label="이전 이미지 (A)"><ArrowLeft /></Button>
    <Button variant="ghost" size="icon" aria-label="다음 이미지 (D)"><ArrowRight /></Button>
    <div class="h-px w-8 bg-border my-1" role="separator"></div>
    <Button variant="secondary" size="icon" aria-label="선택 도구 (V)"><MousePointer2 /></Button>
    <Button variant="ghost" size="icon" aria-label="박스 생성 도구 (B)"><Square /></Button>
    <div class="h-px w-8 bg-border my-1" role="separator"></div>
    <Button variant="ghost" size="icon" aria-label="실행 취소 (Ctrl+Z)"><Undo /></Button>
    <Button variant="ghost" size="icon" aria-label="다시 실행 (Ctrl+Y)"><Redo /></Button>
    <Button variant="ghost" size="icon" class="mt-auto text-destructive" aria-label="선택된 라벨 삭제 (Delete)"><Trash2 /></Button>
  </div>
</aside>