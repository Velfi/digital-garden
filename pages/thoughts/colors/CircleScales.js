import React, { useEffect, useRef } from "react";

import { hsluvToHex } from "hsluv";

const CircleScales = () => {
  const canvasRef = useRef(null);

  const draw = (ctx) => {
    let startingHue = Math.random() * 360.0;
    let steps = 80;
    let circlesPerRow = 10;
    let circleSpacing = ctx.canvas.width / circlesPerRow;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = hsluvToHex([0, 0, 75]);

    for (let i = 0; i < steps; i += 1) {
      let modifiedColor = hsluvToHex([startingHue + i * 5.0, 100, 75]);
      ctx.fillStyle = modifiedColor;
      // let step = ctx.canvas.width - i * stepSize;
      let circle = new Path2D();
      let [x, y] = [i % circlesPerRow, Math.floor(i / circlesPerRow)];
      x = x * circleSpacing + circleSpacing / 2;
      y = y * circleSpacing + circleSpacing / 2;
      circle.arc(x, y, 100, 0, 360);
      ctx.fill(circle);
      ctx.stroke(circle);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    draw(context);
  }, [draw]);

  return <canvas ref={canvasRef} height="750" width="1000" />;
};

export default CircleScales;
