import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '@/types';
import {
  aDay,
  anExercise as exercise,
  aPrescription as prescription,
  aSession,
  aSet as set,
} from '@/test/factories';
import {
  currentItemIndex,
  findLoggedSet,
  itemComplete,
  itemPrescriptions,
  prescriptionProgress,
  formatWeight,
  lastPerformance,
  plannedRows,
  plannedSetCount,
  performanceHistory,
  prefillForRow,
  previousSetFor,
  stepFor,
  summariseSets,
  workoutItems,
} from './workout';

describe('plannedSetCount', () => {
  it('is the prescribed count with nothing logged', () => {
    expect(plannedSetCount(prescription({ sets: 4 }), undefined)).toBe(4);
  });

  it('grows to cover sets logged beyond the prescription', () => {
    // An added set survives a reload because it is already in the log.
    const entry = { exerciseId: 'squat', sets: [set({ setIndex: 4 })] };
    expect(plannedSetCount(prescription({ sets: 4 }), entry)).toBe(5);
  });

  it('does not shrink when fewer sets are logged than prescribed', () => {
    const entry = { exerciseId: 'squat', sets: [set({ setIndex: 0 })] };
    expect(plannedSetCount(prescription({ sets: 4 }), entry)).toBe(4);
  });

  it('adds rows requested in this session but not yet logged', () => {
    expect(plannedSetCount(prescription({ sets: 4 }), undefined, 1)).toBe(5);
  });
});

describe('plannedRows', () => {
  it('is one numbered row per set', () => {
    const rows = plannedRows(prescription(), exercise(), 3);
    expect(rows.map((r) => r.label)).toEqual(['1', '2', '3']);
    expect(rows.map((r) => r.setIndex)).toEqual([0, 1, 2]);
    expect(rows.every((r) => r.side === undefined)).toBe(true);
  });

  it('is two rows per set, L then R, for a unilateral exercise', () => {
    const rows = plannedRows(prescription(), exercise({ unilateral: true }), 2);
    expect(rows.map((r) => r.label)).toEqual(['1 L', '1 R', '2 L', '2 R']);
    expect(rows.map((r) => r.side)).toEqual(['L', 'R', 'L', 'R']);
    expect(rows.map((r) => r.setIndex)).toEqual([0, 0, 1, 1]);
  });

  it('gives every row a distinct key', () => {
    const rows = plannedRows(prescription({ perSide: true }), exercise(), 3);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe('findLoggedSet', () => {
  const sets = [set({ setIndex: 0, side: 'L' }), set({ setIndex: 0, side: 'R' })];

  it('matches on index and side together', () => {
    expect(findLoggedSet(sets, { setIndex: 0, side: 'R' })?.side).toBe('R');
    expect(findLoggedSet(sets, { setIndex: 1, side: 'L' })).toBeUndefined();
  });
});

describe('lastPerformance', () => {
  const session = (
    id: string,
    startedAt: number,
    entries: WorkoutSession['entries'],
  ): WorkoutSession => ({ id, programmeDayId: 'day-1', weekNumber: 1, startedAt, entries });

  it('finds the newest session containing the exercise', () => {
    const sessions = [
      session('old', 1, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 5 })] }]),
      session('new', 2, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 8 })] }]),
    ];
    expect(lastPerformance('squat', sessions)?.sets[0]?.reps).toBe(8);
  });

  it('excludes the session being logged, so today is not its own history', () => {
    const sessions = [
      session('old', 1, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 5 })] }]),
      session('today', 2, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 8 })] }]),
    ];
    expect(lastPerformance('squat', sessions, 'today')?.sets[0]?.reps).toBe(5);
  });

  it('ignores skipped and empty entries', () => {
    const sessions = [
      session('older', 1, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 5 })] }]),
      session('skipped', 2, [{ exerciseId: 'squat', sets: [], skipped: true }]),
      session('empty', 3, [{ exerciseId: 'squat', sets: [] }]),
    ];
    expect(lastPerformance('squat', sessions)?.sets[0]?.reps).toBe(5);
  });

  it('is undefined for an exercise never performed', () => {
    expect(lastPerformance('squat', [])).toBeUndefined();
  });
});

describe('prefillForRow', () => {
  const previous = {
    exerciseId: 'squat',
    sets: [
      set({ setIndex: 0, reps: 8, weightKg: 60 }),
      set({ setIndex: 1, reps: 8, weightKg: 60 }),
      set({ setIndex: 2, reps: 7, weightKg: 60 }),
    ],
  };

  it('uses the matching set from last time', () => {
    const values = prefillForRow(
      { setIndex: 2 },
      { prescription: prescription(), exercise: exercise(), sessionSets: [], previous },
    );
    expect(values).toEqual({ weightKg: 60, reps: 7 });
  });

  it('falls back to the final set of last time for rows beyond it', () => {
    const values = prefillForRow(
      { setIndex: 5 },
      { prescription: prescription(), exercise: exercise(), sessionSets: [], previous },
    );
    expect(values).toEqual({ weightKg: 60, reps: 7 });
  });

  it('follows what was already done in this session rather than last week', () => {
    // Set 1 went up to 62.5; set 2 must open there, not drop back to 60.
    const values = prefillForRow(
      { setIndex: 1 },
      {
        prescription: prescription(),
        exercise: exercise(),
        sessionSets: [set({ setIndex: 0, reps: 8, weightKg: 62.5, completedAt: 5000 })],
        previous,
      },
    );
    expect(values).toEqual({ weightKg: 62.5, reps: 8 });
  });

  it('follows the most recent set in the session, not the first', () => {
    const values = prefillForRow(
      { setIndex: 2 },
      {
        prescription: prescription(),
        exercise: exercise(),
        sessionSets: [
          set({ setIndex: 0, reps: 8, weightKg: 60, completedAt: 1000 }),
          set({ setIndex: 1, reps: 6, weightKg: 65, completedAt: 2000 }),
        ],
        previous,
      },
    );
    expect(values).toEqual({ weightKg: 65, reps: 6 });
  });

  it('falls back to the prescription when there is no history', () => {
    // Bottom of the rep range, and no guessed weight.
    const values = prefillForRow(
      { setIndex: 0 },
      {
        prescription: prescription({ reps: '6-8' }),
        exercise: exercise(),
        sessionSets: [],
        previous: undefined,
      },
    );
    expect(values).toEqual({ reps: 6 });
  });

  it('uses the prescribed hold for an isometric with no history', () => {
    const values = prefillForRow(
      { setIndex: 0 },
      {
        prescription: prescription({ reps: undefined, holdSeconds: 45, timerMode: 'hold' }),
        exercise: exercise({ tracks: ['seconds'] }),
        sessionSets: [],
        previous: undefined,
      },
    );
    expect(values).toEqual({ seconds: 45 });
  });

  it('uses the prescribed distance for a sled with no history', () => {
    const values = prefillForRow(
      { setIndex: 0 },
      {
        prescription: prescription({ reps: undefined, distanceM: 20 }),
        exercise: exercise({ tracks: ['weight', 'distance'] }),
        sessionSets: [],
        previous: undefined,
      },
    );
    expect(values).toEqual({ distanceM: 20 });
  });

  it('only fills fields the exercise tracks', () => {
    // A bodyweight exercise must not carry a weight over from anywhere.
    const values = prefillForRow(
      { setIndex: 0 },
      {
        prescription: prescription(),
        exercise: exercise({ tracks: ['reps'] }),
        sessionSets: [],
        previous,
      },
    );
    expect(values).toEqual({ reps: 8 });
    expect(values.weightKg).toBeUndefined();
  });
});

describe('previousSetFor', () => {
  const previous = {
    exerciseId: 'lunge',
    sets: [
      set({ setIndex: 0, side: 'L', reps: 8, weightKg: 20 }),
      set({ setIndex: 0, side: 'R', reps: 8, weightKg: 20 }),
    ],
  };

  it('matches the same side', () => {
    expect(previousSetFor({ setIndex: 0, side: 'R' }, previous)?.side).toBe('R');
  });

  it('falls back to the same set index when the side is missing', () => {
    expect(previousSetFor({ setIndex: 0 }, previous)?.setIndex).toBe(0);
  });

  it('is undefined with no history', () => {
    expect(previousSetFor({ setIndex: 0 }, undefined)).toBeUndefined();
  });
});

describe('stepFor', () => {
  it('steps weight by the user plate increment', () => {
    expect(stepFor('weight', 2.5)).toBe(2.5);
    expect(stepFor('weight', 1.25)).toBe(1.25);
  });

  it('steps reps by one and time and distance by five', () => {
    expect(stepFor('reps', 2.5)).toBe(1);
    expect(stepFor('seconds', 2.5)).toBe(5);
    expect(stepFor('distance', 2.5)).toBe(5);
  });
});

describe('formatWeight', () => {
  it('drops a trailing zero but keeps a real half plate', () => {
    expect(formatWeight(60)).toBe('60');
    expect(formatWeight(62.5)).toBe('62.5');
  });
});

describe('summariseSets', () => {
  it('collapses identical sets', () => {
    const sets = [
      set({ setIndex: 0, reps: 5, weightKg: 80 }),
      set({ setIndex: 1, reps: 5, weightKg: 80 }),
      set({ setIndex: 2, reps: 5, weightKg: 80 }),
      set({ setIndex: 3, reps: 5, weightKg: 80 }),
    ];
    expect(summariseSets(sets, exercise())).toBe('4×5 @ 80 kg');
  });

  it('shows the sets that fell short rather than averaging them away', () => {
    const sets = [
      set({ setIndex: 0, reps: 8, weightKg: 60 }),
      set({ setIndex: 1, reps: 8, weightKg: 60 }),
      set({ setIndex: 2, reps: 7, weightKg: 60 }),
    ];
    expect(summariseSets(sets, exercise())).toBe('8/8/7 @ 60 kg');
  });

  it('summarises holds in seconds', () => {
    const sets = [
      set({ setIndex: 0, seconds: 45 }),
      set({ setIndex: 1, seconds: 45 }),
    ];
    expect(summariseSets(sets, exercise({ tracks: ['seconds'] }))).toBe('2×45s');
  });

  it('summarises loaded distance work', () => {
    const sets = [
      set({ setIndex: 0, distanceM: 20, weightKg: 40 }),
      set({ setIndex: 1, distanceM: 20, weightKg: 40 }),
    ];
    expect(summariseSets(sets, exercise({ tracks: ['weight', 'distance'] }))).toBe(
      '2×20 m @ 40 kg',
    );
  });

  it('keeps the load visible when reps match but the weight climbed', () => {
    // "4×5" alone would hide the only number that actually changed.
    const sets = [
      set({ setIndex: 0, reps: 5, weightKg: 80 }),
      set({ setIndex: 1, reps: 5, weightKg: 82.5 }),
      set({ setIndex: 2, reps: 5, weightKg: 82.5 }),
    ];
    expect(summariseSets(sets, exercise())).toBe('3 sets · top 5 @ 82.5 kg');
  });

  it('reports the top set when the weight varied', () => {
    const sets = [
      set({ setIndex: 0, reps: 8, weightKg: 60 }),
      set({ setIndex: 1, reps: 5, weightKg: 70 }),
    ];
    expect(summariseSets(sets, exercise())).toBe('2 sets · top 5 @ 70 kg');
  });

  it('is empty for no sets', () => {
    expect(summariseSets([], exercise())).toBe('');
  });
});

describe('workout items', () => {
  const superset = {
    kind: 'superset' as const,
    label: 'Superset — alternate',
    restBetweenPairsSeconds: 60,
    prescriptions: [
      prescription({ exerciseId: 'iso', sets: 2, reps: undefined, holdSeconds: 45 }),
      prescription({ exerciseId: 'nordic', sets: 2, reps: '4-6' }),
    ],
  };
  const day = aDay({
    blocks: [
      {
        letter: 'A',
        name: 'Strength',
        estimatedMinutes: 20,
        items: [{ kind: 'single', prescription: prescription({ exerciseId: 'squat', sets: 2 }) }],
      },
      { letter: 'B', name: 'Pairs', estimatedMinutes: 15, items: [superset] },
    ],
  });

  const library = new Map([
    ['squat', exercise()],
    ['iso', exercise({ id: 'iso', tracks: ['seconds'] })],
    ['nordic', exercise({ id: 'nordic', tracks: ['reps'] })],
  ]);
  const lookup = (id: string) => library.get(id);

  it('flattens blocks into ordered cards, keeping a superset as one', () => {
    const items = workoutItems(day);
    expect(items).toHaveLength(2);
    expect(items[0]?.block.letter).toBe('A');
    expect(items[1]?.item.kind).toBe('superset');
    expect(items.map((i) => i.index)).toEqual([0, 1]);
  });

  it('has no items for a missing day', () => {
    expect(workoutItems(undefined)).toEqual([]);
  });

  it('lists both halves of a superset', () => {
    expect(itemPrescriptions(superset).map((p) => p.exerciseId)).toEqual(['iso', 'nordic']);
  });

  it('starts on the first card', () => {
    expect(currentItemIndex(day, aSession(), lookup)).toBe(0);
  });

  it('moves to the next card once the first is fully logged', () => {
    const session = aSession({
      entries: [{ exerciseId: 'squat', sets: [set({ setIndex: 0 }), set({ setIndex: 1 })] }],
    });
    expect(currentItemIndex(day, session, lookup)).toBe(1);
  });

  it('does not move on while a card is only part-logged', () => {
    const session = aSession({ entries: [{ exerciseId: 'squat', sets: [set({ setIndex: 0 })] }] });
    expect(currentItemIndex(day, session, lookup)).toBe(0);
  });

  it('treats a skipped exercise as done', () => {
    const session = aSession({ entries: [{ exerciseId: 'squat', sets: [], skipped: true }] });
    expect(currentItemIndex(day, session, lookup)).toBe(1);
  });

  it('needs both halves of a superset before the card is done', () => {
    const halfDone = aSession({
      entries: [
        { exerciseId: 'squat', sets: [set({ setIndex: 0 }), set({ setIndex: 1 })] },
        { exerciseId: 'iso', sets: [set({ setIndex: 0 }), set({ setIndex: 1 })] },
      ],
    });
    expect(itemComplete(superset, halfDone, lookup)).toBe(false);
    expect(currentItemIndex(day, halfDone, lookup)).toBe(1);
  });

  it('reports -1 once the whole day is done', () => {
    const session = aSession({
      entries: [
        { exerciseId: 'squat', sets: [set({ setIndex: 0 }), set({ setIndex: 1 })] },
        { exerciseId: 'iso', sets: [set({ setIndex: 0 }), set({ setIndex: 1 })] },
        { exerciseId: 'nordic', sets: [set({ setIndex: 0 }), set({ setIndex: 1 })] },
      ],
    });
    expect(currentItemIndex(day, session, lookup)).toBe(-1);
  });
});

describe('prescriptionProgress', () => {
  it('counts planned rows per side', () => {
    const progress = prescriptionProgress(
      prescription({ sets: 3, perSide: true }),
      exercise(),
      undefined,
    );
    expect(progress.planned).toBe(6);
    expect(progress.logged).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it('is complete once every row is logged', () => {
    const entry = {
      exerciseId: 'squat',
      sets: [set({ setIndex: 0 }), set({ setIndex: 1 })],
    };
    expect(prescriptionProgress(prescription({ sets: 2 }), exercise(), entry).complete).toBe(true);
  });

  it('is complete when skipped, even with nothing logged', () => {
    const entry = { exerciseId: 'squat', sets: [], skipped: true };
    const progress = prescriptionProgress(prescription({ sets: 4 }), exercise(), entry);
    expect(progress.complete).toBe(true);
    expect(progress.skipped).toBe(true);
  });
});

describe('prefill layering with a progression suggestion', () => {
  const previous = {
    exerciseId: 'squat',
    sets: [
      set({ setIndex: 0, reps: 8, weightKg: 60 }),
      set({ setIndex: 1, reps: 8, weightKg: 60 }),
    ],
  };

  it('opens at the suggested weight and reps rather than last week', () => {
    const values = prefillForRow(
      { setIndex: 0 },
      {
        prescription: prescription(),
        exercise: exercise(),
        sessionSets: [],
        previous,
        suggested: { weightKg: 62.5, reps: 6 },
      },
    );
    expect(values).toEqual({ weightKg: 62.5, reps: 6 });
  });

  it('lets last week show through for fields the suggestion is silent on', () => {
    // "Last time 4×8 @ 60. Aim for 8s." names a weight but no rep count.
    const values = prefillForRow(
      { setIndex: 0 },
      {
        prescription: prescription(),
        exercise: exercise(),
        sessionSets: [],
        previous,
        suggested: { weightKg: 60 },
      },
    );
    expect(values).toEqual({ weightKg: 60, reps: 8 });
  });

  it('still follows this session over the suggestion', () => {
    // Set 1 went heavier than proposed; set 2 follows what was actually done.
    const values = prefillForRow(
      { setIndex: 1 },
      {
        prescription: prescription(),
        exercise: exercise(),
        sessionSets: [set({ setIndex: 0, reps: 7, weightKg: 65, completedAt: 9000 })],
        previous,
        suggested: { weightKg: 62.5, reps: 6 },
      },
    );
    expect(values).toEqual({ weightKg: 65, reps: 7 });
  });

  it('drops a suggested weight for an exercise that tracks none', () => {
    const values = prefillForRow(
      { setIndex: 0 },
      {
        prescription: prescription(),
        exercise: exercise({ tracks: ['reps'] }),
        sessionSets: [],
        previous,
        suggested: { weightKg: 62.5, reps: 6 },
      },
    );
    expect(values).toEqual({ reps: 6 });
  });
});

describe('performanceHistory', () => {
  const session = (id: string, startedAt: number, entries: WorkoutSession['entries']): WorkoutSession => ({
    id, programmeDayId: 'day-1', weekNumber: 1, startedAt, entries,
  });

  it('returns every past performance, newest first', () => {
    const sessions = [
      session('a', 1, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 5 })] }]),
      session('c', 3, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 7 })] }]),
      session('b', 2, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 6 })] }]),
    ];
    expect(performanceHistory('squat', sessions).map((e) => e.sets[0]?.reps)).toEqual([7, 6, 5]);
  });

  it('excludes the live session, skipped entries and empty ones', () => {
    const sessions = [
      session('old', 1, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 5 })] }]),
      session('skip', 2, [{ exerciseId: 'squat', sets: [], skipped: true }]),
      session('live', 3, [{ exerciseId: 'squat', sets: [set({ setIndex: 0, reps: 9 })] }]),
    ];
    expect(performanceHistory('squat', sessions, 'live')).toHaveLength(1);
  });
});
