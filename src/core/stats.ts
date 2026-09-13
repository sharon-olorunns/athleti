/**
 * Analytics for the History and Progress screens. Pure.
 *
 * The rule section 5.3 sets: only plot what the exercise's progression currency
 * actually measures. Estimated 1RM for load, total hold seconds for time, and
 * nothing at all for quality and fixed — plotting a jump's "weight" is
 * meaningless and misleading.
 */
import type {
  Exercise,
  LoggedExercise,
  LoggedSet,
  MorningCheck,
  WorkoutSession,
} from '@/types';
import { workingWeight } from './progression';
import { isoDate } from './pain';

/**
 * Epley: a one-rep max estimated from a working set. Used only to give load
 * exercises a comparable number across changing rep counts.
 */
export function estimated1RM(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** The best estimated 1RM in a performance. */
export function bestEstimated1RM(sets: readonly LoggedSet[]): number | undefined {
  const values = sets
    .filter((set) => set.weightKg !== undefined && set.reps !== undefined && set.reps > 0)
    .map((set) => estimated1RM(set.weightKg!, set.reps!));
  return values.length === 0 ? undefined : Math.max(...values);
}

/** The hardest set of a performance — the one worth reading in a history row. */
export function topSet(
  sets: readonly LoggedSet[],
  inverse = false,
): LoggedSet | undefined {
  if (sets.length === 0) return undefined;
  const weight = workingWeight(sets, inverse);
  if (weight !== undefined) {
    return sets.find((set) => set.weightKg === weight);
  }
  // No load: the longest hold, else the most reps, else the furthest.
  return [...sets].sort(
    (a, b) =>
      (b.seconds ?? 0) - (a.seconds ?? 0) ||
      (b.reps ?? 0) - (a.reps ?? 0) ||
      (b.distanceM ?? 0) - (a.distanceM ?? 0),
  )[0];
}

export function totalHoldSeconds(sets: readonly LoggedSet[]): number {
  return sets.reduce((sum, set) => sum + (set.seconds ?? 0), 0);
}

export interface SeriesPoint {
  /** Epoch ms of the session. */
  at: number;
  value: number;
}

export type StrengthSeriesKind = 'e1rm' | 'assistance' | 'hold-seconds' | 'none';

export interface StrengthSeries {
  kind: StrengthSeriesKind;
  /** Axis label, e.g. "Estimated 1RM (kg)". */
  label: string;
  /** Empty for kinds that must not be plotted. */
  points: SeriesPoint[];
  /** True when a falling line is the improvement. */
  lowerIsBetter: boolean;
}

export interface DatedPerformance {
  at: number;
  entry: LoggedExercise;
}

/**
 * Every performance of an exercise with the session date attached, newest first.
 * Substituted entries count under the id that was actually performed.
 */
export function performancesOf(
  exerciseId: string,
  sessions: readonly WorkoutSession[],
): DatedPerformance[] {
  return sessions
    .filter((session) => session.finishedAt !== undefined)
    .flatMap((session) =>
      session.entries
        .filter(
          (entry) =>
            entry.exerciseId === exerciseId && entry.skipped !== true && entry.sets.length > 0,
        )
        .map((entry) => ({ at: session.startedAt, entry })),
    )
    .sort((a, b) => b.at - a.at);
}

/**
 * What to plot for an exercise, or nothing.
 *
 * An inverse load exercise charts the assistance itself rather than an estimated
 * 1RM: the number on the machine going down is the progress, and an e1RM of
 * assistance would read backwards.
 */
export function strengthSeries(
  exercise: Exercise | undefined,
  performances: readonly DatedPerformance[],
): StrengthSeries {
  const rule = exercise?.progression;
  const chronological = [...performances].sort((a, b) => a.at - b.at);

  if (rule?.type === 'load') {
    if (rule.inverse === true) {
      return {
        kind: 'assistance',
        label: 'Assistance (kg)',
        lowerIsBetter: true,
        points: chronological.flatMap(({ at, entry }) => {
          const value = workingWeight(entry.sets, true);
          return value === undefined ? [] : [{ at, value }];
        }),
      };
    }
    return {
      kind: 'e1rm',
      label: 'Estimated 1RM (kg)',
      lowerIsBetter: false,
      points: chronological.flatMap(({ at, entry }) => {
        const value = bestEstimated1RM(entry.sets);
        return value === undefined ? [] : [{ at, value: Math.round(value * 10) / 10 }];
      }),
    };
  }

  if (rule?.type === 'time') {
    return {
      kind: 'hold-seconds',
      label: 'Total hold (s)',
      lowerIsBetter: false,
      points: chronological.flatMap(({ at, entry }) => {
        const value = totalHoldSeconds(entry.sets);
        return value === 0 ? [] : [{ at, value }];
      }),
    };
  }

  // quality and fixed: the history list only.
  return { kind: 'none', label: '', lowerIsBetter: false, points: [] };
}

/** The worst pain recorded anywhere in a session. */
export function sessionPainScore(session: WorkoutSession): number | undefined {
  const scores = [
    ...session.entries.map((entry) => entry.painScore),
    session.prePainScore,
    session.postPainScore,
  ].filter((score): score is number => score !== undefined);
  return scores.length === 0 ? undefined : Math.max(...scores);
}

export interface PainTimeline {
  /** Worst score recorded during each session. */
  session: SeriesPoint[];
  /** The morning-after scores, which matter more than the in-session number. */
  morning: SeriesPoint[];
}

/**
 * Both pain series on one timeline. Morning checks are kept separate rather than
 * merged, because the programme's rule is about pain settling within 24 hours —
 * the two series only mean something next to each other.
 */
export function painTimeline(
  sessions: readonly WorkoutSession[],
  checks: readonly MorningCheck[],
): PainTimeline {
  const session = sessions
    .filter((s) => s.finishedAt !== undefined)
    .flatMap((s) => {
      const score = sessionPainScore(s);
      return score === undefined ? [] : [{ at: s.startedAt, value: score }];
    })
    .sort((a, b) => a.at - b.at);

  const morning = [...checks]
    .map((check) => ({ at: new Date(`${check.date}T09:00:00`).getTime(), value: check.kneeScore }))
    .filter((point) => Number.isFinite(point.at))
    .sort((a, b) => a.at - b.at);

  return { session, morning };
}

export type KneeTrend = 'settling' | 'flat' | 'worsening' | 'unknown';

/**
 * The direction of the knee over a window, called out in words rather than left
 * as a line to interpret. Deliberately coarse: it reports which way the numbers
 * moved and nothing more.
 */
export function kneeTrend(
  points: readonly SeriesPoint[],
  now: number,
  windowDays = 14,
): KneeTrend {
  const since = now - windowDays * 86_400_000;
  const recent = points.filter((point) => point.at >= since).sort((a, b) => a.at - b.at);
  if (recent.length < 3) return 'unknown';

  const half = Math.floor(recent.length / 2);
  const mean = (list: readonly SeriesPoint[]) =>
    list.reduce((sum, point) => sum + point.value, 0) / list.length;

  const earlier = mean(recent.slice(0, half));
  const later = mean(recent.slice(recent.length - half));
  const change = later - earlier;

  // Half a point either way is noise on a 0–10 scale.
  if (change <= -0.5) return 'settling';
  if (change >= 0.5) return 'worsening';
  return 'flat';
}

/** Pain points from the last N days, for the Today sparkline. */
export function recentPainPoints(
  timeline: PainTimeline,
  now: number,
  windowDays = 14,
): SeriesPoint[] {
  const since = now - windowDays * 86_400_000;
  return [...timeline.morning, ...timeline.session]
    .filter((point) => point.at >= since)
    .sort((a, b) => a.at - b.at);
}

export interface MuscleVolume {
  muscle: string;
  sets: number;
}

export interface WeeklyVolume {
  weekNumber: number;
  muscles: MuscleVolume[];
  totalSets: number;
}

/**
 * Working sets per muscle group per week.
 *
 * A set counts once for each of the exercise's primary muscles, which is how
 * sets-per-muscle is normally read: a hip thrust is a set for the glutes and a
 * set for the hamstrings, not half a set for each.
 */
export function weeklyVolumeByMuscle(
  sessions: readonly WorkoutSession[],
  exerciseById: (id: string) => Exercise | undefined,
): WeeklyVolume[] {
  const weeks = new Map<number, Map<string, number>>();

  for (const session of sessions) {
    if (session.finishedAt === undefined) continue;
    const week = weeks.get(session.weekNumber) ?? new Map<string, number>();

    for (const entry of session.entries) {
      const exercise = exerciseById(entry.exerciseId);
      if (exercise === undefined || entry.sets.length === 0) continue;
      for (const muscle of exercise.primaryMuscles) {
        week.set(muscle, (week.get(muscle) ?? 0) + entry.sets.length);
      }
    }

    weeks.set(session.weekNumber, week);
  }

  return [...weeks.entries()]
    .map(([weekNumber, muscles]) => ({
      weekNumber,
      muscles: [...muscles.entries()]
        .map(([muscle, sets]) => ({ muscle, sets }))
        .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle)),
      totalSets: [...muscles.values()].reduce((sum, n) => sum + n, 0),
    }))
    .sort((a, b) => a.weekNumber - b.weekNumber);
}

export interface WeekAdherence {
  weekNumber: number;
  completed: number;
  target: number;
}

/** Sessions completed per week against the programme's four. */
export function weeklyAdherence(
  sessions: readonly WorkoutSession[],
  target = 4,
): WeekAdherence[] {
  const counts = new Map<number, number>();
  for (const session of sessions) {
    if (session.finishedAt === undefined) continue;
    counts.set(session.weekNumber, (counts.get(session.weekNumber) ?? 0) + 1);
  }

  const weeks = [...counts.keys()];
  if (weeks.length === 0) return [];

  const last = Math.max(...weeks);
  const first = Math.min(...weeks);
  const out: WeekAdherence[] = [];
  // Weeks with no sessions are real information, so the gaps are filled in.
  for (let week = first; week <= last; week += 1) {
    out.push({ weekNumber: week, completed: counts.get(week) ?? 0, target });
  }
  return out;
}

/** ISO day of a session, for grouping History rows. */
export function sessionDate(session: WorkoutSession): string {
  return isoDate(session.startedAt);
}
