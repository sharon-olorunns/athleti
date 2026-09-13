import { describe, expect, it } from 'vitest';
import type { MorningCheck } from '@/types';
import { aSession, aSet } from '@/test/factories';
import {
  isoDate,
  lastPainScore,
  morningCheckDue,
  offersKneeSafeSwap,
  painBand,
  painHint,
} from './pain';

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();

describe('painBand', () => {
  it('matches the programme traffic light', () => {
    expect([0, 1, 2, 3].map(painBand)).toEqual(['green', 'green', 'green', 'green']);
    expect([4, 5, 6].map(painBand)).toEqual(['amber', 'amber', 'amber']);
    expect([7, 8, 9, 10].map(painBand)).toEqual(['red', 'red', 'red', 'red']);
  });
});

describe('painHint', () => {
  it('is silent in the green band', () => {
    for (const score of [0, 1, 2, 3]) expect(painHint(score)).toBeUndefined();
  });

  it('gives the programme rule from 4 upwards', () => {
    expect(painHint(4)).toBe('Cut range first, weight second.');
    expect(painHint(9)).toBe('Cut range first, weight second.');
  });

  it('never says anything beyond that one line', () => {
    // The app is a log, not a diagnosis: there is exactly one hint.
    const hints = new Set([...Array(11).keys()].map(painHint).filter((h) => h !== undefined));
    expect(hints.size).toBe(1);
  });
});

describe('offersKneeSafeSwap', () => {
  /** Acceptance criterion 11: a score of 7 offers knee-safe alternatives. */
  it('offers from 7 upwards', () => {
    expect(offersKneeSafeSwap(7)).toBe(true);
    expect(offersKneeSafeSwap(10)).toBe(true);
  });

  it('does not offer below 7', () => {
    for (const score of [0, 3, 4, 6]) expect(offersKneeSafeSwap(score)).toBe(false);
  });
});

describe('lastPainScore', () => {
  it('reads the most recent session that recorded anything', () => {
    const sessions = [
      aSession({ id: 'old', startedAt: 1, entries: [{ exerciseId: 'x', sets: [], painScore: 2 }] }),
      aSession({ id: 'new', startedAt: 2, entries: [{ exerciseId: 'x', sets: [], painScore: 6 }] }),
    ];
    expect(lastPainScore(sessions)).toBe(6);
  });

  it('takes the worst score within that session', () => {
    const sessions = [
      aSession({
        startedAt: 2,
        entries: [
          { exerciseId: 'a', sets: [], painScore: 3 },
          { exerciseId: 'b', sets: [], painScore: 7 },
        ],
      }),
    ];
    expect(lastPainScore(sessions)).toBe(7);
  });

  it('counts the session-level scores too', () => {
    expect(lastPainScore([aSession({ startedAt: 2, postPainScore: 5 })])).toBe(5);
  });

  it('skips sessions with nothing recorded', () => {
    const sessions = [
      aSession({ id: 'old', startedAt: 1, entries: [{ exerciseId: 'x', sets: [], painScore: 4 }] }),
      aSession({ id: 'new', startedAt: 2, entries: [{ exerciseId: 'x', sets: [] }] }),
    ];
    expect(lastPainScore(sessions)).toBe(4);
  });

  it('is undefined when nothing has ever been recorded', () => {
    expect(lastPainScore([])).toBeUndefined();
    expect(lastPainScore([aSession({})])).toBeUndefined();
  });
});

describe('isoDate', () => {
  it('formats local days, which is how a morning check is keyed', () => {
    expect(isoDate(at(2025, 3, 9, 23))).toBe('2025-03-09');
    expect(isoDate(at(2025, 12, 1, 0))).toBe('2025-12-01');
  });
});

describe('morningCheckDue', () => {
  const finished = (id: string, when: number) =>
    aSession({ id, startedAt: when - 3600000, finishedAt: when, entries: [{ exerciseId: 'x', sets: [aSet({ setIndex: 0 })] }] });

  it('is due the morning after a session', () => {
    const prompt = morningCheckDue([finished('s1', at(2025, 3, 10, 19))], [], at(2025, 3, 11, 8));
    expect(prompt).toEqual({ date: '2025-03-11', priorSessionId: 's1' });
  });

  it('is not due on the day of the session itself', () => {
    expect(morningCheckDue([finished('s1', at(2025, 3, 10, 19))], [], at(2025, 3, 10, 22))).toBeUndefined();
  });

  /**
   * Only the next day. The programme's rule is that pain settling within 24
   * hours is acceptable, so the morning after is the reading that matters;
   * asking three days later would measure nothing.
   */
  it('is not due two days later', () => {
    expect(morningCheckDue([finished('s1', at(2025, 3, 10, 19))], [], at(2025, 3, 12, 8))).toBeUndefined();
  });

  it('is not due once today is already recorded', () => {
    const checks: MorningCheck[] = [{ date: '2025-03-11', kneeScore: 2 }];
    expect(morningCheckDue([finished('s1', at(2025, 3, 10, 19))], checks, at(2025, 3, 11, 8))).toBeUndefined();
  });

  it('is not due once dismissed for today', () => {
    expect(
      morningCheckDue([finished('s1', at(2025, 3, 10, 19))], [], at(2025, 3, 11, 8), ['2025-03-11']),
    ).toBeUndefined();
  });

  it('ignores an unfinished session', () => {
    const live = aSession({ id: 'live', startedAt: at(2025, 3, 10, 19) });
    expect(morningCheckDue([live], [], at(2025, 3, 11, 8))).toBeUndefined();
  });

  it('is not due with no sessions at all', () => {
    expect(morningCheckDue([], [], at(2025, 3, 11, 8))).toBeUndefined();
  });

  it('follows the most recent session when several exist', () => {
    const sessions = [finished('old', at(2025, 3, 1, 19)), finished('recent', at(2025, 3, 10, 19))];
    expect(morningCheckDue(sessions, [], at(2025, 3, 11, 8))?.priorSessionId).toBe('recent');
  });
});
