<script lang="ts">
  import { tool } from '../store/index';
  import { isGeneratorTool } from '../store/generators/registry';
  import RocksOptions from './RocksOptions.svelte';
  import AshlarOptions from './AshlarOptions.svelte';
  import GrassOptions from './GrassOptions.svelte';
  import FloraOptions from './FloraOptions.svelte';
  import PiscinaOptions from './PiscinaOptions.svelte';
  import InsectaOptions from './InsectaOptions.svelte';
  import RoofOptions from './RoofOptions.svelte';

  const generatorPanelOpen = $derived(isGeneratorTool($tool));
</script>

{#if generatorPanelOpen}
  <RocksOptions />
  <AshlarOptions />
  <GrassOptions />
  <FloraOptions />
  <PiscinaOptions />
  <InsectaOptions />
  <RoofOptions />
{/if}
