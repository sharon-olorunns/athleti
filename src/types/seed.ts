import type { Exercise } from './library';
import type { LadderStage, Programme, ProgrammeDay, ReintroductionEntry } from './programme';

/**
 * The shape of `seed-programme.json` on disk. Note it keeps `days` and
 * `reintroductionSchedule` at the top level rather than nested inside
 * `programme`, so the loader composes the `Programme` object.
 */
export interface SeedFile {
  schemaVersion: number;
  programme: Omit<Programme, 'days'>;
  exercises: Exercise[];
  days: ProgrammeDay[];
  reintroductionSchedule: ReintroductionEntry[];
  pullUpLadder: LadderStage[];
}
