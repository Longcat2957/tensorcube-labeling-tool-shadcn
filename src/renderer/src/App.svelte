<script lang="ts">
  import Navigation from "./components/Navigation.svelte";
  import LeftSidebar from "./components/LeftSidebar.svelte";
  import CanvasArea from "./components/CanvasArea.svelte";
  import RightSidebar from "./components/RightSidebar.svelte";
  import Footer from "./components/Footer.svelte";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
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