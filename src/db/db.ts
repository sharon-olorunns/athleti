/**
 * IndexedDB via Dexie. Chosen over localStorage because workout history grows
 * without bound and localStorage is a synchronous 5 MB cliff.
 *
 * Every table here is written on mutation, never on session end.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { IntervalSpec, TimerCompletionTarget } from '@/core/timer';
import type {
  Exercise,
  MorningCheck,
  Programme,
  ReintroductionEntry,
  Settings,
  TimerState,
  WorkoutSession,
} from '@/types';

/** Single-row tables keyed by a fixed id, so they can be `put` idempotently. */
export const SINGLETON_ID = 'current' as const;

export interface SettingsRow extends Settings {
  id: typeof SINGLETON_ID;
}

/**
 * What the timer needs beyond the spec's `TimerState` to survive a reload: which
 * exercise it belongs to, the interval durations (TimerState.interval carries
 * only the round and phase), the set a hold completes, and whether its alert has
 * already sounded so a reload does not beep again.
 */
export interface TimerExtras {
  exerciseId?: string;
  intervalSpec?: IntervalSpec;
  completionTarget?: TimerCompletionTarget;
  alerted?: boolean;
}

export interface TimerRow extends TimerState, TimerExtras {
  id: typeof SINGLETON_ID;
}

/** The stored timer as the app uses it: the spec's state plus the extras. */
export type StoredTimer = TimerState & TimerExtras;

/** The active programme, stored as one row so the user can edit it in place. */
export interface ProgrammeRow extends Programme {
  /** Reintroduction schedule travels with the programme it belongs to. */
  reintroductionSchedule: ReintroductionEntry[];
}

/**
 * App-level bookkeeping: when the programme started (which defines week numbers),
 * the seed version applied, and one-off prompt state.
 */
export interface MetaRow {
  key: string;
  value: unknown;
}

export const META_KEYS = {
  /** Epoch ms. Week 1 begins on this day. */
  programmeStartedAt: 'programmeStartedAt',
  /** schemaVersion of the seed file already applied. */
  seededVersion: 'seededVersion',
  /** Epoch ms of the last export, for the 30-day reminder. */
  lastExportAt: 'lastExportAt',
  /** True once notifications have been offered, so the ask happens only once. */
  notificationOffered: 'notificationOffered',
  /** Substitutions the user declined to make permanent, so they are offered once. */
  dismissedSubstitutions: 'dismissedSubstitutions',
  /** ISO days whose morning check was dismissed rather than answered. */
  dismissedMorningChecks: 'dismissedMorningChecks',
  /** True once the install offer has been made, so it is made only once. */
  installOffered: 'installOffered',
  /** When the backup nudge was last dismissed, so it returns only after an export. */
  exportReminderDismissedAt: 'exportReminderDismissedAt',
} as const;

export class TrainerDb extends Dexie {
  /** Seeded library plus any user-added exercises. */
  exercises!: EntityTable<Exercise, 'id'>;
  /** One row: the active programme. */
  programmes!: EntityTable<ProgrammeRow, 'id'>;
  sessions!: EntityTable<WorkoutSession, 'id'>;
  morningChecks!: EntityTable<MorningCheck, 'date'>;
  settings!: EntityTable<SettingsRow, 'id'>;
  /** One row: the running timer, so a reload mid-rest resumes correctly. */
  timer!: EntityTable<TimerRow, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'trainer') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, phase1Excluded',
      programmes: 'id',
      // startedAt indexed for the reverse-chronological History list;
      // programmeDayId for "last time I did this day".
      sessions: 'id, startedAt, programmeDayId, weekNumber',
      morningChecks: 'date',
      settings: 'id',
      timer: 'id',
      meta: 'key',
    });
  }
}

export const db = new TrainerDb();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row === undefined ? undefined : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
