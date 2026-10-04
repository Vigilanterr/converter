<script lang="ts">
  import { categories, tools, type ToolConfig } from "../data/tools";

  interface Props {
    tool: ToolConfig;
    onSelect: (slug: string) => void;
  }

  let { tool, onSelect }: Props = $props();

  const grouped = categories
    .map((category) => ({
      id: category.id,
      label: category.title,
      tools: tools.filter((candidate) => candidate.category === category.id)
    }))
    .filter((group) => group.tools.length > 0);

  type OutputKind = "raster" | "vector" | "document";

  const OUTPUT_META: Record<string, { blurb: string; kind: OutputKind }> = {
    PNG: { blurb: "Lossless quality", kind: "raster" },
    JPG: { blurb: "Compact photos", kind: "raster" },
    WEBP: { blurb: "Modern and light", kind: "raster" },
    SVG: { blurb: "Scalable vector", kind: "vector" },
    PDF: { blurb: "Multi-page document", kind: "document" }
  };

  function metaFor(candidate: ToolConfig): { blurb: string; kind: OutputKind } {
    const key = candidate.outputFormats[0]?.toUpperCase() ?? "";

    return OUTPUT_META[key] ?? { blurb: candidate.title, kind: "raster" };
  }
</script>

<div class="dc-card space-y-6 p-5">
  {#each grouped as group (group.id)}
    <fieldset>
      <legend class="dc-eyebrow">{group.label}</legend>

      <div
        id={group.id === "image" ? "tool-picker" : undefined}
        class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label={`${group.label} converters`}
      >
        {#each group.tools as candidate (candidate.slug)}
          {@const meta = metaFor(candidate)}
          {@const active = candidate.slug === tool.slug}
          <label
            class="relative cursor-pointer rounded-control border p-3 transition duration-180 ease-out focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-zinc-900 {active
              ? 'border-brand bg-brand-soft/60 ring-1 ring-brand dark:bg-brand/10'
              : 'border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60'}"
          >
            <input
              type="radio"
              name="tool-picker"
              value={candidate.slug}
              class="sr-only"
              checked={active}
              onchange={() => onSelect(candidate.slug)}
              aria-label={candidate.title}
            />

            <span class="flex items-start justify-between gap-2">
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] transition {active
                  ? 'bg-brand text-white'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}"
                aria-hidden="true"
              >
                {#if meta.kind === "vector"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                    <path d="m12 19 7-7 3 3-7 7-3-3Z" />
                    <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5Z" />
                    <path d="m2 2 7.586 7.586" />
                    <circle cx="11" cy="11" r="2" />
                  </svg>
                {:else if meta.kind === "document"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 2v6h6" />
                    <path d="M9 13h6M9 17h4" />
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.5-3.5a1.5 1.5 0 0 0-2 0L6 21" />
                  </svg>
                {/if}
              </span>

              {#if active}
                <span
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-white"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">
                    <path d="m5 12.5 4.5 4.5L19 7" />
                  </svg>
                </span>
              {/if}
            </span>

            <span class="mt-2.5 block text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
              {candidate.outputFormats.join(" / ")}
            </span>

            <span class="mt-0.5 block font-mono text-2xs text-zinc-400 dark:text-zinc-500">
              {candidate.inputFormats.join(" / ")} &rarr; {candidate.outputFormats.join(" / ")}
            </span>

            <span class="mt-1 block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              {meta.blurb}
            </span>

            {#if !candidate.browserSupported}
              <span class="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-2xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                Server
              </span>
            {/if}
          </label>
        {/each}
      </div>
    </fieldset>
  {/each}

  <div class="border-t border-zinc-200 pt-4 dark:border-zinc-800">
    <div class="flex flex-wrap items-center gap-2">
      <span class="dc-chip">{tool.inputFormats.join(" / ")}</span>
      <span class="text-zinc-300 dark:text-zinc-600" aria-hidden="true">
        &rarr;
      </span>
      <span class="dc-chip">{tool.outputFormats.join(" / ")}</span>
    </div>

    <p class="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
      {tool.description}
    </p>

    <p class="dc-hint mt-2">
      {tool.browserSupported
        ? "Runs entirely in your browser — the file is never uploaded."
        : "Processed on the server. The temporary copy is deleted automatically."}
    </p>
  </div>
</div>
