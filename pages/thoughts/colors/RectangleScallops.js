import React, { useEffect, useRef } from "react";
import { hsluvToHex, rgbToHsluv } from "hsluv";

function getRandomColor() {
  return [Math.random(), Math.random(), Math.random()];
}

function bottomRightOrigin(i, width) {
  return [width - i, width - i];
}

function bottomLeftOrigin(i, width) {
  return [0, width - i];
}

function topRightOrigin(i, width) {
  return [width - i, 0];
}

function topLeftOrigin(i, width) {
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

const RectangleScallops = () => {
  const canvasRef = useRef(null);

  const draw = (ctx) => {
    let originFn = chooseRandomOriginFn();
    let steps = 4;
    let stepSize = ctx.canvas.width / steps;
    let startingColor = rgbToHsluv(getRandomColor());
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = hsluvToHex([0, 0, 75]);

    for (let i = 0; i < steps; i += 1) {
      let modifiedColor = hsluvToHex([
        startingColor[0] + i * 20.0,
        100.0,
        60.0,
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
    const context = canvas.getContext("2d");

    draw(context);
  }, [draw]);

  return <canvas ref={canvasRef} height="250" width="250" />;
};

export default RectangleScallops;
