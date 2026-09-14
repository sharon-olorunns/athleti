/**
 * The pull-up ladder (section 8b). Pure.
 *
 * The user is working toward a first unassisted pull-up, which is a staged
 * progression rather than one exercise that gets heavier. The seed carries four
 * stages; the app carries which stage the user is on; this module joins them, so
 * the pull-up slots in the programme show the right work without anyone having to
 * remember what stage they are on.
 *
 * Advancing is never automatic. The gates are judgement calls ("a controlled
 * 8-second negative"), and an app that guesses at those would move the user on
 * before they were ready.
 */
import type {
  BlockItem,
  LadderPrescription,
  LadderStage,
  Prescription,
  ProgrammeDay,
  WorkoutSession,
} from '@/types';

/** Every exercise the ladder can ever prescribe. A slot is any prescription of one. */
export function ladderExerciseIds(ladder: readonly LadderStage[]): Set<string> {
  return new Set(ladder.flatMap((s) => s.prescriptions.map((p) => p.exerciseId)));
}

/** Stages are 1-indexed; anything outside the ladder clamps to its ends. */
export function clampStage(ladder: readonly LadderStage[], stage: number): number {
  if (ladder.length === 0) return 1;
  return Math.min(Math.max(Math.trunc(stage) || 1, 1), ladder.length);
}

export function stageFor(
  ladder: readonly LadderStage[],
  stage: number,
): LadderStage | undefined {
  return ladder[clampStage(ladder, stage) - 1];
}

/** The criterion for moving up, or undefined on the last stage. */
export function gateFor(ladder: readonly LadderStage[], stage: number): string | undefined {
  return stageFor(ladder, stage)?.gate ?? undefined;
}

/** There is somewhere to go, and a gate that says when. */
export function canAdvance(ladder: readonly LadderStage[], stage: number): boolean {
  return clampStage(ladder, stage) < ladder.length;
}

export function nextStage(ladder: readonly LadderStage[], stage: number): number {
  return clampStage(ladder, clampStage(ladder, stage) + 1);
}

/**
 * Stage 3 onward opens with an unassisted attempt, fresh, before anything else —
 * the whole point of the ladder, and the thing worth counting.
 */
export function attemptsUnassisted(ladder: readonly LadderStage[], stage: number): boolean {
  return stageFor(ladder, stage)?.attemptUnassistedFirst === true;
}

/**
 * Overlay a stage's prescription onto the programme slot it lands in.
 *
 * The slot owns how the work is run — rest, per side, whether a set is timed —
 * and the stage owns what the work is. Keeping that split means a stage can be
 * dropped into either day's pull-up slot without carrying that day's rest with it.
 */
function applyStage(slot: Prescription, stage: LadderPrescription): Prescription {
  const timed = stage.holdSeconds !== undefined;
  const {
    reps: _reps,
    holdSeconds: _hold,
    distanceM: _distance,
    interval: _interval,
    note: _note,
    ...rest
  } = slot;

  return {
    ...rest,
    exerciseId: stage.exerciseId,
    sets: stage.sets,
    ...(stage.reps !== undefined ? { reps: stage.reps } : {}),
    ...(timed ? { holdSeconds: stage.holdSeconds } : {}),
    // An interval slot would make no sense for a hang or a negative, so the mode
    // follows what the stage actually prescribes.
    timerMode: timed ? 'hold' : 'rest',
    // Only the stage's note survives. The slot notes in the seed are written for
    // whichever rung the slot held when it was authored ("Ladder stage 2"), so
    // carrying one onto a different stage's exercise would be a lie — and what
    // they say is shown structurally now anyway, as the stage name and its gate.
    ...(stage.note !== undefined ? { note: stage.note } : {}),
  };
}

/**
 * How a stage's prescriptions are shared between the programme's pull-up slots.
 *
 * Stages carry between one and three prescriptions and the programme carries two
 * slots, so neither "put them all in every slot" nor "one each" works on its own.
 * Dealing them round-robin does: with three prescriptions over two slots every
 * prescription still gets run in the week, and with one prescription over two
 * slots — stage 4, where the work is simply "attempt pull-ups" — both slots run it.
 */
export function dealStage(
  prescriptions: readonly LadderPrescription[],
  slotCount: number,
): LadderPrescription[][] {
  if (slotCount <= 0 || prescriptions.length === 0) return [];

  const dealt: LadderPrescription[][] = Array.from({ length: slotCount }, () => []);
  prescriptions.forEach((prescription, index) => {
    dealt[index % slotCount]?.push(prescription);
  });

  // Fewer prescriptions than slots: cycle rather than leave a slot empty, which
  // would silently drop the pull-up out of that day.
  for (let slot = 0; slot < slotCount; slot += 1) {
    const hand = dealt[slot];
    if (hand !== undefined && hand.length === 0) {
      const fallback = prescriptions[slot % prescriptions.length];
      if (fallback !== undefined) hand.push(fallback);
    }
  }

  return dealt;
}

/** Slots are counted across the whole programme, in day then block then item order. */
function countSlots(days: readonly ProgrammeDay[], ids: ReadonlySet<string>): number {
  let count = 0;
  for (const day of days) {
    for (const block of day.blocks) {
      for (const item of block.items) {
        const prescriptions =
          item.kind === 'single' ? [item.prescription] : item.prescriptions;
        count += prescriptions.filter((p) => ids.has(p.exerciseId)).length;
      }
    }
  }
  return count;
}

/**
 * Resolve every pull-up slot in the programme to the current stage.
 *
 * Returns the days unchanged when there is no ladder, so a programme without one
 * costs nothing.
 */
export function resolveLadder(
  days: readonly ProgrammeDay[],
  ladder: readonly LadderStage[],
  stage: number,
): ProgrammeDay[] {
  const current = stageFor(ladder, stage);
  if (current === undefined || current.prescriptions.length === 0) return [...days];

  const ids = ladderExerciseIds(ladder);
  const slotCount = countSlots(days, ids);
  if (slotCount === 0) return [...days];

  const hands = dealStage(current.prescriptions, slotCount);
  let slot = 0;

  /** Replace one slot prescription with the hand dealt to it. */
  const expand = (prescription: Prescription): Prescription[] => {
    if (!ids.has(prescription.exerciseId)) return [prescription];
    const hand = hands[slot] ?? [];
    slot += 1;
    return hand.map((stagePrescription) => applyStage(prescription, stagePrescription));
  };

  return days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => ({
      ...block,
      items: block.items.flatMap((item): BlockItem[] => {
        if (item.kind === 'single') {
          // A slot dealt two prescriptions becomes two entries, not a superset:
          // they are separate pieces of work that happen to share a slot.
          return expand(item.prescription).map((prescription) => ({
            kind: 'single' as const,
            prescription,
          }));
        }
        return [{ ...item, prescriptions: item.prescriptions.flatMap(expand) }];
      }),
    })),
  }));
}

/** What the unassisted attempts add up to, for the Progress screen. */
export interface AttemptRecord {
  /** Sessions that asked the question at all — stage 3 and up. */
  asked: number;
  attempted: number;
  /** Consecutive most recent asked sessions where the attempt was made. */
  streak: number;
  successes: number;
  /** When the first rep went up. The milestone the ladder exists for. */
  firstSuccessAt?: number;
}

/**
 * Attempts across the history.
 *
 * The streak counts the habit — showing up to the bar fresh — and stops at the
 * first session that was asked and skipped it. A failed attempt keeps the streak:
 * missing the rep is the expected outcome right up until it is not.
 */
export function unassistedAttempts(sessions: readonly WorkoutSession[]): AttemptRecord {
  const asked = sessions
    .filter((session) => session.unassistedAttempt !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt);

  let streak = 0;
  for (const session of asked) {
    if (session.unassistedAttempt !== true) break;
    streak += 1;
  }

  const successes = asked.filter((session) => session.unassistedSuccess === true);
  const first = successes.at(-1);

  return {
    asked: asked.length,
    attempted: asked.filter((session) => session.unassistedAttempt === true).length,
    streak,
    successes: successes.length,
    ...(first !== undefined ? { firstSuccessAt: first.startedAt } : {}),
  };
}
