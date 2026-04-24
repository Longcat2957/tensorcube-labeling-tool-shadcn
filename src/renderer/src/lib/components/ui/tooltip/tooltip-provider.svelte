<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui'

  const { delayDuration = 150, ...restProps }: TooltipPrimitive.ProviderProps = $props()
</script>

<TooltipPrimitive.Provider {delayDuration} {...restProps} />
