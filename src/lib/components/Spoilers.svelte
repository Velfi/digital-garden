<script lang="ts">
  export let year: number;
  $: age = new Date().getFullYear() - year;
</script>

<p>
  <em>WARNING: This post contains spoilers for a {age}-year old movie.</em>
</p>
