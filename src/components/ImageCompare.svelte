<script lang="ts">
  import PreviewViewport from "./PreviewViewport.svelte";

  interface Props {
    beforeUrl: string;
    afterUrl: string;
    beforeAlt: string;
    afterAlt: string;
    beforeLabel?: string;
    afterLabel?: string;
  }

  let {
    beforeUrl,
    afterUrl,
    beforeAlt,
    afterAlt,
    beforeLabel = "Original",
    afterLabel = "Converted"
  }: Props = $props();

  let position = $state(50);
</script>

<div
  class="dc-alpha relative h-64 w-full overflow-hidden rounded-control border border-zinc-200 sm:h-80 dark:border-zinc-800"
>
  <PreviewViewport
    class="h-full w-full"
    fill
    resetKey="{beforeUrl}|{afterUrl}"
    label="Before and after overlay. Drag to pan, scroll to zoom, drag the handle to compare."
  >
    <div class="relative h-full w-full">
      <img
        src={afterUrl}
        alt={afterAlt}
        class="absolute inset-0 h-full w-full object-contain"
        decoding="async"
        draggable="false"
      />

      <div class="absolute inset-0" style="clip-path: inset(0 {100 - position}% 0 0)">
        <img
          src={beforeUrl}
          alt={beforeAlt}
          class="absolute inset-0 h-full w-full object-contain"
          decoding="async"
          draggable="false"
        />
      </div>
    </div>
  </PreviewViewport>

  <span
    class="pointer-events-none absolute left-3 top-3 rounded-[4px] bg-black/65 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-white"
  >
    {beforeLabel}
  </span>

  <span
    class="pointer-events-none absolute right-3 top-3 rounded-[4px] bg-black/65 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-white"
  >
    {afterLabel}
  </span>

  <!--
    The slider only owns a narrow strip around the divider, so dragging anywhere
    else pans and zooming still works.
  -->
  <div
    class="absolute inset-y-0 z-10 flex w-12 -translate-x-1/2 items-center justify-center"
    style="left: {position}%;"
  >
    <span
      class="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
      aria-hidden="true"
    ></span>

    <span
      class="pointer-events-none flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow-hair dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        class="h-4 w-4"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M7.5 6 3.75 9.75 7.5 13.5M16.5 6l3.75 3.75-3.75 3.75"
        ></path>
      </svg>
    </span>

    <input
      type="range"
      min="0"
      max="100"
      step="1"
      class="absolute h-full w-full cursor-ew-resize bg-transparent opacity-0"
      aria-label="Drag to compare the original with the converted preview"
      aria-valuetext="{position} percent original"
      bind:value={position}
    />
  </div>
</div>
