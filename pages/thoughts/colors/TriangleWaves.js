import React, { useEffect, useRef } from "react";

import { hsluvToHex } from "hsluv";

const TriangleWaves = () => {
  const canvasRef = useRef(null);

  const draw = (ctx, frameCount, hue) => {
    let delta = frameCount * 0.01;
    let steps = 2000;
    let trianglesPerRow = 40;
    let triangleSpacing = ctx.canvas.width / trianglesPerRow;
    ctx.strokeStyle = hsluvToHex([0, 0, 90]);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let i = 0; i < steps; i += 1) {
      let modifiedColor = hsluvToHex([hue + i * 0.05, 100, 85]);
      ctx.fillStyle = modifiedColor;
      // let step = ctx.canvas.width - i * stepSize;
      let [x, y] = [i % trianglesPerRow, Math.floor(i / trianglesPerRow)];
      x = x * triangleSpacing;
      y = (y * triangleSpacing) / 2;

      if (Math.floor(i / trianglesPerRow) % 2 === 0) {
        x = x - triangleSpacing / 2;
      }

      let scale = Math.sin(x + delta) * 100 + Math.cos(y + delta) * 100;

      ctx.beginPath();
      ctx.moveTo(0.0 + x + scale, 0.0 + y + scale);
      ctx.lineTo(30.0 + x + scale, -60.0 + y + scale);
      ctx.lineTo(60.0 + x + scale, 0.0 + y + scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const hue = Math.random() * 360.0;

    let frameCount = 0;
    let animationFrameId;

    //Our draw came here
    const render = () => {
      frameCount++;
      draw(context, frameCount, hue);
      animationFrameId = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [draw]);

  return <canvas ref={canvasRef} height="750" width="1000" />;
};

export default TriangleWaves;
