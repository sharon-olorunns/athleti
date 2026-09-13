import { describe, expect, it } from 'vitest';
import type { Exercise, ProgrammeDay } from '@/types';
import { anExercise as exercise, aSet as set } from '@/test/factories';
import {
  createSession,
  durationLabel,
  entryFor,
  finishSession,
  formatClock,
  logSet,
  newSessionId,
  sessionStats,
  setSessionNotes,
  setSkipped,
  skipUnloggedExercises,
  unlogSet,
} from './session';

const day: ProgrammeDay = {
  id: 'day-1',
  dayLabel: 'Day 1 · Mon',
  title: 'Lower',
  cnsLoad: 'high',
  targetMinutes: 70,
  atHome: false,
  blocks: [
    {
      letter: 'A',
      name: 'Strength',
      estimatedMinutes: 20,
      items: [
        {
          kind: 'single',
          prescription: {
            exerciseId: 'squat',
            sets: 4,
            reps: '5',
            restSeconds: 120,
            perSide: false,
            cutFirst: false,
            kneeModified: false,
            timerMode: 'rest',
          },
        },
        {
          kind: 'single',
          prescription: {
            exerciseId: 'lunge',
            sets: 3,
            reps: '8',
            restSeconds: 60,
            perSide: true,
            cutFirst: false,
            kneeModified: false,
            timerMode: 'rest',
          },
        },
      ],
    },
  ],
};

const library = new Map<string, Exercise>([
  ['squat', exercise()],
  ['lunge', exercise({ id: 'lunge', unilateral: true })],
]);
const lookup = (id: string) => library.get(id);

describe('newSessionId', () => {
  it('is unique for the same instant', () => {
    let n = 0;
    const ids = [newSessionId(1000, () => (n += 0.1)), newSessionId(1000, () => (n += 0.1))];
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('createSession', () => {
  it('starts empty, unfinished and stamped with the week', () => {
    const session = createSession('day-1', 3, 1000, 'fixed');
    expect(session).toEqual({
      id: 'fixed',
      programmeDayId: 'day-1',
      weekNumber: 3,
      startedAt: 1000,
      entries: [],
    });
    expect(session.finishedAt).toBeUndefined();
  });
});

describe('logSet', () => {
  it('creates the entry on the first set of an exercise', () => {
    const session = logSet(createSession('day-1', 1, 0, 's'), 'squat', set({ setIndex: 0, reps: 5 }));
    expect(entryFor(session, 'squat')?.sets).toHaveLength(1);
  });

  it('does not mutate the session it is given', () => {
    const before = createSession('day-1', 1, 0, 's');
    logSet(before, 'squat', set({ setIndex: 0 }));
    expect(before.entries).toHaveLength(0);
  });

  it('replaces rather than duplicates when a row is re-completed', () => {
    let session = createSession('day-1', 1, 0, 's');
    session = logSet(session, 'squat', set({ setIndex: 0, reps: 5, weightKg: 80 }));
    session = logSet(session, 'squat', set({ setIndex: 0, reps: 6, weightKg: 80 }));
    const sets = entryFor(session, 'squat')?.sets ?? [];
    expect(sets).toHaveLength(1);
    expect(sets[0]?.reps).toBe(6);
  });

  it('keeps L and R as separate rows of the same set', () => {
    let session = createSession('day-1', 1, 0, 's');
    session = logSet(session, 'lunge', set({ setIndex: 0, side: 'L', reps: 8 }));
    session = logSet(session, 'lunge', set({ setIndex: 0, side: 'R', reps: 8 }));
    expect(entryFor(session, 'lunge')?.sets).toHaveLength(2);
  });

  it('orders sets by index then side', () => {
    let session = createSession('day-1', 1, 0, 's');
    session = logSet(session, 'lunge', set({ setIndex: 1, side: 'R' }));
    session = logSet(session, 'lunge', set({ setIndex: 0, side: 'R' }));
    session = logSet(session, 'lunge', set({ setIndex: 0, side: 'L' }));
    expect((entryFor(session, 'lunge')?.sets ?? []).map((s) => `${s.setIndex}${s.side}`)).toEqual([
      '0L',
      '0R',
      '1R',
    ]);
  });

  it('un-skips an exercise that is logged into', () => {
    let session = setSkipped(createSession('day-1', 1, 0, 's'), 'squat', true);
    session = logSet(session, 'squat', set({ setIndex: 0 }));
    expect(entryFor(session, 'squat')?.skipped).not.toBe(true);
  });

  it('records what was performed, including a grind', () => {
    const session = logSet(
      createSession('day-1', 1, 0, 's'),
      'squat',
      set({ setIndex: 0, reps: 5, weightKg: 80, wasClean: false, completedAt: 1234 }),
    );
    expect(entryFor(session, 'squat')?.sets[0]).toMatchObject({
      reps: 5,
      weightKg: 80,
      wasClean: false,
      completedAt: 1234,
    });
  });
});

describe('unlogSet', () => {
  it('removes only the matching row', () => {
    let session = createSession('day-1', 1, 0, 's');
    session = logSet(session, 'lunge', set({ setIndex: 0, side: 'L' }));
    session = logSet(session, 'lunge', set({ setIndex: 0, side: 'R' }));
    session = unlogSet(session, 'lunge', 0, 'L');
    const sets = entryFor(session, 'lunge')?.sets ?? [];
    expect(sets).toHaveLength(1);
    expect(sets[0]?.side).toBe('R');
  });

  it('is a no-op for an exercise with no entry', () => {
    const session = createSession('day-1', 1, 0, 's');
    expect(unlogSet(session, 'squat', 0, undefined)).toBe(session);
  });
});

describe('setSessionNotes', () => {
  it('stores trimmed notes', () => {
    expect(setSessionNotes(createSession('d', 1, 0, 's'), '  felt strong ').notes).toBe(
      'felt strong',
    );
  });

  it('drops the field entirely when cleared', () => {
    const withNote = setSessionNotes(createSession('d', 1, 0, 's'), 'x');
    expect('notes' in setSessionNotes(withNote, '   ')).toBe(false);
  });
});

describe('finishSession', () => {
  it('stamps the finish time', () => {
    expect(finishSession(createSession('d', 1, 1000, 's'), 9000).finishedAt).toBe(9000);
  });

  it('does not move an already-recorded finish time', () => {
    const finished = finishSession(createSession('d', 1, 1000, 's'), 9000);
    expect(finishSession(finished, 12000).finishedAt).toBe(9000);
  });
});

describe('skipUnloggedExercises', () => {
  it('skips exercises with nothing logged and leaves the rest alone', () => {
    let session = createSession('day-1', 1, 0, 's');
    session = logSet(session, 'squat', set({ setIndex: 0, reps: 5 }));
    session = skipUnloggedExercises(session, day);

    expect(entryFor(session, 'squat')?.skipped).toBeUndefined();
    expect(entryFor(session, 'lunge')?.skipped).toBe(true);
  });
});

describe('sessionStats', () => {
  it('counts per-side rows in the planned total', () => {
    // squat 4 + lunge 3 × 2 sides = 10
    const stats = sessionStats(createSession('day-1', 1, 0, 's'), day, lookup, 0);
    expect(stats.plannedSets).toBe(10);
    expect(stats.completedSets).toBe(0);
    expect(stats.completionPct).toBe(0);
    expect(stats.allSetsCompleted).toBe(false);
  });

  it('tracks completion as sets are logged', () => {
    let session = createSession('day-1', 1, 0, 's');
    for (let i = 0; i < 4; i += 1) {
      session = logSet(session, 'squat', set({ setIndex: i, reps: 5 }));
    }
    const stats = sessionStats(session, day, lookup, 0);
    expect(stats.completedSets).toBe(4);
    expect(stats.completionPct).toBe(40);
  });

  it('reaches 100% only when every prescribed row is logged', () => {
    let session = createSession('day-1', 1, 0, 's');
    for (let i = 0; i < 4; i += 1) {
      session = logSet(session, 'squat', set({ setIndex: i }));
    }
    for (let i = 0; i < 3; i += 1) {
      session = logSet(session, 'lunge', set({ setIndex: i, side: 'L' }));
      session = logSet(session, 'lunge', set({ setIndex: i, side: 'R' }));
    }
    const stats = sessionStats(session, day, lookup, 0);
    expect(stats.completedSets).toBe(10);
    expect(stats.completionPct).toBe(100);
    expect(stats.allSetsCompleted).toBe(true);
  });

  it('grows the planned total when an extra set is logged', () => {
    let session = createSession('day-1', 1, 0, 's');
    session = logSet(session, 'squat', set({ setIndex: 4 }));
    expect(sessionStats(session, day, lookup, 0).plannedSets).toBe(11);
  });

  it('measures elapsed time for a live session and total for a finished one', () => {
    const live = createSession('day-1', 1, 1000, 's');
    expect(sessionStats(live, day, lookup, 61000).durationMs).toBe(60000);

    const done = finishSession(live, 31000);
    expect(sessionStats(done, day, lookup, 99999).durationMs).toBe(30000);
  });

  it('handles a missing day without dividing by zero', () => {
    const stats = sessionStats(createSession('gone', 1, 0, 's'), undefined, lookup, 0);
    expect(stats.plannedSets).toBe(0);
    expect(stats.completionPct).toBe(0);
    expect(stats.allSetsCompleted).toBe(false);
  });
});

describe('formatClock', () => {
  it('reads as m:ss under an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(34 * 60000 + 12000)).toBe('34:12');
  });

  it('adds hours past sixty minutes', () => {
    expect(formatClock(3600000 + 4 * 60000 + 12000)).toBe('1:04:12');
  });

  it('never shows negative time', () => {
    expect(formatClock(-5000)).toBe('0:00');
  });
});

describe('durationLabel', () => {
  it('rounds to whole minutes', () => {
    expect(durationLabel(58 * 60000)).toBe('58 min');
    expect(durationLabel(58 * 60000 + 40000)).toBe('59 min');
  });

  it('shows hours for long sessions', () => {
    expect(durationLabel(70 * 60000)).toBe('1h 10m');
    expect(durationLabel(120 * 60000)).toBe('2h');
  });
});
