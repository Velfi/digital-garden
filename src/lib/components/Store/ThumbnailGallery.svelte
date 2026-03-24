<script lang="ts">
  let { images }: { images: string[] } = $props();
  let imageIndex = $state(0);

  $effect.pre(() => {
    if (images.length === 0) {
      throw new Error('must pass at least one image to Thumbnail Gallery!');
    }
  });

  const nextImageIndex = () => {
    const maxIndex = images.length - 1;
    if (imageIndex < maxIndex) {
      imageIndex = imageIndex + 1;
    } else {
      imageIndex = 0;
    }
  };
  const previousImageIndex = () => {
    const maxIndex = images.length - 1;
    if (imageIndex == 0) {
      imageIndex = maxIndex;
    } else {
      imageIndex = imageIndex - 1;
    }
  };
</script>

<div class="gallery">
  <img alt="a product thumbnail" src={images[imageIndex]} />
  <button class="index-button left" onclick={previousImageIndex} aria-label="Previous image">
    &#706;
  </button>
  <button
    class="new-tab-button"
    onclick={() => window.open(images[imageIndex])}
    aria-label="Open in new tab"
  ></button>
  <button class="index-button right" onclick={nextImageIndex} aria-label="Next image">
    &#707;
  </button>
</div>

<style>
  .gallery {
    position: relative;
  }

  img {
    height: auto;
    max-width: 100%;
  }

  .index-button {
    position: absolute;
    width: 30%;
    top: 0;
    bottom: 0;
    background: transparent;
    border: none !important;
    font-size: 0;
  }

  .index-button.left {
    left: 0;
    cursor: url('../../assets/left-arrow.cur'), pointer;
  }

  .index-button.right {
    right: 0;
    cursor: url('../../assets/right-arrow.cur'), pointer;
  }

  .new-tab-button {
    position: absolute;
    left: 30%;
    right: 30%;
    width: 40%;
    top: 0;
    bottom: 0;
    background: transparent;
    border: none !important;
    font-size: 0;
    cursor: zoom-in;
  }
</style>
