<script lang="ts">
  import Converter from "./Converter.svelte";
  import StepRail from "./StepRail.svelte";
  import ToolSelect from "./ToolSelect.svelte";
  import { toolAcceptAttribute, toolMap, tools } from "../data/tools";

  interface Props {
    maxFileSizeMb: number;
  }

  let { maxFileSizeMb }: Props = $props();

  const DEFAULT_SLUG = "png-to-jpg";

  let selectedSlug = $state(DEFAULT_SLUG);

  const tool = $derived(toolMap.get(selectedSlug) ?? tools[0]);
  const accept = $derived(toolAcceptAttribute(tool));

  const STEPS = ["Upload", "Convert", "Preview", "Download"];
</script>

<div class="space-y-5">
  <StepRail steps={STEPS} activeIndex={-1} />

  <ToolSelect {tool} onSelect={(slug) => (selectedSlug = slug)} />

  {#key tool.slug}
    <Converter tool={tool} {accept} {maxFileSizeMb} />
  {/key}
</div>
