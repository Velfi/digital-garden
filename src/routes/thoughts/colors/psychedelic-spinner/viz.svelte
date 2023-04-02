<script lang="ts">
  import { hsluvToHex } from '$lib/hsluv';
  import { onDestroy, onMount } from 'svelte';
  import * as store from './store';

  export let height: string | number | null | undefined = 0;
  export let width: string | number | null | undefined = 0;

  if (height === null || height === undefined || width === null || width === undefined) {
    throw new Error('unreachable');
  }

  const root2 = Math.sqrt(2);
  $: length = calculateLength(width, height);
  $: center = calculateCenter(width, height);

  let canvasRef: HTMLCanvasElement;
  let spinnerSpeed: number;
  let steps: number;
  let wobbleSpeed: number;
  let wobbleAmount: number;
  let lineWidth: number;
  let hue: number;
  let hueScale: number;
  let shouldClear: boolean;
  let unsubscribe: () => void = () => {
    /* Do nothing */
  };

  onMount(() => {
    const ctx = canvasRef?.getContext('2d');

    store.spinnerSpeed.subscribe((it) => {
      spinnerSpeed = it;
    });
    store.hue.subscribe((it) => {
      hue = it;
    });
    store.hueScale.subscribe((it) => {
      hueScale = it;
    });
    store.wobbleAmount.subscribe((it) => {
      wobbleAmount = it;
    });
    store.wobbleSpeed.subscribe((it) => {
      wobbleSpeed = it;
    });
    store.steps.subscribe((it) => {
      steps = it;
    });
    store.lineWidth.subscribe((it) => {
      lineWidth = it;
    });
    store.shouldClear.subscribe((it) => {
      shouldClear = it;
    });

    if (!ctx) {
      return;
    }

    let frameCount = 3600;
    let animationFrameId: number;

    const render = () => {
      frameCount++;

      if (frameCount > 36000) {
        frameCount = 3600;
      }

      draw(ctx, frameCount, hue);
      animationFrameId = window.requestAnimationFrame(render);
    };
    render();

    unsubscribe = () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  });

  onDestroy(unsubscribe);

  function calculateLength(width?: string | number | null, height?: string | number | null) {
    let w = 0;
    let h = 0;

    if (typeof width === 'string') {
      w = parseInt(width, 10);
    } else if (typeof width === 'number') {
      w = width;
    }

    if (typeof height === 'string') {
      h = parseInt(height, 10);
    } else if (typeof height === 'number') {
      h = height;
    }

    return (Math.max(w, h) / 2) * root2;
  }

  function calculateCenter(width?: string | number | null, height?: string | number | null) {
    let w = 0;
    let h = 0;

    if (typeof width === 'string') {
      w = parseInt(width, 10);
    } else if (typeof width === 'number') {
      w = width;
    }

    if (typeof height === 'string') {
      h = parseInt(height, 10);
    } else if (typeof height === 'number') {
      h = height;
    }

    return [w / 2, h / 2];
  }

  const draw = (ctx: CanvasRenderingContext2D, frameCount: number, hue: number) => {
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    const delta = frameCount * 0.001;
    const [x1, y1] = center;

    if (shouldClear) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    const wobble = Math.sin(delta * wobbleSpeed) * wobbleAmount;
    let stepSize = length / steps + wobble;

    for (let i = 0; i < steps; i += 1) {
      const modifiedHue = ((hue + i) * hueScale) % 360;
      ctx.strokeStyle = hsluvToHex([modifiedHue, 100, 80]);
      let step = Math.max(length - i * stepSize, 0);
      const x2 = x1 + step * Math.cos(delta * spinnerSpeed);
      const y2 = y1 + step * Math.sin(delta * spinnerSpeed);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };
</script>

<canvas bind:this={canvasRef} {height} {width} />
