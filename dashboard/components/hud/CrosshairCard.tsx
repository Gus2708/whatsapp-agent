'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import { clsx } from 'clsx';

interface CrosshairCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverGlow?: boolean;
}

export const CrosshairCard: React.FC<CrosshairCardProps> = ({
  children,
  className,
  hoverGlow = true,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleMouseEnter = () => {
    if (!cardRef.current) return;
    const crosses = cardRef.current.querySelectorAll('.corner-cross');
    gsap.to(crosses, {
      rotation: 90,
      color: '#d4af37',
      scale: 1.1,
      duration: 0.25,
      ease: 'power2.out',
      stagger: 0.02,
    });
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    const crosses = cardRef.current.querySelectorAll('.corner-cross');
    gsap.to(crosses, {
      rotation: 0,
      color: '#404040',
      scale: 1.0,
      duration: 0.25,
      ease: 'power2.inOut',
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={clsx(
        'blueprint-card relative bg-carbon border border-graphite transition-colors duration-250',
        hoverGlow && 'hover:border-iron',
        className
      )}
      {...props}
    >
      {/* 4 Precision Corner Crosshairs (Centered on 4 vertices) */}
      <svg className="corner-cross tl" viewBox="0 0 10 10">
        <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg className="corner-cross tr" viewBox="0 0 10 10">
        <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg className="corner-cross bl" viewBox="0 0 10 10">
        <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg className="corner-cross br" viewBox="0 0 10 10">
        <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5" />
      </svg>

      {children}
    </div>
  );
};
