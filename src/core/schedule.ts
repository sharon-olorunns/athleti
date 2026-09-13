/**
 * Programme scheduling maths. Pure.
 *
 * Week numbers are 1-indexed from the programme start and drive the deload rule,
 * so they are computed from whole elapsed days rather than raw millisecond
 * division — an hour's drift must never tip the user into the wrong week.
 */

const MS_PER_DAY = 86_400_000;

/** Local midnight for a timestamp, so day maths survives DST and evening sessions. */
export function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days between two timestamps, ignoring time of day. */
export function calendarDaysBetween(fromMs: number, toMs: number): number {
  return Math.round((startOfLocalDay(toMs) - startOfLocalDay(fromMs)) / MS_PER_DAY);
}

/**
 * The 1-indexed programme week a moment falls in. The start day itself is week 1;
 * day 7 is still week 1, day 8 begins week 2. Dates before the start clamp to 1.
 */
export function weekNumberFor(atMs: number, programmeStartedAtMs: number): number {
  const days = calendarDaysBetween(programmeStartedAtMs, atMs);
  if (days < 0) return 1;
  return Math.floor(days / 7) + 1;
}

/** Week 5, and every fifth week after, is a deload. */
export function isDeloadWeek(weekNumber: number): boolean {
  return weekNumber > 0 && weekNumber % 5 === 0;
}

/**
 * Deload cuts suggested sets by roughly 40% (round down, minimum 2) while the
 * weight suggestion is held unchanged. A single-set prescription stays at one —
 * there is nothing to cut, and inflating it to two would add volume on a deload.
 */
export function deloadSets(prescribedSets: number): number {
  if (prescribedSets <= 2) return prescribedSets;
  return Math.max(2, Math.floor(prescribedSets * 0.6));
}

/**
 * The next day to suggest: the one after the last day logged, wrapping at the end.
 * With nothing logged yet the programme starts at its first day. An unrecognised
 * last day (e.g. a day removed from the programme) also falls back to the first.
 */
export function nextDayId(
  dayIds: readonly string[],
  lastLoggedDayId: string | undefined,
): string | undefined {
  if (dayIds.length === 0) return undefined;
  if (lastLoggedDayId === undefined) return dayIds[0];
  const lastIndex = dayIds.indexOf(lastLoggedDayId);
  if (lastIndex === -1) return dayIds[0];
  return dayIds[(lastIndex + 1) % dayIds.length];
}
