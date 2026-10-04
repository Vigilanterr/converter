<script lang="ts">
  export type StepState = "pending" | "active" | "done";

  interface Props {
    /** Ordered list of steps, e.g. Upload, Convert, Preview, Download. */
    steps: string[];
    /** Index of the step currently happening. -1 when nothing has started. */
    activeIndex: number;
  }

  let { steps, activeIndex }: Props = $props();

  function stateFor(index: number): StepState {
    if (activeIndex < 0) {
      return index === 0 ? "active" : "pending";
    }

    if (index < activeIndex) {
      return "done";
    }

    return index === activeIndex ? "active" : "pending";
  }
</script>

<ol
  class="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3"
  aria-label="Conversion progress"
>
  {#each steps as step, index (step)}
    {@const state = stateFor(index)}
    <li class="flex items-center gap-2 sm:gap-3">
      <span
        class="flex items-center gap-2 text-xs font-medium
          {state === 'pending'
            ? 'text-zinc-400 dark:text-zinc-600'
            : state === 'active'
              ? 'text-zinc-900 dark:text-zinc-50'
              : 'text-zinc-500 dark:text-zinc-400'}"
      >
        <span
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold
            {state === 'pending'
              ? 'border-zinc-300 bg-transparent text-zinc-400 dark:border-zinc-700 dark:text-zinc-600'
              : state === 'active'
                ? 'border-brand bg-brand text-brand-ink'
                : 'border-positive/40 bg-positive-soft text-positive dark:bg-positive/10 dark:text-emerald-300'}"
          aria-hidden="true"
        >
          {#if state === "done"}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-3 w-3"
            >
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          {:else}
            {index + 1}
          {/if}
        </span>

        {step}

        {#if state === "active"}
          <span class="sr-only">(current step)</span>
        {/if}
      </span>

      {#if index < steps.length - 1}
        <span
          class="h-px w-4 bg-zinc-200 sm:w-6 dark:bg-zinc-800"
          aria-hidden="true"
        ></span>
      {/if}
    </li>
  {/each}
</ol>
