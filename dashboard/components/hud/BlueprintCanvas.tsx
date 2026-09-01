'use client';

import React, { useEffect, useRef } from 'react';

export const BlueprintCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const handleResize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const render = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const spacing = 38;
      time += 0.007; // Velocidad suave y pausada

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      for (let x = spacing; x < canvas.width; x += spacing) {
        for (let y = spacing; y < canvas.height; y += spacing) {
          const distFromCenter = Math.hypot(x - centerX, y - centerY);
          const wave = Math.sin(distFromCenter * 0.006 - time);

          if (wave > 0.65) {
            // Cresta del pulso (Verde sutil y elegante)
            ctx.fillStyle = 'rgba(152, 255, 56, 0.28)';
            const size = 1.3;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          } else if (wave > 0.35) {
            // Halo intermedio tenue
            ctx.fillStyle = 'rgba(212, 175, 55, 0.14)';
            const size = 0.95;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Puntos base oscuros del blueprint
            ctx.fillStyle = '#181818';
            const size = 0.65;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 opacity-40"
    />
  );
};
