/**
 * Rep-string parsing. Pure.
 *
 * The seed uses three shapes in `prescription.reps`:
 *   "5"           a fixed target
 *   "6-8"         a range, which enables double progression
 *   "6 / 30s / 8" a composite — one string covering a multi-movement flow
 *                 (e.g. 90/90 rotation · running pigeon · KB hip opener)
 *
 * A composite must never be read as a range: "20 / 15" is two movements, not
 * twenty-to-fifteen reps, and treating it as a range would feed the progression
 * engine a nonsense target.
 */

export type RepSpec =
  | { kind: 'fixed'; target: number; text: string }
  | { kind: 'range'; min: number; max: number; text: string }
  | { kind: 'composite'; parts: string[]; text: string }
  | { kind: 'none'; text: string };

/** Hyphen, en dash and em dash all appear in hand-written rep ranges. */
const RANGE_SEPARATOR = /\s*[-–—]\s*/;

export function parseReps(reps: string | undefined | null): RepSpec {
  const text = (reps ?? '').trim();
  if (text === '') return { kind: 'none', text: '' };

  // Composite first: a slash means several distinct movements or targets.
  if (text.includes('/')) {
    const parts = text.split('/').map((p) => p.trim()).filter((p) => p !== '');
    return { kind: 'composite', parts, text };
  }

  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    return { kind: 'fixed', target: asNumber, text };
  }

  const bounds = text.split(RANGE_SEPARATOR);
  if (bounds.length === 2) {
    const min = Number(bounds[0]);
    const max = Number(bounds[1]);
    if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
      return { kind: 'range', min, max, text };
    }
  }

  // Anything else ("AMRAP", "to failure") stays descriptive rather than guessed at.
  return { kind: 'none', text };
}

/** Double progression only applies to a genuine range. */
export function enablesDoubleProgression(spec: RepSpec): boolean {
  return spec.kind === 'range';
}

/** The rep count that, once hit clean on every set, earns more load. */
export function topOfRange(spec: RepSpec): number | undefined {
  if (spec.kind === 'range') return spec.max;
  if (spec.kind === 'fixed') return spec.target;
  return undefined;
}

/** Where reps reset to after a load increase. */
export function bottomOfRange(spec: RepSpec): number | undefined {
  if (spec.kind === 'range') return spec.min;
  if (spec.kind === 'fixed') return spec.target;
  return undefined;
}

/** A starting rep value for a set row when there is no history to pre-fill from. */
export function defaultRepTarget(spec: RepSpec): number | undefined {
  return bottomOfRange(spec);
}
