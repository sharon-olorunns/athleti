import { describe, expect, it } from 'vitest';
import type { Exercise, MorningCheck, Settings, WorkoutSession } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { anExercise, aSession, aSet } from '@/test/factories';
import {
  BACKUP_SCHEMA_VERSION,
  backupFilename,
  buildBackup,
  exportReminderDue,
  parseBackup,
  planImport,
  sessionRecency,
  toCsv,
} from './backup';

const DAY = 86_400_000;
const T0 = new Date(2025, 2, 9, 10).getTime();

const settings: Settings = { ...DEFAULT_SETTINGS };
const seeded = new Set(['squat', 'hip-thrust']);

const input = (over: Partial<Parameters<typeof buildBackup>[0]> = {}) => ({
  sessions: [],
  morningChecks: [],
  settings,
  allExercises: [],
  seededExerciseIds: seeded,
  programme: undefined,
  meta: {},
  exportedAt: T0,
  ...over,
});

describe('buildBackup', () => {
  it('stamps the app, schema version and time', () => {
    const backup = buildBackup(input());
    expect(backup.app).toBe('trainer');
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.exportedAt).toBe(T0);
  });

  it('carries only the exercises the seed cannot put back', () => {
    const backup = buildBackup(
      input({
        allExercises: [
          anExercise({ id: 'squat' }),
          anExercise({ id: 'custom-reverse-lunge' }),
        ],
      }),
    );
    expect(backup.customExercises.map((e) => e.id)).toEqual(['custom-reverse-lunge']);
  });

  it('carries the meta that cannot be recovered, such as the programme start', () => {
    const backup = buildBackup(input({ meta: { programmeStartedAt: T0 - 30 * DAY } }));
    expect(backup.meta['programmeStartedAt']).toBe(T0 - 30 * DAY);
  });

  it('orders sessions oldest first', () => {
    const backup = buildBackup(
      input({
        sessions: [aSession({ id: 'b', startedAt: 2000 }), aSession({ id: 'a', startedAt: 1000 })],
      }),
    );
    expect(backup.sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('backupFilename', () => {
  it('is trainer-export-YYYY-MM-DD.json', () => {
    expect(backupFilename(new Date(2025, 2, 9, 23).getTime())).toBe(
      'trainer-export-2025-03-09.json',
    );
    expect(backupFilename(new Date(2025, 11, 1, 1).getTime())).toBe(
      'trainer-export-2025-12-01.json',
    );
  });
});

describe('parseBackup', () => {
  const valid = JSON.stringify(buildBackup(input({ sessions: [aSession({ id: 'a' })] })));

  it('accepts a file this app wrote', () => {
    const result = parseBackup(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.sessions).toHaveLength(1);
  });

  it('rejects malformed JSON', () => {
    expect(parseBackup('{nope')).toMatchObject({ ok: false });
  });

  it('rejects a file from another app', () => {
    expect(parseBackup(JSON.stringify({ app: 'something-else', sessions: [] }))).toMatchObject({
      ok: false,
    });
  });

  it('rejects a file with no schema version', () => {
    expect(parseBackup(JSON.stringify({ app: 'trainer', sessions: [] }))).toMatchObject({
      ok: false,
    });
  });

  it('refuses an export from a newer app rather than guessing at it', () => {
    const result = parseBackup(
      JSON.stringify({ app: 'trainer', schemaVersion: 99, sessions: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('newer version');
  });

  it('rejects a file with no sessions array', () => {
    expect(
      parseBackup(JSON.stringify({ app: 'trainer', schemaVersion: 1 })),
    ).toMatchObject({ ok: false });
  });

  it('tolerates missing optional sections', () => {
    const result = parseBackup(
      JSON.stringify({ app: 'trainer', schemaVersion: 1, sessions: [] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.morningChecks).toEqual([]);
      expect(result.backup.customExercises).toEqual([]);
    }
  });
});

describe('sessionRecency', () => {
  it('is the latest moment a session can be shown to have been touched', () => {
    const session = aSession({
      startedAt: 1000,
      finishedAt: 5000,
      entries: [{ exerciseId: 'x', sets: [aSet({ setIndex: 0, completedAt: 9000 })] }],
    });
    expect(sessionRecency(session)).toBe(9000);
  });

  it('falls back to the start for an untouched session', () => {
    expect(sessionRecency(aSession({ startedAt: 1000 }))).toBe(1000);
  });
});

describe('planImport — merge', () => {
  const existing = [
    aSession({ id: 'a', startedAt: T0, finishedAt: T0 + 1000 }),
    aSession({ id: 'b', startedAt: T0 + DAY, finishedAt: T0 + DAY + 1000 }),
  ];
  const plan = (backupSessions: WorkoutSession[], checks: MorningCheck[] = []) =>
    planImport({
      existingSessions: existing,
      existingMorningChecks: [],
      existingExerciseIds: seeded,
      existingSettings: settings,
      backup: buildBackup(input({ sessions: backupSessions, morningChecks: checks })),
      mode: 'merge',
    });

  it('adds sessions it does not have', () => {
    const result = plan([aSession({ id: 'c', startedAt: T0 + 2 * DAY })]);
    expect(result.summary.sessionsAdded).toBe(1);
    expect(result.sessions).toHaveLength(3);
  });

  it('leaves an identical session alone', () => {
    const result = plan([existing[0]!]);
    expect(result.summary.sessionsUnchanged).toBe(1);
    expect(result.summary.sessionsUpdated).toBe(0);
  });

  /** "Newest wins" on an id collision. */
  it('takes the incoming copy when it is the newer one', () => {
    const newer = aSession({
      id: 'a',
      startedAt: T0,
      finishedAt: T0 + 1000,
      entries: [{ exerciseId: 'x', sets: [aSet({ setIndex: 0, completedAt: T0 + 99_000 })] }],
    });
    const result = plan([newer]);
    expect(result.summary.sessionsUpdated).toBe(1);
    expect(result.sessions.find((s) => s.id === 'a')?.entries).toHaveLength(1);
  });

  it('keeps the local copy when it is the newer one', () => {
    const older = aSession({ id: 'b', startedAt: T0 + DAY, finishedAt: T0 + DAY + 1 });
    const result = plan([older]);
    expect(result.summary.sessionsUnchanged).toBe(1);
    expect(result.sessions.find((s) => s.id === 'b')?.finishedAt).toBe(T0 + DAY + 1000);
  });

  it('never removes anything', () => {
    const result = plan([]);
    expect(result.summary.sessionsRemoved).toBe(0);
    expect(result.sessions).toHaveLength(2);
  });

  it('adds only morning checks for days it does not have', () => {
    const result = planImport({
      existingSessions: [],
      existingMorningChecks: [{ date: '2025-03-09', kneeScore: 3 }],
      existingExerciseIds: seeded,
      existingSettings: settings,
      backup: buildBackup(
        input({
          morningChecks: [
            { date: '2025-03-09', kneeScore: 9 },
            { date: '2025-03-10', kneeScore: 2 },
          ],
        }),
      ),
      mode: 'merge',
    });
    expect(result.summary.morningChecksAdded).toBe(1);
    expect(result.morningChecks.find((c) => c.date === '2025-03-09')?.kneeScore).toBe(3);
  });

  it('leaves this device settings and programme alone', () => {
    // Merging history is not the same as adopting another device's preferences.
    const result = planImport({
      existingSessions: [],
      existingMorningChecks: [],
      existingExerciseIds: seeded,
      existingSettings: settings,
      backup: buildBackup(input({ settings: { ...settings, units: 'lb', theme: 'light' } })),
      mode: 'merge',
    });
    expect(result.summary.settingsChange).toBe(false);
    expect(result.settings.units).toBe('kg');
  });

  it('adds custom exercises it does not have', () => {
    const custom: Exercise = anExercise({ id: 'custom-lunge' });
    const result = planImport({
      existingSessions: [],
      existingMorningChecks: [],
      existingExerciseIds: seeded,
      existingSettings: settings,
      backup: buildBackup(input({ allExercises: [custom] })),
      mode: 'merge',
    });
    expect(result.summary.customExercisesAdded).toBe(1);
  });
});

describe('planImport — replace', () => {
  it('reports what it will remove and takes the file wholesale', () => {
    const result = planImport({
      existingSessions: [aSession({ id: 'a' }), aSession({ id: 'b' })],
      existingMorningChecks: [],
      existingExerciseIds: seeded,
      existingSettings: settings,
      backup: buildBackup(
        input({ sessions: [aSession({ id: 'c' })], settings: { ...settings, units: 'lb' } }),
      ),
      mode: 'replace',
    });

    expect(result.summary.sessionsRemoved).toBe(2);
    expect(result.summary.sessionsAdded).toBe(1);
    expect(result.sessions.map((s) => s.id)).toEqual(['c']);
    expect(result.summary.settingsChange).toBe(true);
    expect(result.settings.units).toBe('lb');
  });
});

describe('round trip', () => {
  /** Acceptance criterion 12: export, clear everything, import, nothing lost. */
  it('restores every session exactly through a replace', () => {
    const sessions = [
      aSession({
        id: 's1',
        startedAt: T0,
        finishedAt: T0 + 3600_000,
        weekNumber: 2,
        prePainScore: 3,
        postPainScore: 5,
        notes: 'felt heavy',
        entries: [
          {
            exerciseId: 'custom-lunge',
            substitutedForId: 'squat',
            substitutionReason: 'machine taken',
            painScore: 4,
            qualityConfirmed: false,
            sets: [
              aSet({ setIndex: 0, side: 'L', reps: 8, weightKg: 62.5, wasClean: true, completedAt: T0 + 60_000 }),
              aSet({ setIndex: 0, side: 'R', reps: 7, weightKg: 62.5, wasClean: false, completedAt: T0 + 90_000 }),
            ],
          },
        ],
      }),
    ];
    const custom = anExercise({ id: 'custom-lunge', name: 'Reverse lunge' });
    const checks: MorningCheck[] = [{ date: '2025-03-10', kneeScore: 2, priorSessionId: 's1' }];

    const backup = buildBackup(
      input({
        sessions,
        morningChecks: checks,
        allExercises: [anExercise({ id: 'squat' }), custom],
        meta: { programmeStartedAt: T0 - 14 * DAY },
        settings: { ...settings, units: 'lb' },
      }),
    );

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Site data cleared: nothing local at all.
    const restored = planImport({
      existingSessions: [],
      existingMorningChecks: [],
      existingExerciseIds: new Set(['squat']),
      existingSettings: settings,
      backup: parsed.backup,
      mode: 'replace',
    });

    expect(restored.sessions).toEqual(sessions);
    expect(restored.morningChecks).toEqual(checks);
    expect(restored.customExercises).toEqual([custom]);
    expect(restored.settings.units).toBe('lb');
    expect(parsed.backup.meta['programmeStartedAt']).toBe(T0 - 14 * DAY);
  });
});

describe('toCsv', () => {
  const sessions = [
    aSession({
      id: 's1',
      startedAt: T0,
      weekNumber: 3,
      programmeDayId: 'day-1',
      entries: [
        {
          exerciseId: 'squat',
          painScore: 4,
          sets: [aSet({ setIndex: 0, reps: 5, weightKg: 80, wasClean: true })],
        },
      ],
    }),
  ];

  it('writes a header and one row per set', () => {
    const csv = toCsv(sessions, () => 'Back squat');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('weight_kg');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('80');
    expect(lines[1]).toContain('Back squat');
    expect(lines[1]).toContain('clean');
  });

  it('quotes a name containing a comma', () => {
    const csv = toCsv(sessions, () => 'Split squat, flat-footed');
    expect(csv).toContain('"Split squat, flat-footed"');
  });

  it('is just a header when nothing is logged', () => {
    expect(toCsv([], () => 'x').trim().split('\n')).toHaveLength(1);
  });
});

describe('exportReminderDue', () => {
  it('is due more than thirty days after the last export', () => {
    expect(exportReminderDue(T0 - 31 * DAY, T0 - 60 * DAY, T0)).toBe(true);
    expect(exportReminderDue(T0 - 29 * DAY, T0 - 60 * DAY, T0)).toBe(false);
  });

  it('counts from the first session when there has never been an export', () => {
    expect(exportReminderDue(undefined, T0 - 31 * DAY, T0)).toBe(true);
    expect(exportReminderDue(undefined, T0 - 10 * DAY, T0)).toBe(false);
  });

  it('says nothing with no history at all', () => {
    expect(exportReminderDue(undefined, undefined, T0)).toBe(false);
  });
});
