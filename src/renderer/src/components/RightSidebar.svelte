<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import Minimap from "./Minimap.svelte";
  import ClassSelector from "./ClassSelector.svelte";
  import LabelList from "./LabelList.svelte";
</script>

<aside class="h-full border-l flex flex-col" aria-label="인스펙터 패널">
  <Resizable.PaneGroup direction="vertical" class="h-full">
    <Resizable.Pane defaultSize={30} minSize={10}>
      <Minimap />
    </Resizable.Pane>
    <Resizable.Handle />
    <Resizable.Pane>
      <Resizable.PaneGroup direction="vertical" class="h-full">
        <Resizable.Pane defaultSize={50} minSize={20}>
          <ClassSelector />
        </Resizable.Pane>
        <Resizable.Handle />
        <Resizable.Pane>
          <LabelList />
        </Resizable.Pane>
      </Resizable.PaneGroup>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</aside>
