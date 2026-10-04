<script lang="ts">
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
  <img
    src={afterUrl}
    alt={afterAlt}
    class="absolute inset-0 h-full w-full object-contain"
    decoding="async"
  />

  <div
    class="absolute inset-0"
    style="clip-path: inset(0 {100 - position}% 0 0)"
  >
    <img
      src={beforeUrl}
      alt={beforeAlt}
      class="absolute inset-0 h-full w-full object-contain"
      decoding="async"
    />
  </div>

  <div
    class="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
    style="left: {position}%"
    aria-hidden="true"
  >
    <span
      class="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow-hair dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
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
        />
      </svg>
    </span>
  </div>

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

  <input
    type="range"
    min="0"
    max="100"
    step="1"
    class="absolute inset-0 h-full w-full cursor-ew-resize bg-transparent opacity-0"
    aria-label="Drag to compare the original with the converted preview"
    aria-valuetext="{position} percent original"
    bind:value={position}
  />
</div>
