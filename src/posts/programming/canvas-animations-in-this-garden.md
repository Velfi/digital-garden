---
title: How this site previously used Canvas to render art and animations
description: A brief history of how this site used Canvas to render art and animations.
keywords: canvas, react, animation, art
---

The [colors] page features some dynamic illustrations implemented with HTML canvas. Below is an example of the

```tsx
import React, { useEffect, useRef } from 'react';

export const ColorExample1: React.FC = (props) => {
  const canvasRef = useRef(null);

  const draw = (ctx, frameCount) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(50, 100, 20 * Math.sin(frameCount * 0.05) ** 2, 0, 2 * Math.PI);
    ctx.fill();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    let frameCount = 0;
    let animationFrameId;

    //Our draw came here
    const render = () => {
      frameCount++;
      draw(context, frameCount);
      animationFrameId = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [draw]);

  return <canvas ref={canvasRef} {...props} />;
};
```

[canvas with react.js]: https://medium.com/@pdx.lucasm/canvas-with-react-js-32e133c05258
[colors]: /thoughts/colors
