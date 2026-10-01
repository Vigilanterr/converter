<script lang="ts">
  export let tool: {
    slug: string;
    title: string;
    description: string;
    inputFormats: string[];
    outputFormats: string[];
    options: string[];
    browserSupported?: boolean;
  };

  type FileStatus =
    | "waiting"
    | "converting"
    | "done"
    | "error";

  type FileItem = {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    output?: Blob;
    outputName?: string;
    error?: string;
    previewUrl?: string;
  };

  let files: FileItem[] = [];
  let quality = 85;
  let background = "#ffffff";
  let resizeWidth = "";
  let resizeHeight = "";
  let rotation = 0;
  let isDragging = false;

  const browserFormats = [
    "PNG",
    "JPG",
    "JPEG",
    "WEBP"
  ];

  $: isBrowserConversion =
    tool.browserSupported === true &&
    tool.inputFormats.every((format) =>
      browserFormats.includes(format)
    );

  function createId() {
    return crypto.randomUUID();
  }

  function addFiles(selectedFiles: FileList | File[]) {
    const incoming = Array.from(selectedFiles);

    const newItems: FileItem[] = incoming.map((file) => ({
      id: createId(),
      file,
      status: "waiting",
      progress: 0,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined
    }));

    files = [...files, ...newItems];
  }

  function handleInput(event: Event) {
    const input = event.target as HTMLInputElement;

    if (input.files) {
      addFiles(input.files);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    if (event.dataTransfer?.files) {
      addFiles(event.dataTransfer.files);
    }
  }

  function removeFile(id: string) {
    const target = files.find((item) => item.id === id);

    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }

    files = files.filter((item) => item.id !== id);
  }

  function getOutputExtension() {
    return tool.outputFormats[0].toLowerCase() === "jpeg"
      ? "jpg"
      : tool.outputFormats[0].toLowerCase();
  }

  async function convertInBrowser(item: FileItem) {
    const sourceUrl = URL.createObjectURL(item.file);

    try {
      files = files.map((file) =>
        file.id === item.id
          ? {
              ...file,
              status: "converting",
              progress: 10
            }
          : file
      );

      const image = new Image();

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Unable to read the image."));
        image.src = sourceUrl;
      });

      const width = resizeWidth
        ? Number(resizeWidth)
        : image.naturalWidth;

      const height = resizeHeight
        ? Number(resizeHeight)
        : image.naturalHeight;

      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas is not available.");
      }

      if (
        tool.outputFormats[0].toUpperCase() === "JPG" ||
        tool.outputFormats[0].toUpperCase() === "JPEG"
      ) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }

      context.save();

      if (rotation !== 0) {
        const radians = (rotation * Math.PI) / 180;

        context.translate(width / 2, height / 2);
        context.rotate(radians);
        context.translate(-width / 2, -height / 2);
      }

      context.drawImage(
        image,
        0,
        0,
        width,
        height
      );

      context.restore();

      files = files.map((file) =>
        file.id === item.id
          ? {
              ...file,
              progress: 65
            }
          : file
      );

      const mime =
        tool.outputFormats[0].toUpperCase() === "JPG" ||
        tool.outputFormats[0].toUpperCase() === "JPEG"
          ? "image/jpeg"
          : `image/${getOutputExtension()}`;

      const output = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create output."));
            }
          },
          mime,
          quality / 100
        );
      });

      const baseName = item.file.name.replace(
        /\.[^/.]+$/,
        ""
      );

      files = files.map((file) =>
        file.id === item.id
          ? {
              ...file,
              status: "done",
              progress: 100,
              output,
              outputName: `${baseName}.${getOutputExtension()}`
            }
          : file
      );
    } catch (error) {
      files = files.map((file) =>
        file.id === item.id
          ? {
              ...file,
              status: "error",
              progress: 0,
              error:
                error instanceof Error
                  ? error.message
                  : "Conversion failed."
            }
          : file
      );
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  async function convertThroughApi(item: FileItem) {
    try {
      files = files.map((file) =>
        file.id === item.id
          ? {
              ...file,
              status: "converting",
              progress: 20
            }
          : file
      );

      const formData = new FormData();

      formData.append("file", item.file);
      formData.append(
        "output",
        tool.outputFormats[0]
      );
      formData.append(
        "quality",
        String(quality)
      );
      formData.append(
        "background",
        background
      );
      formData.append(
        "width",
        resizeWidth
      );
      formData.append(
        "height",
        resizeHeight
      );
      formData.append(
        "rotation",
        String(rotation)
      );

      const response = await fetch(
        "/api/image-convert",
        {
          method: "POST",
          body: formData
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(
          () => null
        );

        throw new Error(
          body?.error ?? "Conversion failed."
        );
      }

      const blob = await response.blob();

      const disposition =
        response.headers.get(
          "Content-Disposition"
        );

      const match = disposition?.match(
        /filename="?([^"]+)"?/
      );

      const fallbackName =
        `${item.file.name.replace(/\.[^/.]+$/, "")}.${getOutputExtension()}`;

      files = files.map((file) =>
        file.id === item.id
          ? {
              ...file,
              status: "done",
              progress: 100,
              output: blob,
              outputName:
                match?.[1] ?? fallbackName
            }
          : file
      );
    } catch (error) {
      files = files.map((file) =>
        file.id === item.id
          ? {
              ...file,
              status: "error",
              progress: 0,
              error:
                error instanceof Error
                  ? error.message
                  : "Conversion failed."
            }
          : file
      );
    }
  }

  async function convertAll() {
    for (const item of files) {
      if (item.status === "done") {
        continue;
      }

      if (isBrowserConversion) {
        await convertInBrowser(item);
      } else {
        await convertThroughApi(item);
      }
    }
  }

  function downloadFile(item: FileItem) {
    if (!item.output) {
      return;
    }

    const url = URL.createObjectURL(
      item.output
    );

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      item.outputName ?? "converted-file";

    anchor.click();

    URL.revokeObjectURL(url);
  }
</script>

<div class="mx-auto max-w-4xl">
  <div
    class:!border-blue-500={isDragging}
    class="rounded-3xl border-2 border-dashed border-zinc-300 bg-white p-6 transition dark:border-zinc-700 dark:bg-zinc-900 sm:p-10"
    on:dragover|preventDefault={() => (isDragging = true)}
    on:dragleave={() => (isDragging = false)}
    on:drop={handleDrop}
  >
    <div class="text-center">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl dark:bg-blue-950/50">
        ↑
      </div>

      <h2 class="mt-5 text-xl font-semibold">
        Drop your files here
      </h2>

      <p class="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        or select files from your device
      </p>

      <label class="mt-6 inline-flex cursor-pointer rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200">
        Choose files

        <input
          class="hidden"
          type="file"
          multiple
          accept={tool.inputFormats
            .map((format) => `.${format.toLowerCase()}`)
            .join(",")}
          on:change={handleInput}
        />
      </label>

      <p class="mt-4 text-xs text-zinc-400">
        Supported: {tool.inputFormats.join(", ")}
      </p>
    </div>
  </div>

  {#if tool.options.length > 0}
    <div class="mt-6 grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
      {#if tool.options.includes("quality")}
        <label class="block">
          <span class="text-sm font-medium">
            Quality: {quality}
          </span>

          <input
            class="mt-3 w-full"
            type="range"
            min="1"
            max="100"
            bind:value={quality}
          />
        </label>
      {/if}

      {#if tool.options.includes("background")}
        <label class="block">
          <span class="text-sm font-medium">
            Background
          </span>

          <input
            class="mt-3 h-10 w-full cursor-pointer rounded-lg border border-zinc-200"
            type="color"
            bind:value={background}
          />
        </label>
      {/if}

      {#if tool.options.includes("resize")}
        <div>
          <span class="text-sm font-medium">
            Resize
          </span>

          <div class="mt-3 flex gap-2">
            <input
              class="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              type="number"
              min="1"
              placeholder="Width"
              bind:value={resizeWidth}
            />

            <input
              class="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              type="number"
              min="1"
              placeholder="Height"
              bind:value={resizeHeight}
            />
          </div>
        </div>
      {/if}

      {#if tool.options.includes("rotation")}
        <label class="block">
          <span class="text-sm font-medium">
            Rotation
          </span>

          <select
            class="mt-3 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            bind:value={rotation}
          >
            <option value={0}>0°</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </label>
      {/if}
    </div>
  {/if}

  {#if files.length > 0}
    <div class="mt-6 space-y-3">
      {#each files as item}
        <div class="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-center gap-4">
            {#if item.previewUrl}
              <img
                src={item.previewUrl}
                alt={item.file.name}
                class="h-14 w-14 rounded-xl object-cover"
              />
            {:else}
              <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-100 text-xs dark:bg-zinc-800">
                FILE
              </div>
            {/if}

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {item.file.name}
              </p>

              <p class="mt-1 text-xs text-zinc-500">
                {(item.file.size / 1024 / 1024).toFixed(2)} MB
              </p>

              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={`width: ${item.progress}%`}
                ></div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              {#if item.status === "done"}
                <button
                  type="button"
                  class="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  on:click={() => downloadFile(item)}
                >
                  Download
                </button>
              {:else if item.status === "converting"}
                <span class="text-xs text-blue-600">
                  Converting...
                </span>
              {:else if item.status === "error"}
                <span class="text-xs text-red-500">
                  Error
                </span>
              {/if}

              {#if item.status !== "converting"}
                <button
                  type="button"
                  class="rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  on:click={() => removeFile(item.id)}
                >
                  Remove
                </button>
              {/if}
            </div>
          </div>

          {#if item.error}
            <p class="mt-3 text-xs text-red-500">
              {item.error}
            </p>
          {/if}
        </div>
      {/each}
    </div>

    <button
      type="button"
      class="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={files.some(
        (file) => file.status === "converting"
      )}
      on:click={convertAll}
    >
      Convert {files.length} file{files.length > 1 ? "s" : ""}
    </button>
  {/if}
</div>