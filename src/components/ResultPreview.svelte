<script lang="ts">
  import { onDestroy } from "svelte";
  import PreviewViewport from "./PreviewViewport.svelte";
  import { formatBytes } from "../lib/format-utils";
  import {
    clampPreviewText,
    readTextPreview,
    renderPdfPreview
  } from "../lib/result-preview";

  export type ResultKind = "image" | "pdf" | "svg" | "text" | "file";

  interface Props {
    url: string;
    name: string;
    mimeType: string;
    size: number;
    kind: ResultKind;
    /** Pages, for PDF output. */
    pages?: number;
    /** Server-reported pixel dimensions, when the endpoint knows them. */
    width?: number;
    height?: number;
  }

  let {
    url,
    name,
    mimeType,
    size,
    kind,
    pages,
    width,
    height
  }: Props = $props();

  let pdfDataUrl = $state<string | null>(null);
  let pdfPageCount = $state<number | null>(null);
  let textBody = $state<string | null>(null);
  let previewError = $state<string | null>(null);
  let loading = $state(false);

  let loadToken = 0;
  let objectUrl: string | null = null;

  const label = $derived.by(() => {
    if (kind === "pdf") return "PDF document";
    if (kind === "svg") return "SVG drawing";
    if (kind === "text") return "Text file";
    if (kind === "image") return "Image";
    return "File";
  });

  const extension = $derived.by(() => {
    const match = /\.([a-z0-9]+)$/i.exec(name);

    return match ? match[1].toUpperCase() : "";
  });

  const pdfPages = $derived(pdfPageCount ?? pages ?? 1);
  const pdfPagesLabel = $derived(pdfPages === 1 ? "page" : "pages");

  const hint = $derived.by(() => {
    if (kind === "pdf") {
      return "Rendered from the converted file with PDF.js.";
    }
    if (kind === "svg") {
      return "Rendered by your browser from the converted file.";
    }
    if (kind === "image") {
      return "Rendered by your browser from the converted file.";
    }
    if (kind === "text") {
      return "First bytes of the converted file.";
    }
    return "This format has no visual preview. The file is ready to download.";
  });

  function loadTextPreview(blob: Blob, token: number) {
    void readTextPreview(blob).then((text) => {
      if (token === loadToken) {
        textBody = clampPreviewText(text);
        loading = false;
      }
    });
  }

  async function loadPdfPreview(blob: Blob, token: number) {
    try {
      const buffer = await blob.arrayBuffer();

      if (token !== loadToken) {
        return;
      }

      const preview = await renderPdfPreview(buffer);

      if (token !== loadToken) {
        return;
      }

      pdfDataUrl = preview.dataUrl;
      pdfPageCount = preview.pageCount;
      loading = false;
    } catch (error) {
      if (token !== loadToken) {
        return;
      }

      previewError =
        error instanceof Error
          ? error.message
          : "This PDF could not be previewed.";
      loading = false;
    }
  }

  $effect(() => {
    // Re-run when the file changes, never on an unrelated parent update.
    const source = url;
    const sourceKind = kind;

    loadToken += 1;
    const token = loadToken;

    pdfDataUrl = null;
    pdfPageCount = null;
    textBody = null;
    previewError = null;
    loading = sourceKind === "pdf" || sourceKind === "text";

    if (!loading) {
      return;
    }

    let cancelled = false;

    void fetch(source)
      .then((response) => {
        if (!response.ok) {
          throw new Error("The converted file could not be read back.");
        }

        return response.blob();
      })
      .then((blob) => {
        if (cancelled || token !== loadToken) {
          return;
        }

        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }

        objectUrl = URL.createObjectURL(blob);

        if (sourceKind === "pdf") {
          return loadPdfPreview(blob, token);
        }

        loadTextPreview(blob, token);
      })
      .catch((error: unknown) => {
        if (cancelled || token !== loadToken) {
          return;
        }

        previewError =
          error instanceof Error
            ? error.message
            : "The converted file could not be previewed.";
        loading = false;
      });

    return () => {
      cancelled = true;
    };
  });

  onDestroy(() => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  });
</script>

<section class="dc-card overflow-hidden" aria-label={`Preview of ${name}`}>
  <header
    class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
  >
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">
      Converted result
    </h3>

    <span
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide
        {previewError
          ? 'border-caution/30 bg-caution-soft text-caution dark:bg-caution/10 dark:text-amber-300'
          : 'border-positive/30 bg-positive-soft text-positive dark:bg-positive/10 dark:text-emerald-300'}"
    >
      <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
      {previewError ? "Preview limited" : "Preview ready"}
    </span>
  </header>

  <figure class="m-0">
    <div class="dc-alpha min-h-52 sm:min-h-64">
      {#if kind === "image" || kind === "svg"}
        <PreviewViewport
          class="h-[min(30rem,60vh)]"
          resetKey={url}
          label={`Converted result ${name}. Drag to pan, scroll to zoom.`}
        >
          <img
            src={url}
            alt={`Converted result: ${name}`}
            class="dc-fade-in max-h-full max-w-full object-contain"
            decoding="async"
            draggable="false"
          />
        </PreviewViewport>
      {:else if kind === "pdf"}
        {#if pdfDataUrl}
          <PreviewViewport
            class="h-[min(30rem,60vh)]"
            resetKey={pdfDataUrl}
            label={`Page 1 of ${name}. Drag to pan, scroll to zoom.`}
          >
            <img
              src={pdfDataUrl}
              alt={`Page 1 of the converted file ${name}`}
              class="dc-fade-in max-h-full max-w-full object-contain shadow-lift"
              draggable="false"
            />
          </PreviewViewport>
        {:else if loading}
          <div class="flex h-[min(30rem,60vh)] items-center justify-center">
            <span class="flex items-center gap-3 text-sm text-zinc-500">
              <span
                class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-brand"
                aria-hidden="true"
              ></span>
              Rendering page 1…
            </span>
          </div>
        {:else}
          <div class="flex h-[min(30rem,60vh)] items-center justify-center px-4">
            <p class="text-center text-sm text-zinc-600 dark:text-zinc-300">
              {previewError ?? "Preview unavailable for this PDF."} The file is
              still ready to download.
            </p>
          </div>
        {/if}
      {:else if kind === "text"}
        {#if textBody !== null}
          <pre
            class="dc-fade-in max-h-[min(30rem,60vh)] w-full overflow-auto whitespace-pre-wrap break-words p-4 text-left font-mono text-2xs leading-relaxed text-zinc-700 dark:text-zinc-300">{textBody}</pre>
        {:else if loading}
          <div class="flex h-52 items-center justify-center">
            <span class="text-sm text-zinc-500">Reading the converted file…</span>
          </div>
        {:else}
          <div class="flex h-52 items-center justify-center px-4">
            <p class="text-sm text-zinc-600 dark:text-zinc-300">
              {previewError ?? "This file cannot be shown here."}
            </p>
          </div>
        {/if}
      {:else}
        <div class="flex h-52 items-center justify-center px-4 text-center">
          <div>
            <span
              class="mx-auto flex h-16 w-16 items-center justify-center rounded-card bg-zinc-100 font-mono text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              aria-hidden="true"
            >
              {extension || "FILE"}
            </span>
            <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {label} ready
            </p>
            <p class="mt-1 font-mono text-2xs text-zinc-500">
              {mimeType} · {formatBytes(size)}
            </p>
          </div>
        </div>
      {/if}
    </div>

    <figcaption
      class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800"
    >
      <span class="dc-chip">{extension || label}</span>
      <span class="dc-metric">{formatBytes(size)}</span>

      {#if width && height}
        <span class="dc-metric">{width} × {height} px</span>
      {/if}

      {#if kind === "pdf"}
        <span class="dc-metric">{pdfPages} {pdfPagesLabel}</span>
      {/if}

      <span class="w-full text-2xs text-zinc-400 dark:text-zinc-500">
        {hint} Drag to pan, scroll or pinch to zoom.
      </span>
    </figcaption>
  </figure>
</section>
