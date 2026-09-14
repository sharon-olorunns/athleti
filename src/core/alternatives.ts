/**
 * Exercise substitution. Pure.
 *
 * The machine is taken, the sled is in use, or the knee is having a bad day. A
 * swap replaces the exercise for this session only: the logged entry records what
 * was actually performed as `exerciseId` and what the programme asked for as
 * `substitutedForId`, so history stays honest and the programme is untouched.
 */
import type { Alternative, Exercise, LoggedExercise, WorkoutSession } from '@/types';

export interface ResolvedAlternative {
  /** Stable list key. */
  key: string;
  name: string;
  /** Why it is offered: "no sled available", "knee-friendlier". */
  reason: string;
  kneeSafe: boolean;
  /** The library exercise, when the alternative names one. */
  exercise?: Exercise;
}

/**
 * The curated alternatives for an exercise, with library entries attached where
 * the seed names one. Most seeded alternatives are free text — a substitute that
 * does not exist in the library yet — and those carry no exercise.
 */
export function resolveAlternatives(
  exercise: Exercise | undefined,
  library: ReadonlyMap<string, Exercise>,
): ResolvedAlternative[] {
  return (exercise?.alternatives ?? []).map((alternative, index) => {
    const found =
      alternative.exerciseId === undefined ? undefined : library.get(alternative.exerciseId);
    return {
      key: alternative.exerciseId ?? `${index}-${alternative.name}`,
      name: alternative.name,
      reason: alternative.reason,
      kneeSafe: alternative.kneeSafe,
      ...(found !== undefined ? { exercise: found } : {}),
    };
  });
}

/**
 * Knee-safe options come first when the exercise loads the front of the knee, or
 * when the knee has recently been complaining.
 */
export function preferKneeSafe(
  exercise: Exercise | undefined,
  lastPainScore: number | undefined,
): boolean {
  return exercise?.kneeSensitive === true || (lastPainScore ?? 0) >= 4;
}

/** Stable sort: knee-safe first when asked, original order otherwise. */
export function sortAlternatives(
  alternatives: readonly ResolvedAlternative[],
  kneeFirst: boolean,
): ResolvedAlternative[] {
  if (!kneeFirst) return [...alternatives];
  return [...alternatives].sort((a, b) => Number(b.kneeSafe) - Number(a.kneeSafe));
}

/**
 * Search the whole library, for a substitute that is not in the curated list.
 * Matches name, muscles and equipment, so "glute" or "cable" both find things.
 */
export function searchLibrary(
  query: string,
  library: ReadonlyMap<string, Exercise>,
  excludeIds: readonly string[] = [],
): Exercise[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const excluded = new Set(excludeIds);

  return [...library.values()]
    .filter((exercise) => !excluded.has(exercise.id))
    .filter((exercise) =>
      [exercise.name, ...exercise.primaryMuscles, ...exercise.secondaryMuscles, ...exercise.equipment]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
    .sort((a, b) => {
      // Name matches before muscle or equipment matches.
      const aName = a.name.toLowerCase().includes(needle);
      const bName = b.name.toLowerCase().includes(needle);
      if (aName !== bName) return Number(bName) - Number(aName);
      return a.name.localeCompare(b.name);
    });
}

/** A stable, kebab-case id for a substitute the library does not have yet. */
export function customExerciseId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return `custom-${slug === '' ? 'exercise' : slug}`;
}

/**
 * Turn a free-text alternative into a real library exercise, so what was done is
 * logged under an id of its own and builds its own history.
 *
 * The substitute inherits the tracked fields, muscles and progression rule of the
 * exercise it stands in for — section 8 asks that the progression type be
 * preserved where possible, and the set row has to show the same inputs. The id
 * is derived from the name, so choosing the same substitute again reuses it and
 * its history accumulates rather than fragmenting.
 */
export function deriveExerciseFromAlternative(
  alternative: Pick<Alternative, 'name' | 'kneeSafe'>,
  source: Exercise,
): Exercise {
  return {
    id: customExerciseId(alternative.name),
    name: alternative.name,
    equipment: [],
    primaryMuscles: [...source.primaryMuscles],
    secondaryMuscles: [...source.secondaryMuscles],
    tracks: [...source.tracks],
    unilateral: source.unilateral,
    progression: { ...source.progression },
    kneeSensitive: !alternative.kneeSafe,
    painTracked: source.painTracked,
    phase1Excluded: false,
    userExcluded: false,
    alternatives: [],
  };
}

/** The entry standing in for a prescribed exercise in this session, if any. */
export function substitutionFor(
  session: WorkoutSession | undefined,
  prescribedId: string,
): LoggedExercise | undefined {
  return session?.entries.find((entry) => entry.substitutedForId === prescribedId);
}

/** What is actually being performed in a prescribed slot today. */
export function effectiveExerciseId(
  session: WorkoutSession | undefined,
  prescribedId: string,
): string {
  return substitutionFor(session, prescribedId)?.exerciseId ?? prescribedId;
}

export interface SubstitutionTally {
  prescribedId: string;
  performedId: string;
  count: number;
}

/** How often each substitute has stood in for each prescribed exercise. */
export function substitutionTallies(sessions: readonly WorkoutSession[]): SubstitutionTally[] {
  const counts = new Map<string, SubstitutionTally>();

  for (const session of sessions) {
    for (const entry of session.entries) {
      if (entry.substitutedForId === undefined) continue;
      if (entry.substitutedForId === entry.exerciseId) continue;
      const key = `${entry.substitutedForId}->${entry.exerciseId}`;
      const existing = counts.get(key);
      if (existing === undefined) {
        counts.set(key, {
          prescribedId: entry.substitutedForId,
          performedId: entry.exerciseId,
          count: 1,
        });
      } else {
        existing.count += 1;
      }
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/**
 * A substitution used often enough to be worth making permanent. Offered on the
 * Today screen, never mid-workout.
 */
export function permanentSubstitutionCandidate(
  sessions: readonly WorkoutSession[],
  dismissed: readonly string[] = [],
  threshold = 3,
): SubstitutionTally | undefined {
  const skip = new Set(dismissed);
  return substitutionTallies(sessions).find(
    (tally) =>
      tally.count >= threshold && !skip.has(`${tally.prescribedId}->${tally.performedId}`),
  );
}

export function substitutionKey(prescribedId: string, performedId: string): string {
  return `${prescribedId}->${performedId}`;
}
