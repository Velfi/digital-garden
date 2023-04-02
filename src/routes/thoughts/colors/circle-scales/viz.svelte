<script lang="ts">
  import { hsluvToHex } from '$lib/hsluv';
  import { onDestroy, onMount } from 'svelte';
  import * as store from './store';

  function degToRad(degrees: number) {
    return degrees * (Math.PI / 180);
  }

  export let height: string | number | null | undefined;
  export let width: string | number | null | undefined;

  let canvasRef: HTMLCanvasElement;
  let circleSize: number;
  let circleSpacing: number;
  let Eccentricity: number;
  let waveScale: { x: number; y: number };
  let hue: number;
  let hueScale: number;
  let unsubscribe: () => void = () => {
    /* Do nothing */
  };

  $: scaledCircleSpacing = circleSpacing * circleSize;
  $: rowCount = Math.floor(Number(height) / scaledCircleSpacing);
  $: columnCount = Math.floor(Number(width) / scaledCircleSpacing);
  $: scaleXMod = scaledCircleSpacing * 0.8;
  $: scaleYMod = scaledCircleSpacing / 2;

  onMount(() => {
    const context = canvasRef?.getContext('2d');

    store.circleSize.subscribe((it) => {
      circleSize = it;
    });
    store.circleSpacing.subscribe((it) => {
      circleSpacing = it;
    });
    store.Eccentricity.subscribe((it) => {
      Eccentricity = it;
    });
    store.waveScale.subscribe((it) => {
      waveScale = it;
    });
    store.hue.subscribe((it) => {
      hue = it;
    });
    store.hueScale.subscribe((it) => {
      hueScale = it;
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
    const delta = frameCount * 0.00001;
    const dwx = delta * waveScale.x;
    const dwy = delta * waveScale.y;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = hsluvToHex([0, 0, 100]);

    for (let y = 0; y < rowCount; y += 1) {
      for (let x = 0; x < columnCount; x += 1) {
        const modifiedHue = ((hue + x + y) * hueScale) % 360;
        ctx.fillStyle = hsluvToHex([modifiedHue, 100, 75]);

        let scaledX = x * scaledCircleSpacing + scaleXMod;
        let scaledY = y * scaledCircleSpacing + scaleYMod;
        let t = Math.sin(x * dwx + y * dwy);

        ctx.beginPath();
        ctx.ellipse(
          scaledX,
          scaledY,
          circleSize,
          circleSize + Eccentricity * y,
          t * 360,
          degToRad(0),
          degToRad(270)
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  };
</script>

<canvas bind:this={canvasRef} {height} {width} />
