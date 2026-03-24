<script>
  import { resolve } from '$app/paths';
  import { siteConfig } from '$lib/siteconfig';
</script>

<header class="header">
  <nav class="nav">
    <a href={resolve('/')}>{siteConfig.title}</a>
  </nav>
</header>
