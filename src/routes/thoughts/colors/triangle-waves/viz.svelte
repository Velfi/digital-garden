<script lang="ts">
  import { hsluvToHex } from '$lib/hsluv';
  import { onDestroy, onMount } from 'svelte';
  import * as store from './store';

  export let height: string | number | null | undefined;
  export let width: string | number | null | undefined;

  let canvasRef: HTMLCanvasElement;
  let triangleSpacing: number;
  let triangleSize: number;
  let waveIntensity: number;
  let waveScale: { x: number; y: number };
  let hue: number;
  let hueScale: number;
  let unsubscribe: () => void = () => {
    /* Do nothing */
  };

  $: scaledTriangleSpacing = triangleSpacing * triangleSize;
  $: rowCount = Math.floor(Number(height) / scaledTriangleSpacing);
  $: columnCount = Math.floor(Number(width) / scaledTriangleSpacing);
  $: scaleXMod = scaledTriangleSpacing * 0.2;
  $: scaleYMod = scaledTriangleSpacing / 2;
  $: a = 0 * triangleSize;
  $: b = (1 / 3) * triangleSize;
  $: c = (2 / 3) * triangleSize;

  onMount(() => {
    const context = canvasRef?.getContext('2d');

    store.triangleSize.subscribe((it) => {
      triangleSize = it;
    });
    store.triangleSpacing.subscribe((it) => {
      triangleSpacing = it;
    });
    store.waveIntensity.subscribe((it) => {
      waveIntensity = it;
    });
    store.hue.subscribe((it) => {
      hue = it;
    });
    store.hueScale.subscribe((it) => {
      hueScale = it;
    });
    store.waveScale.subscribe((it) => {
      waveScale = it;
    });

    if (!context) {
      return;
    }

    let frameCount = 0;
    let animationFrameId: number;

    const render = () => {
      frameCount++;
      draw(context, frameCount, hue);
      animationFrameId = window.requestAnimationFrame(render);
    };
    render();

    unsubscribe = () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  });

  onDestroy(unsubscribe);

  const draw = (ctx: CanvasRenderingContext2D, frameCount: number, hue: number) => {
    const delta = frameCount * 0.01;
    ctx.strokeStyle = hsluvToHex([0, 0, 100]);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let y = 0; y < rowCount; y += 1) {
      for (let x = 0; x < columnCount; x += 1) {
        const modifiedHue = ((hue + x * 10 + y * 10) * hueScale) % 360;
        ctx.fillStyle = hsluvToHex([modifiedHue, 100, 85]);
        let scaledX = x * scaledTriangleSpacing + scaleXMod;
        let scaledY = y * scaledTriangleSpacing - scaleYMod;

        let t =
          (Math.sin(x * waveScale.x + delta) + Math.cos(y * waveScale.y + delta)) * waveIntensity;

        ctx.beginPath();
        ctx.moveTo(a + scaledX + t, a + scaledY + t);
        ctx.lineTo(b + scaledX + t, -c + scaledY + t);
        ctx.lineTo(c + scaledX + t, a + scaledY + t);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  };
</script>

<canvas bind:this={canvasRef} {height} {width} />
