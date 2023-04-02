<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<svelte:head>
  <title>{data?.title}</title>
  <meta name="description" content={data?.description} />
  <meta name="keywords" content={data?.keywords} />
</svelte:head>

<h1>{data?.title}</h1>

<svelte:component this={data.content} />
