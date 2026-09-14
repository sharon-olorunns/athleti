import { describe, expect, it } from 'vitest';
import seedJson from '@/data/seed-programme.json';
import type { LadderStage, ProgrammeDay, SeedFile, WorkoutSession } from '@/types';
import { aPrescription } from '@/test/factories';
import {
  attemptsUnassisted,
  canAdvance,
  clampStage,
  dealStage,
  gateFor,
  ladderExerciseIds,
  nextStage,
  resolveLadder,
  stageFor,
  unassistedAttempts,
} from './ladder';
import { exerciseIdsOf, prescriptionsOf } from './prescription';

const seed = seedJson as unknown as SeedFile;
const ladder = seed.pullUpLadder;

const stage = (over: Partial<LadderStage> = {}): LadderStage => ({
  stage: 1,
  name: 'Stage',
  prescriptions: [{ exerciseId: 'inverted-row', sets: 3, reps: '10' }],
  gate: 'a gate',
  ...over,
});

const dayWith = (...exerciseIds: string[]): ProgrammeDay => ({
  id: 'day-a',
  dayLabel: 'Day A',
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
        prescription: aPrescription({ exerciseId, sets: 4, reps: '6-8', restSeconds: 120 }),
      })),
    },
  ],
});

describe('clampStage', () => {
  it('holds a stage inside the ladder', () => {
    expect(clampStage(ladder, 0)).toBe(1);
    expect(clampStage(ladder, 1)).toBe(1);
    expect(clampStage(ladder, 4)).toBe(4);
    // A stored stage from a longer ladder must not empty the pull-up slots.
    expect(clampStage(ladder, 99)).toBe(4);
  });

  it('survives an empty ladder', () => {
    expect(clampStage([], 3)).toBe(1);
    expect(stageFor([], 1)).toBeUndefined();
  });
});

describe('gates', () => {
  it('reads the gate of the current stage, and none on the last', () => {
    expect(gateFor(ladder, 2)).toBe('A controlled 8-second negative');
    expect(gateFor(ladder, 4)).toBeUndefined();
  });

  it('has somewhere to go until the top', () => {
    expect(canAdvance(ladder, 1)).toBe(true);
    expect(canAdvance(ladder, 3)).toBe(true);
    expect(canAdvance(ladder, 4)).toBe(false);
    expect(nextStage(ladder, 3)).toBe(4);
    // Advancing off the top stays put rather than resolving to nothing.
    expect(nextStage(ladder, 4)).toBe(4);
  });

  it('opens with an unassisted attempt from stage 3', () => {
    expect(attemptsUnassisted(ladder, 1)).toBe(false);
    expect(attemptsUnassisted(ladder, 2)).toBe(false);
    expect(attemptsUnassisted(ladder, 3)).toBe(true);
    expect(attemptsUnassisted(ladder, 4)).toBe(true);
  });
});

describe('dealStage', () => {
  it('gives one slot each when the counts match', () => {
    const dealt = dealStage(
      [
        { exerciseId: 'a', sets: 1 },
        { exerciseId: 'b', sets: 1 },
      ],
      2,
    );
    expect(dealt.map((hand) => hand.map((p) => p.exerciseId))).toEqual([['a'], ['b']]);
  });

  it('runs every prescription in the week when a stage has more than there are slots', () => {
    const dealt = dealStage(
      [
        { exerciseId: 'a', sets: 1 },
        { exerciseId: 'b', sets: 1 },
        { exerciseId: 'c', sets: 1 },
      ],
      2,
    );
    expect(dealt.map((hand) => hand.map((p) => p.exerciseId))).toEqual([['a', 'c'], ['b']]);
  });

  it('never leaves a slot empty when a stage has only one prescription', () => {
    // Stage 4 is a single "attempt pull-ups" entry, and it has to appear in both
    // days rather than dropping out of one of them.
    const dealt = dealStage([{ exerciseId: 'a', sets: 1 }], 2);
    expect(dealt.map((hand) => hand.map((p) => p.exerciseId))).toEqual([['a'], ['a']]);
  });
});

describe('resolveLadder', () => {
  /**
   * A two-rung ladder whose first rung is the exercise the day's slot names, so
   * resolving at rung 2 exercises the repointing rather than a no-op.
   */
  const rungs = (...prescriptions: LadderStage['prescriptions']): LadderStage[] => [
    stage({ stage: 1, prescriptions: [{ exerciseId: 'assisted-pull-up', sets: 4, reps: '6-8' }] }),
    stage({ stage: 2, prescriptions, gate: null }),
  ];

  const single = rungs({ exerciseId: 'negative-pull-up', sets: 4, reps: '3' });

  it('leaves a day with no pull-up slot alone', () => {
    const days = [dayWith('seated-row')];
    expect(resolveLadder(days, single, 2)).toEqual(days);
  });

  it('repoints the slot at the current stage', () => {
    const [day] = resolveLadder([dayWith('assisted-pull-up')], single, 2);
    expect(exerciseIdsOf(day!)).toEqual(['negative-pull-up']);
  });

  it('keeps the slot rest and takes the stage sets and reps', () => {
    const [day] = resolveLadder([dayWith('assisted-pull-up')], single, 2);
    const [prescription] = prescriptionsOf(day!);
    // The slot owns how the work is run; the stage owns what the work is.
    expect(prescription?.restSeconds).toBe(120);
    expect(prescription?.sets).toBe(4);
    expect(prescription?.reps).toBe('3');
  });

  it('switches to the hold timer for a timed stage prescription', () => {
    const hang = rungs({ exerciseId: 'dead-hang', sets: 3, holdSeconds: 25 });
    const [day] = resolveLadder([dayWith('assisted-pull-up')], hang, 2);
    const [prescription] = prescriptionsOf(day!);
    expect(prescription?.timerMode).toBe('hold');
    expect(prescription?.holdSeconds).toBe(25);
    // The slot's rep target has to go, or a hang would show a rep stepper.
    expect(prescription?.reps).toBeUndefined();
  });

  it('takes the stage note and drops the slot note', () => {
    const noted = rungs({
      exerciseId: 'negative-pull-up',
      sets: 4,
      reps: '3',
      note: '5-second lowering',
    });
    const [day] = resolveLadder([dayWith('assisted-pull-up')], noted, 2);
    expect(prescriptionsOf(day!)[0]?.note).toBe('5-second lowering');

    // A slot note names the rung the slot was authored at, so it must not ride
    // along onto a different one.
    const unnoted = rungs({ exerciseId: 'negative-pull-up', sets: 4, reps: '3' });
    const [plain] = resolveLadder([dayWith('assisted-pull-up')], unnoted, 2);
    expect(prescriptionsOf(plain!)[0]?.note).toBeUndefined();
  });

  it('splits a slot dealt two prescriptions into two entries', () => {
    const two = rungs(
      { exerciseId: 'inverted-row', sets: 3, reps: '10' },
      { exerciseId: 'dead-hang', sets: 3, holdSeconds: 25 },
    );
    const [day] = resolveLadder([dayWith('assisted-pull-up')], two, 2);
    expect(exerciseIdsOf(day!)).toEqual(['inverted-row', 'dead-hang']);
  });
});

describe('the seeded ladder against the seeded programme', () => {
  const ladderIds = ladderExerciseIds(ladder);

  /** Acceptance criterion 17. */
  it('changes which exercise appears in the pull-up slots at every stage', () => {
    const seen = new Set<string>();

    for (const stageNumber of [1, 2, 3, 4]) {
      const resolved = resolveLadder(seed.days, ladder, stageNumber);
      const pulling = resolved
        .flatMap((day) => prescriptionsOf(day))
        .map((p) => p.exerciseId)
        .filter((id) => ladderIds.has(id));

      expect(pulling.length).toBeGreaterThan(0);
      // Every exercise shown is one the stage actually prescribes.
      const allowed = new Set(
        stageFor(ladder, stageNumber)?.prescriptions.map((p) => p.exerciseId) ?? [],
      );
      for (const id of pulling) expect(allowed.has(id)).toBe(true);

      seen.add([...new Set(pulling)].sort().join(','));
    }

    // Four stages, four different sets of pull-up work.
    expect(seen.size).toBe(4);
  });

  it('runs every prescription of every stage somewhere in the week', () => {
    for (const current of ladder) {
      const resolved = resolveLadder(seed.days, ladder, current.stage);
      const prescribed = new Set(resolved.flatMap((day) => exerciseIdsOf(day)));
      for (const prescription of current.prescriptions) {
        expect(prescribed.has(prescription.exerciseId)).toBe(true);
      }
    }
  });

  it('leaves everything that is not a pull-up slot untouched', () => {
    const before = seed.days.flatMap((d) => exerciseIdsOf(d)).filter((id) => !ladderIds.has(id));
    const after = resolveLadder(seed.days, ladder, 3)
      .flatMap((d) => exerciseIdsOf(d))
      .filter((id) => !ladderIds.has(id));
    expect(after).toEqual(before);
  });
});

describe('unassistedAttempts', () => {
  const session = (
    startedAt: number,
    over: Partial<Pick<WorkoutSession, 'unassistedAttempt' | 'unassistedSuccess'>> = {},
  ): WorkoutSession => ({
    id: `s${startedAt}`,
    programmeDayId: 'day-a',
    weekNumber: 1,
    startedAt,
    entries: [],
    ...over,
  });

  it('counts nothing before the question is ever asked', () => {
    expect(unassistedAttempts([session(1), session(2)])).toEqual({
      asked: 0,
      attempted: 0,
      streak: 0,
      successes: 0,
    });
  });

  it('keeps the streak through a missed attempt', () => {
    // Missing the rep is the expected outcome right up until it is not; what the
    // streak counts is showing up to the bar fresh.
    const record = unassistedAttempts([
      session(1, { unassistedAttempt: true }),
      session(2, { unassistedAttempt: true }),
      session(3, { unassistedAttempt: true }),
    ]);
    expect(record.streak).toBe(3);
    expect(record.successes).toBe(0);
  });

  it('breaks the streak on a session that skipped the attempt', () => {
    const record = unassistedAttempts([
      session(1, { unassistedAttempt: true }),
      session(2, { unassistedAttempt: false }),
      session(3, { unassistedAttempt: true }),
      session(4, { unassistedAttempt: true }),
    ]);
    expect(record.asked).toBe(4);
    expect(record.attempted).toBe(3);
    expect(record.streak).toBe(2);
  });

  it('remembers when the first rep went up', () => {
    const record = unassistedAttempts([
      session(1, { unassistedAttempt: true }),
      session(3, { unassistedAttempt: true, unassistedSuccess: true }),
      session(5, { unassistedAttempt: true, unassistedSuccess: true }),
    ]);
    expect(record.successes).toBe(2);
    expect(record.firstSuccessAt).toBe(3);
  });
});
