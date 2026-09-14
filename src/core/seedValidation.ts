/**
 * Seed integrity checks. Pure, so they run in tests without a browser.
 *
 * The seed file is the source of truth for programme content, and section 14 of
 * the requirements puts one hard rule on it: the phase1Excluded exercises must be
 * present in the library and visible on the Programme screen with their
 * reintroduction week, but must not appear in any day's blocks. A regression there
 * would silently put a jump back into a knee-modified phase, so it is checked on
 * load rather than trusted.
 */
import type { SeedFile } from '@/types';
import { ladderExerciseIds } from './ladder';
import { prescriptionsOf } from './prescription';

export interface SeedProblem {
  kind:
    | 'unknown-exercise-id'
    | 'excluded-exercise-in-day'
    | 'duplicate-exercise-id'
    | 'excluded-without-reintroduce-week'
    | 'unknown-reintroduction-id'
    | 'unknown-alternative-id'
    | 'user-excluded-in-day'
    | 'user-excluded-without-reason'
    | 'unknown-ladder-exercise-id'
    | 'ladder-stages-not-contiguous';
  detail: string;
}

export function validateSeed(seed: SeedFile): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const seen = new Set<string>();

  for (const exercise of seed.exercises) {
    if (seen.has(exercise.id)) {
      problems.push({ kind: 'duplicate-exercise-id', detail: exercise.id });
    }
    seen.add(exercise.id);
  }

  const excluded = new Set(seed.exercises.filter((e) => e.phase1Excluded).map((e) => e.id));
  const dropped = new Set(seed.exercises.filter((e) => e.userExcluded).map((e) => e.id));

  for (const exercise of seed.exercises) {
    if (exercise.phase1Excluded && exercise.reintroduceWeek === undefined) {
      problems.push({ kind: 'excluded-without-reintroduce-week', detail: exercise.id });
    }
    // A removal without a reason is a decision the user will not remember making.
    if (exercise.userExcluded && exercise.userExcludedReason === undefined) {
      problems.push({ kind: 'user-excluded-without-reason', detail: exercise.id });
    }
    for (const alternative of exercise.alternatives) {
      if (alternative.exerciseId !== undefined && !seen.has(alternative.exerciseId)) {
        problems.push({
          kind: 'unknown-alternative-id',
          detail: `${exercise.id} → ${alternative.exerciseId}`,
        });
      }
    }
  }

  for (const day of seed.days) {
    for (const prescription of prescriptionsOf(day)) {
      const id = prescription.exerciseId;
      if (!seen.has(id)) {
        problems.push({ kind: 'unknown-exercise-id', detail: `${day.id} → ${id}` });
      }
      if (excluded.has(id)) {
        problems.push({ kind: 'excluded-exercise-in-day', detail: `${day.id} → ${id}` });
      }
      if (dropped.has(id)) {
        problems.push({ kind: 'user-excluded-in-day', detail: `${day.id} → ${id}` });
      }
    }
  }

  // The ladder resolves the pull-up slots, so an id it cannot reach would empty
  // them out rather than fail loudly.
  for (const id of ladderExerciseIds(seed.pullUpLadder)) {
    if (!seen.has(id)) {
      problems.push({ kind: 'unknown-ladder-exercise-id', detail: id });
    }
  }
  seed.pullUpLadder.forEach((stage, index) => {
    if (stage.stage !== index + 1) {
      problems.push({
        kind: 'ladder-stages-not-contiguous',
        detail: `position ${index + 1} is stage ${stage.stage}`,
      });
    }
  });

  for (const entry of seed.reintroductionSchedule) {
    for (const id of entry.exerciseIds) {
      if (!seen.has(id)) {
        problems.push({ kind: 'unknown-reintroduction-id', detail: `week ${entry.week} → ${id}` });
      }
    }
  }

  return problems;
}
