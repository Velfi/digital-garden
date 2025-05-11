<script lang="ts">
  import { harmonyType, baseHue, saturation, lightness } from './store';
  import { onMount } from 'svelte';
  import { Hsluv } from 'hsluv';

  export let width: number;
  export let height: number;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let isDragging = false;
  let gradientRotation = 0;
  const hsluv = new Hsluv();

  function getPerceptualColor(angle: number): string {
    hsluv.hsluv_h = angle;
    hsluv.hsluv_s = $saturation;
    hsluv.hsluv_l = $lightness;
    hsluv.hsluvToHex();
    return hsluv.hex;
  }

  function getHarmonyColors(hue: number, type: string): number[] {
    switch (type) {
      case 'complementary':
        return [hue, (hue + 180) % 360];
      case 'analogous':
        return [hue, (hue + 30) % 360, (hue - 30 + 360) % 360];
      case 'triadic':
        return [hue, (hue + 120) % 360, (hue + 240) % 360];
      case 'split-complementary':
        return [hue, (hue + 150) % 360, (hue + 210) % 360];
      case 'square':
        return [hue, (hue + 90) % 360, (hue + 180) % 360, (hue + 270) % 360];
      default:
        return [hue];
    }
  }

  function getHueFromPosition(x: number, y: number): number {
    const centerX = width / 2;
    const centerY = height / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return (angle + 360) % 360;
  }

  function handleMouseDown(event: MouseEvent) {
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const newHue = getHueFromPosition(x, y);
    baseHue.set(newHue);
    gradientRotation = newHue;
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const newHue = getHueFromPosition(x, y);
    baseHue.set(newHue);
    gradientRotation = newHue;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function drawColorWheel() {
    if (!ctx) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw color wheel using HSLuv
    for (let angle = 0; angle < 360; angle++) {
      const startAngle = ((angle - 2) * Math.PI) / 180;
      const endAngle = ((angle + 2) * Math.PI) / 180;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = getPerceptualColor(angle);
      ctx.fill();
    }

    // Draw harmony lines
    const colors = getHarmonyColors($baseHue, $harmonyType);

    colors.forEach((hue) => {
      const angle = (hue * Math.PI) / 180;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw color circle
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fillStyle = getPerceptualColor(hue);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw cursor indicator
    const cursorAngle = ($baseHue * Math.PI) / 180;
    const cursorX = centerX + radius * Math.cos(cursorAngle);
    const cursorY = centerY + radius * Math.sin(cursorAngle);

    ctx.beginPath();
    ctx.arc(cursorX, cursorY, 25, 0, Math.PI * 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  $: if (width && height) {
    drawColorWheel();
  }

  $: if ($baseHue !== undefined) {
    drawColorWheel();
  }

  $: if ($saturation !== undefined) {
    drawColorWheel();
  }

  $: if ($lightness !== undefined) {
    drawColorWheel();
  }

  $: if ($harmonyType !== undefined) {
    drawColorWheel();
  }

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    drawColorWheel();
  });
</script>

<div
  class="outer"
  style="background: linear-gradient({gradientRotation + 270}deg, {getHarmonyColors(
    $baseHue,
    $harmonyType
  )
    .map((hue) => getPerceptualColor(hue))
    .join(', ')})"
>
  <canvas
    bind:this={canvas}
    {width}
    {height}
    style="background: transparent; cursor: crosshair;"
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
  ></canvas>

  <div class="color-list">
    {#each getHarmonyColors($baseHue, $harmonyType) as hue}
      <div class="color-item">
        <div class="color-swatch" style="background: {getPerceptualColor(hue)}"></div>
        <div class="color-value">{getPerceptualColor(hue)}</div>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .outer {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease-out;
    position: relative;
  }

  .color-list {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 1rem;
    background: rgba(0, 0, 0, 0.1);
    padding: 1rem;
    border-radius: 0.5rem;
    backdrop-filter: blur(4px);
  }

  .color-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .color-swatch {
    width: 2rem;
    height: 2rem;
    border-radius: 0.25rem;
    border: 2px solid white;
  }

  .color-value {
    font-family: monospace;
    font-size: 0.875rem;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
</style>
