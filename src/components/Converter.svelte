<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { ToolConfig } from "../data/tools";
  import { toolOutputFormat, toolProducesPdf } from "../data/tools";
  import PreviewPanel from "./PreviewPanel.svelte";  import ResultPreview, { type ResultKind } from "./ResultPreview.svelte";
  import StepRail from "./StepRail.svelte";
  import UploadZone from "./UploadZone.svelte";
  import { baseNameOf, extensionOf, formatLabelFromFile } from "../lib/file-utils";
  import {
    extensionForFormat,
    formatBytes,
    mimeForFormat,
    normalizeFormatLabel
  } from "../lib/format-utils";
  import {
    computeTargetSize,
    createPreview,
    encodePreview,
    estimateOutputSize,
    exportCanvas,
    hasTransparency,
    loadImage,
    PREVIEW_DEBOUNCE_MS,
    PREVIEW_FAILED_NOTE,
    REDUCED_PREVIEW_NOTE,
    UNSUPPORTED_PREVIEW_NOTE,
    type PreviewMeta,
    type PreviewOutputFormat,
    type PreviewStatus
  } from "../lib/image-preview";

  interface Props {
    tool: ToolConfig;
    accept: string;
    maxFileSizeMb: number;
  }

  /** Outputs a browser canvas can encode, so the preview can run locally. */
  const PREVIEWABLE_OUTPUTS = new Set(["PNG", "JPG", "WEBP"]);

  const STEPS = ["Upload", "Convert", "Preview", "Download"];

  /** MIME types whose payload is genuinely readable text. */
  const TEXTUAL_MIME = /^(text\/|application\/(json|xml|yaml|x-yaml|xhtml\+xml|javascript|toml))/;

  const REQUEST_TIMEOUT_MS = 120_000;

  type QueueStatus = "queued" | "uploading" | "processing" | "done" | "error";
  type Stage = "idle" | "uploading" | "processing" | "success" | "error";

  interface QueueItem {
    id: string;
    file: File;
    status: QueueStatus;
    previewUrl?: string;
    progress?: number;
    error?: string;
  }

  interface ResultItem {
    id: string;
    name: string;
    size: number;
    url: string;
    mimeType: string;
    kind: ResultKind;
    width?: number;
    height?: number;
    pages?: number;
    sourceName?: string;
  }

  let { tool, accept, maxFileSizeMb }: Props = $props();

  const maxBytes = maxFileSizeMb * 1024 * 1024;

  const acceptedExtensions = $derived(
    new Set(
      accept
        .split(",")
        .map((value) => value.trim().replace(".", "").toLowerCase())
        .filter(Boolean)
    )
  );

  let files = $state<QueueItem[]>([]);
  let results = $state<ResultItem[]>([]);
  let stage = $state<Stage>("idle");
  let uploadProgress = $state(0);
  let notice = $state<string | null>(null);
  let problems = $state<string[]>([]);

  let quality = $state(85);
  let background = $state("#ffffff");
  let width = $state<number | null>(null);
  let height = $state<number | null>(null);
  let rotation = $state(0);
  let removeMetadata = $state(true);
  let traceMode = $state<"color" | "grayscale" | "lineart">("color");
  let traceColors = $state(8);
  let traceDetail = $state(0.5);
  let traceSmoothing = $state(0.5);

  let selectedId = $state<string | null>(null);
  let activeResultId = $state<string | null>(null);

  let previewStatus = $state<PreviewStatus>("idle");
  let previewNote = $state<string | null>(null);
  let previewError = $state<string | null>(null);
  let originalMeta = $state<PreviewMeta | null>(null);
  let convertedMeta = $state<PreviewMeta | null>(null);
  let sourceToken = $state(0);

  let sourceImage: HTMLImageElement | null = null;
  let sourceFileName = "";
  let convertedObjectUrl: string | null = null;
  let loadToken = 0;
  let renderToken = 0;
  let renderedOnce = false;

  const traceModes = [
    {
      value: "color" as const,
      label: "Colour regions",
      hint: "Flattens into flat colour shapes. Best for logos and flat artwork."
    },
    {
      value: "grayscale" as const,
      label: "Greyscale",
      hint: "Two tones only. Good for scans, stamps and black and white art."
    },
    {
      value: "lineart" as const,
      label: "Line art",
      hint: "Traces edges into strokes. Best for sketches, maps and lettering."
    }
  ];

  const outputFormat = $derived(toolOutputFormat(tool).toUpperCase());
  const normalizedOutput = $derived(normalizeFormatLabel(outputFormat));
  const isPdfOutput = $derived(toolProducesPdf(tool));
  const runsInBrowser = $derived(tool.browserSupported);
  const isSvgOutput = $derived(normalizedOutput === "SVG");
  const acceptsMultiple = $derived(isPdfOutput);
  const queuedCount = $derived(
    files.filter((item) => item.status !== "done").length
  );
  const isBusy = $derived(stage === "uploading" || stage === "processing");
  const canConvert = $derived(files.length > 0 && !isBusy);
  const outputPreviewable = $derived(
    PREVIEWABLE_OUTPUTS.has(normalizedOutput)
  );
  const previewFormat = $derived(normalizedOutput as PreviewOutputFormat);
  const previewMessage = $derived(previewError ?? previewNote);
  const previewBusy = $derived(previewStatus === "loading");

  const activeResult = $derived(
    results.find((item) => item.id === activeResultId) ?? null
  );

  const selectedFormat = $derived.by(() => {
    const id = selectedId;
    const item = untrack(() => files.find((entry) => entry.id === id));

    return item ? formatLabelFromFile(item.file) : "";
  });

  const errors = $derived(
    files.filter((item) => item.status === "error" && item.error)
  );

  const stepIndex = $derived.by(() => {
    if (stage === "uploading") return 0;
    if (stage === "processing") return 1;
    if (stage === "success") return 3;
    if (stage === "error") return results.length > 0 ? 3 : 0;

    return -1;
  });

  const primaryLabel = $derived.by(() => {
    if (isBusy) {
      return stage === "uploading" ? "Uploading…" : "Converting…";
    }

    if (results.length > 0) {
      return activeResult ? `Download ${activeResult.name}` : "Download";
    }

    if (files.length === 0) {
      return "Add a file to convert";
    }

    if (previewBusy) {
      return "Preparing preview…";
    }

    return `Convert to ${outputFormat}`;
  });

  function kindForMime(mimeType: string): ResultKind {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType === "image/svg+xml") return "svg";
    if (mimeType.startsWith("image/")) return "image";
    if (TEXTUAL_MIME.test(mimeType)) return "text";

    return "file";
  }

  function extensionForOutput(): string {
    return extensionForFormat(outputFormat);
  }

  function mimeForOutput(): string {
    return mimeForFormat(outputFormat);
  }

  function disposeConvertedPreview(): void {
    if (convertedObjectUrl) {
      URL.revokeObjectURL(convertedObjectUrl);
      convertedObjectUrl = null;
    }
  }

  function releaseResults() {
    for (const result of results) {
      URL.revokeObjectURL(result.url);
    }

    results = [];
    activeResultId = null;
  }

  function addFiles(incoming: FileList | File[]) {
    const rejected: string[] = [];
    const accepted: QueueItem[] = [];

    for (const file of Array.from(incoming)) {
      if (!acceptedExtensions.has(extensionOf(file.name))) {
        rejected.push(`${file.name} is not a supported file type.`);
        continue;
      }

      if (file.size === 0) {
        rejected.push(`${file.name} is empty.`);
        continue;
      }

      if (file.size > maxBytes) {
        rejected.push(
          `${file.name} is larger than the ${maxFileSizeMb} MB limit.`
        );
        continue;
      }

      if (
        files.some((item) => item.file.name === file.name) ||
        accepted.some((item) => item.file.name === file.name)
      ) {
        continue;
      }

      const isImage =
        file.type.startsWith("image/") || extensionOf(file.name) === "svg";

      accepted.push({
        id: crypto.randomUUID(),
        file,
        status: "queued",
        previewUrl: isImage ? URL.createObjectURL(file) : undefined
      });
    }

    if (accepted.length > 0) {
      files = [...files, ...accepted];
      notice = null;
      problems = [];

      if (!selectedId || !files.some((item) => item.id === selectedId)) {
        selectedId = accepted[0].id;
      }

      stage = "idle";
    }

    if (rejected.length > 0) {
      problems = rejected.slice(0, 4);
    }
  }

  function removeFile(id: string) {
    const target = files.find((item) => item.id === id);

    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }

    const remaining = files.filter((item) => item.id !== id);
    files = remaining;

    if (selectedId === id) {
      selectedId = remaining[0]?.id ?? null;
    }

    if (remaining.length === 0) {
      resetRunState();
    }
  }

  function resetRunState() {
    releaseResults();
    stage = "idle";
    uploadProgress = 0;
    notice = null;
    problems = [];
  }

  function clearAll() {
    for (const item of files) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }

    disposeConvertedPreview();
    sourceImage = null;
    sourceFileName = "";

    files = [];
    selectedId = null;

    resetRunState();
  }

  function updateItem(
    id: string,
    patch: Partial<Pick<QueueItem, "status" | "error" | "progress">>
  ) {
    files = files.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
  }

  $effect(() => {
    const id = selectedId;
    const token = ++loadToken;

    sourceImage = null;
    sourceFileName = "";
    renderedOnce = false;
    disposeConvertedPreview();
    convertedMeta = null;
    previewNote = null;
    previewError = null;

    const item = untrack(() => files.find((entry) => entry.id === id) ?? null);

    if (!item) {
      originalMeta = null;
      previewStatus = "idle";
      return;
    }

    sourceFileName = item.file.name;
    previewStatus = "loading";
    originalMeta = {
      name: item.file.name,
      format: formatLabelFromFile(item.file),
      size: item.file.size,
      sizeLabel: "File size",
      url: item.previewUrl
    };

    let cancelled = false;

    loadImage(item.file)
      .then((image) => {
        if (cancelled || token !== loadToken) {
          return;
        }

        if (!image.naturalWidth || !image.naturalHeight) {
          previewStatus = "idle";
          previewNote = UNSUPPORTED_PREVIEW_NOTE;
          return;
        }

        sourceImage = image;

        const current = originalMeta;

        originalMeta = current
          ? {
              ...current,
              width: image.naturalWidth,
              height: image.naturalHeight,
              hasAlpha: hasTransparency(
                image,
                image.naturalWidth,
                image.naturalHeight
              )
            }
          : current;

        if (!outputPreviewable) {
          previewStatus = "idle";
          previewNote = UNSUPPORTED_PREVIEW_NOTE;
          return;
        }

        previewStatus = "loading";
        sourceToken += 1;
      })
      .catch(() => {
        if (cancelled || token !== loadToken) {
          return;
        }

        previewStatus = "error";
        previewError = PREVIEW_FAILED_NOTE;
      });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const id = selectedId;
    const generation = sourceToken;
    const sourceFormat = selectedFormat;
    const options = { quality, background, width, height, rotation };
    const image = sourceImage;
    const currentLoad = loadToken;

    if (!id || !image || generation === 0 || !outputPreviewable) {
      return;
    }

    const runId = ++renderToken;
    const timer = window.setTimeout(() => {
      void renderConverted(image, sourceFormat, options, runId, currentLoad);
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  });

  async function renderConverted(
    image: HTMLImageElement,
    sourceFormat: string,
    options: {
      quality: number;
      background: string;
      width: number | null;
      height: number | null;
      rotation: number;
    },
    runId: number,
    currentLoad: number
  ): Promise<void> {
    previewStatus = renderedOnce ? "updating" : "loading";
    previewError = null;

    const flatten =
      previewFormat === "JPG" ||
      (sourceFormat === "SVG" && tool.options.includes("background"));

    try {
      const render = createPreview(image, {
        outputFormat: previewFormat,
        quality: options.quality,
        width: options.width,
        height: options.height,
        background: options.background,
        rotation: options.rotation,
        flatten
      });

      const encoded = await encodePreview(render.canvas, {
        outputFormat: previewFormat,
        quality: options.quality
      });

      if (runId !== renderToken || currentLoad !== loadToken) {
        return;
      }

      disposeConvertedPreview();

      const url = URL.createObjectURL(encoded.blob);
      convertedObjectUrl = url;

      convertedMeta = {
        name: `${baseNameOf(sourceFileName)}.${extensionForFormat(encoded.format)}`,
        format: encoded.format,
        size: estimateOutputSize(encoded.blob.size, render),
        sizeLabel: "Estimated size",
        width: render.finalWidth,
        height: render.finalHeight,
        hasAlpha:
          encoded.format !== "JPG" &&
          !flatten &&
          (originalMeta?.hasAlpha ?? false),
        url
      };

      previewNote =
        [
          encoded.note,
          render.reduced ? REDUCED_PREVIEW_NOTE : null
        ]
          .filter(Boolean)
          .join(" ") || null;
      previewStatus = "ready";
      renderedOnce = true;
    } catch {
      if (runId !== renderToken || currentLoad !== loadToken) {
        return;
      }

      disposeConvertedPreview();
      convertedMeta = null;
      previewStatus = "error";
      previewError = PREVIEW_FAILED_NOTE;
    }
  }

  function collectOptions(): FormData {
    const formData = new FormData();

    formData.append("tool", tool.slug);
    formData.append("output", outputFormat);

    if (tool.options.includes("quality")) {
      formData.append("quality", String(quality));
    }

    if (tool.options.includes("background")) {
      formData.append("background", background);
    }

    if (tool.options.includes("resize")) {
      if (width) {
        formData.append("width", String(width));
      }

      if (height) {
        formData.append("height", String(height));
      }
    }

    if (tool.options.includes("rotation")) {
      formData.append("rotation", String(rotation));
    }

    if (tool.options.includes("metadata")) {
      formData.append("keepMetadata", String(!removeMetadata));
    }

    if (tool.options.includes("trace")) {
      formData.append("traceMode", traceMode);
      formData.append("traceColors", String(traceColors));
      formData.append("traceDetail", String(traceDetail));
      formData.append("traceSmoothing", String(traceSmoothing));
    }

    return formData;
  }

  function headerValue(headers: Headers, name: string): string | null {
    return headers.get(name);
  }

  function fileNameFromHeaders(headers: Headers, fallback: string): string {
    const disposition = headerValue(headers, "Content-Disposition");
    const match = disposition?.match(/filename="([^"]+)"/);

    return match?.[1] ?? fallback;
  }

  interface ServerResponse {
    blob: Blob;
    headers: Headers;
  }

  function headersFromXhr(request: XMLHttpRequest): Headers {
    const headers = new Headers();

    for (const line of request
      .getAllResponseHeaders()
      .trim()
      .split(/[\r\n]+/)) {
      const index = line.indexOf(":");

      if (index > 0) {
        headers.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
      }
    }

    return headers;
  }

  /**
   * `fetch` cannot report upload progress, so the server path uses XHR. The
   * `upload` events are what separate the uploading state from the processing
   * state: once the last byte is sent, the server is doing the work.
   */
  function postToServer(
    formData: FormData,
    onProgress: (percent: number) => void,
    onSent: () => void
  ): Promise<ServerResponse> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();

      request.open("POST", "/api/image-convert");
      request.responseType = "blob";
      request.timeout = REQUEST_TIMEOUT_MS;

      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(
            Math.min(99, Math.round((event.loaded / event.total) * 100))
          );
        }
      });

      request.upload.addEventListener("load", () => {
        onProgress(100);
        onSent();
      });

      request.addEventListener("load", () => {
        const blob = request.response as Blob;

        if (request.status >= 200 && request.status < 300) {
          resolve({ blob, headers: headersFromXhr(request) });
          return;
        }

        void blob.text().then((text) => {
          try {
            const body = JSON.parse(text) as { error?: unknown };

            reject(
              new Error(
                typeof body.error === "string" && body.error
                  ? body.error
                  : `The server rejected the conversion (status ${request.status}).`
              )
            );
          } catch {
            reject(
              new Error(
                `The server rejected the conversion (status ${request.status}).`
              )
            );
          }
        });
      });

      request.addEventListener("error", () =>
        reject(
          new Error(
            "The file could not be uploaded. Check your connection and try again."
          )
        )
      );

      request.addEventListener("timeout", () =>
        reject(
          new Error(
            "The conversion timed out. Try a smaller file or a simpler set of options."
          )
        )
      );

      request.addEventListener("abort", () =>
        reject(new Error("The conversion was cancelled."))
      );

      request.send(formData);
    });
  }

  async function requestServer(items: QueueItem[]): Promise<void> {
    const formData = collectOptions();

    for (const item of items) {
      formData.append("file", item.file, item.file.name);
    }

    const { blob, headers } = await postToServer(
      formData,
      (percent) => {
        uploadProgress = percent;

        if (items.length === 1) {
          updateItem(items[0].id, { progress: percent });
        }
      },
      () => {
        stage = "processing";

        if (items.length === 1) {
          updateItem(items[0].id, { status: "processing" });
        }
      }
    );

    const tracePaths = headerValue(headers, "X-Trace-Path-Count");

    if (tracePaths) {
      notice =
        `Traced into ${tracePaths} vector path${tracePaths === "1" ? "" : "s"}.` +
        (headerValue(headers, "X-Trace-Downscaled") === "true"
          ? " The source was reduced before tracing — raise the detail slider if the result looks too coarse."
          : "");
    }

    const fallbackName = isPdfOutput
      ? `${items.length > 1 ? "images" : baseNameOf(items[0].file.name)}.pdf`
      : `${baseNameOf(items[0].file.name)}.${extensionForOutput()}`;

    const widthHeader = Number(headerValue(headers, "X-Output-Width") ?? "");
    const heightHeader = Number(headerValue(headers, "X-Output-Height") ?? "");
    const mimeType = blob.type || mimeForOutput();
    const result: ResultItem = {
      id: crypto.randomUUID(),
      name: fileNameFromHeaders(headers, fallbackName),
      size: blob.size,
      url: URL.createObjectURL(blob),
      mimeType,
      kind: kindForMime(mimeType),
      width: widthHeader > 0 ? widthHeader : undefined,
      height: heightHeader > 0 ? heightHeader : undefined,
      pages: isPdfOutput ? items.length : undefined,
      sourceName: items[0].file.name
    };

    results = [...results, result];
    activeResultId = result.id;
  }

  async function convertInBrowser(item: QueueItem): Promise<void> {
    const image = await loadImage(item.file);
    const { width: targetWidth, height: targetHeight } = computeTargetSize(
      image.naturalWidth,
      image.naturalHeight,
      width,
      height
    );

    const swapAxes = rotation === 90 || rotation === 270;
    const canvas = document.createElement("canvas");

    canvas.width = swapAxes ? targetHeight : targetWidth;
    canvas.height = swapAxes ? targetWidth : targetHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("This browser does not provide a 2D canvas.");
    }

    if (normalizedOutput === "JPG" || normalizedOutput === "JPEG") {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(
      image,
      -targetWidth / 2,
      -targetHeight / 2,
      targetWidth,
      targetHeight
    );
    context.restore();

    let mimeType = mimeForOutput();
    const encodingQuality = tool.options.includes("quality")
      ? quality / 100
      : undefined;
    let blob = await exportCanvas(canvas, mimeType, encodingQuality);
    let extension = extensionForOutput();

    if (mimeType === "image/webp" && blob.type !== "image/webp") {
      mimeType = "image/png";
      extension = "png";
      blob = await exportCanvas(canvas, mimeType, encodingQuality);
      notice = "This browser cannot encode WebP, so PNG was produced instead.";
    }

    const result: ResultItem = {
      id: crypto.randomUUID(),
      name: `${baseNameOf(item.file.name)}.${extension}`,
      size: blob.size,
      url: URL.createObjectURL(blob),
      mimeType,
      kind: kindForMime(blob.type || mimeType),
      width: canvas.width,
      height: canvas.height,
      sourceName: item.file.name
    };

    results = [...results, result];
    activeResultId = result.id;
  }

  function describeError(error: unknown): string {
    return error instanceof Error && error.message
      ? error.message
      : "The conversion failed.";
  }

  async function run() {
    if (!canConvert) {
      return;
    }

    releaseResults();
    notice = null;
    problems = [];

    for (const item of files) {
      updateItem(item.id, { status: "queued", error: undefined, progress: 0 });
    }

    uploadProgress = 0;

    const pending = files.filter((item) => item.status !== "done");

    if (pending.length === 0) {
      return;
    }

    try {
      if (runsInBrowser) {
        stage = "processing";

        for (const item of pending) {
          updateItem(item.id, { status: "processing" });

          try {
            await convertInBrowser(item);
            updateItem(item.id, { status: "done", progress: 100 });
          } catch (error) {
            updateItem(item.id, {
              status: "error",
              error: describeError(error)
            });
          }
        }
      } else if (isPdfOutput) {
        stage = "uploading";
        updateItem(pending[0].id, { status: "uploading" });

        try {
          await requestServer(pending);
          files = files.map((item) => ({ ...item, status: "done", progress: 100 }));
        } catch (error) {
          updateItem(pending[0].id, {
            status: "error",
            error: describeError(error)
          });
        }
      } else {
        for (const item of pending) {
          stage = "uploading";
          updateItem(item.id, { status: "uploading" });

          try {
            await requestServer([item]);
            updateItem(item.id, { status: "done", progress: 100 });
          } catch (error) {
            updateItem(item.id, {
              status: "error",
              error: describeError(error)
            });
          }
        }
      }
    } catch (error) {
      problems = [describeError(error)];
    } finally {
      stage = results.length > 0 ? "success" : "error";
      uploadProgress = 100;
    }
  }

  function triggerDownload(result: ResultItem) {
    const anchor = document.createElement("a");

    anchor.href = result.url;
    anchor.download = result.name;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  function downloadActive() {
    if (activeResult) {
      triggerDownload(activeResult);
    }
  }

  function downloadAll() {
    results.forEach((result, index) => {
      window.setTimeout(() => triggerDownload(result), index * 150);
    });
  }

  function rowLabel(item: QueueItem, index: number): string {
    if (item.status === "uploading") return "Uploading";
    if (item.status === "processing") return "Converting";
    if (item.status === "done") return "Done";
    if (item.status === "error") return "Failed";

    return isPdfOutput ? `Page ${index + 1}` : "Queued";
  }

  onDestroy(() => {
    for (const item of files) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }

    releaseResults();
    disposeConvertedPreview();
  });
</script>

<div class="space-y-4">
  <StepRail steps={STEPS} activeIndex={stepIndex} />
</div>

<div
  class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
>
  <div class="min-w-0 space-y-5">
    <UploadZone
      inputFormats={tool.inputFormats}
      {accept}
      {maxFileSizeMb}
      multiple={acceptsMultiple}
      busy={isBusy}
      onFiles={addFiles}
    />

    {#if problems.length > 0}
      <div class="dc-note dc-note-error" role="alert">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          class="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.949 3.86a2 2 0 0 0-3.42 0Z"
          />
        </svg>

        <span>
          {#each problems as problem, index (problem)}
            {index > 0 ? " " : ""}{problem}
          {/each}
        </span>
      </div>
    {/if}

    {#if notice}
      <p class="dc-note dc-note-info" role="status">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          class="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M11.25 11.25 12 12m0-3.75h.008v.008H12V8.25ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <span>{notice}</span>
      </p>
    {/if}

    {#if files.length > 0}
      <section class="dc-card overflow-hidden" aria-label="Selected files">
        <header
          class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-white">
            {files.length} file{files.length > 1 ? "s" : ""} selected
          </h2>

          <button
            type="button"
            class="dc-btn dc-btn-ghost dc-btn-sm"
            onclick={clearAll}
            disabled={isBusy}
          >
            Clear all
          </button>
        </header>

        <ul class="divide-y divide-zinc-200 dark:divide-zinc-800">
          {#each files as item, index (item.id)}
            <li
              class="flex items-center gap-3 px-3 py-2.5 transition {selectedId ===
              item.id
                ? 'bg-brand-soft/60 dark:bg-brand/10'
                : ''}"
            >
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  class="peer sr-only"
                  type="radio"
                  name="preview-file"
                  value={item.id}
                  bind:group={selectedId}
                  aria-label={`Preview ${item.file.name}`}
                />

                <span
                  class="flex min-w-0 flex-1 items-center gap-3 rounded-control peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-zinc-950"
                >
                  {#if item.previewUrl}
                    <img
                      src={item.previewUrl}
                      alt=""
                      class="h-9 w-9 shrink-0 rounded-control bg-white object-cover dark:bg-zinc-950"
                    />
                  {:else}
                    <span
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-zinc-100 font-mono text-2xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      aria-hidden="true"
                    >
                      {(extensionOf(item.file.name) || "file").toUpperCase()}
                    </span>
                  {/if}

                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-100"
                    >
                      {item.file.name}
                    </span>

                    <span class="dc-metric mt-0.5 block">
                      {formatLabelFromFile(item.file)} · {formatBytes(
                        item.file.size
                      )}
                    </span>

                    {#if item.error}
                      <span
                        class="mt-1 block text-2xs leading-relaxed text-critical dark:text-red-300"
                      >
                        {item.error}
                      </span>
                    {/if}
                  </span>
                </span>
              </label>

              {#if item.status === "uploading" || item.status === "processing"}
                <span class="dc-metric shrink-0 tabular-nums">
                  {item.status === "uploading"
                    ? `${item.progress ?? 0}%`
                    : "…"}
                </span>
              {:else}
                <span
                  class="dc-metric shrink-0 {item.status === 'error'
                    ? 'text-critical dark:text-red-300'
                    : item.status === 'done'
                      ? 'text-positive dark:text-emerald-300'
                      : ''}"
                >
                  {rowLabel(item, index)}
                </span>
              {/if}

              <button
                type="button"
                class="shrink-0 rounded-control p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label={`Remove ${item.file.name}`}
                onclick={() => removeFile(item.id)}
                disabled={item.status === "uploading" ||
                  item.status === "processing"}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  class="h-4 w-4"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </li>
          {/each}
        </ul>

        {#if files.length > 1}
          <p class="border-t border-zinc-200 px-4 py-2.5 text-2xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Select a row to preview it. Only one file is previewed at a time.
          </p>
        {/if}
      </section>
    {/if}

    {#if tool.options.length > 0}
      <section class="dc-card p-5" aria-label="Conversion options">
        <h2 class="dc-label">Options</h2>

        <div class="mt-4 grid gap-5 sm:grid-cols-2">
          {#if tool.options.includes("quality")}
            <label class="block">
              <span
                class="flex items-baseline justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Quality
                <span class="dc-metric">{quality}</span>
              </span>
              <input
                class="mt-3"
                type="range"
                min="1"
                max="100"
                aria-label="Output quality"
                bind:value={quality}
              />
              <span class="dc-hint mt-2 block">
                85 keeps the visual difference hard to notice.
              </span>
            </label>
          {/if}

          {#if tool.options.includes("background")}
            <div>
              <span class="dc-label">Background</span>
              <div class="mt-3 flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Background colour for transparent areas"
                  bind:value={background}
                />
                <span class="dc-hint">
                  Fills transparent pixels. JPG has no alpha channel.
                </span>
              </div>
            </div>
          {/if}

          {#if tool.options.includes("resize")}
            <div>
              <label class="dc-label" for="resize-width">Resize</label>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <input
                  id="resize-width"
                  class="dc-field"
                  type="number"
                  min="1"
                  placeholder="Width"
                  aria-label="Target width in pixels"
                  bind:value={width}
                />
                <input
                  class="dc-field"
                  type="number"
                  min="1"
                  placeholder="Height"
                  aria-label="Target height in pixels"
                  bind:value={height}
                />
              </div>
              <p class="dc-hint mt-2">
                Leave empty to keep the original size. The ratio is preserved.
              </p>
            </div>
          {/if}

          {#if tool.options.includes("rotation")}
            <label class="block">
              <span class="dc-label">Rotation</span>
              <select
                class="dc-field mt-3"
                aria-label="Rotation"
                bind:value={rotation}
              >
                <option value={0}>No rotation</option>
                <option value={90}>90° clockwise</option>
                <option value={180}>180°</option>
                <option value={270}>270° clockwise</option>
              </select>
            </label>
          {/if}

          {#if tool.options.includes("metadata")}
            <label
              class="flex cursor-pointer items-start gap-3 rounded-control border border-zinc-200 p-3 transition hover:border-zinc-300 sm:col-span-2 dark:border-zinc-800 dark:hover:border-zinc-700"
            >
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                bind:checked={removeMetadata}
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Remove metadata
                </span>
                <span class="dc-hint mt-0.5 block">
                  Strips EXIF, GPS location, camera model and colour profiles.
                </span>
              </span>
            </label>
          {/if}

          {#if tool.options.includes("trace")}
            <fieldset class="sm:col-span-2">
              <legend class="dc-label">Trace mode</legend>

              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                {#each traceModes as option (option.value)}
                  <label
                    class="flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition {traceMode ===
                    option.value
                      ? 'border-brand bg-brand-soft dark:border-brand-lift dark:bg-brand/10'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'}"
                  >
                    <input
                      type="radio"
                      name="traceMode"
                      class="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                      value={option.value}
                      bind:group={traceMode}
                    />
                    <span class="min-w-0">
                      <span
                        class="block font-semibold text-zinc-800 dark:text-zinc-100"
                      >
                        {option.label}
                      </span>
                      <span
                        class="dc-hint mt-0.5 block leading-relaxed"
                      >
                        {option.hint}
                      </span>
                    </span>
                  </label>
                {/each}
              </div>

              <p class="dc-hint mt-3">
                Vectorising redraws the image as paths, so it approximates the
                source rather than reproducing it pixel for pixel. Logos and flat
                artwork trace cleanly; photographs posterise.
              </p>
            </fieldset>

            {#if traceMode === "color"}
              <label class="block">
                <span
                  class="flex items-baseline justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  Colour regions
                  <span class="dc-metric">{traceColors}</span>
                </span>
                <input
                  class="mt-3"
                  type="range"
                  min="2"
                  max="32"
                  aria-label="Number of colour regions"
                  bind:value={traceColors}
                />
              </label>
            {/if}

            <label class="block">
              <span
                class="flex items-baseline justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Detail
                <span class="dc-metric">{traceDetail}</span>
              </span>
              <input
                class="mt-3"
                type="range"
                min="0"
                max="1"
                step="0.05"
                aria-label="Trace detail"
                bind:value={traceDetail}
              />
              <span class="dc-hint mt-2 block">
                Lower merges nearby regions into simpler shapes.
              </span>
            </label>

            <label class="block">
              <span
                class="flex items-baseline justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Smoothing
                <span class="dc-metric">{traceSmoothing}</span>
              </span>
              <input
                class="mt-3"
                type="range"
                min="0"
                max="1"
                step="0.05"
                aria-label="Trace smoothing"
                bind:value={traceSmoothing}
              />
              <span class="dc-hint mt-2 block">
                Higher rounds curves and cuts the point count.
              </span>
            </label>
          {/if}
        </div>
      </section>
    {/if}

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      {#if results.length > 0}
        <button
          type="button"
          class="dc-btn dc-btn-primary sm:flex-1"
          onclick={downloadActive}
          disabled={!activeResult}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Download
        </button>

        {#if results.length > 1}
          <button
            type="button"
            class="dc-btn dc-btn-secondary"
            onclick={downloadAll}
          >
            Download all ({results.length})
          </button>
        {/if}
      {:else}
        <button
          type="button"
          class="dc-btn dc-btn-primary sm:flex-1"
          onclick={run}
          disabled={!canConvert || queuedCount === 0 || previewBusy}
          aria-busy={isBusy}
        >
          {#if isBusy}
            <span
              class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            ></span>
          {/if}
          {primaryLabel}
        </button>
      {/if}
    </div>

    {#if isBusy}
      <div class="space-y-2" role="status" aria-live="polite">
        <div
          class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-label={stage === "uploading"
            ? `Uploading, ${uploadProgress} percent`
            : "Converting on the server"}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={stage === "uploading" ? uploadProgress : undefined}
        >
          <div
            class="dc-bar-fill h-full rounded-full bg-brand {stage ===
            'processing'
              ? 'w-1/3 animate-pulse'
              : 'w-full'}"
            style={stage === "uploading"
              ? `transform: scaleX(${uploadProgress / 100})`
              : undefined}
          ></div>
        </div>

        <p class="dc-hint">
          {#if stage === "uploading"}
            Uploading {uploadProgress}% — the file stays on this server.
          {:else}
            {runsInBrowser
              ? "Encoding in your browser. Nothing is uploaded."
              : "Uploaded. Converting on the server now."}
          {/if}
        </p>
      </div>
    {/if}

    {#if errors.length > 0}
      <div class="dc-note dc-note-error" role="alert">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          class="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.949 3.86a2 2 0 0 0-3.42 0Z"
          />
        </svg>
        <span>
          {errors.length === 1
            ? errors[0].error
            : `${errors.length} files failed to convert.`}
        </span>
      </div>
    {/if}

    {#if results.length > 0}
      <section class="dc-card overflow-hidden" aria-label="Converted files">
        <header
          class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-white">
            {results.length} converted file{results.length > 1 ? "s" : ""}
          </h2>

          <span class="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive-soft px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-positive dark:bg-positive/10 dark:text-emerald-300">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-3 w-3"
              aria-hidden="true"
            >
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
            Ready
          </span>
        </header>

        <ul class="divide-y divide-zinc-200 dark:divide-zinc-800">
          {#each results as result (result.id)}
            <li
              class="flex items-center gap-3 px-3 py-2.5 transition {activeResultId ===
              result.id
                ? 'bg-brand-soft/60 dark:bg-brand/10'
                : ''}"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left"
                onclick={() => (activeResultId = result.id)}
                aria-pressed={activeResultId === result.id}
              >
                <span
                  class="dc-chip shrink-0"
                  aria-hidden="true"
                >
                  {(extensionOf(result.name) || result.kind).toUpperCase()}
                </span>

                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-100"
                  >
                    {result.name}
                  </span>

                  <span class="dc-metric mt-0.5 block truncate">
                    {formatBytes(result.size)}
                    {#if result.width && result.height}
                      · {result.width} × {result.height}
                    {/if}
                    {#if result.pages}
                      · {result.pages} page{result.pages > 1 ? "s" : ""}
                    {/if}
                    {#if result.sourceName && files.length > 1}
                      · from {result.sourceName}
                    {/if}
                  </span>
                </span>
              </button>

              <button
                type="button"
                class="dc-btn dc-btn-secondary dc-btn-sm shrink-0"
                onclick={() => triggerDownload(result)}
              >
                Download
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>

  <div class="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
    {#if activeResult}
      <ResultPreview
        url={activeResult.url}
        name={activeResult.name}
        mimeType={activeResult.mimeType}
        size={activeResult.size}
        kind={activeResult.kind}
        pages={activeResult.pages}
        width={activeResult.width}
        height={activeResult.height}
      />

      <button
        type="button"
        class="dc-btn dc-btn-primary w-full"
        onclick={downloadActive}
      >
        Download {activeResult.name}
      </button>
    {:else}
      <PreviewPanel
        status={previewStatus}
        supported={outputPreviewable}
        message={previewMessage}
        original={originalMeta}
        converted={convertedMeta}
        {outputFormat}
      />

      {#if isSvgOutput || isPdfOutput}
        <p class="dc-hint">
          {isSvgOutput
            ? "SVG output has no browser-canvas preview. The traced drawing is rendered here as soon as the conversion finishes."
            : "PDF output is rendered here with PDF.js as soon as the conversion finishes."}
        </p>
      {/if}
    {/if}
  </div>
</div>
