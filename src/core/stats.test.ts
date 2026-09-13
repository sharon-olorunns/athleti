import { describe, expect, it } from 'vitest';
import type { Exercise, MorningCheck, WorkoutSession } from '@/types';
import { anExercise, aSession, aSet } from '@/test/factories';
import {
  bestEstimated1RM,
  estimated1RM,
  kneeTrend,
  painTimeline,
  performancesOf,
  recentPainPoints,
  sessionPainScore,
  strengthSeries,
  topSet,
  totalHoldSeconds,
  weeklyAdherence,
  weeklyVolumeByMuscle,
} from './stats';

const DAY = 86_400_000;
const T0 = new Date(2025, 0, 6, 9).getTime();

const finished = (over: Partial<WorkoutSession> = {}): WorkoutSession =>
  aSession({ finishedAt: (over.startedAt ?? 1000) + 3_600_000, ...over });

describe('estimated1RM', () => {
  it('is the weight itself for a single', () => {
    expect(estimated1RM(100, 1)).toBe(100);
    expect(estimated1RM(100, 0)).toBe(100);
  });

  it('scales with reps by Epley', () => {
    expect(estimated1RM(60, 6)).toBeCloseTo(72);
    expect(estimated1RM(100, 30)).toBeCloseTo(200);
  });

  it('rises with either more weight or more reps', () => {
    expect(estimated1RM(62.5, 5)).toBeGreaterThan(estimated1RM(60, 5));
    expect(estimated1RM(60, 8)).toBeGreaterThan(estimated1RM(60, 5));
  });
});

describe('bestEstimated1RM', () => {
  it('takes the best set', () => {
    const sets = [
      aSet({ setIndex: 0, reps: 8, weightKg: 60 }),
      aSet({ setIndex: 1, reps: 3, weightKg: 80 }),
    ];
    expect(bestEstimated1RM(sets)).toBeCloseTo(88);
  });

  it('is undefined without both a weight and reps', () => {
    expect(bestEstimated1RM([aSet({ setIndex: 0, reps: 8 })])).toBeUndefined();
    expect(bestEstimated1RM([aSet({ setIndex: 0, seconds: 45 })])).toBeUndefined();
    expect(bestEstimated1RM([])).toBeUndefined();
  });
});

describe('topSet', () => {
  it('is the heaviest set', () => {
    const sets = [
      aSet({ setIndex: 0, reps: 8, weightKg: 60 }),
      aSet({ setIndex: 1, reps: 5, weightKg: 70 }),
    ];
    expect(topSet(sets)?.weightKg).toBe(70);
  });

  it('is the lightest set when the load is assistance', () => {
    const sets = [
      aSet({ setIndex: 0, reps: 8, weightKg: 30 }),
      aSet({ setIndex: 1, reps: 8, weightKg: 25 }),
    ];
    expect(topSet(sets, true)?.weightKg).toBe(25);
  });

  it('is the longest hold when there is no load', () => {
    const sets = [aSet({ setIndex: 0, seconds: 30 }), aSet({ setIndex: 1, seconds: 45 })];
    expect(topSet(sets)?.seconds).toBe(45);
  });

  it('is the most reps for bodyweight work', () => {
    const sets = [aSet({ setIndex: 0, reps: 4 }), aSet({ setIndex: 1, reps: 6 })];
    expect(topSet(sets)?.reps).toBe(6);
  });

  it('is undefined for no sets', () => {
    expect(topSet([])).toBeUndefined();
  });
});

describe('totalHoldSeconds', () => {
  it('sums the holds', () => {
    expect(totalHoldSeconds([aSet({ setIndex: 0, seconds: 45 }), aSet({ setIndex: 1, seconds: 50 })])).toBe(95);
  });

  it('ignores sets with no seconds', () => {
    expect(totalHoldSeconds([aSet({ setIndex: 0, reps: 8 })])).toBe(0);
  });
});

describe('performancesOf', () => {
  const sessions = [
    finished({ id: 'a', startedAt: T0, entries: [{ exerciseId: 'squat', sets: [aSet({ setIndex: 0, reps: 5 })] }] }),
    finished({ id: 'b', startedAt: T0 + DAY, entries: [{ exerciseId: 'squat', sets: [aSet({ setIndex: 0, reps: 6 })] }] }),
  ];

  it('lists performances newest first with their dates', () => {
    const found = performancesOf('squat', sessions);
    expect(found.map((p) => p.entry.sets[0]?.reps)).toEqual([6, 5]);
    expect(found[0]?.at).toBe(T0 + DAY);
  });

  it('ignores unfinished sessions, skips and empty entries', () => {
    const noisy = [
      ...sessions,
      aSession({ id: 'live', startedAt: T0 + 2 * DAY, entries: [{ exerciseId: 'squat', sets: [aSet({ setIndex: 0 })] }] }),
      finished({ id: 'skipped', startedAt: T0 + 3 * DAY, entries: [{ exerciseId: 'squat', sets: [], skipped: true }] }),
    ];
    expect(performancesOf('squat', noisy)).toHaveLength(2);
  });

  it('counts a substitute under the id actually performed', () => {
    const swapped = [
      finished({
        id: 'c', startedAt: T0,
        entries: [{ exerciseId: 'leg-press', substitutedForId: 'squat', sets: [aSet({ setIndex: 0, reps: 8 })] }],
      }),
    ];
    expect(performancesOf('leg-press', swapped)).toHaveLength(1);
    expect(performancesOf('squat', swapped)).toHaveLength(0);
  });
});

describe('strengthSeries', () => {
  const load = anExercise({ progression: { type: 'load', label: '+2.5', incrementKg: 2.5 } });
  const perf = (at: number, reps: number, weightKg: number) => ({
    at,
    entry: { exerciseId: 'x', sets: [aSet({ setIndex: 0, reps, weightKg })] },
  });

  it('plots estimated 1RM for a load exercise, oldest first', () => {
    const series = strengthSeries(load, [perf(T0 + DAY, 5, 85), perf(T0, 5, 80)]);
    expect(series.kind).toBe('e1rm');
    expect(series.label).toBe('Estimated 1RM (kg)');
    expect(series.lowerIsBetter).toBe(false);
    expect(series.points.map((p) => p.at)).toEqual([T0, T0 + DAY]);
    expect(series.points[0]?.value).toBeCloseTo(93.3, 1);
  });

  /** The assisted pull-up: the number going down is the progress. */
  it('plots the assistance itself for an inverse exercise, and says lower is better', () => {
    const assisted = anExercise({
      progression: { type: 'load', label: '↓ Assistance', incrementKg: 2.5, inverse: true },
    });
    const series = strengthSeries(assisted, [perf(T0, 8, 30), perf(T0 + DAY, 8, 27.5)]);
    expect(series.kind).toBe('assistance');
    expect(series.lowerIsBetter).toBe(true);
    expect(series.points.map((p) => p.value)).toEqual([30, 27.5]);
  });

  it('plots total hold seconds for a time exercise', () => {
    const iso = anExercise({ progression: { type: 'time', label: '↑ Time', holdIncrementSeconds: 5 } });
    const series = strengthSeries(iso, [
      { at: T0, entry: { exerciseId: 'x', sets: [aSet({ setIndex: 0, seconds: 45 }), aSet({ setIndex: 1, seconds: 45 })] } },
    ]);
    expect(series.kind).toBe('hold-seconds');
    expect(series.points[0]?.value).toBe(90);
  });

  /**
   * Section 5.3: nothing is plotted for quality or fixed. A jump's "weight" is
   * meaningless and charting it would mislead.
   */
  it('plots nothing for a quality exercise, even though it carries load', () => {
    const jump = anExercise({
      tracks: ['weight', 'reps'],
      progression: { type: 'quality', label: '↑ Bar speed', neverAddLoad: true },
    });
    const series = strengthSeries(jump, [perf(T0, 3, 60), perf(T0 + DAY, 3, 60)]);
    expect(series.kind).toBe('none');
    expect(series.points).toEqual([]);
  });

  it('plots nothing for a fixed exercise', () => {
    const warmup = anExercise({ progression: { type: 'fixed', label: 'Fixed' } });
    expect(strengthSeries(warmup, [perf(T0, 6, 0)]).kind).toBe('none');
  });

  it('plots nothing for an unknown exercise', () => {
    expect(strengthSeries(undefined, []).kind).toBe('none');
  });

  it('skips performances with nothing plottable', () => {
    const series = strengthSeries(load, [
      { at: T0, entry: { exerciseId: 'x', sets: [aSet({ setIndex: 0, reps: 8 })] } },
    ]);
    expect(series.points).toEqual([]);
  });
});

describe('sessionPainScore', () => {
  it('is the worst score anywhere in the session', () => {
    const session = finished({
      prePainScore: 2,
      postPainScore: 4,
      entries: [{ exerciseId: 'x', sets: [], painScore: 7 }],
    });
    expect(sessionPainScore(session)).toBe(7);
  });

  it('is undefined when nothing was recorded', () => {
    expect(sessionPainScore(finished({}))).toBeUndefined();
  });

  it('counts a recorded zero', () => {
    expect(sessionPainScore(finished({ postPainScore: 0 }))).toBe(0);
  });
});

describe('painTimeline', () => {
  const sessions = [
    finished({ id: 'a', startedAt: T0, postPainScore: 5 }),
    finished({ id: 'b', startedAt: T0 + 2 * DAY, postPainScore: 3 }),
  ];
  const checks: MorningCheck[] = [
    { date: '2025-01-07', kneeScore: 4 },
    { date: '2025-01-09', kneeScore: 2 },
  ];

  it('keeps the two series apart and in order', () => {
    const timeline = painTimeline(sessions, checks);
    expect(timeline.session.map((p) => p.value)).toEqual([5, 3]);
    expect(timeline.morning.map((p) => p.value)).toEqual([4, 2]);
  });

  it('ignores unfinished sessions and sessions with no score', () => {
    const timeline = painTimeline(
      [...sessions, aSession({ id: 'live', startedAt: T0 + 5 * DAY, postPainScore: 9 }), finished({ id: 'c', startedAt: T0 + DAY })],
      [],
    );
    expect(timeline.session).toHaveLength(2);
  });

  it('is empty with nothing recorded', () => {
    expect(painTimeline([], [])).toEqual({ session: [], morning: [] });
  });
});

describe('kneeTrend', () => {
  const points = (values: number[]) => values.map((value, i) => ({ at: T0 + i * DAY, value }));

  it('reports settling when the numbers come down', () => {
    expect(kneeTrend(points([6, 6, 5, 3, 2, 2]), T0 + 6 * DAY)).toBe('settling');
  });

  it('reports worsening when they climb', () => {
    expect(kneeTrend(points([2, 2, 3, 5, 6, 6]), T0 + 6 * DAY)).toBe('worsening');
  });

  it('reports flat for noise under half a point', () => {
    expect(kneeTrend(points([4, 4, 4, 4, 4, 4]), T0 + 6 * DAY)).toBe('flat');
    expect(kneeTrend(points([4, 4, 4, 4, 4, 5]), T0 + 6 * DAY)).toBe('flat');
  });

  it('says nothing with too few readings to mean anything', () => {
    expect(kneeTrend(points([6, 2]), T0 + DAY)).toBe('unknown');
    expect(kneeTrend([], T0)).toBe('unknown');
  });

  it('only looks inside the window', () => {
    const old = [{ at: T0 - 60 * DAY, value: 9 }, { at: T0 - 59 * DAY, value: 9 }];
    expect(kneeTrend([...old, ...points([2, 2, 2])], T0 + 2 * DAY)).not.toBe('worsening');
  });
});

describe('recentPainPoints', () => {
  it('merges both series inside the window, in order', () => {
    const timeline = {
      session: [{ at: T0, value: 5 }, { at: T0 - 30 * DAY, value: 9 }],
      morning: [{ at: T0 + DAY, value: 3 }],
    };
    const points = recentPainPoints(timeline, T0 + DAY);
    expect(points.map((p) => p.value)).toEqual([5, 3]);
  });
});

describe('weeklyVolumeByMuscle', () => {
  const library = new Map<string, Exercise>([
    ['squat', anExercise({ id: 'squat', primaryMuscles: ['Quads', 'Glute max'] })],
    ['thrust', anExercise({ id: 'thrust', primaryMuscles: ['Glute max'] })],
  ]);
  const lookup = (id: string) => library.get(id);

  it('credits a set to each primary muscle', () => {
    const sessions = [
      finished({
        weekNumber: 1,
        entries: [{ exerciseId: 'squat', sets: [aSet({ setIndex: 0 }), aSet({ setIndex: 1 })] }],
      }),
    ];
    const volume = weeklyVolumeByMuscle(sessions, lookup);
    expect(volume[0]?.muscles).toEqual([
      { muscle: 'Glute max', sets: 2 },
      { muscle: 'Quads', sets: 2 },
    ]);
  });

  it('adds up across exercises within a week', () => {
    const sessions = [
      finished({ id: 'a', weekNumber: 1, entries: [{ exerciseId: 'squat', sets: [aSet({ setIndex: 0 })] }] }),
      finished({ id: 'b', weekNumber: 1, entries: [{ exerciseId: 'thrust', sets: [aSet({ setIndex: 0 }), aSet({ setIndex: 1 })] }] }),
    ];
    const volume = weeklyVolumeByMuscle(sessions, lookup);
    expect(volume[0]?.muscles.find((m) => m.muscle === 'Glute max')?.sets).toBe(3);
  });

  it('keeps weeks separate and ordered', () => {
    const sessions = [
      finished({ id: 'b', weekNumber: 2, entries: [{ exerciseId: 'thrust', sets: [aSet({ setIndex: 0 })] }] }),
      finished({ id: 'a', weekNumber: 1, entries: [{ exerciseId: 'thrust', sets: [aSet({ setIndex: 0 })] }] }),
    ];
    expect(weeklyVolumeByMuscle(sessions, lookup).map((w) => w.weekNumber)).toEqual([1, 2]);
  });

  it('ignores unfinished sessions and unknown exercises', () => {
    const sessions = [
      aSession({ weekNumber: 1, entries: [{ exerciseId: 'squat', sets: [aSet({ setIndex: 0 })] }] }),
      finished({ id: 'x', weekNumber: 1, entries: [{ exerciseId: 'ghost', sets: [aSet({ setIndex: 0 })] }] }),
    ];
    expect(weeklyVolumeByMuscle(sessions, lookup)).toEqual([
      { weekNumber: 1, muscles: [], totalSets: 0 },
    ]);
  });
});

describe('weeklyAdherence', () => {
  it('counts finished sessions per week against the target', () => {
    const sessions = [
      finished({ id: 'a', weekNumber: 1 }),
      finished({ id: 'b', weekNumber: 1 }),
      finished({ id: 'c', weekNumber: 2 }),
    ];
    expect(weeklyAdherence(sessions)).toEqual([
      { weekNumber: 1, completed: 2, target: 4 },
      { weekNumber: 2, completed: 1, target: 4 },
    ]);
  });

  it('fills in weeks with nothing logged, since a gap is information', () => {
    const sessions = [finished({ id: 'a', weekNumber: 1 }), finished({ id: 'c', weekNumber: 3 })];
    expect(weeklyAdherence(sessions).map((w) => w.completed)).toEqual([1, 0, 1]);
  });

  it('ignores unfinished sessions', () => {
    expect(weeklyAdherence([aSession({ weekNumber: 1 })])).toEqual([]);
  });

  it('is empty with no history', () => {
    expect(weeklyAdherence([])).toEqual([]);
  });
});
