import { describe, expect, it } from 'vitest';
import {
  bottomOfRange,
  enablesDoubleProgression,
  parseReps,
  topOfRange,
} from './reps';

describe('parseReps', () => {
  it('reads a single number as a fixed target', () => {
    expect(parseReps('5')).toEqual({ kind: 'fixed', target: 5, text: '5' });
    expect(parseReps('20')).toEqual({ kind: 'fixed', target: 20, text: '20' });
  });

  it('reads a hyphenated pair as a range', () => {
    expect(parseReps('6-8')).toEqual({ kind: 'range', min: 6, max: 8, text: '6-8' });
    expect(parseReps('12-15')).toEqual({ kind: 'range', min: 12, max: 15, text: '12-15' });
  });

  it('accepts en and em dashes in ranges', () => {
    expect(parseReps('6–8')).toMatchObject({ kind: 'range', min: 6, max: 8 });
    expect(parseReps('6 — 8')).toMatchObject({ kind: 'range', min: 6, max: 8 });
  });

  it('treats slash-separated strings as composite, never as a range', () => {
    // "20 / 15" is two movements. Read as a range it would feed the progression
    // engine a descending target.
    expect(parseReps('20 / 15')).toEqual({
      kind: 'composite',
      parts: ['20', '15'],
      text: '20 / 15',
    });
    expect(parseReps('6 / 30s / 8')).toEqual({
      kind: 'composite',
      parts: ['6', '30s', '8'],
      text: '6 / 30s / 8',
    });
  });

  it('returns none for absent or empty reps', () => {
    expect(parseReps(undefined)).toEqual({ kind: 'none', text: '' });
    expect(parseReps('')).toEqual({ kind: 'none', text: '' });
    expect(parseReps('   ')).toEqual({ kind: 'none', text: '' });
  });

  it('keeps unparseable text descriptive rather than guessing', () => {
    expect(parseReps('AMRAP')).toEqual({ kind: 'none', text: 'AMRAP' });
    // A descending pair is not a valid range.
    expect(parseReps('8-6')).toEqual({ kind: 'none', text: '8-6' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseReps(' 8 ')).toMatchObject({ kind: 'fixed', target: 8 });
  });
});

describe('double progression', () => {
  it('is enabled only by a genuine range', () => {
    expect(enablesDoubleProgression(parseReps('6-8'))).toBe(true);
    expect(enablesDoubleProgression(parseReps('5'))).toBe(false);
    expect(enablesDoubleProgression(parseReps('6 / 30s / 8'))).toBe(false);
    expect(enablesDoubleProgression(parseReps(undefined))).toBe(false);
  });

  it('exposes the rep target that earns load, and where reps reset to', () => {
    expect(topOfRange(parseReps('6-8'))).toBe(8);
    expect(bottomOfRange(parseReps('6-8'))).toBe(6);
    // A fixed target is both its own top and bottom.
    expect(topOfRange(parseReps('5'))).toBe(5);
    expect(bottomOfRange(parseReps('5'))).toBe(5);
  });

  it('has no rep target for composite or absent specs', () => {
    expect(topOfRange(parseReps('20 / 15'))).toBeUndefined();
    expect(bottomOfRange(parseReps(undefined))).toBeUndefined();
  });
});
