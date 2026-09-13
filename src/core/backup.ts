/**
 * Export and import. Pure.
 *
 * No server means the user's only backup is their own export, so this has to be
 * trustworthy: everything that cannot be regenerated from the seed goes in the
 * file, and an import says exactly what it will change before it changes it.
 */
import type {
  Exercise,
  MorningCheck,
  Programme,
  ReintroductionEntry,
  Settings,
  WorkoutSession,
} from '@/types';

/** The export format's own version, independent of the seed's schemaVersion. */
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = 'trainer';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: number;
  sessions: WorkoutSession[];
  morningChecks: MorningCheck[];
  settings: Settings;
  /** Exercises that are not in the seed: user additions and swapped-in substitutes. */
  customExercises: Exercise[];
  /** The stored programme, which the user may have edited in place. */
  programme: (Programme & { reintroductionSchedule: ReintroductionEntry[] }) | undefined;
  /** Bookkeeping that cannot be recovered, above all the programme start date. */
  meta: Record<string, unknown>;
}

export interface BackupInput {
  sessions: readonly WorkoutSession[];
  morningChecks: readonly MorningCheck[];
  settings: Settings;
  allExercises: readonly Exercise[];
  seededExerciseIds: ReadonlySet<string>;
  programme: BackupFile['programme'];
  meta: Record<string, unknown>;
  exportedAt: number;
}

export function buildBackup(input: BackupInput): BackupFile {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: input.exportedAt,
    sessions: [...input.sessions].sort((a, b) => a.startedAt - b.startedAt),
    morningChecks: [...input.morningChecks].sort((a, b) => a.date.localeCompare(b.date)),
    settings: { ...input.settings },
    // Only what the seed cannot put back.
    customExercises: input.allExercises.filter((e) => !input.seededExerciseIds.has(e.id)),
    programme: input.programme,
    meta: { ...input.meta },
  };
}

/** `trainer-export-2025-03-09.json` */
export function backupFilename(exportedAt: number): string {
  const d = new Date(exportedAt);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `trainer-export-${d.getFullYear()}-${month}-${day}.json`;
}

export type ParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; reason: string };

/**
 * Parse and validate a file before anything is written. A backup that cannot be
 * trusted is rejected outright rather than half-applied.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not valid JSON.' };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'That file is not a Trainer export.' };
  }

  const candidate = raw as Partial<BackupFile>;
  if (candidate.app !== BACKUP_APP_ID) {
    return { ok: false, reason: 'That file is not a Trainer export.' };
  }
  if (typeof candidate.schemaVersion !== 'number') {
    return { ok: false, reason: 'That export has no schema version.' };
  }
  if (candidate.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `That export is from a newer version of the app (schema ${candidate.schemaVersion}). Update first.`,
    };
  }
  if (!Array.isArray(candidate.sessions)) {
    return { ok: false, reason: 'That export has no sessions.' };
  }

  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      schemaVersion: candidate.schemaVersion,
      exportedAt: typeof candidate.exportedAt === 'number' ? candidate.exportedAt : 0,
      sessions: candidate.sessions,
      morningChecks: Array.isArray(candidate.morningChecks) ? candidate.morningChecks : [],
      settings: candidate.settings as Settings,
      customExercises: Array.isArray(candidate.customExercises) ? candidate.customExercises : [],
      programme: candidate.programme,
      meta: typeof candidate.meta === 'object' && candidate.meta !== null ? candidate.meta : {},
    },
  };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportSummary {
  mode: ImportMode;
  sessionsAdded: number;
  sessionsUpdated: number;
  sessionsUnchanged: number;
  /** Only ever non-zero on replace: sessions here that the file does not have. */
  sessionsRemoved: number;
  morningChecksAdded: number;
  customExercisesAdded: number;
  settingsChange: boolean;
  programmeChange: boolean;
}

/**
 * How recent a session is, for resolving an id collision on merge.
 *
 * There is no modified timestamp in the data model, so recency is the latest
 * moment the session can be shown to have been touched — its finish, its start,
 * or the last set completed in it. A session that gained sets after being
 * exported therefore wins over the exported copy.
 */
export function sessionRecency(session: WorkoutSession): number {
  const lastSet = session.entries.reduce(
    (latest, entry) =>
      entry.sets.reduce((inner, set) => Math.max(inner, set.completedAt), latest),
    0,
  );
  return Math.max(session.finishedAt ?? 0, session.startedAt, lastSet);
}

export interface MergeInput {
  existingSessions: readonly WorkoutSession[];
  existingMorningChecks: readonly MorningCheck[];
  existingExerciseIds: ReadonlySet<string>;
  existingSettings: Settings;
  backup: BackupFile;
  mode: ImportMode;
}

export interface MergePlan {
  summary: ImportSummary;
  sessions: WorkoutSession[];
  morningChecks: MorningCheck[];
  customExercises: Exercise[];
  settings: Settings;
}

/**
 * Work out exactly what an import would do, without doing it. The screen shows
 * this summary and only writes once the user confirms.
 */
export function planImport(input: MergeInput): MergePlan {
  const { backup, mode } = input;

  if (mode === 'replace') {
    return {
      summary: {
        mode,
        sessionsAdded: backup.sessions.length,
        sessionsUpdated: 0,
        sessionsUnchanged: 0,
        sessionsRemoved: input.existingSessions.length,
        morningChecksAdded: backup.morningChecks.length,
        customExercisesAdded: backup.customExercises.length,
        settingsChange: backup.settings !== undefined,
        programmeChange: backup.programme !== undefined,
      },
      sessions: [...backup.sessions],
      morningChecks: [...backup.morningChecks],
      customExercises: [...backup.customExercises],
      settings: backup.settings ?? input.existingSettings,
    };
  }

  const byId = new Map(input.existingSessions.map((session) => [session.id, session]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incoming of backup.sessions) {
    const existing = byId.get(incoming.id);
    if (existing === undefined) {
      byId.set(incoming.id, incoming);
      added += 1;
    } else if (sessionRecency(incoming) > sessionRecency(existing)) {
      byId.set(incoming.id, incoming);
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  const existingDates = new Set(input.existingMorningChecks.map((check) => check.date));
  const newChecks = backup.morningChecks.filter((check) => !existingDates.has(check.date));
  const newExercises = backup.customExercises.filter((e) => !input.existingExerciseIds.has(e.id));

  return {
    summary: {
      mode,
      sessionsAdded: added,
      sessionsUpdated: updated,
      sessionsUnchanged: unchanged,
      sessionsRemoved: 0,
      morningChecksAdded: newChecks.length,
      customExercisesAdded: newExercises.length,
      // A merge leaves the settings and the programme alone: they are this
      // device's, and silently overwriting them is not what merging means.
      settingsChange: false,
      programmeChange: false,
    },
    sessions: [...byId.values()].sort((a, b) => a.startedAt - b.startedAt),
    morningChecks: [...input.existingMorningChecks, ...newChecks].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    customExercises: newExercises,
    settings: input.existingSettings,
  };
}

const CSV_COLUMNS = [
  'date',
  'session_id',
  'week',
  'day_id',
  'exercise_id',
  'exercise',
  'substituted_for',
  'set',
  'side',
  'weight_kg',
  'reps',
  'seconds',
  'distance_m',
  'clean',
  'exercise_pain',
] as const;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/**
 * One row per logged set, for anyone who wants it in a spreadsheet. Weights stay
 * in kilograms — the column says so, and a export should not depend on a display
 * setting.
 */
export function toCsv(
  sessions: readonly WorkoutSession[],
  exerciseName: (id: string) => string,
): string {
  const rows: string[] = [CSV_COLUMNS.join(',')];

  for (const session of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const date = new Date(session.startedAt).toISOString();
    for (const entry of session.entries) {
      for (const set of entry.sets) {
        rows.push(
          [
            date,
            session.id,
            session.weekNumber,
            session.programmeDayId,
            entry.exerciseId,
            exerciseName(entry.exerciseId),
            entry.substitutedForId,
            set.setIndex + 1,
            set.side,
            set.weightKg,
            set.reps,
            set.seconds,
            set.distanceM,
            set.wasClean ? 'clean' : 'grind',
            entry.painScore,
          ]
            .map(csvCell)
            .join(','),
        );
      }
    }
  }

  return `${rows.join('\n')}\n`;
}

/**
 * Whether to nudge for a backup: more than 30 days since the last export, or
 * since the first session if there has never been one.
 */
export function exportReminderDue(
  lastExportAt: number | undefined,
  earliestSessionAt: number | undefined,
  now: number,
  days = 30,
): boolean {
  const since = lastExportAt ?? earliestSessionAt;
  if (since === undefined) return false;
  return now - since > days * 86_400_000;
}
