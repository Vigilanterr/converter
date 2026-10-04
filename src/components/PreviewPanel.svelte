<script lang="ts">
  import ImageCompare from "./ImageCompare.svelte";
  import PreviewInfo from "./PreviewInfo.svelte";
  import PreviewViewport from "./PreviewViewport.svelte";
  import type { PreviewMeta, PreviewStatus } from "../lib/image-preview";

  interface Props {
    status: PreviewStatus;
    /** Whether the browser can render this tool's output at all. */
    supported: boolean;
    message: string | null;
    original: PreviewMeta | null;
    converted: PreviewMeta | null;
    outputFormat: string;
  }

  let {
    status,
    supported,
    message,
    original,
    converted,
    outputFormat
  }: Props = $props();

  let view = $state<"split" | "compare">("split");

  const pill = $derived.by(() => {
    if (!supported) {
      return {
        label: "Runs on convert",
        tone: "neutral"
      };
    }

    if (status === "error") {
      return { label: "Preview failed", tone: "error" };
    }

    if (status === "loading" || status === "updating") {
      return {
        label: status === "loading" ? "Preparing" : "Updating",
        tone: "neutral"
      };
    }

    if (status === "idle" && message) {
      return { label: "Unavailable", tone: "warning" };
    }

    return { label: "Live preview", tone: "success" };
  });

  const pillTone: Record<string, string> = {
    neutral:
      "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    warning:
      "border-caution/30 bg-caution-soft text-caution dark:bg-caution/10 dark:text-amber-300",
    error:
      "border-critical/30 bg-critical-soft text-critical dark:bg-critical/10 dark:text-red-300",
    success:
      "border-positive/30 bg-positive-soft text-positive dark:bg-positive/10 dark:text-emerald-300"
  };

  const canCompare = $derived(!!original?.url && !!converted?.url);
  const showCompare = $derived(view === "compare" && canCompare);
  const busy = $derived(status === "loading" || status === "updating");
</script>

<section class="dc-card overflow-hidden" aria-labelledby="live-preview-heading">
  <header
    class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
  >
    <div class="min-w-0">
      <h2
        id="live-preview-heading"
        class="text-sm font-semibold text-zinc-900 dark:text-white"
      >
        Live preview
      </h2>

      <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {#if supported}
          Rendered in your browser from the source file.
        {:else}
          This output is produced on the server. The result is previewed after
          conversion.
        {/if}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide {pillTone[
          pill.tone
        ]}"
        role="status"
      >
        <span
          class="h-1.5 w-1.5 shrink-0 rounded-full bg-current {busy
            ? 'animate-pulse'
            : ''}"
          aria-hidden="true"
        ></span>
        {pill.label}
      </span>

      {#if canCompare}
        <div
          class="flex items-center rounded-control border border-zinc-200 p-0.5 dark:border-zinc-700"
          role="group"
          aria-label="Preview layout"
        >
          <button
            type="button"
            class="rounded-[4px] px-2 py-1 text-2xs font-semibold transition {view ===
            'split'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}"
            aria-pressed={view === "split"}
            onclick={() => (view = "split")}
          >
            Side by side
          </button>

          <button
            type="button"
            class="rounded-[4px] px-2 py-1 text-2xs font-semibold transition {view ===
            'compare'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}"
            aria-pressed={view === "compare"}
            onclick={() => (view = "compare")}
          >
            Overlay
          </button>
        </div>
      {/if}
    </div>
  </header>

  <div class="space-y-4 p-4">
    {#if message}
      <p
        class="dc-note {status === 'error' ? 'dc-note-error' : 'dc-note-warning'}"
        role={status === "error" ? "alert" : "status"}
      >
        <span aria-hidden="true" class="shrink-0">
          {#if status === "error"}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              class="h-4 w-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              />
            </svg>
          {:else}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              class="h-4 w-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          {/if}
        </span>
        <span>{message}</span>
      </p>
    {/if}

    {#if !original}
      <div
        class="flex min-h-52 flex-col items-center justify-center gap-2 rounded-control border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700"
      >
        <span
          class="flex h-10 w-10 items-center justify-center rounded-control bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            class="h-5 w-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z"
            />
          </svg>
        </span>

        <p class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          Your preview appears here
        </p>

        <p class="max-w-xs text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Add a file and the converted result is rendered before you download it.
        </p>
      </div>
    {:else if showCompare && original.url && converted}
      <ImageCompare
        beforeUrl={original.url}
        afterUrl={converted.url ?? ""}
        beforeAlt={`Original ${original.name}`}
        afterAlt={`Converted preview of ${original.name}`}
        afterLabel={converted.format}
      />

      <PreviewInfo meta={converted} />
    {:else}
      <div
        class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      >
        <figure class="min-w-0">
          <figcaption
            class="mb-2 flex items-baseline justify-between gap-2 text-2xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            <span>Original</span>
            <span class="font-mono normal-case tracking-normal text-zinc-400">
              {original.format}
            </span>
          </figcaption>

          <div
            class="h-44 rounded-control border border-zinc-200 sm:h-56 {original.hasAlpha
              ? 'dc-alpha'
              : 'bg-white dark:bg-zinc-950'}"
          >
            {#key original.url}
              {#if original.url}
                <PreviewViewport
                  class="h-full w-full rounded-control"
                  resetKey={original.url}
                  label={`Original ${original.name}. Drag to pan, scroll to zoom.`}
                >
                  <img
                    src={original.url}
                    alt={`Original ${original.name}`}
                    class="dc-fade-in max-h-full max-w-full object-contain"
                    draggable="false"
                  />
                </PreviewViewport>
              {:else}
                <div class="flex h-full items-center justify-center p-3">
                  <span
                    class="rounded-control bg-zinc-100 px-3 py-2 font-mono text-2xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {original.format}
                  </span>
                </div>
              {/if}
            {/key}
          </div>

          <PreviewInfo meta={original} />
        </figure>

        <div
          class="flex items-center justify-center py-1"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            class="h-4 w-4 rotate-90 text-zinc-300 sm:rotate-0 dark:text-zinc-600"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 4.5 21 12l-7.5 7.5M3 12h18"
            />
          </svg>
        </div>

        <figure class="min-w-0">
          <figcaption
            class="mb-2 flex items-baseline justify-between gap-2 text-2xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            <span>Preview</span>
            <span class="font-mono normal-case tracking-normal text-zinc-400">
              {converted ? converted.format : outputFormat}
            </span>
          </figcaption>

          {#if converted && converted.url}
            <div
              class="h-44 rounded-control border border-zinc-200 sm:h-56 {converted.hasAlpha
                ? 'dc-alpha'
                : 'bg-white dark:bg-zinc-950'}"
            >
              {#key converted.url}
                <PreviewViewport
                  class="h-full w-full rounded-control"
                  resetKey={converted.url}
                  label={`Converted preview of ${original.name}. Drag to pan, scroll to zoom.`}
                >
                  <img
                    src={converted.url}
                    alt={`Converted preview of ${original.name}`}
                    class="dc-fade-in max-h-full max-w-full object-contain"
                    draggable="false"
                  />
                </PreviewViewport>
              {/key}
            </div>

            <PreviewInfo meta={converted} />
          {:else}
            <div
              class="flex h-44 flex-col items-center justify-center gap-2 rounded-control border border-dashed border-zinc-300 px-4 text-center sm:h-56 dark:border-zinc-700"
            >
              {#if status === "error" || !supported}
                <p class="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {supported
                    ? "Preview failed"
                    : `Preview appears after conversion`}
                </p>

                <p class="max-w-[24ch] text-xs text-zinc-500 dark:text-zinc-400">
                  {supported
                    ? "You can still run the conversion."
                    : "The result is rendered here as soon as it is ready."}
                </p>
              {:else}
                <span
                  class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-brand"
                  aria-hidden="true"
                ></span>

                <p class="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {status === "updating" ? "Updating preview…" : "Preparing preview…"}
                </p>
              {/if}
            </div>
          {/if}
        </figure>
      </div>
    {/if}
  </div>
</section>
