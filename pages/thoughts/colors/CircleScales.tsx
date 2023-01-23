import React, { useEffect, useRef } from "react";
import { hsluvToHex } from "@/hsluvUtils";

function degToRad(degrees: number) {
  return degrees * (Math.PI / 180);
}

const CircleScales = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const draw = (ctx: CanvasRenderingContext2D) => {
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
      let [x, y] = [i % circlesPerRow, Math.floor(i / circlesPerRow)];
      x = x * circleSpacing + circleSpacing / 2;
      y = y * circleSpacing + circleSpacing / 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 100, 100, 0, degToRad(0), degToRad(270));
      ctx.fill();
      ctx.stroke();
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

  return <canvas ref={canvasRef} height="750" width="1000" />;
};

export default CircleScales;
