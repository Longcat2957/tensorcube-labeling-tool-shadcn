<script lang="ts">
  import { setContext } from "svelte";
  import Navigation from "./components/Navigation.svelte";
  import LeftSidebar from "./components/LeftSidebar.svelte";
  import CanvasArea from "./components/CanvasArea.svelte";
  import RightSidebar from "./components/RightSidebar.svelte";
  import Footer from "./components/Footer.svelte";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { createKeyboardManager, KEYBOARD_MANAGER_KEY } from "$lib/stores/keyboardManager.svelte.js";

  // 키보드 매니저 생성 및 Context 제공
  const keyboardManager = createKeyboardManager();
  setContext(KEYBOARD_MANAGER_KEY, keyboardManager);

  // 전역 키보드 이벤트 리스너
  $effect(() => {
    window.addEventListener("keydown", keyboardManager.handleKeyDown);
    return () => {
      window.removeEventListener("keydown", keyboardManager.handleKeyDown);
    };
  });
</script>

<div class="h-screen flex flex-col font-sans overflow-hidden" role="application" aria-label="데이터 라벨링 도구">
  <Navigation />
  <div class="flex-1 flex overflow-hidden">
    <LeftSidebar />
    <Resizable.PaneGroup direction="horizontal" class="flex-1">
      <Resizable.Pane>
        <CanvasArea />
      </Resizable.Pane>
      <Resizable.Handle />
      <Resizable.Pane defaultSize={15} minSize={5} maxSize={40}>
        <RightSidebar />
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </div>
  <Footer />
</div>