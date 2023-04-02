<script lang="ts">
  export let images: string[];
  $: imageIndex = 0;
  const maxIndex = images.length - 1;

  if (images.length == 0) {
    throw Error('must pass at least one image to Thumbnail Gallery!');
  }

  const nextImageIndex = () => {
    if (imageIndex < maxIndex) {
      imageIndex = imageIndex + 1;
    } else {
      imageIndex = 0;
    }
  };
  const previousImageIndex = () => {
    if (imageIndex == 0) {
      imageIndex = maxIndex;
    } else {
      imageIndex = imageIndex - 1;
    }
  };
</script>

<div class="gallery">
  <img alt="a product thumbnail" src={images[imageIndex]} />
  <button class="index-button left" on:click={previousImageIndex}> &#706; </button>
  <button class="new-tab-button" on:click={() => window.open(images[imageIndex])} />
  <button class="index-button right" on:click={nextImageIndex}> &#707; </button>
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
