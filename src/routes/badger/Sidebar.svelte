<script lang="ts">
  import '../voxelle/sidebar/shared.css';
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import { mode, sidebarOpen } from './store';
  import MetalPane from './sidebar/MetalPane.svelte';
  import ColorsPane from './sidebar/ColorsPane.svelte';
  import PbrPane from './sidebar/PbrPane.svelte';
  import RtPane from './sidebar/RtPane.svelte';
  import WarningsPane from './sidebar/WarningsPane.svelte';
</script>

<ArtSidebar open={sidebarOpen}>
  {#if $mode === 'metal'}
    <MetalPane />
    <WarningsPane />
  {:else if $mode === 'colors'}
    <ColorsPane />
  {:else if $mode === 'pbr'}
    <PbrPane />
  {:else}
    <RtPane />
  {/if}
</ArtSidebar>
