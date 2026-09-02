'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface HeaderAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Renders in the danger tone and is separated from the rest. */
  destructive?: boolean;
}

interface HeaderActionsMenuProps {
  actions: HeaderAction[];
  /** Read-only context shown above the actions (session identity, tunnels). */
  status?: React.ReactNode;
  className?: string;
}

/**
 * Collapses the header's secondary actions into a single control.
 *
 * On narrow viewports those actions were four same-sized bordered boxes with no
 * hierarchy, which read as clutter and cost a full header row. Here they become
 * one button plus a menu, where each item gets a full-width 44px target and a
 * visible label instead of a bare icon.
 */
export const HeaderActionsMenu: React.FC<HeaderActionsMenuProps> = ({
  actions,
  status,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const focusTimer = window.setTimeout(
      () => panelRef.current?.querySelector('button')?.focus(),
      0
    );

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const runAction = (action: HeaderAction) => {
    setIsOpen(false);
    action.onClick();
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Acciones y estado de la sesión"
        className={`flex h-10 w-10 items-center justify-center border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-compass-gold ${
          isOpen
            ? 'border-compass-gold bg-compass-gold/15 text-gold-bright'
            : 'border-graphite bg-[#141414] text-smoke hover:border-ash hover:text-chalk'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Acciones de la sesión"
          className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[248px] animate-fade-in border border-graphite bg-[#0e0e0e] shadow-[0_12px_32px_rgba(0,0,0,0.75)]"
        >
          {status && (
            <div className="border-b border-graphite px-3 py-2.5">{status}</div>
          )}

          <div className="flex flex-col p-1">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                onClick={() => runAction(action)}
                className={`flex min-h-[44px] w-full items-center gap-2.5 px-2.5 text-left font-mono text-[11.5px] uppercase tracking-wider transition-colors focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-compass-gold ${
                  action.destructive
                    ? 'mt-1 border-t border-graphite pt-1 text-neon-rose hover:bg-neon-rose/10'
                    : 'text-chalk hover:bg-graphite/50'
                }`}
              >
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  {action.icon}
                </span>
                <span className="truncate">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
