<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui'

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TooltipPrimitive.TriggerProps = $props()
</script>

<TooltipPrimitive.Trigger bind:ref data-slot="tooltip-trigger" class={className} {...restProps} />
