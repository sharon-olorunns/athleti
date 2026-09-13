/**
 * First-run seeding. Reads `seed-programme.json` and writes the library and the
 * programme into IndexedDB, once.
 *
 * Re-seeding on a later schemaVersion refreshes the seeded content but leaves the
 * user's own exercises and all logged data untouched — history must survive a
 * programme edit.
 */
import seedJson from '@/data/seed-programme.json';
import { DEFAULT_SETTINGS, type Exercise, type SeedFile } from '@/types';
import { validateSeed } from '@/core/seedValidation';
import { startOfLocalDay } from '@/core/schedule';
import { db, getMeta, META_KEYS, setMeta, SINGLETON_ID, type ProgrammeRow } from './db';

export const seed = seedJson as unknown as SeedFile;

export interface SeedReport {
  action: 'seeded' | 'upgraded' | 'already-current';
  seedVersion: number;
  exerciseCount: number;
  dayCount: number;
}

function programmeRow(): ProgrammeRow {
  return {
    ...seed.programme,
    days: seed.days,
    reintroductionSchedule: seed.reintroductionSchedule,
  };
}

/**
 * Seed if this database has never been seeded, or if the bundled seed is newer
 * than what was applied. Safe to call on every app start.
 */
export async function seedIfNeeded(now = Date.now()): Promise<SeedReport> {
  const problems = validateSeed(seed);
  if (problems.length > 0) {
    // Refusing to seed a broken programme is better than half-loading one.
    throw new Error(
      `seed-programme.json failed validation:\n${problems
        .map((p) => `  ${p.kind}: ${p.detail}`)
        .join('\n')}`,
    );
  }

  const appliedVersion = await getMeta<number>(META_KEYS.seededVersion);
  if (appliedVersion === seed.schemaVersion) {
    return {
      action: 'already-current',
      seedVersion: seed.schemaVersion,
      exerciseCount: await db.exercises.count(),
      dayCount: seed.days.length,
    };
  }

  const firstRun = appliedVersion === undefined;

  await db.transaction('rw', db.exercises, db.programmes, db.settings, db.meta, async () => {
    // bulkPut rather than clear-then-add: a user-added exercise sharing no id with
    // the seed is left alone, and logged history keeps pointing at live rows.
    await db.exercises.bulkPut(seed.exercises as Exercise[]);
    await db.programmes.put(programmeRow());

    if (firstRun) {
      await db.settings.put({ id: SINGLETON_ID, ...DEFAULT_SETTINGS });
      // Week 1 begins today; week numbers are counted from local midnight.
      await setMeta(META_KEYS.programmeStartedAt, startOfLocalDay(now));
    }
    await setMeta(META_KEYS.seededVersion, seed.schemaVersion);
  });

  return {
    action: firstRun ? 'seeded' : 'upgraded',
    seedVersion: seed.schemaVersion,
    exerciseCount: seed.exercises.length,
    dayCount: seed.days.length,
  };
}
