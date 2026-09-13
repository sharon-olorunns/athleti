/**
 * App-level state. Zustand rather than Context so the active-workout screen can
 * later subscribe to slices without re-rendering the whole tree between sets.
 *
 * The store is a cache over IndexedDB, never the source of truth: every mutation
 * writes through to Dexie first.
 */
import { create } from 'zustand';
import type { Exercise, MorningCheck, Settings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import type { ProgrammeRow } from '@/db/db';
import { db } from '@/db/db';
import {
  getExerciseMap,
  getMorningChecks,
  getProgramme,
  getProgrammeStartedAt,
  getSettings,
  putMorningCheck,
  saveSettings,
} from '@/db/repo';
import { seedIfNeeded } from '@/db/seed';
import { weekNumberFor } from '@/core/schedule';

export type BootStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AppState {
  status: BootStatus;
  error: string | undefined;
  programme: ProgrammeRow | undefined;
  library: Map<string, Exercise>;
  settings: Settings;
  programmeStartedAt: number | undefined;
  morningChecks: MorningCheck[];

  boot: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  exercise: (id: string) => Exercise | undefined;
  currentWeek: (now?: number) => number;
  /** Add a substitute the library does not have yet. */
  addExercise: (exercise: Exercise) => Promise<void>;
  saveMorningCheck: (check: MorningCheck) => Promise<void>;
  /** Replace a prescribed exercise across the programme, permanently. */
  makeSubstitutionPermanent: (prescribedId: string, performedId: string) => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  status: 'idle',
  error: undefined,
  programme: undefined,
  library: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  programmeStartedAt: undefined,
  morningChecks: [],

  /** Load from IndexedDB, seeding on first run. Safe to call more than once. */
  boot: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: undefined });
    try {
      await seedIfNeeded();
      const [programme, library, settings, programmeStartedAt, morningChecks] = await Promise.all([
        getProgramme(),
        getExerciseMap(),
        getSettings(),
        getProgrammeStartedAt(),
        getMorningChecks(),
      ]);
      if (programme === undefined) throw new Error('No programme found after seeding');
      set({ status: 'ready', programme, library, settings, programmeStartedAt, morningChecks });
      applyTheme(settings.theme);
    } catch (cause) {
      set({ status: 'error', error: cause instanceof Error ? cause.message : String(cause) });
    }
  },

  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    await saveSettings(next);
    set({ settings: next });
    applyTheme(next.theme);
  },

  exercise: (id) => get().library.get(id),

  addExercise: async (exercise) => {
    await db.exercises.put(exercise);
    set((state) => ({ library: new Map(state.library).set(exercise.id, exercise) }));
  },

  saveMorningCheck: async (check) => {
    await putMorningCheck(check);
    const morningChecks = await getMorningChecks();
    set({ morningChecks });
  },

  /**
   * The one place the programme itself is edited. Every prescription naming the
   * prescribed exercise is repointed at the substitute, and the change is written
   * to the stored programme — the seed file is never touched.
   */
  makeSubstitutionPermanent: async (prescribedId, performedId) => {
    const programme = get().programme;
    if (programme === undefined) return;

    const next = {
      ...programme,
      days: programme.days.map((day) => ({
        ...day,
        blocks: day.blocks.map((block) => ({
          ...block,
          items: block.items.map((item) =>
            item.kind === 'single'
              ? {
                  ...item,
                  prescription:
                    item.prescription.exerciseId === prescribedId
                      ? { ...item.prescription, exerciseId: performedId }
                      : item.prescription,
                }
              : {
                  ...item,
                  prescriptions: item.prescriptions.map((prescription) =>
                    prescription.exerciseId === prescribedId
                      ? { ...prescription, exerciseId: performedId }
                      : prescription,
                  ),
                },
          ),
        })),
      })),
    };

    await db.programmes.put(next);
    set({ programme: next });
  },

  currentWeek: (now = Date.now()) => {
    const startedAt = get().programmeStartedAt;
    return startedAt === undefined ? 1 : weekNumberFor(now, startedAt);
  },
}));

/** Dark by default; 'system' follows the device. */
export function applyTheme(theme: Settings['theme']): void {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.dataset['theme'] = resolved;
}
