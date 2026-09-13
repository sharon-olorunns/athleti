/**
 * Typed accessors over Dexie. Screens talk to this, never to raw tables, so the
 * storage shape stays swappable and every write goes through one place.
 */
import type {
  Exercise,
  MorningCheck,
  Settings,
  TimerState,
  WorkoutSession,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { db, getMeta, META_KEYS, setMeta, SINGLETON_ID, type ProgrammeRow } from './db';

export async function getProgramme(): Promise<ProgrammeRow | undefined> {
  const all = await db.programmes.toArray();
  return all[0];
}

export async function getAllExercises(): Promise<Exercise[]> {
  return db.exercises.toArray();
}

/** The library as a lookup, which is how every screen actually needs it. */
export async function getExerciseMap(): Promise<Map<string, Exercise>> {
  const all = await getAllExercises();
  return new Map(all.map((e) => [e.id, e]));
}

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get(SINGLETON_ID);
  if (row === undefined) return { ...DEFAULT_SETTINGS };
  const { id: _id, ...settings } = row;
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ id: SINGLETON_ID, ...settings });
}

/** Epoch ms of programme week 1. Falls back to today if somehow unset. */
export async function getProgrammeStartedAt(): Promise<number> {
  const stored = await getMeta<number>(META_KEYS.programmeStartedAt);
  if (stored !== undefined) return stored;
  const now = Date.now();
  await setMeta(META_KEYS.programmeStartedAt, now);
  return now;
}

/** Sessions newest first, for History. */
export async function getSessions(limit?: number): Promise<WorkoutSession[]> {
  const query = db.sessions.orderBy('startedAt').reverse();
  return limit === undefined ? query.toArray() : query.limit(limit).toArray();
}

export async function getSession(id: string): Promise<WorkoutSession | undefined> {
  return db.sessions.get(id);
}

/** The most recently started session, finished or not. */
export async function getLastSession(): Promise<WorkoutSession | undefined> {
  const [latest] = await getSessions(1);
  return latest;
}

/** Persist on every mutation — a dead battery mid-workout must lose nothing. */
export async function putSession(session: WorkoutSession): Promise<void> {
  await db.sessions.put(session);
}

export async function getMorningChecks(): Promise<MorningCheck[]> {
  return db.morningChecks.orderBy('date').toArray();
}

export async function putMorningCheck(check: MorningCheck): Promise<void> {
  await db.morningChecks.put(check);
}

export async function getTimerState(): Promise<TimerState | undefined> {
  const row = await db.timer.get(SINGLETON_ID);
  if (row === undefined) return undefined;
  const { id: _id, ...state } = row;
  return state;
}

export async function saveTimerState(state: TimerState): Promise<void> {
  await db.timer.put({ id: SINGLETON_ID, ...state });
}

export async function clearTimerState(): Promise<void> {
  await db.timer.delete(SINGLETON_ID);
}
