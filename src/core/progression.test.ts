import { describe, expect, it } from 'vitest';
import seedJson from '@/data/seed-programme.json';
import type { Exercise, LoggedExercise, SeedFile } from '@/types';
import { anExercise, aPrescription, aSet } from '@/test/factories';
import {
  deloadBanner,
  qualityQuestion,
  roundToIncrement,
  suggestProgression,
  workingWeight,
} from './progression';
import { prescriptionsOf } from './prescription';

const seed = seedJson as unknown as SeedFile;
const seeded = (id: string): Exercise => {
  const found = seed.exercises.find((e) => e.id === id);
  if (found === undefined) throw new Error(`no seeded exercise ${id}`);
  return found;
};
/**
 * The prescription the programme actually uses for an exercise.
 *
 * Some seeded exercises are in the library without being programmed — the trap
 * bar lifts are the case acceptance criteria 7 and 8 name, one dropped at the
 * user's request and one simply not in this split. The progression rule still has
 * to be right for the day they are swapped back in, so those fall back to a
 * prescription built from the exercise's own rep range rather than skipping the
 * check.
 */
const seededPrescription = (id: string) => {
  for (const day of seed.days) {
    const found = prescriptionsOf(day).find((p) => p.exerciseId === id);
    if (found !== undefined) return found;
  }
  const range = seeded(id).progression.repRange;
  // A rule with no rep range describes a low-rep quality lift; the jump ran 3 × 3
  // while it was programmed, which is the shape the rule has to hold for.
  if (range === undefined) return aPrescription({ exerciseId: id, sets: 3, reps: '3' });
  const [floor, top] = range;
  return aPrescription({
    exerciseId: id,
    sets: 4,
    reps: floor === top ? String(top) : `${floor}-${top}`,
  });
};

const performance = (
  reps: number[],
  weightKg?: number,
  over: Partial<LoggedExercise> = {},
): LoggedExercise => ({
  exerciseId: 'x',
  sets: reps.map((r, i) =>
    aSet({ setIndex: i, reps: r, wasClean: true, ...(weightKg !== undefined ? { weightKg } : {}) }),
  ),
  ...over,
});

const holds = (seconds: number[], clean = true): LoggedExercise => ({
  exerciseId: 'x',
  sets: seconds.map((s, i) => aSet({ setIndex: i, seconds: s, wasClean: clean })),
});

describe('roundToIncrement', () => {
  it('lands suggestions on real plates', () => {
    expect(roundToIncrement(37.2, 2.5)).toBe(37.5);
    expect(roundToIncrement(36, 5)).toBe(35);
  });

  it('leaves the value alone with no increment', () => {
    expect(roundToIncrement(37.2, 0)).toBe(37.2);
  });
});

describe('workingWeight', () => {
  it('is the heaviest set normally', () => {
    expect(workingWeight([aSet({ setIndex: 0, weightKg: 60 }), aSet({ setIndex: 1, weightKg: 65 })])).toBe(65);
  });

  it('is the lightest set when the load is assistance', () => {
    // Less assistance is the harder set.
    expect(
      workingWeight([aSet({ setIndex: 0, weightKg: 30 }), aSet({ setIndex: 1, weightKg: 25 })], true),
    ).toBe(25);
  });

  it('is undefined for bodyweight work', () => {
    expect(workingWeight([aSet({ setIndex: 0, reps: 8 })])).toBeUndefined();
  });
});

describe('7.1 load — double progression', () => {
  const exercise = anExercise({
    progression: { type: 'load', label: '↑ 2.5 kg/wk', repRange: [6, 8], incrementKg: 2.5 },
  });
  const prescription = aPrescription({ sets: 4, reps: '6-8' });

  /**
   * Acceptance criterion 8, with section 7.1's own numbers: a session of 4×8 all
   * clean suggests the next weight up, pre-filled at the bottom of the range.
   */
  it('suggests the next weight up at the bottom of the range after a clean top-of-range session', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([8, 8, 8, 8], 60)],
      weekNumber: 1,
    });

    expect(result.kind).toBe('load-progress');
    expect(result.message).toBe('All sets at 8 clean last time → try 62.5 kg');
    expect(result.prefill.weightKg).toBe(62.5);
    expect(result.prefill.reps).toBe(6);
  });

  it('holds the weight and names the target when the range was not topped out', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([7, 7, 7, 7], 60)],
      weekNumber: 1,
    });

    expect(result.kind).toBe('load-hold');
    expect(result.message).toBe('Last time 4×7 @ 60 kg. Aim for 8s.');
    expect(result.prefill.weightKg).toBe(60);
  });

  it('does not progress when a set hit the target but was a grind', () => {
    const ground: LoggedExercise = {
      exerciseId: 'x',
      sets: [
        aSet({ setIndex: 0, reps: 8, weightKg: 60, wasClean: true }),
        aSet({ setIndex: 1, reps: 8, weightKg: 60, wasClean: false }),
      ],
    };
    const result = suggestProgression({ exercise, prescription, history: [ground], weekNumber: 1 });
    expect(result.kind).toBe('load-hold');
    expect(result.prefill.weightKg).toBe(60);
  });

  it('does not progress when one set fell short', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([8, 8, 8, 7], 60)],
      weekNumber: 1,
    });
    expect(result.kind).toBe('load-hold');
    expect(result.message).toBe('Last time 8/8/8/7 @ 60 kg. Aim for 8s.');
  });

  it('calls a stall after two sessions stuck at the same weight and reps', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([7, 7, 7, 7], 60), performance([7, 7, 7, 7], 60)],
      weekNumber: 1,
    });

    expect(result.kind).toBe('load-stalled');
    expect(result.message).toBe('Stalled two weeks — drop to 60% for one session, then rebuild.');
    // 60% of 60 is 36, rounded onto the 2.5 kg increment.
    expect(result.prefill.weightKg).toBe(35);
  });

  it('is not a stall when the weight moved between the two sessions', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([7, 7, 7, 7], 62.5), performance([7, 7, 7, 7], 60)],
      weekNumber: 1,
    });
    expect(result.kind).toBe('load-hold');
  });

  it('is not a stall when the reps moved', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([7, 7, 7, 7], 60), performance([6, 6, 6, 6], 60)],
      weekNumber: 1,
    });
    expect(result.kind).toBe('load-hold');
  });

  it('asks for a working weight the first time, and never guesses one', () => {
    const result = suggestProgression({ exercise, prescription, history: [], weekNumber: 1 });
    expect(result.kind).toBe('load-start');
    expect(result.prefill.weightKg).toBeUndefined();
    expect(result.prefill.reps).toBe(6);
  });
});

describe('7.1 load — inverse (assisted pull-up)', () => {
  /** Acceptance criterion 9: it must suggest less assistance, and say so. */
  const exercise = seeded('assisted-pull-up');
  const prescription = seededPrescription('assisted-pull-up');

  it('reduces the assistance and says so in words', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([8, 8, 8], 27.5)],
      weekNumber: 1,
    });

    expect(result.kind).toBe('load-progress');
    expect(result.message).toBe('All sets at 8 clean last time → assistance down to 25 kg');
    expect(result.prefill.weightKg).toBe(25);
    // Unambiguously downwards.
    expect(result.prefill.weightKg!).toBeLessThan(27.5);
    expect(result.message.toLowerCase()).toContain('assistance down');
  });

  it('reads the lightest set as the working weight, since less assistance is harder', () => {
    const mixed: LoggedExercise = {
      exerciseId: 'x',
      sets: [
        aSet({ setIndex: 0, reps: 8, weightKg: 30, wasClean: true }),
        aSet({ setIndex: 1, reps: 8, weightKg: 25, wasClean: true }),
      ],
    };
    const result = suggestProgression({ exercise, prescription, history: [mixed], weekNumber: 1 });
    expect(result.prefill.weightKg).toBe(22.5);
  });

  it('never drops assistance below zero', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([8, 8, 8], 1)],
      weekNumber: 1,
    });
    expect(result.prefill.weightKg).toBe(0);
  });

  it('adds assistance back on a stall rather than cutting it to 60%', () => {
    // 60% of assistance would be a harder set, which is the opposite of backing off.
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([6, 6, 6], 30), performance([6, 6, 6], 30)],
      weekNumber: 1,
    });
    expect(result.kind).toBe('load-stalled');
    expect(result.prefill.weightKg).toBe(32.5);
    expect(result.message).toContain('assistance back up to 32.5 kg');
  });
});

describe('7.2 quality — never add weight', () => {
  const exercise = seeded('trap-bar-jump');
  const prescription = seededPrescription('trap-bar-jump');

  /**
   * Acceptance criterion 7: the trap bar jump never shows a suggestion to add
   * weight, in any circumstance. Every history shape is checked, because "in any
   * circumstance" is the whole point of the rule.
   */
  it('never suggests a weight, whatever the history', () => {
    const histories: LoggedExercise[][] = [
      [],
      [performance([3, 3, 3], 60)],
      [performance([3, 3, 3], 60), performance([3, 3, 3], 60)],
      [performance([5, 5, 5], 60)],
      [{ exerciseId: 'x', sets: [aSet({ setIndex: 0, reps: 3, weightKg: 60, wasClean: false })] }],
      [performance([3, 3, 3], 60, { qualityConfirmed: true })],
      [performance([3, 3, 3], 60, { qualityConfirmed: false })],
    ];

    for (const history of histories) {
      for (const weekNumber of [1, 5]) {
        const result = suggestProgression({ exercise, prescription, history, weekNumber });
        expect(result.prefill.weightKg).toBeUndefined();
        expect(result.message).not.toMatch(/try \d/);
        expect(result.message.toLowerCase()).not.toContain('kg/wk');
      }
    }
  });

  it('states what is actually being progressed', () => {
    const result = suggestProgression({ exercise, prescription, history: [], weekNumber: 1 });
    expect(result.kind).toBe('quality');
    expect(result.message).toContain('↑ Bar speed');
  });

  it('reports last time without proposing a change', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([3, 3, 3], 60)],
      weekNumber: 1,
    });
    expect(result.message).toBe('↑ Bar speed · last time 3×3 @ 60 kg');
  });

  it('warns after two consecutive no answers', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [
        performance([3, 3, 3], 60, { qualityConfirmed: false }),
        performance([3, 3, 3], 60, { qualityConfirmed: false }),
      ],
      weekNumber: 1,
    });
    expect(result.hint).toBe('Quality dropping — reduce sets rather than pushing through.');
  });

  it('does not warn on a single no, or on a no followed by a yes', () => {
    const single = suggestProgression({
      exercise,
      prescription,
      history: [performance([3, 3, 3], 60, { qualityConfirmed: false })],
      weekNumber: 1,
    });
    expect(single.hint).toBeUndefined();

    const recovered = suggestProgression({
      exercise,
      prescription,
      history: [
        performance([3, 3, 3], 60, { qualityConfirmed: true }),
        performance([3, 3, 3], 60, { qualityConfirmed: false }),
      ],
      weekNumber: 1,
    });
    expect(recovered.hint).toBeUndefined();
  });
});

describe('qualityQuestion', () => {
  it('asks the spec question for the trap bar jump', () => {
    expect(qualityQuestion(seeded('trap-bar-jump'), seededPrescription('trap-bar-jump'))).toBe(
      'Was bar speed maintained on every rep?',
    );
  });

  it('keeps the first clause of a longer label', () => {
    // "↑ Distance, quiet landings" asks about distance, not the whole label.
    expect(qualityQuestion(seeded('skater-jump'), seededPrescription('skater-jump'))).toBe(
      'Was distance maintained on every rep?',
    );
  });

  it('asks per round for interval work', () => {
    expect(
      qualityQuestion(seeded('interval-conditioning'), seededPrescription('interval-conditioning')),
    ).toBe('Was reps or shorter rest maintained on every round?');
  });

  it('has no question for exercises that are not quality-progressed', () => {
    expect(qualityQuestion(seeded('trap-bar-deadlift'), seededPrescription('trap-bar-deadlift'))).toBeUndefined();
  });
});

describe('7.3 time — hold longer, or progress the lever', () => {
  const exercise = seeded('spanish-squat-iso');
  const prescription = seededPrescription('spanish-squat-iso');

  it('suggests a longer hold once every hold was completed clean', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [holds([45, 45, 45, 45, 45])],
      weekNumber: 1,
    });
    expect(result.kind).toBe('time-progress');
    expect(result.message).toBe('All 5 × 45s held → try 50s');
    expect(result.prefill.seconds).toBe(50);
  });

  it('holds steady when a hold was cut short', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [holds([45, 45, 30])],
      weekNumber: 1,
    });
    expect(result.kind).toBe('time-hold');
    expect(result.prefill.seconds).toBe(45);
  });

  it('holds steady when a hold was a grind', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [holds([45, 45, 45], false)],
      weekNumber: 1,
    });
    expect(result.kind).toBe('time-hold');
  });

  it('never suggests seconds where the rule does not progress by time', () => {
    // The banded lateral walk pins holdIncrementSeconds to 0: it progresses by
    // band stiffness, and "walk further" is the wrong prompt.
    const walk = seeded('banded-lateral-walk');
    const result = suggestProgression({
      exercise: walk,
      prescription: seededPrescription('banded-lateral-walk'),
      history: [{ exerciseId: 'x', sets: [aSet({ setIndex: 0, distanceM: 15 })] }],
      weekNumber: 1,
    });
    expect(result.kind).toBe('time-hold');
    expect(result.prefill.seconds).toBeUndefined();
    expect(result.message).toContain('↑ Band tension');
  });
});

describe('7.3 the Copenhagen lever prompt', () => {
  const exercise = seeded('copenhagen-plank');
  const prescription = seededPrescription('copenhagen-plank');
  const at = () => holds([25, 25, 25]);

  it('prompts for the lever after four clean sessions at the hold', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [at(), at(), at(), at()],
      weekNumber: 1,
    });
    expect(result.hint).toBe('Four sessions at the top — move toward ankle-supported.');
  });

  it('does not prompt before four', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [at(), at(), at()],
      weekNumber: 1,
    });
    expect(result.hint).toBeUndefined();
  });

  it('resets the streak when a session fell short', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [at(), at(), holds([25, 20]), at(), at()],
      weekNumber: 1,
    });
    expect(result.hint).toBeUndefined();
  });

  it('is a text prompt only and changes nothing automatically', () => {
    const result = suggestProgression({
      exercise,
      prescription,
      history: [at(), at(), at(), at()],
      weekNumber: 1,
    });
    // The time suggestion still runs; the lever is advice, not an action.
    expect(result.prefill.weightKg).toBeUndefined();
    expect(result.kind).toBe('time-progress');
  });

  it('does not offer a lever prompt for other timed work', () => {
    const result = suggestProgression({
      exercise: seeded('spanish-squat-iso'),
      prescription: seededPrescription('spanish-squat-iso'),
      history: [holds([45, 45]), holds([45, 45]), holds([45, 45]), holds([45, 45])],
      weekNumber: 1,
    });
    expect(result.hint).toBeUndefined();
  });
});

describe('7.4 fixed — nothing goes up', () => {
  it('produces no banner and no suggestion', () => {
    const exercise = seeded('hip-mobility-flow');
    const result = suggestProgression({
      exercise,
      prescription: seededPrescription('hip-mobility-flow'),
      history: [performance([6, 6, 6])],
      weekNumber: 1,
    });
    expect(result.kind).toBe('none');
    expect(result.message).toBe('');
    expect(result.prefill).toEqual({});
  });

  it('keeps its prescribed sets even on a deload week', () => {
    // Warm-ups sit outside the progression machinery; trimming them buys no
    // recovery, it just means warming up less.
    const exercise = seeded('hip-mobility-flow');
    const prescription = aPrescription({ sets: 3, exerciseId: exercise.id });
    const result = suggestProgression({ exercise, prescription, history: [], weekNumber: 5 });
    expect(result.suggestedSets).toBe(3);
    expect(result.deloaded).toBe(false);
  });
});

describe('7.5 deload weeks', () => {
  const exercise = anExercise({
    progression: { type: 'load', label: '↑ 2.5 kg/wk', repRange: [6, 8], incrementKg: 2.5 },
  });

  it('cuts sets by roughly 40% and leaves the weight suggestion alone', () => {
    const prescription = aPrescription({ sets: 5, reps: '6-8' });
    const normal = suggestProgression({
      exercise,
      prescription,
      history: [performance([8, 8, 8, 8, 8], 60)],
      weekNumber: 4,
    });
    const deload = suggestProgression({
      exercise,
      prescription,
      history: [performance([8, 8, 8, 8, 8], 60)],
      weekNumber: 5,
    });

    expect(normal.suggestedSets).toBe(5);
    expect(deload.suggestedSets).toBe(3);
    expect(deload.deloaded).toBe(true);
    // Intensity held: the same weight is suggested either way.
    expect(deload.prefill.weightKg).toBe(normal.prefill.weightKg);
  });

  it('never cuts below two sets', () => {
    const result = suggestProgression({
      exercise,
      prescription: aPrescription({ sets: 3, reps: '6-8' }),
      history: [],
      weekNumber: 10,
    });
    expect(result.suggestedSets).toBe(2);
  });

  it('leaves a short prescription alone rather than inflating it', () => {
    const result = suggestProgression({
      exercise,
      prescription: aPrescription({ sets: 2, reps: '6-8' }),
      history: [],
      weekNumber: 5,
    });
    expect(result.suggestedSets).toBe(2);
    expect(result.deloaded).toBe(false);
  });
});

describe('deloadBanner', () => {
  it('explains the trade on a deload week', () => {
    expect(deloadBanner(5)).toBe(
      'Week 5 is a deload — same weights, fewer sets. Volume down, intensity held.',
    );
    expect(deloadBanner(10)).toContain('Week 10');
  });

  it('is absent on every other week', () => {
    expect(deloadBanner(4)).toBeUndefined();
    expect(deloadBanner(6)).toBeUndefined();
  });
});

describe('against the seeded programme', () => {
  it('never proposes load for any exercise whose rule forbids it', () => {
    // The rule that justifies the whole engine, checked across the real library.
    for (const exercise of seed.exercises) {
      if (exercise.progression.neverAddLoad !== true) continue;
      for (const history of [[], [performance([5, 5, 5], 40)]]) {
        const result = suggestProgression({
          exercise,
          prescription: aPrescription({ exerciseId: exercise.id, sets: 3, reps: '3' }),
          history,
          weekNumber: 1,
        });
        expect(result.prefill.weightKg).toBeUndefined();
      }
    }
  });

  it('produces a banner for every non-fixed exercise in the programme', () => {
    for (const day of seed.days) {
      for (const prescription of prescriptionsOf(day)) {
        const exercise = seeded(prescription.exerciseId);
        const result = suggestProgression({ exercise, prescription, history: [], weekNumber: 1 });
        if (exercise.progression.type === 'fixed') {
          expect(result.message).toBe('');
        } else {
          expect(result.message.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('suggests the next weight up at 6 reps after a clean 4×8', () => {
    /*
     * Acceptance criterion 8, against the seeded lift itself: the trap bar
     * deadlift runs 6-8 in 2.5 kg steps, so a session of 4×8 all clean earns
     * 82.5 kg and the rows reopen at the bottom of the range.
     */
    const exercise = seeded('trap-bar-deadlift');
    const prescription = seededPrescription('trap-bar-deadlift');
    expect(exercise.progression.repRange).toEqual([6, 8]);
    expect(prescription.reps).toBe('6-8');

    const result = suggestProgression({
      exercise,
      prescription,
      history: [performance([8, 8, 8, 8], 80)],
      weekNumber: 1,
    });
    expect(result.kind).toBe('load-progress');
    expect(exercise.progression.incrementKg).toBe(2.5);
    expect(result.message).toBe('All sets at 8 clean last time → try 82.5 kg');
    expect(result.prefill.weightKg).toBe(82.5);
    expect(result.prefill.reps).toBe(6);
  });

  it('holds the weight while the deadlift is still short of 8s', () => {
    const exercise = seeded('trap-bar-deadlift');
    const result = suggestProgression({
      exercise,
      prescription: seededPrescription('trap-bar-deadlift'),
      history: [performance([8, 8, 7, 6], 80)],
      weekNumber: 1,
    });
    expect(result.kind).toBe('load-hold');
    expect(result.prefill.weightKg).toBe(80);
  });
});
