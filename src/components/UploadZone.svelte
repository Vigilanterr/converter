<script lang="ts">
  interface Props {
    inputFormats: string[];
    accept: string;
    maxFileSizeMb: number;
    /** Whether more than one file is meaningful for this tool. */
    multiple?: boolean;
    busy?: boolean;
    onFiles: (files: FileList | File[]) => void;
  }

  let {
    inputFormats,
    accept,
    maxFileSizeMb,
    multiple = true,
    busy = false,
    onFiles
  }: Props = $props();

  let dragging = $state(false);
  /** Nested dragenter/dragleave events fire constantly; depth keeps the
      highlight steady while the pointer moves over child elements. */
  let dragDepth = 0;

  const formatLabel = $derived(inputFormats.join(", "));

  function openPicker() {
    if (!busy) {
      picker?.click();
    }
  }

  let picker: HTMLInputElement;

  function handleInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;

    if (input.files && input.files.length > 0) {
      onFiles(input.files);
      input.value = "";
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();

    dragDepth = 0;
    dragging = false;

    if (busy) {
      return;
    }

    const dropped = event.dataTransfer?.files;

    if (dropped && dropped.length > 0) {
      onFiles(dropped);
    }
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    dragDepth += 1;
    dragging = true;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = busy ? "none" : "copy";
    }
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);

    if (dragDepth === 0) {
      dragging = false;
    }
  }
</script>

<section
  class="relative rounded-card border-2 border-dashed transition duration-180 ease-out
    {dragging
      ? 'border-brand bg-brand-soft dark:border-brand-lift dark:bg-brand/10'
      : 'border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'}"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  data-dragging={dragging}
>
  <div
    class="flex flex-col items-center gap-5 px-6 py-10 text-center sm:py-14"
  >
    <span
      class="flex h-14 w-14 items-center justify-center rounded-card transition duration-260 ease-out
        {dragging
          ? 'scale-105 bg-brand text-brand-ink'
          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-7 w-7"
      >
        <path d="M12 16.5V9.75m0 0 3 3m-3-3-3 3" />
        <path d="M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
      </svg>
    </span>

    <div class="max-w-md">
      <p class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
        {#if dragging}
          Release to add {formatLabel}
        {:else}
          Drop {formatLabel} files here
        {/if}
      </p>

      <p class="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        Drag and drop, or choose from your device.
        {multiple
          ? "Add as many as you need."
          : "One file per conversion."}
        Up to {maxFileSizeMb} MB each.
      </p>
    </div>

    <div class="flex flex-col items-center gap-3">
      <button
        type="button"
        class="dc-btn dc-btn-primary"
        onclick={openPicker}
        disabled={busy}
      >
        Choose {multiple ? "files" : "file"}
      </button>

      <p class="dc-eyebrow">{formatLabel}</p>
    </div>
  </div>

  <input
    bind:this={picker}
    class="sr-only"
    type="file"
    multiple={multiple}
    {accept}
    aria-label="Select files to convert"
    onchange={handleInput}
  />
</section>
