/**
 * The progression engine. Pure.
 *
 * Each exercise declares one of four progression currencies and the app prompts
 * for that one only. The binding rule: never suggest adding weight to an exercise
 * whose rule says otherwise. Adding load to a jump turns it into a strength
 * exercise and deletes the point of it, so `quality` and `neverAddLoad` never
 * produce a weight suggestion under any circumstance.
 */
import type { Exercise, LoggedExercise, LoggedSet, Prescription, ProgressionType } from '@/types';
import { deloadSets, isDeloadWeek } from './schedule';
import { parseReps, topOfRange } from './reps';
import type { RowValues } from './workout';
import { formatWeight } from './workout';

export type SuggestionKind =
  | 'none'
  | 'load-start'
  | 'load-progress'
  | 'load-hold'
  | 'load-stalled'
  | 'quality'
  | 'time-start'
  | 'time-progress'
  | 'time-hold';

export interface ProgressionSuggestion {
  type: ProgressionType;
  kind: SuggestionKind;
  /** The banner line, shown verbatim. Empty for `fixed`, which gets no banner. */
  message: string;
  /** A second line: the stall warning, the Copenhagen lever prompt. */
  hint?: string;
  /**
   * What to open the set rows with. Empty when the engine has no opinion and the
   * ordinary history pre-fill should stand.
   */
  prefill: RowValues;
  /** Sets to show, after any deload cut. */
  suggestedSets: number;
  /** True when this week's sets were cut for a deload. */
  deloaded: boolean;
}

export interface ProgressionInput {
  exercise: Exercise;
  prescription: Prescription;
  /** Past performances of this exercise, newest first, excluding the live session. */
  history: readonly LoggedExercise[];
  weekNumber: number;
}

/** Round a computed weight onto the increment, so suggestions land on real plates. */
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/**
 * The weight a performance was actually worked at. For an inverse exercise the
 * assistance is the load being removed, so the hardest set is the lightest one.
 */
export function workingWeight(
  sets: readonly LoggedSet[],
  inverse = false,
): number | undefined {
  const weights = sets.map((s) => s.weightKg).filter((w): w is number => w !== undefined);
  if (weights.length === 0) return undefined;
  return inverse ? Math.min(...weights) : Math.max(...weights);
}

/** Every set reached the rep target and every one was clean. */
function allRepsAtTargetClean(sets: readonly LoggedSet[], target: number): boolean {
  if (sets.length === 0) return false;
  return sets.every((set) => set.wasClean && (set.reps ?? 0) >= target);
}

/** Every set held at least the prescribed time and every one was clean. */
function allHoldsCompleteClean(sets: readonly LoggedSet[], target: number): boolean {
  if (sets.length === 0) return false;
  return sets.every((set) => set.wasClean && (set.seconds ?? 0) >= target);
}

/** "4×7" when the sets match, "8/8/7" when they do not. */
function repsSummary(sets: readonly LoggedSet[]): string {
  const reps = sets.map((s) => s.reps).filter((r): r is number => r !== undefined);
  if (reps.length === 0) return `${sets.length} sets`;
  const unique = [...new Set(reps)];
  return unique.length === 1 ? `${reps.length}×${unique[0]}` : reps.join('/');
}

function secondsSummary(sets: readonly LoggedSet[]): string {
  const seconds = sets.map((s) => s.seconds).filter((v): v is number => v !== undefined);
  if (seconds.length === 0) return `${sets.length} sets`;
  const unique = [...new Set(seconds)];
  return unique.length === 1 ? `${seconds.length} × ${unique[0]}s` : seconds.map((s) => `${s}s`).join('/');
}

/** The best reps reached in a performance, for comparing two sessions. */
function topReps(sets: readonly LoggedSet[]): number {
  return sets.reduce((best, set) => Math.max(best, set.reps ?? 0), 0);
}

/**
 * Two sessions stuck at the same weight and reps, neither of which earned the
 * next step up.
 */
function isStalled(
  history: readonly LoggedExercise[],
  repTarget: number,
  inverse: boolean,
): boolean {
  const [last, previous] = history;
  if (last === undefined || previous === undefined) return false;
  if (allRepsAtTargetClean(last.sets, repTarget)) return false;
  if (allRepsAtTargetClean(previous.sets, repTarget)) return false;

  const lastWeight = workingWeight(last.sets, inverse);
  const previousWeight = workingWeight(previous.sets, inverse);
  if (lastWeight !== previousWeight) return false;

  return topReps(last.sets) === topReps(previous.sets);
}

/**
 * Consecutive recent sessions where every hold met the prescribed time cleanly.
 * Drives the Copenhagen's lever prompt.
 */
function cleanHoldStreak(history: readonly LoggedExercise[], target: number): number {
  let streak = 0;
  for (const entry of history) {
    if (!allHoldsCompleteClean(entry.sets, target)) break;
    streak += 1;
  }
  return streak;
}

/** The last two performances both answered "no" to the quality question. */
function qualityDropping(history: readonly LoggedExercise[]): boolean {
  const [last, previous] = history;
  return last?.qualityConfirmed === false && previous?.qualityConfirmed === false;
}

/**
 * The binary question asked after a `quality` exercise, built from its own label:
 * "↑ Bar speed" becomes "Was bar speed maintained on every rep?".
 */
export function qualityQuestion(
  exercise: Exercise,
  prescription: Prescription,
): string | undefined {
  if (exercise.progression.type !== 'quality') return undefined;
  // Strip the arrow, and keep the first clause: "↑ Distance, quiet landings"
  // asks about distance rather than reading back the whole label.
  const subject = exercise.progression.label
    .replace(/^[↑↓]\s*/u, '')
    .split(',')[0]
    ?.trim()
    .toLowerCase();
  if (subject === undefined || subject === '') return undefined;
  const unit = prescription.timerMode === 'interval' ? 'every round' : 'every rep';
  return `Was ${subject} maintained on ${unit}?`;
}

function loadSuggestion(input: ProgressionInput, sets: number): ProgressionSuggestion {
  const { exercise, prescription, history } = input;
  const rule = exercise.progression;
  const inverse = rule.inverse === true;
  const increment = rule.incrementKg ?? 0;

  // The prescription's reps win over the rule's range: the range describes the
  // exercise, the prescription describes today.
  const spec = parseReps(prescription.reps);
  const repTarget = topOfRange(spec) ?? rule.repRange?.[1] ?? 0;
  const repFloor = rule.repRange?.[0] ?? (spec.kind === 'range' ? spec.min : repTarget);

  const base = { type: 'load' as const, suggestedSets: sets, deloaded: false };
  const last = history[0];

  if (last === undefined || last.sets.length === 0) {
    return {
      ...base,
      kind: 'load-start',
      message: `First time logged — find a working weight for ${repTarget || '?'} reps.`,
      prefill: repFloor > 0 ? { reps: repFloor } : {},
    };
  }

  const lastWeight = workingWeight(last.sets, inverse);

  if (repTarget > 0 && allRepsAtTargetClean(last.sets, repTarget)) {
    if (lastWeight === undefined || increment <= 0) {
      return {
        ...base,
        kind: 'load-progress',
        message: `All sets at ${repTarget} clean last time → add a step.`,
        prefill: repFloor > 0 ? { reps: repFloor } : {},
      };
    }
    // Inverse runs backwards: the assistance comes down, and the copy says so.
    const next = inverse
      ? Math.max(0, lastWeight - increment)
      : lastWeight + increment;
    return {
      ...base,
      kind: 'load-progress',
      message: inverse
        ? `All sets at ${repTarget} clean last time → assistance down to ${formatWeight(next)} kg`
        : `All sets at ${repTarget} clean last time → try ${formatWeight(next)} kg`,
      prefill: {
        weightKg: next,
        ...(repFloor > 0 ? { reps: repFloor } : {}),
      },
    };
  }

  if (isStalled(history, repTarget, inverse)) {
    if (lastWeight === undefined) {
      return {
        ...base,
        kind: 'load-stalled',
        message: 'Stalled two weeks — back off for one session, then rebuild.',
        prefill: {},
      };
    }
    /*
     * The spec's 60% cut is written for load that goes up. On an inverse
     * exercise, 60% of the assistance is a harder set, not an easier one, so the
     * same intent — back off, then rebuild — is expressed as one step more
     * assistance instead.
     */
    const backedOff = inverse
      ? lastWeight + increment
      : roundToIncrement(lastWeight * 0.6, increment);
    return {
      ...base,
      kind: 'load-stalled',
      message: inverse
        ? `Stalled two weeks — assistance back up to ${formatWeight(backedOff)} kg for one session, then rebuild.`
        : 'Stalled two weeks — drop to 60% for one session, then rebuild.',
      prefill: { weightKg: backedOff },
    };
  }

  const weightText = lastWeight === undefined ? '' : ` @ ${formatWeight(lastWeight)} kg`;
  return {
    ...base,
    kind: 'load-hold',
    message: `Last time ${repsSummary(last.sets)}${weightText}. Aim for ${repTarget}s.`,
    prefill: lastWeight === undefined ? {} : { weightKg: lastWeight },
  };
}

function qualitySuggestion(input: ProgressionInput, sets: number): ProgressionSuggestion {
  const { exercise, history } = input;
  const last = history[0];

  /*
   * No weight suggestion is produced here under any circumstance. A quality
   * exercise that still carries load keeps last session's weight through the
   * ordinary history pre-fill, which is why `prefill` stays empty.
   */
  const lastWeight = last === undefined ? undefined : workingWeight(last.sets);
  const trailing =
    last === undefined
      ? ''
      : ` · last time ${repsSummary(last.sets)}${
          lastWeight === undefined ? '' : ` @ ${formatWeight(lastWeight)} kg`
        }`;

  return {
    type: 'quality',
    kind: 'quality',
    message: `${exercise.progression.label}${trailing}`,
    ...(qualityDropping(history)
      ? { hint: 'Quality dropping — reduce sets rather than pushing through.' }
      : {}),
    prefill: {},
    suggestedSets: sets,
    deloaded: false,
  };
}

function timeSuggestion(input: ProgressionInput, sets: number): ProgressionSuggestion {
  const { exercise, prescription, history } = input;
  const rule = exercise.progression;
  const increment = rule.holdIncrementSeconds ?? 0;
  const target = prescription.holdSeconds ?? 0;
  const base = { type: 'time' as const, suggestedSets: sets, deloaded: false };
  const last = history[0];

  /*
   * The lever prompt, from the rule rather than from an exercise id: the seed
   * marks the Copenhagen with "↑ Lever length", and its own note explains that
   * the lever is the progression. Four clean sessions at the prescribed hold and
   * the app says so — as text, never as an automated change.
   */
  const leverRule = rule.label.toLowerCase().includes('lever');
  const streak = target > 0 ? cleanHoldStreak(history, target) : 0;
  const leverHint =
    leverRule && streak >= 4
      ? { hint: 'Four sessions at the top — move toward ankle-supported.' }
      : {};

  if (last === undefined || last.sets.length === 0) {
    return {
      ...base,
      ...leverHint,
      kind: 'time-start',
      message: target > 0 ? `First time logged — hold ${target}s.` : rule.label,
      prefill: target > 0 ? { seconds: target } : {},
    };
  }

  /*
   * A `time` rule does not always mean "hold longer". The banded lateral walk
   * pins holdIncrementSeconds to 0 because it progresses by band stiffness, and
   * others progress by reps or range and omit it. Only a positive increment may
   * produce a "try 50s" suggestion.
   */
  if (increment > 0 && target > 0 && allHoldsCompleteClean(last.sets, target)) {
    return {
      ...base,
      ...leverHint,
      kind: 'time-progress',
      message: `All ${secondsSummary(last.sets)} held → try ${target + increment}s`,
      prefill: { seconds: target + increment },
    };
  }

  const lastSummary =
    target > 0 ? `Last time ${secondsSummary(last.sets)}. ` : `Last time ${repsSummary(last.sets)}. `;
  return {
    ...base,
    ...leverHint,
    kind: 'time-hold',
    message: `${lastSummary}${rule.label}`,
    prefill: target > 0 ? { seconds: target } : {},
  };
}

/**
 * How many sets to show today: the prescription, cut for a deload week.
 *
 * The single place the deload rule lives, so the set rows, the card header and
 * the session's completion total cannot disagree with each other.
 *
 * `fixed` is exempt. Warm-ups, mobility and the agility ladder sit outside the
 * progression machinery — trimming them buys no recovery, it just means warming
 * up less.
 */
export function suggestedSetsFor(
  exercise: Exercise | undefined,
  prescription: Prescription,
  weekNumber: number,
): number {
  if (exercise === undefined || exercise.progression.type === 'fixed') return prescription.sets;
  if (!isDeloadWeek(weekNumber)) return prescription.sets;
  return deloadSets(prescription.sets);
}

/**
 * What to prompt for this exercise today.
 *
 * `fixed` returns a suggestion with no message: warm-ups, mobility and the
 * agility ladder get no banner, no prompt and no chart, because progressing them
 * only adds fatigue.
 */
export function suggestProgression(input: ProgressionInput): ProgressionSuggestion {
  const { exercise, prescription, weekNumber } = input;
  const type = exercise.progression.type;

  if (type === 'fixed') {
    return {
      type,
      kind: 'none',
      message: '',
      prefill: {},
      suggestedSets: prescription.sets,
      deloaded: false,
    };
  }

  // Deload cuts volume and holds intensity: the set count drops, the weight
  // suggestion is untouched.
  const sets = suggestedSetsFor(exercise, prescription, weekNumber);
  const deloaded = sets !== prescription.sets;

  const suggestion =
    type === 'load'
      ? loadSuggestion(input, sets)
      : type === 'quality'
        ? qualitySuggestion(input, sets)
        : timeSuggestion(input, sets);

  return { ...suggestion, suggestedSets: sets, deloaded };
}

/** The session-level deload banner. */
export function deloadBanner(weekNumber: number): string | undefined {
  if (!isDeloadWeek(weekNumber)) return undefined;
  return `Week ${weekNumber} is a deload — same weights, fewer sets. Volume down, intensity held.`;
}
