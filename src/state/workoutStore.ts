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
import type { Exercise, LoggedSet, ProgrammeDay, WorkoutSession } from '@/types';
import { db } from '@/db/db';
import { getSessions, putSession } from '@/db/repo';
import {
  clearSubstitution,
  createSession,
  finishSession,
  logSet,
  setPainScore,
  setQualityConfirmed,
  setSessionNotes,
  setSessionPainScore,
  setSkipped,
  setUnassistedAttempt,
  skipUnloggedExercises,
  substituteExercise,
  unlogSet,
} from '@/core/session';
import type { PlannedRow, RowValues } from '@/core/workout';
import { primeAudio, releaseAudio } from '@/platform/audio';
import { useTimer } from './timerStore';
import { useApp } from './store';

/** Draft values are keyed per exercise and row, since a superset shows two at once. */
const draftKey = (exerciseId: string, rowKey: string) => `${exerciseId}|${rowKey}`;

export interface CompleteRowOptions {
  /** The row to bring into view next. */
  nextFocusKey?: string;
  /**
   * The rest to start once the set is logged. `seconds` is what the programme
   * prescribes; any ±15s override for this exercise is applied here.
   */
  rest?: { seconds: number; contextLabel: string };
}

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
    options?: CompleteRowOptions,
  ) => Promise<void>;
  uncompleteRow: (exerciseId: string, row: PlannedRow) => Promise<void>;
  setDraft: (exerciseId: string, rowKey: string, values: RowValues) => void;
  draftFor: (exerciseId: string, rowKey: string) => RowValues | undefined;
  addSet: (exerciseId: string) => void;
  skipExercise: (exerciseId: string, skipped: boolean) => Promise<void>;
  confirmQuality: (exerciseId: string, confirmed: boolean) => Promise<void>;
  /** Replace a prescribed exercise for this session only. */
  swapExercise: (prescribedId: string, substitute: Exercise, reason: string) => Promise<void>;
  revertSwap: (prescribedId: string) => Promise<void>;
  savePainScore: (exerciseId: string, score: number) => Promise<void>;
  saveSessionPain: (which: 'pre' | 'post', score: number) => Promise<void>;
  /** The fresh unassisted pull-up attempt, logged once per session. */
  saveUnassistedAttempt: (attempted: boolean, succeeded: boolean) => Promise<void>;
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
      // The AudioContext must be created inside a user gesture or iOS Safari will
      // never play the alert. This runs on the tap that starts the workout.
      primeAudio();
      const now = Date.now();
      const weekNumber = useApp.getState().currentWeek(now);
      const next = createSession(dayId, weekNumber, now);
      set({ addedSets: {}, drafts: {}, focusKey: undefined });
      await persist(next);
    },

    completeRow: async (exerciseId, row, values, wasClean, options) => {
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

      set({ focusKey: options?.nextFocusKey });
      await persist(logSet(current, exerciseId, logged));

      // Auto-start the rest at the prescribed duration. A prescription with no
      // rest (the warm-up flows) starts nothing.
      const rest = options?.rest;
      if (rest !== undefined && useApp.getState().settings.autoStartRestTimer) {
        const timer = useTimer.getState();
        const seconds = timer.restSecondsFor(exerciseId, rest.seconds);
        if (seconds > 0) {
          await timer.startRest({ seconds, contextLabel: rest.contextLabel, exerciseId });
        }
      }
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

    confirmQuality: async (exerciseId, confirmed) => {
      const current = get().session;
      if (current === undefined) return;
      await persist(setQualityConfirmed(current, exerciseId, confirmed));
    },

    swapExercise: async (prescribedId, substitute, reason) => {
      const current = get().session;
      if (current === undefined) return;
      // A substitute the library does not have yet is added first, so the logged
      // entry points at a real exercise and builds history under its own id.
      if (useApp.getState().library.get(substitute.id) === undefined) {
        await useApp.getState().addExercise(substitute);
      }
      await persist(substituteExercise(current, prescribedId, substitute.id, reason));
    },

    revertSwap: async (prescribedId) => {
      const current = get().session;
      if (current === undefined) return;
      await persist(clearSubstitution(current, prescribedId));
    },

    savePainScore: async (exerciseId, score) => {
      const current = get().session;
      if (current === undefined) return;
      await persist(setPainScore(current, exerciseId, score));
    },

    saveSessionPain: async (which, score) => {
      const current = get().session;
      if (current === undefined) return;
      await persist(setSessionPainScore(current, which, score));
    },

    saveUnassistedAttempt: async (attempted, succeeded) => {
      const current = get().session;
      if (current === undefined) return;
      await persist(setUnassistedAttempt(current, attempted, succeeded));
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
      await useTimer.getState().skip();
      releaseAudio();
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
      await useTimer.getState().skip();
      releaseAudio();
      set({ session: undefined, addedSets: {}, drafts: {}, focusKey: undefined });
    },
  };
});
