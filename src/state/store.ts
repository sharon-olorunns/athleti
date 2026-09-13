/**
 * App-level state. Zustand rather than Context so the active-workout screen can
 * later subscribe to slices without re-rendering the whole tree between sets.
 *
 * The store is a cache over IndexedDB, never the source of truth: every mutation
 * writes through to Dexie first.
 */
import { create } from 'zustand';
import type { Exercise, Settings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import type { ProgrammeRow } from '@/db/db';
import { getExerciseMap, getProgramme, getProgrammeStartedAt, getSettings, saveSettings } from '@/db/repo';
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

  boot: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  exercise: (id: string) => Exercise | undefined;
  currentWeek: (now?: number) => number;
}

export const useApp = create<AppState>((set, get) => ({
  status: 'idle',
  error: undefined,
  programme: undefined,
  library: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  programmeStartedAt: undefined,

  /** Load from IndexedDB, seeding on first run. Safe to call more than once. */
  boot: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: undefined });
    try {
      await seedIfNeeded();
      const [programme, library, settings, programmeStartedAt] = await Promise.all([
        getProgramme(),
        getExerciseMap(),
        getSettings(),
        getProgrammeStartedAt(),
      ]);
      if (programme === undefined) throw new Error('No programme found after seeding');
      set({ status: 'ready', programme, library, settings, programmeStartedAt });
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
