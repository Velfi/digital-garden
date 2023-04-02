<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<svelte:head>
  <title>{data?.post.metadata.title}</title>
  <meta name="description" content={data?.post.metadata.description} />
  <meta name="keywords" content={data?.post.metadata.keywords} />
</svelte:head>

<h1>{data?.post.metadata.title}</h1>
{@html data?.post.content}
