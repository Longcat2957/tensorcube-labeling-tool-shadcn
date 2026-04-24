<script lang="ts">
  import { Slider as SliderPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    type = 'single',
    min = 0,
    max = 100,
    step = 1,
    disabled,
    ...restProps
  }: SliderPrimitive.RootProps = $props()
</script>

<SliderPrimitive.Root
  bind:ref
  bind:value={value as never}
  data-slot="slider"
  {type}
  {min}
  {max}
  {step}
  {disabled}
  class={cn(
    'relative flex w-full touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
    className
  )}
  {...restProps}
>
  {#snippet children({ thumbs })}
    <span
      data-slot="slider-track"
      class="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
    >
      <SliderPrimitive.Range
        data-slot="slider-range"
        class="bg-primary absolute h-full data-[orientation=vertical]:w-full"
      />
    </span>
    {#each thumbs as index (index)}
      <SliderPrimitive.Thumb
        {index}
        data-slot="slider-thumb"
        class="border-primary bg-background ring-offset-background focus-visible:ring-ring block h-4 w-4 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      />
    {/each}
  {/snippet}
</SliderPrimitive.Root>
