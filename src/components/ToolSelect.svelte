<script lang="ts">
  import { categories, tools, type ToolConfig } from "../data/tools";

  interface Props {
    tool: ToolConfig;
    onSelect: (slug: string) => void;
  }

  let { tool, onSelect }: Props = $props();

  const grouped = categories
    .map((category) => ({
      label: category.title,
      tools: tools.filter((candidate) => candidate.category === category.id)
    }))
    .filter((group) => group.tools.length > 0);
</script>

<div class="dc-card p-5">
  <div
    class="grid gap-5 sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] sm:items-start"
  >
    <div>
      <label class="dc-label" for="tool-picker">Conversion</label>

      <select
        id="tool-picker"
        class="dc-field mt-2"
        value={tool.slug}
        onchange={(event) => onSelect(event.currentTarget.value)}
      >
        {#each grouped as group (group.label)}
          <optgroup label={group.label}>
            {#each group.tools as candidate (candidate.slug)}
              <option value={candidate.slug}>{candidate.title}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>

    <div class="min-w-0">
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
</div>
