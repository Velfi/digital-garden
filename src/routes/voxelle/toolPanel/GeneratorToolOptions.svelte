<script lang="ts">
  import { tool } from '../store/index';
  import { isGeneratorTool } from '../store/generators/registry';
  import RocksOptions from './RocksOptions.svelte';
  import AshlarOptions from './AshlarOptions.svelte';
  import GrassOptions from './GrassOptions.svelte';
  import FloraOptions from './FloraOptions.svelte';
  import PiscinaOptions from './PiscinaOptions.svelte';
  import InsectaOptions from './InsectaOptions.svelte';
  import FaunaOptions from './FaunaOptions.svelte';
  import RoofOptions from './RoofOptions.svelte';
  import RopeClothGeneratorOptions from './RopeClothGeneratorOptions.svelte';

  const generatorPanelOpen = $derived(isGeneratorTool($tool));
</script>

{#if generatorPanelOpen}
  <RopeClothGeneratorOptions />
  <RocksOptions />
  <AshlarOptions />
  <GrassOptions />
  <FloraOptions />
  <PiscinaOptions />
  <InsectaOptions />
  <FaunaOptions />
  <RoofOptions />
{/if}
