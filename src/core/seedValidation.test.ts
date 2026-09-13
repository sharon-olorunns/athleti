import { describe, expect, it } from 'vitest';
import type { Exercise, ProgrammeDay, SeedFile } from '@/types';
import { validateSeed } from './seedValidation';

const exercise = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  equipment: ['bodyweight'],
  primaryMuscles: [],
  secondaryMuscles: [],
  tracks: ['reps'],
  unilateral: false,
  progression: { type: 'fixed', label: 'Fixed' },
  kneeSensitive: false,
  painTracked: false,
  phase1Excluded: false,
  alternatives: [],
  ...over,
});

const dayWith = (...exerciseIds: string[]): ProgrammeDay => ({
  id: 'day-1',
  dayLabel: 'Day 1',
  title: 'Day',
  cnsLoad: 'low',
  targetMinutes: 30,
  atHome: false,
  blocks: [
    {
      letter: 'A',
      name: 'Block',
      estimatedMinutes: 10,
      items: exerciseIds.map((exerciseId) => ({
        kind: 'single' as const,
        prescription: {
          exerciseId,
          sets: 3,
          reps: '8',
          restSeconds: 60,
          perSide: false,
          cutFirst: false,
          kneeModified: false,
          timerMode: 'rest' as const,
        },
      })),
    },
  ],
});

const seedWith = (over: Partial<SeedFile> = {}): SeedFile => ({
  schemaVersion: 1,
  programme: { id: 'p', name: 'P', phase: 'Phase 1' },
  exercises: [exercise('squat')],
  days: [dayWith('squat')],
  reintroductionSchedule: [],
  ...over,
});

describe('validateSeed', () => {
  it('accepts a consistent seed', () => {
    expect(validateSeed(seedWith())).toEqual([]);
  });

  it('rejects a prescription pointing at an unknown exercise', () => {
    const problems = validateSeed(seedWith({ days: [dayWith('ghost')] }));
    expect(problems).toContainEqual({ kind: 'unknown-exercise-id', detail: 'day-1 → ghost' });
  });

  it('rejects a phase1Excluded exercise appearing in a day', () => {
    // The rule that keeps jumps out of a knee-adapted phase.
    const problems = validateSeed(
      seedWith({
        exercises: [exercise('box-jump', { phase1Excluded: true, reintroduceWeek: 6 })],
        days: [dayWith('box-jump')],
      }),
    );
    expect(problems).toContainEqual({
      kind: 'excluded-exercise-in-day',
      detail: 'day-1 → box-jump',
    });
  });

  it('rejects an excluded exercise with no reintroduction week', () => {
    const problems = validateSeed(
      seedWith({
        exercises: [exercise('squat'), exercise('box-jump', { phase1Excluded: true })],
      }),
    );
    expect(problems).toContainEqual({
      kind: 'excluded-without-reintroduce-week',
      detail: 'box-jump',
    });
  });

  it('rejects duplicate exercise ids', () => {
    const problems = validateSeed(
      seedWith({ exercises: [exercise('squat'), exercise('squat')] }),
    );
    expect(problems).toContainEqual({ kind: 'duplicate-exercise-id', detail: 'squat' });
  });

  it('rejects an alternative pointing at an unknown exercise', () => {
    const problems = validateSeed(
      seedWith({
        exercises: [
          exercise('squat', {
            alternatives: [{ exerciseId: 'ghost', name: 'Ghost', reason: 'x', kneeSafe: true }],
          }),
        ],
      }),
    );
    expect(problems).toContainEqual({
      kind: 'unknown-alternative-id',
      detail: 'squat → ghost',
    });
  });

  it('accepts an alternative with a name but no id, since it may not be in the library', () => {
    const problems = validateSeed(
      seedWith({
        exercises: [
          exercise('squat', {
            alternatives: [{ name: 'Standing hip circles', reason: 'busy floor', kneeSafe: true }],
          }),
        ],
      }),
    );
    expect(problems).toEqual([]);
  });

  it('rejects a reintroduction entry pointing at an unknown exercise', () => {
    const problems = validateSeed(
      seedWith({ reintroductionSchedule: [{ week: 6, exerciseIds: ['ghost'], startAt: 'Low box' }] }),
    );
    expect(problems).toContainEqual({
      kind: 'unknown-reintroduction-id',
      detail: 'week 6 → ghost',
    });
  });

  it('reports every problem rather than stopping at the first', () => {
    const problems = validateSeed(
      seedWith({
        exercises: [exercise('squat'), exercise('squat')],
        days: [dayWith('ghost')],
      }),
    );
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });
});
