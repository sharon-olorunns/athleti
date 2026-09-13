/**
 * The active workout.
 *
 * Every mutation writes the whole session to IndexedDB before the store updates,
 * so a closed tab, a crashed browser or a dead battery loses nothing already
 * logged. Nothing here waits on a network request.
 *
 * Draft values — what a stepper shows before the set is confirmed — are kept in
 * memory only. Losing an unconfirmed number to a crash is acceptable; losing a
 * logged set is not. On resume, rows re-fill from what the session already logged,
 * so the loss is close to invisible.
 */
import { create } from 'zustand';
import type { LoggedSet, ProgrammeDay, WorkoutSession } from '@/types';
import { db } from '@/db/db';
import { getSessions, putSession } from '@/db/repo';
import {
  createSession,
  finishSession,
  logSet,
  setSessionNotes,
  setSkipped,
  skipUnloggedExercises,
  unlogSet,
} from '@/core/session';
import type { PlannedRow, RowValues } from '@/core/workout';
import { useApp } from './store';

/** Draft values are keyed per exercise and row, since a superset shows two at once. */
const draftKey = (exerciseId: string, rowKey: string) => `${exerciseId}|${rowKey}`;

interface WorkoutState {
  session: WorkoutSession | undefined;
  /** Finished sessions, newest first — the source for pre-fill and Today. */
  history: WorkoutSession[];
  /** Rows added in this session but not yet logged, per exercise. */
  addedSets: Record<string, number>;
  drafts: Record<string, RowValues>;
  /** The row to bring into view after a completion. */
  focusKey: string | undefined;
  saving: boolean;

  loadHistory: () => Promise<void>;
  resumeActive: () => Promise<void>;
  start: (dayId: string) => Promise<void>;
  completeRow: (
    exerciseId: string,
    row: PlannedRow,
    values: RowValues,
    wasClean: boolean,
    nextFocusKey?: string,
  ) => Promise<void>;
  uncompleteRow: (exerciseId: string, row: PlannedRow) => Promise<void>;
  setDraft: (exerciseId: string, rowKey: string, values: RowValues) => void;
  draftFor: (exerciseId: string, rowKey: string) => RowValues | undefined;
  addSet: (exerciseId: string) => void;
  skipExercise: (exerciseId: string, skipped: boolean) => Promise<void>;
  saveNotes: (notes: string) => Promise<void>;
  finish: (markRemainingSkipped: boolean, day: ProgrammeDay | undefined) => Promise<void>;
  discard: () => Promise<void>;
}

export const useWorkout = create<WorkoutState>((set, get) => {
  /** One place where a session change is persisted, so no path can skip the write. */
  const persist = async (next: WorkoutSession) => {
    set({ saving: true });
    try {
      await putSession(next);
      set({ session: next });
    } finally {
      set({ saving: false });
    }
  };

  return {
    session: undefined,
    history: [],
    addedSets: {},
    drafts: {},
    focusKey: undefined,
    saving: false,

    loadHistory: async () => {
      const all = await getSessions();
      set({ history: all.filter((s) => s.finishedAt !== undefined) });
    },

    /**
     * Pick up an unfinished session after a reload or a crash. There is at most
     * one; the newest wins if an older one was somehow left open.
     */
    resumeActive: async () => {
      const all = await getSessions();
      const active = all.find((s) => s.finishedAt === undefined);
      set({
        session: active,
        history: all.filter((s) => s.finishedAt !== undefined),
        addedSets: {},
        drafts: {},
      });
    },

    start: async (dayId) => {
      const now = Date.now();
      const weekNumber = useApp.getState().currentWeek(now);
      const next = createSession(dayId, weekNumber, now);
      set({ addedSets: {}, drafts: {}, focusKey: undefined });
      await persist(next);
    },

    completeRow: async (exerciseId, row, values, wasClean, nextFocusKey) => {
      const current = get().session;
      if (current === undefined) return;

      const logged: LoggedSet = {
        setIndex: row.setIndex,
        wasClean,
        completedAt: Date.now(),
        ...(row.side !== undefined ? { side: row.side } : {}),
        ...(values.weightKg !== undefined ? { weightKg: values.weightKg } : {}),
        ...(values.reps !== undefined ? { reps: values.reps } : {}),
        ...(values.seconds !== undefined ? { seconds: values.seconds } : {}),
        ...(values.distanceM !== undefined ? { distanceM: values.distanceM } : {}),
      };

      set({ focusKey: nextFocusKey });
      await persist(logSet(current, exerciseId, logged));
    },

    uncompleteRow: async (exerciseId, row) => {
      const current = get().session;
      if (current === undefined) return;

      // Keep the values on screen so un-completing does not wipe what was entered.
      const entry = current.entries.find((e) => e.exerciseId === exerciseId);
      const existing = entry?.sets.find(
        (s) => s.setIndex === row.setIndex && s.side === row.side,
      );
      if (existing !== undefined) {
        get().setDraft(exerciseId, row.key, {
          ...(existing.weightKg !== undefined ? { weightKg: existing.weightKg } : {}),
          ...(existing.reps !== undefined ? { reps: existing.reps } : {}),
          ...(existing.seconds !== undefined ? { seconds: existing.seconds } : {}),
          ...(existing.distanceM !== undefined ? { distanceM: existing.distanceM } : {}),
        });
      }

      await persist(unlogSet(current, exerciseId, row.setIndex, row.side));
    },

    setDraft: (exerciseId, rowKey, values) => {
      set((state) => ({ drafts: { ...state.drafts, [draftKey(exerciseId, rowKey)]: values } }));
    },

    draftFor: (exerciseId, rowKey) => get().drafts[draftKey(exerciseId, rowKey)],

    addSet: (exerciseId) => {
      set((state) => ({
        addedSets: { ...state.addedSets, [exerciseId]: (state.addedSets[exerciseId] ?? 0) + 1 },
      }));
    },

    skipExercise: async (exerciseId, skipped) => {
      const current = get().session;
      if (current === undefined) return;
      await persist(setSkipped(current, exerciseId, skipped));
    },

    saveNotes: async (notes) => {
      const current = get().session;
      if (current === undefined) return;
      await persist(setSessionNotes(current, notes));
    },

    finish: async (markRemainingSkipped, day) => {
      const current = get().session;
      if (current === undefined) return;

      const withSkips =
        markRemainingSkipped && day !== undefined
          ? skipUnloggedExercises(current, day)
          : current;
      const finished = finishSession(withSkips, Date.now());

      await putSession(finished);
      set({
        session: undefined,
        addedSets: {},
        drafts: {},
        focusKey: undefined,
        history: [finished, ...get().history],
      });
    },

    /** Only offered while nothing is logged, so this can never lose data. */
    discard: async () => {
      const current = get().session;
      if (current === undefined) return;
      await db.sessions.delete(current.id);
      set({ session: undefined, addedSets: {}, drafts: {}, focusKey: undefined });
    },
  };
});
