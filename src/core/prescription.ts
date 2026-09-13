/**
 * Reading a prescription for display and for building set rows. Pure.
 *
 * Block `estimatedMinutes` is deliberately absent from everything here: it is for
 * display and pacing only and must not drive logic.
 */
import type { Exercise, Prescription, ProgrammeDay, TrackedField } from '@/types';
import { parseReps, type RepSpec } from './reps';

/**
 * Whether sets are logged per side. The prescription wins over the exercise flag:
 * the banded lateral walk is not a unilateral exercise but is prescribed per
 * direction, and it still needs an L row and an R row.
 */
export function logsPerSide(prescription: Prescription, exercise: Exercise | undefined): boolean {
  return prescription.perSide || exercise?.unilateral === true;
}

/** How many set rows a prescription produces — two per set when logged per side. */
export function setRowCount(prescription: Prescription, exercise: Exercise | undefined): number {
  return prescription.sets * (logsPerSide(prescription, exercise) ? 2 : 1);
}

/** The fields a set row should show, from the exercise rather than assumed. */
export function trackedFields(exercise: Exercise | undefined): TrackedField[] {
  return exercise?.tracks ?? [];
}

export function tracks(exercise: Exercise | undefined, field: TrackedField): boolean {
  return trackedFields(exercise).includes(field);
}

/** The rep spec for a prescription, parsed once. */
export function repSpecOf(prescription: Prescription): RepSpec {
  return parseReps(prescription.reps);
}

/**
 * The per-set target as short display text: "5", "6-8", "45s", "20 m",
 * "20s on / 40s off". Used on programme and upcoming-exercise cards.
 */
export function targetText(prescription: Prescription): string {
  if (prescription.timerMode === 'interval' && prescription.interval) {
    const { workSeconds, restSeconds } = prescription.interval;
    return `${workSeconds}s on / ${restSeconds}s off`;
  }
  if (prescription.holdSeconds !== undefined) return `${prescription.holdSeconds}s`;
  if (prescription.reps !== undefined && prescription.reps !== '') return prescription.reps;
  if (prescription.distanceM !== undefined) return `${prescription.distanceM} m`;
  return '';
}

/**
 * The whole prescription as one line: "4 × 5", "5 × 45s", "3 × 20 m per side",
 * "8 × 20s on / 40s off".
 */
export function prescriptionText(
  prescription: Prescription,
  exercise: Exercise | undefined,
): string {
  const target = targetText(prescription);
  const rounds =
    prescription.timerMode === 'interval' && prescription.interval
      ? prescription.interval.rounds
      : prescription.sets;
  const core = target === '' ? `${rounds} set${rounds === 1 ? '' : 's'}` : `${rounds} × ${target}`;
  return logsPerSide(prescription, exercise) ? `${core} per side` : core;
}

/** Every prescription in a day, in order, flattened out of blocks and supersets. */
export function prescriptionsOf(day: ProgrammeDay): Prescription[] {
  return day.blocks.flatMap((block) =>
    block.items.flatMap((item) =>
      item.kind === 'single' ? [item.prescription] : item.prescriptions,
    ),
  );
}

/** Total prescribed sets for a day, counting per-side rows once each. */
export function totalSetRows(
  day: ProgrammeDay,
  exerciseById: (id: string) => Exercise | undefined,
): number {
  return prescriptionsOf(day).reduce(
    (sum, p) => sum + setRowCount(p, exerciseById(p.exerciseId)),
    0,
  );
}

/** Distinct exercise ids used by a day, in order of first appearance. */
export function exerciseIdsOf(day: ProgrammeDay): string[] {
  return [...new Set(prescriptionsOf(day).map((p) => p.exerciseId))];
}
