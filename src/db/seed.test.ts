/**
 * Seed loader against a real IndexedDB implementation (fake-indexeddb), because
 * the guarantees that matter here — idempotence, and never clobbering user data —
 * are about what lands in the store.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getMeta, META_KEYS, SINGLETON_ID } from './db';
import { seed, seedIfNeeded } from './seed';
import { getExerciseMap, getProgramme, getSettings } from './repo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();

describe('seedIfNeeded', () => {
  it('loads the library and the programme on first run', async () => {
    const report = await seedIfNeeded();

    expect(report.action).toBe('seeded');
    expect(report.seedVersion).toBe(seed.schemaVersion);
    expect(await db.exercises.count()).toBe(seed.exercises.length);

    const programme = await getProgramme();
    expect(programme?.id).toBe(seed.programme.id);
    expect(programme?.days).toHaveLength(5);
    expect(programme?.reintroductionSchedule).toHaveLength(seed.reintroductionSchedule.length);
  });

  it('writes default settings on first run', async () => {
    await seedIfNeeded();
    const settings = await getSettings();
    // Dark by default: gym lighting and battery life.
    expect(settings.theme).toBe('dark');
    expect(settings.autoStartRestTimer).toBe(true);
    expect(settings.plateIncrementKg).toBe(2.5);
  });

  it('stamps the programme start at local midnight, so week 1 starts today', async () => {
    const now = at(2025, 1, 6, 21);
    await seedIfNeeded(now);
    expect(await getMeta<number>(META_KEYS.programmeStartedAt)).toBe(at(2025, 1, 6, 0));
  });

  it('is a no-op on the second run', async () => {
    await seedIfNeeded();
    const second = await seedIfNeeded();
    expect(second.action).toBe('already-current');
    expect(await db.exercises.count()).toBe(seed.exercises.length);
  });

  it('does not move the programme start on a later run', async () => {
    const first = at(2025, 1, 6);
    await seedIfNeeded(first);
    await seedIfNeeded(at(2025, 3, 1));
    expect(await getMeta<number>(META_KEYS.programmeStartedAt)).toBe(at(2025, 1, 6, 0));
  });

  it('keeps user settings across a re-seed', async () => {
    await seedIfNeeded();
    await db.settings.put({
      id: SINGLETON_ID,
      ...(await getSettings()),
      theme: 'light',
      units: 'lb',
    });

    // Force the upgrade path by pretending an older seed was applied.
    await db.meta.put({ key: META_KEYS.seededVersion, value: seed.schemaVersion - 1 });
    const report = await seedIfNeeded();

    expect(report.action).toBe('upgraded');
    const settings = await getSettings();
    expect(settings.theme).toBe('light');
    expect(settings.units).toBe('lb');
  });

  it('keeps a user-added exercise across a re-seed', async () => {
    await seedIfNeeded();
    await db.exercises.put({
      id: 'my-own-lift',
      name: 'My own lift',
      equipment: ['dumbbell'],
      primaryMuscles: ['Biceps'],
      secondaryMuscles: [],
      tracks: ['weight', 'reps'],
      unilateral: false,
      progression: { type: 'load', label: '+2.5 kg' },
      kneeSensitive: false,
      painTracked: false,
      phase1Excluded: false,
      alternatives: [],
    });

    await db.meta.put({ key: META_KEYS.seededVersion, value: seed.schemaVersion - 1 });
    await seedIfNeeded();

    const library = await getExerciseMap();
    expect(library.get('my-own-lift')?.name).toBe('My own lift');
    expect(library.size).toBe(seed.exercises.length + 1);
  });

  it('keeps logged sessions across a re-seed', async () => {
    await seedIfNeeded();
    await db.sessions.put({
      id: 's1',
      programmeDayId: 'day-1',
      weekNumber: 1,
      startedAt: at(2025, 1, 6),
      finishedAt: at(2025, 1, 6, 10),
      entries: [],
    });

    await db.meta.put({ key: META_KEYS.seededVersion, value: seed.schemaVersion - 1 });
    await seedIfNeeded();

    expect(await db.sessions.count()).toBe(1);
    expect((await db.sessions.get('s1'))?.programmeDayId).toBe('day-1');
  });

  it('stores the excluded exercises in the library so the Programme screen can show them', async () => {
    await seedIfNeeded();
    const excluded = await db.exercises.filter((e) => e.phase1Excluded).toArray();
    expect(excluded.length).toBe(12);
    for (const exercise of excluded) {
      expect(exercise.reintroduceWeek).toBeGreaterThanOrEqual(5);
    }
  });
});
