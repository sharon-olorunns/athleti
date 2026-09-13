import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  deloadSets,
  isDeloadWeek,
  nextDayId,
  startOfLocalDay,
  weekNumberFor,
} from './schedule';

/** Local-time constructor, so these assertions hold in any timezone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('startOfLocalDay', () => {
  it('strips the time of day', () => {
    expect(startOfLocalDay(at(2025, 3, 10, 23))).toBe(at(2025, 3, 10, 0));
  });
});

describe('calendarDaysBetween', () => {
  it('counts whole days regardless of time of day', () => {
    // 23:00 to 01:00 the next morning is one calendar day, not zero.
    expect(calendarDaysBetween(at(2025, 3, 10, 23), at(2025, 3, 11, 1))).toBe(1);
    expect(calendarDaysBetween(at(2025, 3, 10), at(2025, 3, 10))).toBe(0);
    expect(calendarDaysBetween(at(2025, 3, 10), at(2025, 3, 17))).toBe(7);
  });

  it('survives a daylight-saving transition', () => {
    // Late March covers the European DST jump; a 23-hour day is still one day.
    expect(calendarDaysBetween(at(2025, 3, 29), at(2025, 4, 5))).toBe(7);
  });
});

describe('weekNumberFor', () => {
  const start = at(2025, 1, 6); // a Monday

  it('puts the start day in week 1', () => {
    expect(weekNumberFor(start, start)).toBe(1);
  });

  it('keeps the whole first seven days in week 1', () => {
    expect(weekNumberFor(at(2025, 1, 12), start)).toBe(1); // day 7
  });

  it('begins week 2 on day 8', () => {
    expect(weekNumberFor(at(2025, 1, 13), start)).toBe(2);
  });

  it('reaches the deload on day 29', () => {
    expect(weekNumberFor(at(2025, 2, 3), start)).toBe(5);
  });

  it('is unaffected by an evening session on the boundary day', () => {
    expect(weekNumberFor(at(2025, 1, 12, 22), start)).toBe(1);
    expect(weekNumberFor(at(2025, 1, 13, 6), start)).toBe(2);
  });

  it('clamps dates before the programme start to week 1', () => {
    expect(weekNumberFor(at(2024, 12, 25), start)).toBe(1);
  });
});

describe('isDeloadWeek', () => {
  it('fires on week 5 and every fifth week after', () => {
    expect(isDeloadWeek(5)).toBe(true);
    expect(isDeloadWeek(10)).toBe(true);
    expect(isDeloadWeek(15)).toBe(true);
  });

  it('does not fire on other weeks', () => {
    for (const week of [1, 2, 3, 4, 6, 9, 11]) {
      expect(isDeloadWeek(week)).toBe(false);
    }
  });

  it('is false for week 0 and below', () => {
    expect(isDeloadWeek(0)).toBe(false);
    expect(isDeloadWeek(-5)).toBe(false);
  });
});

describe('deloadSets', () => {
  it('cuts volume by roughly 40%, rounding down', () => {
    expect(deloadSets(5)).toBe(3);
    expect(deloadSets(4)).toBe(2);
    expect(deloadSets(3)).toBe(2); // floor(1.8) = 1, lifted to the minimum of 2
  });

  it('never drops below two sets', () => {
    expect(deloadSets(3)).toBeGreaterThanOrEqual(2);
    expect(deloadSets(6)).toBe(3);
  });

  it('leaves one- and two-set prescriptions alone rather than inflating them', () => {
    expect(deloadSets(1)).toBe(1);
    expect(deloadSets(2)).toBe(2);
  });
});

describe('nextDayId', () => {
  const days = ['day-1', 'day-2', 'day-3', 'day-4', 'day-5'];

  it('suggests the day after the last one logged', () => {
    expect(nextDayId(days, 'day-1')).toBe('day-2');
    expect(nextDayId(days, 'day-4')).toBe('day-5');
  });

  it('wraps at the last day', () => {
    expect(nextDayId(days, 'day-5')).toBe('day-1');
  });

  it('starts at the first day when nothing is logged', () => {
    expect(nextDayId(days, undefined)).toBe('day-1');
  });

  it('falls back to the first day for an unrecognised last day', () => {
    expect(nextDayId(days, 'day-removed')).toBe('day-1');
  });

  it('has no suggestion for an empty programme', () => {
    expect(nextDayId([], 'day-1')).toBeUndefined();
  });
});
