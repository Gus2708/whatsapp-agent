import { LeadStatus } from './types';

/**
 * Shared visual tokens for CRM lead statuses.
 * Centralised so the conversation list, chat header and lead pane never drift apart.
 */
export interface StatusTone {
  /** Badge / pill classes: background + text + border. */
  badge: string;
  /** Solid fill for dots and bars. */
  dot: string;
  /** Foreground-only accent for text and icons. */
  text: string;
  /** Avatar ring color. */
  ring: string;
}

const STATUS_TONES: Record<LeadStatus, StatusTone> = {
  qualified: {
    badge: 'bg-pulse-green/10 text-pulse-green border-pulse-green/35',
    dot: 'bg-pulse-green',
    text: 'text-pulse-green',
    ring: 'ring-pulse-green/45',
  },
  'in-progress': {
    badge: 'bg-cobalt/10 text-blue-300 border-cobalt/40',
    dot: 'bg-cobalt',
    text: 'text-blue-300',
    ring: 'ring-cobalt/45',
  },
  escalated: {
    badge: 'bg-neon-rose/10 text-neon-rose border-neon-rose/40',
    dot: 'bg-neon-rose',
    text: 'text-neon-rose',
    ring: 'ring-neon-rose/45',
  },
  closed: {
    badge: 'bg-gold-bright/10 text-gold-bright border-gold-bright/35',
    dot: 'bg-gold-bright',
    text: 'text-gold-bright',
    ring: 'ring-gold-bright/45',
  },
};

/** Neutral tone for statuses the backend may return outside the known set. */
const FALLBACK_TONE: StatusTone = {
  badge: 'bg-graphite text-smoke border-iron',
  dot: 'bg-smoke',
  text: 'text-smoke',
  ring: 'ring-iron',
};

export const getStatusTone = (status: LeadStatus): StatusTone =>
  STATUS_TONES[status] ?? FALLBACK_TONE;

/** Two-letter monogram used by conversation avatars. */
export const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '--';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

/** Lead score color ramp. All values clear 4.5:1 against the obsidian surface. */
export const getScoreTone = (score: number): string => {
  if (score >= 80) return 'text-pulse-green';
  if (score >= 60) return 'text-blue-300';
  return 'text-neon-rose';
};

/** Stroke color for the score gauge, mirroring getScoreTone. */
export const getScoreStroke = (score: number): string => {
  if (score >= 80) return 'var(--color-pulse-green)';
  if (score >= 60) return '#93c5fd';
  return 'var(--color-neon-rose)';
};
