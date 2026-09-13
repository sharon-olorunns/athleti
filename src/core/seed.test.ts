/**
 * Tests against the real seed file. These guard the content rules the app depends
 * on rather than the loader's plumbing, so a bad edit to the programme data fails
 * here instead of on the gym floor.
 */
import { describe, expect, it } from 'vitest';
import seedJson from '@/data/seed-programme.json';
import type { SeedFile } from '@/types';
import { validateSeed } from './seedValidation';
import { exerciseIdsOf, prescriptionsOf, setRowCount, totalSetRows } from './prescription';
import { parseReps } from './reps';

const seed = seedJson as unknown as SeedFile;
const byId = new Map(seed.exercises.map((e) => [e.id, e]));

describe('seed-programme.json', () => {
  it('passes validation with no problems', () => {
    expect(validateSeed(seed)).toEqual([]);
  });

  it('carries the whole library and all five days', () => {
    expect(seed.schemaVersion).toBe(3);
    expect(seed.exercises).toHaveLength(57);
    expect(seed.days).toHaveLength(5);
  });

  it('never places a phase1Excluded exercise in a day', () => {
    const excluded = new Set(seed.exercises.filter((e) => e.phase1Excluded).map((e) => e.id));
    expect(excluded.size).toBeGreaterThan(0);
    const prescribed = new Set(seed.days.flatMap((d) => exerciseIdsOf(d)));
    for (const id of excluded) {
      expect(prescribed.has(id)).toBe(false);
    }
  });

  it('gives every excluded exercise a reintroduction week', () => {
    for (const exercise of seed.exercises.filter((e) => e.phase1Excluded)) {
      expect(exercise.reintroduceWeek).toBeGreaterThanOrEqual(5);
    }
  });

  it('lists every excluded exercise in the reintroduction schedule', () => {
    const scheduled = new Set(seed.reintroductionSchedule.flatMap((r) => r.exerciseIds));
    for (const exercise of seed.exercises.filter((e) => e.phase1Excluded)) {
      expect(scheduled.has(exercise.id)).toBe(true);
    }
  });

  it('resolves every prescribed exercise id against the library', () => {
    for (const day of seed.days) {
      for (const prescription of prescriptionsOf(day)) {
        expect(byId.get(prescription.exerciseId)).toBeDefined();
      }
    }
  });

  it('parses every rep string in the programme', () => {
    for (const day of seed.days) {
      for (const prescription of prescriptionsOf(day)) {
        if (prescription.reps === undefined) continue;
        // Nothing in the programme should fall through to unparseable.
        expect(parseReps(prescription.reps).kind).not.toBe('none');
      }
    }
  });

  it('blocks load suggestions on every quality exercise', () => {
    // Section 7.2: quality exercises must never be offered more weight.
    for (const exercise of seed.exercises) {
      if (exercise.progression.type === 'quality') {
        expect(exercise.progression.neverAddLoad ?? false).toBe(true);
      }
    }
  });

  it('keeps the trap bar jump on a quality rule that blocks load', () => {
    // Acceptance criterion 7.
    const jump = byId.get('trap-bar-jump');
    expect(jump?.progression.type).toBe('quality');
    expect(jump?.progression.neverAddLoad).toBe(true);
  });

  it('keeps the trap bar deadlift on a load rule with a rep range and increment', () => {
    // Acceptance criterion 8.
    const deadlift = byId.get('trap-bar-deadlift');
    expect(deadlift?.progression.type).toBe('load');
    expect(deadlift?.progression.incrementKg).toBeGreaterThan(0);
    expect(deadlift?.progression.repRange).toHaveLength(2);
  });

  it('marks the assisted pull-up as inverse', () => {
    // Acceptance criterion 9: the suggestion must reduce assistance.
    expect(byId.get('assisted-pull-up')?.progression.inverse).toBe(true);
  });

  it('gives every load exercise an increment to step by', () => {
    for (const exercise of seed.exercises) {
      if (exercise.progression.type === 'load') {
        expect(exercise.progression.incrementKg).toBeGreaterThan(0);
      }
    }
  });

  it('only offers more seconds where the time rule is actually about time', () => {
    // A 'time' type does not imply "hold longer". The banded lateral walk
    // progresses by band stiffness and pins holdIncrementSeconds to 0 to say so;
    // others progress by reps or range and omit it. Only a positive increment
    // may produce a "try 50s" suggestion.
    const timeExercises = seed.exercises.filter((e) => e.progression.type === 'time');
    expect(timeExercises.length).toBeGreaterThan(0);
    for (const exercise of timeExercises) {
      const increment = exercise.progression.holdIncrementSeconds;
      expect(increment === undefined || increment >= 0).toBe(true);
      // Whatever the currency, the label always says what to push.
      expect(exercise.progression.label.length).toBeGreaterThan(0);
    }
    expect(byId.get('banded-lateral-walk')?.progression.holdIncrementSeconds).toBe(0);
  });

  it('gives the prescribed isometric holds a positive second increment', () => {
    // The exercises actually run on the hold timer are the ones that progress in
    // seconds, so these must be able to suggest a longer hold.
    const heldIds = new Set(
      seed.days
        .flatMap((d) => prescriptionsOf(d))
        .filter((p) => p.timerMode === 'hold')
        .map((p) => p.exerciseId),
    );
    const timed = [...heldIds]
      .map((id) => byId.get(id))
      .filter((e) => e?.progression.type === 'time');
    expect(timed.length).toBeGreaterThan(0);
    for (const exercise of timed) {
      expect(exercise?.progression.holdIncrementSeconds).toBeGreaterThan(0);
    }
  });

  it('tracks the fields each prescription actually needs', () => {
    for (const day of seed.days) {
      for (const prescription of prescriptionsOf(day)) {
        const exercise = byId.get(prescription.exerciseId);
        if (prescription.holdSeconds !== undefined) {
          expect(exercise?.tracks).toContain('seconds');
        }
        if (prescription.distanceM !== undefined) {
          expect(exercise?.tracks).toContain('distance');
        }
      }
    }
  });

  it('pairs interval prescriptions with interval parameters', () => {
    for (const day of seed.days) {
      for (const prescription of prescriptionsOf(day)) {
        if (prescription.timerMode === 'interval') {
          expect(prescription.interval).toBeDefined();
          expect(prescription.interval?.rounds).toBeGreaterThan(0);
        }
        if (prescription.timerMode === 'hold') {
          expect(prescription.holdSeconds).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives each day a sane shape for the Today screen', () => {
    for (const day of seed.days) {
      expect(day.blocks.length).toBeGreaterThan(0);
      expect(day.targetMinutes).toBeGreaterThan(0);
      expect(['high', 'moderate', 'low']).toContain(day.cnsLoad);
      expect(totalSetRows(day, (id) => byId.get(id))).toBeGreaterThan(0);
    }
  });

  it('doubles the set rows for a per-side prescription', () => {
    // The banded lateral walk is prescribed per side though it is not a
    // unilateral exercise, and still needs an L row and an R row.
    const walk = seed.days
      .flatMap((d) => prescriptionsOf(d))
      .find((p) => p.exerciseId === 'banded-lateral-walk');
    expect(walk).toBeDefined();
    expect(byId.get('banded-lateral-walk')?.unilateral).toBe(false);
    expect(setRowCount(walk!, byId.get('banded-lateral-walk'))).toBe(walk!.sets * 2);
  });
});
