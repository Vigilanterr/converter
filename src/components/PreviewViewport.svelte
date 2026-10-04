<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    /** Change this to reset pan and zoom, e.g. the previewed file URL. */
    resetKey?: string;
    label?: string;
    minZoom?: number;
    maxZoom?: number;
    class?: string;
    /** Stretch the content to the full viewport instead of fitting inside it. */
    fill?: boolean;
  }

  let {
    children,
    resetKey = "",
    label = "Preview. Drag to pan, scroll or pinch to zoom.",
    minZoom = 1,
    maxZoom = 8,
    class: className = "",
    fill = false
  }: Props = $props();

  let container: HTMLDivElement | null = $state(null);
  let content: HTMLDivElement | null = $state(null);

  let zoom = $state(minZoom);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let dragging = $state(false);

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDistance = 0;

  const zoomPercent = $derived(Math.round(zoom * 100));
  const canPan = $derived(zoom > minZoom + 0.001);

  /**
   * Pan is clamped so the scaled content can never be dragged out of sight: at
   * fit scale the offset is always zero, and beyond it the content edge stops at
   * the viewport edge.
   */
  function clampOffsets(x: number, y: number): { x: number; y: number } {
    if (!container || !content) {
      return { x, y };
    }

    const maxX = Math.max(0, (content.offsetWidth * zoom - container.clientWidth) / 2);
    const maxY = Math.max(0, (content.offsetHeight * zoom - container.clientHeight) / 2);

    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y))
    };
  }

  function applyOffsets(x: number, y: number) {
    const clamped = clampOffsets(x, y);

    offsetX = clamped.x;
    offsetY = clamped.y;
  }

  /** Zooms while keeping whatever sits under the pointer (or the centre) put. */
  function zoomAt(nextZoom: number, clientX?: number, clientY?: number) {
    if (!container) {
      return;
    }

    const target = Math.min(maxZoom, Math.max(minZoom, nextZoom));

    if (Math.abs(target - zoom) < 0.0001) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const pointX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const pointY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const ratio = target / zoom;
    const deltaX = pointX - rect.width / 2 - offsetX;
    const deltaY = pointY - rect.height / 2 - offsetY;

    zoom = target;
    applyOffsets(
      pointX - rect.width / 2 - deltaX * ratio,
      pointY - rect.height / 2 - deltaY * ratio
    );
  }

  function resetView() {
    zoom = minZoom;
    offsetX = 0;
    offsetY = 0;
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();

    zoomAt(zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    container?.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragging = true;
  }

  function onPointerMove(event: PointerEvent) {
    const previous = pointers.get(event.pointerId);

    if (!previous) {
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      applyOffsets(
        offsetX + (event.clientX - previous.x),
        offsetY + (event.clientY - previous.y)
      );

      return;
    }

    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);

      if (pinchDistance > 0 && distance > 0) {
        zoomAt(
          zoom * (distance / pinchDistance),
          (first.x + second.x) / 2,
          (first.y + second.y) / 2
        );
      }

      pinchDistance = distance;
    }
  }

  function onPointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);

    if (pointers.size < 2) {
      pinchDistance = 0;
    }

    if (pointers.size === 0) {
      dragging = false;
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 80 : 24;

    switch (event.key) {
      case "ArrowLeft":
        applyOffsets(offsetX + step, offsetY);
        break;
      case "ArrowRight":
        applyOffsets(offsetX - step, offsetY);
        break;
      case "ArrowUp":
        applyOffsets(offsetX, offsetY + step);
        break;
      case "ArrowDown":
        applyOffsets(offsetX, offsetY - step);
        break;
      case "+":
      case "=":
        zoomAt(zoom * 1.25);
        break;
      case "-":
      case "_":
        zoomAt(zoom / 1.25);
        break;
      case "0":
        resetView();
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  // A plain listener keeps the wheel gesture cancelable, so the page does not
  // scroll while zooming inside the preview.
  $effect(() => {
    const node = container;

    if (!node) {
      return;
    }

    node.addEventListener("wheel", onWheel, { passive: false });

    return () => node.removeEventListener("wheel", onWheel);
  });

  $effect(() => {
    void resetKey;

    resetView();
  });
</script>

<div class="relative {className}">
  <div
    bind:this={container}
    class="flex h-full w-full touch-none select-none items-center justify-center overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 {dragging
      ? 'cursor-grabbing'
      : canPan
        ? 'cursor-grab'
        : 'cursor-zoom-in'}"
    style="touch-action: none;"
    tabindex="0"
    role="group"
    aria-label={label}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={() => (zoom > minZoom + 0.001 ? resetView() : zoomAt(2.5))}
    onkeydown={onKeyDown}
  >
    <div
      bind:this={content}
      class="flex items-center justify-center will-change-transform {fill
        ? 'h-full w-full'
        : 'max-h-full max-w-full p-1'}"
      style="transform: translate3d({offsetX}px, {offsetY}px, 0) scale({zoom});"
    >
      {@render children()}
    </div>
  </div>

  <div
    class="absolute right-2 top-2 flex items-center gap-0.5 rounded-control border border-zinc-200 bg-white/90 p-0.5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90"
  >
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-[4px] text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
      onclick={() => zoomAt(zoom / 1.5)}
      disabled={zoom <= minZoom + 0.001}
      aria-label="Zoom out"
    >
      &minus;
    </button>

    <button
      type="button"
      class="min-w-[3.25rem] rounded-[4px] px-1 py-1 font-mono text-2xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
      onclick={resetView}
      title="Reset to fit"
    >
      {zoomPercent}%
    </button>

    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-[4px] text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
      onclick={() => zoomAt(zoom * 1.5)}
      disabled={zoom >= maxZoom - 0.001}
      aria-label="Zoom in"
    >
      +
    </button>
  </div>
</div>
