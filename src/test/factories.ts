/**
 * Shared test fixtures.
 *
 * Overrides accept `undefined` to mean "leave this field off", which the domain
 * types cannot express directly under `exactOptionalPropertyTypes` — an isometric
 * genuinely has no `reps`, and a bilateral set genuinely has no `side`.
 */
import type {
  Exercise,
  LoggedSet,
  Prescription,
  ProgrammeDay,
  WorkoutSession,
} from '@/types';

export type Over<T> = { [K in keyof T]?: T[K] | undefined };

function build<T extends object>(base: T, over: Over<T>): T {
  const merged: Record<string, unknown> = { ...base, ...over };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as T;
}

export const anExercise = (over: Over<Exercise> = {}): Exercise =>
  build(
    {
      id: 'squat',
      name: 'Squat',
      equipment: ['barbell'],
      primaryMuscles: ['Quads'],
      secondaryMuscles: [],
      tracks: ['weight', 'reps'],
      unilateral: false,
      progression: { type: 'load', label: '+2.5 kg' },
      kneeSensitive: false,
      painTracked: false,
      phase1Excluded: false,
      alternatives: [],
    },
    over,
  );

export const aPrescription = (over: Over<Prescription> = {}): Prescription =>
  build(
    {
      exerciseId: 'squat',
      sets: 4,
      reps: '6-8',
      restSeconds: 120,
      perSide: false,
      cutFirst: false,
      kneeModified: false,
      timerMode: 'rest',
    },
    over,
  );

export const aSet = (over: Over<LoggedSet> & { setIndex: number }): LoggedSet => {
  const base: LoggedSet = { setIndex: over.setIndex, wasClean: true, completedAt: 5000 };
  return build(base, over);
};

export const aSession = (over: Over<WorkoutSession> = {}): WorkoutSession =>
  build(
    { id: 's', programmeDayId: 'day-1', weekNumber: 1, startedAt: 1000, entries: [] },
    over,
  );

export const aDay = (over: Over<ProgrammeDay> = {}): ProgrammeDay =>
  build(
    {
      id: 'day-1',
      dayLabel: 'Day 1 · Mon',
      title: 'Lower',
      cnsLoad: 'high',
      targetMinutes: 70,
      atHome: false,
      blocks: [],
    },
    over,
  );
