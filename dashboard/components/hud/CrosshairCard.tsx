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
      color: '#383838',
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
      {/* 4 Corner Crosshairs */}
      <svg className="corner-cross tl" viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <svg className="corner-cross tr" viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <svg className="corner-cross bl" viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <svg className="corner-cross br" viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>

      {children}
    </div>
  );
};
