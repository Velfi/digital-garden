<script lang="ts">
  import '../voxelle/sidebar/shared.css';
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import { mode, sidebarOpen } from './store';
  import MetalPane from './sidebar/MetalPane.svelte';
  import ColorsPane from './sidebar/ColorsPane.svelte';
  import RenderPane from './sidebar/RenderPane.svelte';
  import WarningsPane from './sidebar/WarningsPane.svelte';
</script>

<ArtSidebar open={sidebarOpen}>
  {#if $mode === 'metal'}
    <MetalPane />
    <WarningsPane />
  {:else if $mode === 'colors'}
    <ColorsPane />
  {:else}
    <RenderPane />
  {/if}
</ArtSidebar>
