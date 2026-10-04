<script lang="ts">
  import {
    aspectRatioLabel,
    formatBytes,
    formatPixelSize
  } from "../lib/format-utils";
  import type { PreviewMeta } from "../lib/image-preview";

  interface Props {
    meta: PreviewMeta;
  }

  let { meta }: Props = $props();
</script>

<dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
  <div class="min-w-0">
    <dt class="text-2xs uppercase tracking-wide text-zinc-400">Type</dt>
    <dd class="truncate font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
      {meta.format}
    </dd>
  </div>

  <div class="min-w-0">
    <dt class="text-2xs uppercase tracking-wide text-zinc-400">
      {meta.sizeLabel}
    </dt>
    <dd class="truncate font-mono text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
      {formatBytes(meta.size)}
    </dd>
  </div>

  {#if meta.width && meta.height}
    <div class="min-w-0">
      <dt class="text-2xs uppercase tracking-wide text-zinc-400">Dimensions</dt>
      <dd class="truncate font-mono text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
        {formatPixelSize(meta.width, meta.height)}
      </dd>
    </div>

    <div class="min-w-0">
      <dt class="text-2xs uppercase tracking-wide text-zinc-400">Ratio</dt>
      <dd class="truncate font-mono text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
        {aspectRatioLabel(meta.width, meta.height)}
      </dd>
    </div>
  {/if}
</dl>
