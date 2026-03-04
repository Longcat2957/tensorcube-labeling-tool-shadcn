<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Tabs, TabsList, TabsTrigger } from "$lib/components/ui/tabs/index.js";
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "$lib/components/ui/dropdown-menu/index.js";
  import { Menu, ArrowDownToLine } from "@lucide/svelte";
</script>

<header class="h-14 border-b flex items-center px-4 justify-between">
  <div class="flex items-center gap-4">
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" aria-label="메뉴 열기"><Menu /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>프로젝트 설정</DropdownMenuItem>
        <DropdownMenuItem>워크스페이스 열기</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div class="font-semibold text-sm">Example Workspace</div>
  </div>

  <div class="flex items-center gap-4">
    <Tabs value="edit">
      <TabsList>
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="check">Check</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
    </Tabs>
    <Button variant="outline" size="icon" aria-label="내보내기"><ArrowDownToLine /></Button>
  </div>
</header>
