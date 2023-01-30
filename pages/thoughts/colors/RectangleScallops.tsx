import { getRandomHsluv, hsluvToHex } from "@/hsluvUtils";
import React, { useEffect, useRef } from "react";

function bottomRightOrigin(i: number, width: number) {
  return [width - i, width - i];
}

function bottomLeftOrigin(i: number, width: number) {
  return [0, width - i];
}

function topRightOrigin(i: number, width: number) {
  return [width - i, 0];
}

function topLeftOrigin(i: number, width: number) {
  return [0, 0];
}

function chooseRandomOriginFn() {
  let originFns = [
    bottomRightOrigin,
    bottomLeftOrigin,
    topRightOrigin,
    topLeftOrigin,
  ];
  return originFns[Math.floor(Math.random() * originFns.length)];
}

const RectangleScallops: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const draw = (ctx: CanvasRenderingContext2D) => {
    let originFn = chooseRandomOriginFn();
    let steps = 8;
    let stepSize = ctx.canvas.width / steps;
    let startingColor = getRandomHsluv();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = hsluvToHex([0, 0, 75]);

    for (let i = 0; i < steps; i += 1) {
      let modifiedColor = hsluvToHex([
        startingColor.hsluv_h + i * 20.0,
        startingColor.hsluv_l,
        70,
      ]);

      let step = ctx.canvas.width - i * stepSize;
      ctx.fillStyle = modifiedColor;
      let rectangle = new Path2D();
      let [x, y] = originFn(step, ctx.canvas.width);
      rectangle.rect(x, y, step, step);
      ctx.fill(rectangle);
      ctx.stroke(rectangle);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!context) {
      return;
    }

    draw(context);
  }, []);

  return <canvas ref={canvasRef} height="250" width="250" />;
};

export default RectangleScallops;
