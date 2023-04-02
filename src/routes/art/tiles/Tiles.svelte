<script lang="ts">
  import { hsluvToHex } from '$lib/hsluv';
  import { onDestroy, onMount } from 'svelte';

  let canvasRef: HTMLCanvasElement;
  const tileWidth = 240;
  const unit = tileWidth / 10;
  const unit2 = unit * 2;
  const unit4 = unit * 4;
  const unit10 = unit * 10;
  let unsubscribe: () => void = () => {
    /* Do nothing */
  };

  onMount(() => {
    const context = canvasRef?.getContext('2d');

    if (!context) {
      return;
    }

    let animationFrameId: number;

    const render = () => {
      draw(context);
      animationFrameId = window.requestAnimationFrame(render);
    };
    render();

    unsubscribe = () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  });

  onDestroy(unsubscribe);

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = hsluvToHex([0, 0, 255]);
    const origin: [number, number] = [1, 1];

    let colors = [];

    for (let i = 0; i < 5; i += 1) {
      let modifiedColor = hsluvToHex([0, 0, 5 + i * 20.0]);

      colors.push(modifiedColor);
    }

    draw_top_edge(ctx, origin, colors[0]);
    draw_left_edge(ctx, origin, colors[0]);

    draw_left_triangle(ctx, origin, colors[3]);
    draw_top_triangle(ctx, origin, colors[4]);

    draw_edge_square(ctx, origin, colors[1]);
    draw_inner_square(ctx, origin, colors[2]);

    function draw_edge_square(
      ctx: CanvasRenderingContext2D,
      origin: [number, number],
      color: string
    ) {
      ctx.fillStyle = color;
      let rectangle = new Path2D();
      let [x, y] = origin;
      rectangle.rect(x, y, unit2, unit2);
      ctx.fill(rectangle);
      ctx.stroke(rectangle);
    }

    function draw_top_edge(ctx: CanvasRenderingContext2D, origin: [number, number], color: string) {
      ctx.fillStyle = color;
      let rectangle = new Path2D();
      let [x, y] = origin;
      rectangle.rect(x + unit2, y, x + unit10, y + unit2);
      ctx.fill(rectangle);
      ctx.stroke(rectangle);
    }

    function draw_left_edge(
      ctx: CanvasRenderingContext2D,
      origin: [number, number],
      color: string
    ) {
      ctx.fillStyle = color;
      let rectangle = new Path2D();
      let [x, y] = origin;
      rectangle.rect(x, y + unit2, x + unit2, y + unit10);
      ctx.fill(rectangle);
      ctx.stroke(rectangle);
    }

    function draw_inner_square(
      ctx: CanvasRenderingContext2D,
      origin: [number, number],
      color: string
    ) {
      ctx.fillStyle = color;
      let rectangle = new Path2D();
      let [x, y] = origin;
      rectangle.rect(x + unit2, y + unit2, x + unit4, y + unit4);
      ctx.fill(rectangle);
      ctx.stroke(rectangle);
    }

    function draw_left_triangle(
      ctx: CanvasRenderingContext2D,
      origin: [number, number],
      color: string
    ) {
      ctx.fillStyle = color;
      let triangle = new Path2D();
      let [x, y] = origin;
      triangle.moveTo(x + unit2, y + unit2);
      triangle.lineTo(x + unit2, y + unit10);
      triangle.lineTo(x + unit10, y + unit10);
      ctx.fill(triangle);
      ctx.stroke(triangle);
    }

    function draw_top_triangle(
      ctx: CanvasRenderingContext2D,
      origin: [number, number],
      color: string
    ) {
      ctx.fillStyle = color;
      let triangle = new Path2D();
      let [x, y] = origin;
      triangle.moveTo(x + unit2, y + unit2);
      triangle.lineTo(x + unit10, y + unit2);
      triangle.lineTo(x + unit10, y + unit10);
      ctx.fill(triangle);
      ctx.stroke(triangle);
    }
  };
</script>

<canvas bind:this={canvasRef} height={tileWidth + 2} width={tileWidth + 2} />

<style>
  canvas {
    width: 33.33%;
  }
</style>
