/**
 * Session construction and immutable updates. Pure.
 *
 * Every function returns a new session rather than mutating, so the store can
 * write the result to IndexedDB on every change — a closed tab or a dead battery
 * must lose nothing already logged.
 */
import type {
  Exercise,
  LoggedExercise,
  LoggedSet,
  ProgrammeDay,
  WorkoutSession,
} from '@/types';
import { effectiveExerciseId } from './alternatives';
import { prescriptionsOf, setRowCount } from './prescription';
import { suggestedSetsFor } from './progression';
import { plannedSetCount } from './workout';

/** Session ids are only ever local, so time plus randomness is enough. */
export function newSessionId(now: number, random: () => number = Math.random): string {
  return `s-${now.toString(36)}-${Math.floor(random() * 1e6).toString(36)}`;
}

export function createSession(
  programmeDayId: string,
  weekNumber: number,
  now: number,
  id = newSessionId(now),
): WorkoutSession {
  return { id, programmeDayId, weekNumber, startedAt: now, entries: [] };
}

/** The logged entry for an exercise, if the session has one. */
export function entryFor(
  session: WorkoutSession,
  exerciseId: string,
): LoggedExercise | undefined {
  return session.entries.find((entry) => entry.exerciseId === exerciseId);
}

function withEntry(
  session: WorkoutSession,
  exerciseId: string,
  update: (entry: LoggedExercise) => LoggedExercise,
): WorkoutSession {
  const existing = entryFor(session, exerciseId);
  const base: LoggedExercise = existing ?? { exerciseId, sets: [] };
  const next = update(base);

  const entries =
    existing === undefined
      ? [...session.entries, next]
      : session.entries.map((entry) => (entry.exerciseId === exerciseId ? next : entry));

  return { ...session, entries };
}

/** Sets stay ordered by set index then side, so L always reads before R. */
function sortSets(sets: LoggedSet[]): LoggedSet[] {
  return [...sets].sort((a, b) =>
    a.setIndex === b.setIndex ? (a.side ?? '').localeCompare(b.side ?? '') : a.setIndex - b.setIndex,
  );
}

/**
 * Record a completed set, replacing any previous log of the same row so that
 * re-completing an edited row updates rather than duplicates it.
 */
export function logSet(
  session: WorkoutSession,
  exerciseId: string,
  set: LoggedSet,
): WorkoutSession {
  return withEntry(session, exerciseId, (entry) => {
    // Logging into a skipped exercise un-skips it: the user clearly did it. The
    // flag is dropped rather than set false, so exports carry no dead fields.
    const { skipped: _wasSkipped, ...rest } = entry;
    return {
      ...rest,
      sets: sortSets([
        ...entry.sets.filter((s) => !(s.setIndex === set.setIndex && s.side === set.side)),
        set,
      ]),
    };
  });
}

/** Un-complete a row. The exercise entry stays, so its other sets are untouched. */
export function unlogSet(
  session: WorkoutSession,
  exerciseId: string,
  setIndex: number,
  side: 'L' | 'R' | undefined,
): WorkoutSession {
  const existing = entryFor(session, exerciseId);
  if (existing === undefined) return session;
  return withEntry(session, exerciseId, (entry) => ({
    ...entry,
    sets: entry.sets.filter((s) => !(s.setIndex === setIndex && s.side === side)),
  }));
}

/**
 * Record a substitution for this session. The entry logs what is actually being
 * performed and what the programme prescribed, so history stays honest; the
 * programme itself is never touched.
 */
export function substituteExercise(
  session: WorkoutSession,
  prescribedId: string,
  performedId: string,
  reason?: string,
): WorkoutSession {
  // Clear any earlier substitution for the same slot, and any untouched entry
  // for the prescribed exercise, so swapping twice does not leave a trail.
  const entries = session.entries.filter((entry) => {
    if (entry.substitutedForId === prescribedId) return entry.sets.length > 0;
    if (entry.exerciseId === prescribedId) return entry.sets.length > 0;
    return true;
  });

  if (performedId === prescribedId) return { ...session, entries };

  const existing = entries.find((entry) => entry.exerciseId === performedId);
  const substituted: LoggedExercise = {
    ...(existing ?? { exerciseId: performedId, sets: [] }),
    exerciseId: performedId,
    substitutedForId: prescribedId,
    ...(reason !== undefined && reason !== '' ? { substitutionReason: reason } : {}),
  };

  return {
    ...session,
    entries:
      existing === undefined
        ? [...entries, substituted]
        : entries.map((entry) => (entry.exerciseId === performedId ? substituted : entry)),
  };
}

/** Undo a substitution, returning the slot to what the programme prescribes. */
export function clearSubstitution(
  session: WorkoutSession,
  prescribedId: string,
): WorkoutSession {
  return {
    ...session,
    entries: session.entries.filter(
      (entry) => !(entry.substitutedForId === prescribedId && entry.sets.length === 0),
    ),
  };
}

/** The 0–10 score for one exercise. Optional, and never blocking. */
export function setPainScore(
  session: WorkoutSession,
  exerciseId: string,
  score: number,
): WorkoutSession {
  return withEntry(session, exerciseId, (entry) => ({ ...entry, painScore: score }));
}

/** Asked once at the start of a session, and once at the end. Both optional. */
export function setSessionPainScore(
  session: WorkoutSession,
  which: 'pre' | 'post',
  score: number,
): WorkoutSession {
  return which === 'pre'
    ? { ...session, prePainScore: score }
    : { ...session, postPainScore: score };
}

/**
 * The fresh unassisted attempt that opens stages 3 and 4 of the pull-up ladder.
 *
 * Two flags rather than one: whether it was attempted, which is the habit worth
 * keeping a streak of, and whether it went up, because the first rep that does is
 * the milestone the whole ladder exists for. A miss is still an attempt.
 */
export function setUnassistedAttempt(
  session: WorkoutSession,
  attempted: boolean,
  succeeded = false,
): WorkoutSession {
  return {
    ...session,
    unassistedAttempt: attempted,
    unassistedSuccess: attempted && succeeded,
  };
}

/**
 * The answer to the binary quality question asked after a `quality` exercise:
 * was bar speed, height or distance maintained on every rep.
 */
export function setQualityConfirmed(
  session: WorkoutSession,
  exerciseId: string,
  confirmed: boolean,
): WorkoutSession {
  return withEntry(session, exerciseId, (entry) => ({ ...entry, qualityConfirmed: confirmed }));
}

/** Mark an exercise skipped, or un-skip it. */
export function setSkipped(
  session: WorkoutSession,
  exerciseId: string,
  skipped: boolean,
): WorkoutSession {
  return withEntry(session, exerciseId, (entry) => ({ ...entry, skipped }));
}

export function setSessionNotes(session: WorkoutSession, notes: string): WorkoutSession {
  const trimmed = notes.trim();
  if (trimmed === '') {
    const { notes: _dropped, ...rest } = session;
    return rest;
  }
  return { ...session, notes: trimmed };
}

/** Close the session. Already-finished sessions keep their original finish time. */
export function finishSession(session: WorkoutSession, now: number): WorkoutSession {
  if (session.finishedAt !== undefined) return session;
  return { ...session, finishedAt: now };
}

/**
 * Mark every exercise with no logged sets as skipped — what the inline prompt on
 * Finish offers when rows remain unlogged.
 */
export function skipUnloggedExercises(
  session: WorkoutSession,
  day: ProgrammeDay,
): WorkoutSession {
  let next = session;
  for (const prescription of prescriptionsOf(day)) {
    // A swapped slot is skipped under what was actually going to be performed,
    // so finishing does not invent an entry for the exercise that was replaced.
    const performedId = effectiveExerciseId(next, prescription.exerciseId);
    const entry = entryFor(next, performedId);
    if (entry === undefined || entry.sets.length === 0) {
      next = setSkipped(next, performedId, true);
    }
  }
  return next;
}

export interface SessionStats {
  /** Set rows actually completed. */
  completedSets: number;
  /** Set rows the day prescribes, grown by any extra sets logged. */
  plannedSets: number;
  /** 0–100, rounded. */
  completionPct: number;
  /** Elapsed for a live session, total for a finished one. */
  durationMs: number;
  /** True when every prescribed row is logged. */
  allSetsCompleted: boolean;
}

export function sessionStats(
  session: WorkoutSession,
  day: ProgrammeDay | undefined,
  exerciseById: (id: string) => Exercise | undefined,
  now = Date.now(),
): SessionStats {
  const completedSets = session.entries.reduce((sum, entry) => sum + entry.sets.length, 0);

  let plannedSets = 0;
  for (const prescription of prescriptionsOf(day ?? emptyDay)) {
    const performedId = effectiveExerciseId(session, prescription.exerciseId);
    const exercise = exerciseById(performedId);
    const entry = entryFor(session, performedId);
    // The same deload-aware count the cards show, so the total cannot disagree.
    const suggested = suggestedSetsFor(exercise, prescription, session.weekNumber);
    const setCount = plannedSetCount({ ...prescription, sets: suggested }, entry);
    plannedSets += setRowCount({ ...prescription, sets: setCount }, exercise);
  }

  const durationMs = (session.finishedAt ?? now) - session.startedAt;
  const completionPct =
    plannedSets === 0 ? 0 : Math.round((completedSets / plannedSets) * 100);

  return {
    completedSets,
    plannedSets,
    completionPct,
    durationMs,
    allSetsCompleted: plannedSets > 0 && completedSets >= plannedSets,
  };
}

const emptyDay: ProgrammeDay = {
  id: '',
  dayLabel: '',
  title: '',
  cnsLoad: 'low',
  targetMinutes: 0,
  atHome: false,
  blocks: [],
};

/** "34:12", or "1:04:12" once past an hour. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** "58 min" — a finished session's length, for History and the Today summary. */
export function durationLabel(ms: number): string {
  const minutes = Math.round(ms / 60000);
  // A session shorter than a minute is real; reporting it as "0 min" is not.
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
