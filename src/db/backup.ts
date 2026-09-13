/**
 * Reading the whole store out, and writing a backup back in.
 *
 * The planning is pure (`core/backup`); this is only the database work, and it
 * happens in one transaction so a failed import cannot leave half a history
 * behind.
 */
import type { Exercise, MorningCheck, Settings, WorkoutSession } from '@/types';
import {
  buildBackup,
  type BackupFile,
  type ImportMode,
  type MergePlan,
} from '@/core/backup';
import { seed } from './seed';
import { db, META_KEYS, SINGLETON_ID, type ProgrammeRow } from './db';
import { getSettings } from './repo';

const SEEDED_IDS = new Set(seed.exercises.map((e) => e.id));

/** Everything that cannot be regenerated from the seed. */
export async function readBackup(now = Date.now()): Promise<BackupFile> {
  const [sessions, morningChecks, settings, allExercises, programmes, metaRows] =
    await Promise.all([
      db.sessions.toArray(),
      db.morningChecks.toArray(),
      getSettings(),
      db.exercises.toArray(),
      db.programmes.toArray(),
      db.meta.toArray(),
    ]);

  const meta: Record<string, unknown> = {};
  for (const row of metaRows) meta[row.key] = row.value;

  return buildBackup({
    sessions,
    morningChecks,
    settings,
    allExercises,
    seededExerciseIds: SEEDED_IDS,
    programme: programmes[0],
    meta,
    exportedAt: now,
  });
}

export interface ApplyResult {
  sessions: number;
  morningChecks: number;
  customExercises: number;
}

/**
 * Apply a planned import. Replace wipes the logged data first; merge only adds.
 * Either way the seeded library is left alone — it is regenerated, not restored.
 */
export async function applyImport(
  plan: MergePlan,
  backup: BackupFile,
  mode: ImportMode,
): Promise<ApplyResult> {
  await db.transaction(
    'rw',
    [db.sessions, db.morningChecks, db.exercises, db.programmes, db.settings, db.meta],
    async () => {
      if (mode === 'replace') {
        await db.sessions.clear();
        await db.morningChecks.clear();
      }

      await db.sessions.bulkPut(plan.sessions as WorkoutSession[]);
      await db.morningChecks.bulkPut(plan.morningChecks as MorningCheck[]);
      await db.exercises.bulkPut(plan.customExercises as Exercise[]);

      if (mode === 'replace') {
        await db.settings.put({ id: SINGLETON_ID, ...(plan.settings as Settings) });
        if (backup.programme !== undefined) {
          await db.programmes.put(backup.programme as ProgrammeRow);
        }
        // The programme start defines every week number, so it travels with a
        // replace or the restored history lands in the wrong weeks.
        const startedAt = backup.meta[META_KEYS.programmeStartedAt];
        if (typeof startedAt === 'number') {
          await db.meta.put({ key: META_KEYS.programmeStartedAt, value: startedAt });
        }
      }
    },
  );

  return {
    sessions: plan.sessions.length,
    morningChecks: plan.morningChecks.length,
    customExercises: plan.customExercises.length,
  };
}

export function seededExerciseIds(): ReadonlySet<string> {
  return SEEDED_IDS;
}
