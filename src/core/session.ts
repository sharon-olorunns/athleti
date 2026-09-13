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
import { prescriptionsOf, setRowCount } from './prescription';
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
    const entry = entryFor(next, prescription.exerciseId);
    if (entry === undefined || entry.sets.length === 0) {
      next = setSkipped(next, prescription.exerciseId, true);
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
    const exercise = exerciseById(prescription.exerciseId);
    const entry = entryFor(session, prescription.exerciseId);
    const setCount = plannedSetCount(prescription, entry);
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
