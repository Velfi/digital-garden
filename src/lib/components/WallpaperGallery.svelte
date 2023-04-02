<script lang="ts">
  type Src = string;
  type Href = string;
  type Subtitle = string;

  export let images: [Src, Href, Subtitle][];
</script>

<p><em>Click on an image to open the full-size version in a new tab.</em></p>
<div>
  {#each images as [src, href, subtitle], i}
    <p>
      <a {href}>
        <img loading={i < 2 ? 'eager' : 'lazy'} {src} alt="A decorative desktop wallpaper" />
        {subtitle}
      </a>
    </p>
  {/each}
</div>

<style lang="scss">
  a > img {
    width: 100%;
    max-width: unset;
    padding: 0.8rem;
    background-color: rgb(255, 255, 255, 0.9);
    border-radius: 1px;
    box-shadow: rgba(0, 0, 0, 0.05) 0px 6px 24px 0px, rgba(0, 0, 0, 0.08) 0px 0px 0px 1px;
    margin-bottom: 0.2rem;
  }

  a,
  p {
    font-style: italic;
  }
</style>
