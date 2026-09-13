/**
 * Turning a prescription into set rows, and working out what to pre-fill them
 * with. Pure.
 *
 * The product rule this serves: logging a set that went as planned takes one tap.
 * That only holds if the row already shows the right numbers, so pre-fill is the
 * whole game here.
 */
import type {
  Block,
  BlockItem,
  Exercise,
  LoggedExercise,
  LoggedSet,
  Prescription,
  ProgrammeDay,
  TrackedField,
  WorkoutSession,
} from '@/types';
import { logsPerSide, setRowCount } from './prescription';
import { bottomOfRange, parseReps } from './reps';

export interface PlannedRow {
  /** Stable across re-renders and reloads: derived from position, not identity. */
  key: string;
  /** 0-based, matching LoggedSet.setIndex. */
  setIndex: number;
  side?: 'L' | 'R';
  /** "1" or "1 L" — what the row shows. */
  label: string;
}

/** The editable values of one row. Only fields the exercise tracks are present. */
export interface RowValues {
  weightKg?: number;
  reps?: number;
  seconds?: number;
  distanceM?: number;
}

/**
 * How many rows of sets to show. The prescription is the floor; a session that
 * already logged beyond it (via Add set) keeps those rows after a reload, and
 * `added` covers rows added in this session but not yet logged.
 */
export function plannedSetCount(
  prescription: Prescription,
  entry: LoggedExercise | undefined,
  added = 0,
): number {
  const loggedBeyond = (entry?.sets ?? []).reduce(
    (max, set) => Math.max(max, set.setIndex + 1),
    0,
  );
  return Math.max(prescription.sets, loggedBeyond) + added;
}

/** One row per set, or two (L and R) where sets are logged per side. */
export function plannedRows(
  prescription: Prescription,
  exercise: Exercise | undefined,
  setCount: number,
): PlannedRow[] {
  const perSide = logsPerSide(prescription, exercise);
  const rows: PlannedRow[] = [];

  for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
    if (perSide) {
      for (const side of ['L', 'R'] as const) {
        rows.push({
          key: `${setIndex}-${side}`,
          setIndex,
          side,
          label: `${setIndex + 1} ${side}`,
        });
      }
    } else {
      rows.push({ key: `${setIndex}`, setIndex, label: `${setIndex + 1}` });
    }
  }

  return rows;
}

/** The logged set matching a row, if it has been completed. */
export function findLoggedSet(
  sets: readonly LoggedSet[],
  row: Pick<PlannedRow, 'setIndex' | 'side'>,
): LoggedSet | undefined {
  return sets.find((set) => set.setIndex === row.setIndex && set.side === row.side);
}

/**
 * The last time an exercise was performed, in any earlier session. Sessions are
 * scanned newest first, and the in-progress session is excluded so today's work
 * does not become its own history.
 */
export function lastPerformance(
  exerciseId: string,
  sessions: readonly WorkoutSession[],
  excludeSessionId?: string,
): LoggedExercise | undefined {
  const candidates = sessions
    .filter((session) => session.id !== excludeSessionId)
    .sort((a, b) => b.startedAt - a.startedAt);

  for (const session of candidates) {
    const entry = session.entries.find(
      (e) => e.exerciseId === exerciseId && e.skipped !== true && e.sets.length > 0,
    );
    if (entry !== undefined) return entry;
  }
  return undefined;
}

export interface PrefillContext {
  prescription: Prescription;
  exercise: Exercise | undefined;
  /** Sets already completed for this exercise in the session being logged. */
  sessionSets: readonly LoggedSet[];
  /** The same exercise the last time it was performed, in an earlier session. */
  previous: LoggedExercise | undefined;
  /**
   * What the progression engine proposes. It supplies only the fields it has an
   * opinion about, so a suggestion that names a weight but not a rep count still
   * lets last week's reps show through.
   */
  suggested?: RowValues;
}

/** Copy only the fields this exercise actually tracks. */
function pick(values: RowValues, tracks: readonly TrackedField[]): RowValues {
  const out: RowValues = {};
  if (tracks.includes('weight') && values.weightKg !== undefined) out.weightKg = values.weightKg;
  if (tracks.includes('reps') && values.reps !== undefined) out.reps = values.reps;
  if (tracks.includes('seconds') && values.seconds !== undefined) out.seconds = values.seconds;
  if (tracks.includes('distance') && values.distanceM !== undefined) {
    out.distanceM = values.distanceM;
  }
  return out;
}

/** What the prescription itself asks for, when there is no history at all. */
function prescribedValues(prescription: Prescription): RowValues {
  const values: RowValues = {};
  const reps = bottomOfRange(parseReps(prescription.reps));
  if (reps !== undefined) values.reps = reps;
  if (prescription.holdSeconds !== undefined) values.seconds = prescription.holdSeconds;
  if (prescription.distanceM !== undefined) values.distanceM = prescription.distanceM;
  return values;
}

/**
 * The values a row opens with.
 *
 * In priority order:
 *   1. The most recent set of this exercise already logged in this session, so
 *      set 2 follows what set 1 actually did rather than dropping back to last
 *      week's number — and the R side follows the L side.
 *   2. The matching set from the last time this exercise was performed, falling
 *      back to that session's final set when this row goes beyond it.
 *   3. The prescription: the bottom of the rep range, the prescribed hold or
 *      distance. Weight is left empty rather than guessed.
 */
export function prefillForRow(row: Pick<PlannedRow, 'setIndex'>, ctx: PrefillContext): RowValues {
  const tracks = ctx.exercise?.tracks ?? [];

  // Layered lowest to highest. Each layer only overrides the fields it defines.
  let values: RowValues = prescribedValues(ctx.prescription);

  const previousSets = ctx.previous?.sets ?? [];
  if (previousSets.length > 0) {
    const matching =
      previousSets.find((set) => set.setIndex === row.setIndex) ??
      previousSets[previousSets.length - 1];
    if (matching !== undefined) {
      values = { ...values, ...stripUndefined(matching) };
    }
  }

  if (ctx.suggested !== undefined) {
    values = { ...values, ...stripUndefined(ctx.suggested) };
  }

  const latestInSession = [...ctx.sessionSets].sort((a, b) => b.completedAt - a.completedAt)[0];
  if (latestInSession !== undefined) {
    values = { ...values, ...stripUndefined(latestInSession) };
  }

  return pick(values, tracks);
}

/** Only the value fields that are actually set, so a layer cannot blank a lower one. */
function stripUndefined(source: RowValues): RowValues {
  const out: RowValues = {};
  if (source.weightKg !== undefined) out.weightKg = source.weightKg;
  if (source.reps !== undefined) out.reps = source.reps;
  if (source.seconds !== undefined) out.seconds = source.seconds;
  if (source.distanceM !== undefined) out.distanceM = source.distanceM;
  return out;
}

/** The matching set from last time, for the row's ghost text. */
export function previousSetFor(
  row: Pick<PlannedRow, 'setIndex' | 'side'>,
  previous: LoggedExercise | undefined,
): LoggedSet | undefined {
  const sets = previous?.sets ?? [];
  return (
    sets.find((set) => set.setIndex === row.setIndex && set.side === row.side) ??
    sets.find((set) => set.setIndex === row.setIndex)
  );
}

/** The step a `+`/`−` press moves a field by. */
export function stepFor(field: TrackedField, plateIncrementKg: number): number {
  switch (field) {
    case 'weight':
      return plateIncrementKg;
    case 'reps':
      return 1;
    case 'seconds':
      return 5;
    case 'distance':
      return 5;
  }
}

/** Weights show a decimal only when they have one: "60 kg", "62.5 kg". */
export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

/**
 * A performance as one line: "4×5 @ 80 kg", "5×45s", "3×20 m @ 40 kg".
 * Used for collapsed cards and the "last time" ghost.
 */
export function summariseSets(
  sets: readonly LoggedSet[],
  exercise: Exercise | undefined,
): string {
  if (sets.length === 0) return '';
  const tracks = exercise?.tracks ?? [];

  const count = sets.length;
  const weights = [...new Set(sets.map((s) => s.weightKg).filter((w) => w !== undefined))];
  const sameWeight = weights.length <= 1;

  const unitOf = (set: LoggedSet): string | undefined => {
    if (tracks.includes('reps') && set.reps !== undefined) return String(set.reps);
    if (tracks.includes('seconds') && set.seconds !== undefined) return `${set.seconds}s`;
    if (tracks.includes('distance') && set.distanceM !== undefined) return `${set.distanceM} m`;
    return undefined;
  };

  const units = sets.map(unitOf).filter((u) => u !== undefined);
  const sameUnit = new Set(units).size <= 1;

  // A varying weight is reported as the top set. Checked before the reps, since
  // identical reps at different loads must not collapse to "4×5" and lose the
  // number that actually moved.
  if (!sameWeight) {
    const top = sets.reduce((best, set) =>
      (set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best,
    );
    const topUnit = unitOf(top);
    const topWeight = top.weightKg === undefined ? '' : ` @ ${formatWeight(top.weightKg)} kg`;
    return `${count} sets · top ${topUnit ?? ''}${topWeight}`.replace('top  @', 'top @');
  }

  const load =
    tracks.includes('weight') && weights[0] !== undefined
      ? ` @ ${formatWeight(weights[0])} kg`
      : '';

  if (units.length === 0) return `${count} set${count === 1 ? '' : 's'}${load}`;

  if (sameUnit) return `${count}×${units[0]}${load}`;

  // Mixed efforts at one load: show them rather than averaging away a set that
  // fell short.
  return `${units.join('/')}${load}`;
}

/** A block item paired with the block it came from, in the order they are worked. */
export interface WorkoutItem {
  block: Block;
  item: BlockItem;
  /** Position in the day, used as the card's stable key. */
  index: number;
}

/** The day as a flat, ordered list of cards. A superset stays one card. */
export function workoutItems(day: ProgrammeDay | undefined): WorkoutItem[] {
  const items: WorkoutItem[] = [];
  let index = 0;
  for (const block of day?.blocks ?? []) {
    for (const item of block.items) {
      items.push({ block, item, index });
      index += 1;
    }
  }
  return items;
}

/** The prescriptions a card covers: one, or both halves of a superset. */
export function itemPrescriptions(item: BlockItem): Prescription[] {
  return item.kind === 'single' ? [item.prescription] : item.prescriptions;
}

export interface PrescriptionProgress {
  logged: number;
  planned: number;
  /** Every planned row logged, or the exercise deliberately skipped. */
  complete: boolean;
  skipped: boolean;
}

export function prescriptionProgress(
  prescription: Prescription,
  exercise: Exercise | undefined,
  entry: LoggedExercise | undefined,
): PrescriptionProgress {
  const setCount = plannedSetCount(prescription, entry);
  const planned = setRowCount({ ...prescription, sets: setCount }, exercise);
  const logged = entry?.sets.length ?? 0;
  const skipped = entry?.skipped === true;
  return { logged, planned, complete: skipped || (planned > 0 && logged >= planned), skipped };
}

/** A card is done when every exercise on it is done. */
export function itemComplete(
  item: BlockItem,
  session: WorkoutSession | undefined,
  exerciseById: (id: string) => Exercise | undefined,
): boolean {
  return itemPrescriptions(item).every((prescription) => {
    const entry = session?.entries.find((e) => e.exerciseId === prescription.exerciseId);
    return prescriptionProgress(prescription, exerciseById(prescription.exerciseId), entry).complete;
  });
}

/**
 * The card to expand: the first one not yet finished. Returns -1 once the whole
 * day is done, so the screen can show the finish state instead.
 */
export function currentItemIndex(
  day: ProgrammeDay | undefined,
  session: WorkoutSession | undefined,
  exerciseById: (id: string) => Exercise | undefined,
): number {
  const items = workoutItems(day);
  const found = items.find(({ item }) => !itemComplete(item, session, exerciseById));
  return found?.index ?? -1;
}

/**
 * Every past performance of an exercise, newest first. The progression engine
 * needs the run of sessions, not just the last one: stalls are two deep and the
 * Copenhagen's lever prompt is four.
 */
export function performanceHistory(
  exerciseId: string,
  sessions: readonly WorkoutSession[],
  excludeSessionId?: string,
): LoggedExercise[] {
  return sessions
    .filter((session) => session.id !== excludeSessionId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .flatMap((session) =>
      session.entries.filter(
        (entry) => entry.exerciseId === exerciseId && entry.skipped !== true && entry.sets.length > 0,
      ),
    );
}
