/**
 * Pain tracking. Pure.
 *
 * The app records scores and bands them by colour. It never interprets them
 * beyond the two hints the programme itself prescribes: it is a log, not a
 * diagnosis.
 */
import type { MorningCheck, WorkoutSession } from '@/types';
import { calendarDaysBetween, startOfLocalDay } from './schedule';

export type PainBand = 'green' | 'amber' | 'red';

export const PAIN_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** The programme's traffic light: 0–3 green, 4–6 amber, 7–10 red. */
export function painBand(score: number): PainBand {
  if (score <= 3) return 'green';
  if (score <= 6) return 'amber';
  return 'red';
}

export function painTint(score: number): string {
  return `var(--pain-${painBand(score)})`;
}

/**
 * The only interpretation the app is allowed to offer. Scoring 4+ gets the
 * programme's own rule about what to change first; 7+ additionally offers the
 * swap sheet, which the caller handles.
 */
export function painHint(score: number): string | undefined {
  if (score >= 4) return 'Cut range first, weight second.';
  return undefined;
}

/** At 7 and above, offer a knee-safe alternative directly. */
export function offersKneeSafeSwap(score: number): boolean {
  return score >= 7;
}

/**
 * The most recently recorded pain score, used to sort knee-safe alternatives
 * first. Considers per-exercise scores and session-level ones together, since
 * either means the knee has been complaining.
 */
export function lastPainScore(sessions: readonly WorkoutSession[]): number | undefined {
  const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  for (const session of ordered) {
    const scores = [
      ...session.entries.map((entry) => entry.painScore),
      session.postPainScore,
      session.prePainScore,
    ].filter((score): score is number => score !== undefined);
    if (scores.length > 0) return Math.max(...scores);
  }
  return undefined;
}

/** Whether any exercise in a day prompts for a pain score. */
export function sessionTracksPain(
  session: WorkoutSession,
  painTrackedIds: ReadonlySet<string>,
): boolean {
  return session.entries.some((entry) => painTrackedIds.has(entry.exerciseId));
}

export interface MorningCheckPrompt {
  /** ISO yyyy-mm-dd for today. */
  date: string;
  priorSessionId: string;
}

/** ISO yyyy-mm-dd in local time, which is how MorningCheck keys its days. */
export function isoDate(epochMs: number): string {
  const d = new Date(startOfLocalDay(epochMs));
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * The morning-after check, due on the first app open of the day following a
 * session.
 *
 * Deliberately only the *next* day. The programme's rule is that pain settling
 * within 24 hours is acceptable, so the morning after is the reading that
 * matters; asking again three days later would measure nothing and would be
 * nagging, which the app does not do.
 */
export function morningCheckDue(
  sessions: readonly WorkoutSession[],
  checks: readonly MorningCheck[],
  now: number,
  dismissedDates: readonly string[] = [],
): MorningCheckPrompt | undefined {
  const today = isoDate(now);
  if (checks.some((check) => check.date === today)) return undefined;
  if (dismissedDates.includes(today)) return undefined;

  const finished = sessions
    .filter((session) => session.finishedAt !== undefined)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  const last = finished[0];
  if (last?.finishedAt === undefined) return undefined;
  if (calendarDaysBetween(last.finishedAt, now) !== 1) return undefined;

  return { date: today, priorSessionId: last.id };
}
