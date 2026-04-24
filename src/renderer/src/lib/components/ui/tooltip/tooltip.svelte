<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui'

  const { ...restProps }: TooltipPrimitive.RootProps = $props()
</script>

<TooltipPrimitive.Root {...restProps} />
