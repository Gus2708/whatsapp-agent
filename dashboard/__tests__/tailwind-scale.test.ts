import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import tailwindConfig from '../tailwind.config';

/**
 * Tailwind silently generates NO CSS for a utility whose value is off its scale.
 * There is no build error and no warning -- the class lands in the DOM dead.
 * This has shipped as a real bug twice in this codebase:
 *   - `bg-[#0e0e0e]/98`  -> `98` is not a default opacity step, whole utility is dead.
 *   - `py-0.2`           -> `0.2` is not a default spacing step, padding is dead.
 *
 * This test statically scans dashboard source for those two dead-utility shapes.
 * It is table-driven (see OFFENDER_FAMILIES below) so a future off-scale family
 * (e.g. a new arbitrary-adjacent utility that silently no-ops) is a small addition:
 * add one entry with a regex, a validity check, and a hint -- the walk/report
 * plumbing is shared.
 */

const DASHBOARD_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

// ---------------------------------------------------------------------------
// Scale definitions, honouring theme.extend from the real tailwind config
// instead of hardcoding the default scale blindly.
// ---------------------------------------------------------------------------

/** Tailwind's default opacity scale: multiples of 5 from 0 to 100 inclusive. */
function isDefaultOpacityStep(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 100 && n % 5 === 0;
}

/** Extra opacity steps declared under theme.extend.opacity (numeric keys only). */
const extendedOpacitySteps = new Set<number>(
  Object.keys(tailwindConfig?.theme?.extend?.opacity ?? {})
    .map(Number)
    .filter((n) => Number.isFinite(n)),
);

function isValidOpacityValue(n: number): boolean {
  return isDefaultOpacityStep(n) || extendedOpacitySteps.has(n);
}

function nearestOpacityStep(n: number): number {
  const clamped = Math.min(100, Math.max(0, n));
  return Math.round(clamped / 5) * 5;
}

/**
 * Font-size tokens. `text-sm/6` is NOT an opacity modifier -- it is Tailwind
 * 3.4's font-size/line-height shorthand, and it is perfectly valid. Without
 * this exclusion the opacity family flags it as dead, and a false positive in
 * a guard is worse than a gap: the fix a reader reaches for is deleting the
 * guard, not correcting the class.
 */
const DEFAULT_FONT_SIZE_TOKENS = new Set<string>([
  'xs', 'sm', 'base', 'lg', 'xl',
  '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
]);

const fontSizeTokens = new Set<string>([
  ...DEFAULT_FONT_SIZE_TOKENS,
  ...Object.keys(tailwindConfig?.theme?.extend?.fontSize ?? {}),
]);

/**
 * True when `match` is a font-size/line-height pair rather than a colour with
 * an opacity modifier. Covers the token form (`text-sm/6`) and the
 * arbitrary-length form (`text-[14px]/6`); an arbitrary COLOUR
 * (`text-[#fff]/50`) is a genuine opacity modifier and is left alone.
 */
function isFontSizeLineHeight(match: string): boolean {
  const m = /^text-(\[[^\]]+\]|[a-zA-Z0-9-]+)\//.exec(match);
  if (!m) return false;
  const token = m[1];
  if (token.startsWith('[')) {
    return !/^\[(#|rgb|hsl|var|color|oklch|lab)/i.test(token);
  }
  return fontSizeTokens.has(token);
}

/** Tailwind's default fractional spacing steps. */
const DEFAULT_SPACING_DECIMALS = new Set(['0.5', '1.5', '2.5', '3.5']);

/** Extra decimal spacing steps declared under theme.extend.spacing. */
const extendedSpacingDecimals = new Set<string>(
  Object.keys(tailwindConfig?.theme?.extend?.spacing ?? {}).filter((key) =>
    /^\d+\.\d+$/.test(key),
  ),
);

function isValidSpacingDecimal(value: string): boolean {
  return DEFAULT_SPACING_DECIMALS.has(value) || extendedSpacingDecimals.has(value);
}

function nearestSpacingDecimal(value: string): string {
  const target = Number(value);
  const candidates = [...DEFAULT_SPACING_DECIMALS, ...extendedSpacingDecimals];
  let best = candidates[0];
  let bestDiff = Math.abs(Number(best) - target);
  for (const candidate of candidates) {
    const diff = Math.abs(Number(candidate) - target);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Offender families (table-driven scan)
// ---------------------------------------------------------------------------

interface Offender {
  file: string;
  line: number;
  className: string;
  reason: string;
}

interface OffenderFamily {
  name: string;
  /** Must be a global regex; capture group 1 is the value to validate. */
  regex: RegExp;
  isValid: (capture: string) => boolean;
  /** Optional: drop a match that looks like this family but is valid syntax. */
  skip?: (fullMatch: string) => boolean;
  hint: (capture: string, fullMatch: string) => string;
}

// Colour-utility prefixes that Tailwind allows an opacity modifier on.
const COLOR_UTILITY_PREFIXES =
  'bg|text|border|ring|ring-offset|from|via|to|divide|outline|decoration|placeholder|accent|caret|fill|stroke';

// Spacing-utility prefixes that take a bare numeric scale value.
const SPACING_UTILITY_PREFIXES =
  'p|px|py|pt|pr|pb|pl|' +
  'm|mx|my|mt|mr|mb|ml|' +
  'gap-x|gap-y|gap|' +
  'space-x|space-y|' +
  'w|h|' +
  'inset-x|inset-y|inset|' +
  'top|right|bottom|left|' +
  'translate-x|translate-y';

const OFFENDER_FAMILIES: OffenderFamily[] = [
  {
    // Matches e.g. `bg-[#0e0e0e]/98`, `text-pulse-green/33`, `border-black/7`.
    // The colour value itself is either a bracket arbitrary value or a plain
    // utility/color token. A bracket opacity modifier (`/[98%]`, `/[0.98]`)
    // requires a digit immediately after the slash, so it never matches this
    // pattern -- that's the "critical" distinction the task calls out.
    name: 'off-scale opacity modifier',
    regex: new RegExp(
      `\\b(?:${COLOR_UTILITY_PREFIXES})-(?:\\[[^\\]\\s]+\\]|[a-zA-Z0-9-]+)\\/(\\d{1,3})\\b`,
      'g',
    ),
    isValid: (capture) => isValidOpacityValue(Number(capture)),
    skip: isFontSizeLineHeight,
    hint: (capture) =>
      `opacity modifier /${capture} is not on Tailwind's default 0,5,10,...,100 scale, ` +
      `so the whole utility produces no CSS. Nearest on-scale value: /${nearestOpacityStep(
        Number(capture),
      )}, or use the arbitrary bracket form /[${capture}%] (or /[0.${capture.padStart(2, '0')}]).`,
  },
  {
    // Matches e.g. `py-0.2`, `mt-1.2`, `gap-2.7`. A bracket arbitrary value
    // (`p-[0.2rem]`) has `[` right after the hyphen, never a digit, so it
    // never matches this pattern. A fraction utility like `w-1/2` has no
    // decimal point at all, so it never matches either.
    name: 'off-scale spacing decimal',
    regex: new RegExp(`-?\\b(?:${SPACING_UTILITY_PREFIXES})-(\\d+\\.\\d+)\\b`, 'g'),
    isValid: (capture) => isValidSpacingDecimal(capture),
    hint: (capture) =>
      `spacing decimal ${capture} is not one of Tailwind's default fractional steps ` +
      `(0.5, 1.5, 2.5, 3.5), so the utility produces no CSS. Nearest on-scale value: ` +
      `${nearestSpacingDecimal(capture)}, or use the arbitrary bracket form [${capture}rem].`,
  },
];

// ---------------------------------------------------------------------------
// File walk
// ---------------------------------------------------------------------------

function collectSourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const absDir = path.join(DASHBOARD_ROOT, dir);
    if (!fs.existsSync(absDir)) continue;
    const entries = fs.readdirSync(absDir, { recursive: true }) as string[];
    for (const entry of entries) {
      const abs = path.join(absDir, entry);
      if (!fs.statSync(abs).isFile()) continue;
      if (!SCAN_EXTENSIONS.has(path.extname(abs))) continue;
      files.push(abs);
    }
  }
  return files;
}

function scanFile(absPath: string): Offender[] {
  const relPath = path.relative(DASHBOARD_ROOT, absPath).split(path.sep).join('/');
  const lines = fs.readFileSync(absPath, 'utf8').split('\n');
  const offenders: Offender[] = [];

  lines.forEach((line, idx) => {
    for (const family of OFFENDER_FAMILIES) {
      // Fresh regex per line to reset lastIndex safely (regex has 'g' flag, shared object).
      const re = new RegExp(family.regex.source, family.regex.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        const capture = match[1];
        if (family.skip?.(match[0])) continue;
        if (!family.isValid(capture)) {
          offenders.push({
            file: relPath,
            line: idx + 1,
            className: match[0],
            reason: family.hint(capture, match[0]),
          });
        }
      }
    }
  });

  return offenders;
}

function formatReport(offenders: Offender[]): string {
  return offenders
    .map((o) => `${o.file}:${o.line}  ${o.className}\n  dead because: ${o.reason}`)
    .join('\n');
}

describe('Tailwind scale usage', () => {
  it('has no off-scale (dead) opacity modifiers or spacing decimals under app/ and components/', () => {
    const files = collectSourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap(scanFile);

    if (offenders.length > 0) {
      throw new Error(
        `Found ${offenders.length} off-scale Tailwind class(es) that silently produce no CSS:\n\n` +
          formatReport(offenders),
      );
    }
  });
});
