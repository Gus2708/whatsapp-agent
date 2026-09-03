import { describe, expect, it } from 'vitest';
import { getInitials, getScoreStroke, getScoreTone, getStatusTone } from '@/lib/crm-ui';
import type { StatusTone } from '@/lib/crm-ui';
import type { LeadStatus } from '@/lib/types';

describe('getStatusTone', () => {
  // Golden values, deliberately duplicating the lookup table. A truthy-per-field
  // check passes on a swapped pair, and pinning only `dot` passes when badge/text/
  // ring are corrupted. These tokens are a visual contract the CRM renders directly,
  // so the whole tone is pinned per status.
  it('maps each known lead status to its exact tone', () => {
    const expected: Record<LeadStatus, StatusTone> = {
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
    for (const status of Object.keys(expected) as LeadStatus[]) {
      expect(getStatusTone(status)).toEqual(expected[status]);
    }
  });

  it('falls back to the neutral tone for an unrecognized status', () => {
    const tone = getStatusTone('unknown-status' as LeadStatus);
    expect(tone).toEqual({
      badge: 'bg-graphite text-smoke border-iron',
      dot: 'bg-smoke',
      text: 'text-smoke',
      ring: 'ring-iron',
    });
  });
});

describe('getInitials', () => {
  it('takes the first letter of the first two words for a full name', () => {
    expect(getInitials('Maria Gonzalez')).toBe('MG');
  });

  it('takes the first two letters for a single-word name', () => {
    expect(getInitials('Cliente')).toBe('CL');
  });

  it('falls back to "--" for an empty/blank name', () => {
    expect(getInitials('')).toBe('--');
    expect(getInitials('   ')).toBe('--');
  });
});

describe('getScoreTone / getScoreStroke thresholds', () => {
  it('resolves the high bucket at and above 80', () => {
    expect(getScoreTone(80)).toBe('text-pulse-green');
    expect(getScoreTone(95)).toBe('text-pulse-green');
    expect(getScoreStroke(80)).toBe('var(--color-pulse-green)');
  });

  it('resolves the mid bucket just below 80 and at/above 60', () => {
    expect(getScoreTone(79)).toBe('text-blue-300');
    expect(getScoreTone(60)).toBe('text-blue-300');
    expect(getScoreStroke(60)).toBe('#93c5fd');
  });

  it('resolves the low bucket just below 60', () => {
    expect(getScoreTone(59)).toBe('text-neon-rose');
    expect(getScoreStroke(59)).toBe('var(--color-neon-rose)');
  });
});
