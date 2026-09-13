/**
 * The gym timer.
 *
 * The store holds `endsAt` and nothing that counts. A tick elsewhere only causes
 * a re-render; every displayed number is derived from `Date.now()` at render
 * time, so a throttled or suspended tab cannot make the timer wrong.
 *
 * Every change is written to IndexedDB, so a reload mid-rest resumes at the right
 * second rather than starting over.
 */
import { create } from 'zustand';
import type { TimerState } from '@/types';
import type { StoredTimer } from '@/db/db';
import { clearTimerState, getTimerState, saveTimerState } from '@/db/repo';
import {
  adjustTimer,
  advanceInterval,
  createTimer,
  hasElapsed,
  pauseTimer,
  resumeTimer,
  type IntervalSpec,
  type TimerCompletionTarget,
} from '@/core/timer';
import { playAlert, vibrate, type AlertKind } from '@/platform/audio';
import { postTimerNotification } from '@/platform/notifications';
import { useApp } from './store';

/** What `handleElapsed` tells the caller to do, so this store never imports the workout. */
export type ElapseOutcome =
  | { kind: 'none' }
  | { kind: 'rest-finished' }
  | { kind: 'interval-advanced' }
  | { kind: 'interval-finished'; target: TimerCompletionTarget | undefined }
  | { kind: 'hold-finished'; target: TimerCompletionTarget | undefined };

interface TimerStoreState {
  timer: StoredTimer | undefined;
  /** The full-screen view. */
  expanded: boolean;
  /**
   * Per-exercise rest overrides from the ±15s controls. Session-scoped and in
   * memory: the spec is explicit that these never reach the programme.
   */
  restOverrides: Record<string, number>;
  /** Set when a timer ran out while the page was hidden, for the returning banner. */
  finishedWhileHidden: boolean;

  restore: () => Promise<void>;
  startRest: (params: {
    seconds: number;
    contextLabel: string;
    exerciseId: string;
  }) => Promise<void>;
  startHold: (params: {
    seconds: number;
    contextLabel: string;
    exerciseId: string;
    target: TimerCompletionTarget;
  }) => Promise<void>;
  startInterval: (params: {
    spec: IntervalSpec;
    contextLabel: string;
    exerciseId: string;
    target: TimerCompletionTarget;
  }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  adjust: (deltaSeconds: number) => Promise<void>;
  skip: () => Promise<void>;
  dismiss: () => Promise<void>;
  setExpanded: (expanded: boolean) => void;
  /** Called by the runner when the clock passes `endsAt`. */
  handleElapsed: (now: number, wasHidden: boolean) => ElapseOutcome;
  /** The rest to use for an exercise, including any ±15s override. */
  restSecondsFor: (exerciseId: string, prescribed: number) => number;
}

function alertNow(kind: AlertKind, contextLabel?: string): void {
  const { soundEnabled, vibrationEnabled } = useApp.getState().settings;

  if (soundEnabled) playAlert(kind);
  if (vibrationEnabled) {
    // Android only; iOS Safari has no vibration at all, which is why the alert
    // is never vibration alone.
    vibrate(kind === 'finished' ? [200, 100, 200] : 150);
  }

  // A notification is a supplementary alert for a backgrounded app, and only
  // where the user has already granted permission.
  if (kind === 'finished' && typeof document !== 'undefined' && document.hidden) {
    postTimerNotification('Rest finished', contextLabel ?? 'Back to it.');
  }
}

export const useTimer = create<TimerStoreState>((set, get) => {
  const persist = async (timer: StoredTimer | undefined) => {
    set({ timer });
    if (timer === undefined) {
      await clearTimerState();
    } else {
      await saveTimerState(timer);
    }
  };

  /** Apply a pure transform to the running timer and write the result. */
  const update = async (change: (timer: StoredTimer) => StoredTimer) => {
    const current = get().timer;
    if (current === undefined) return;
    await persist(change(current));
  };

  return {
    timer: undefined,
    expanded: false,
    restOverrides: {},
    finishedWhileHidden: false,

    restore: async () => {
      const stored = await getTimerState();
      set({ timer: stored });
    },

    startRest: async ({ seconds, contextLabel, exerciseId }) => {
      if (seconds <= 0) {
        await persist(undefined);
        return;
      }
      const base = createTimer({
        mode: 'rest',
        totalSeconds: seconds,
        contextLabel,
        now: Date.now(),
      });
      set({ finishedWhileHidden: false });
      await persist({ ...base, exerciseId, alerted: false });
    },

    startHold: async ({ seconds, contextLabel, exerciseId, target }) => {
      const base = createTimer({
        mode: 'hold',
        totalSeconds: seconds,
        contextLabel,
        now: Date.now(),
      });
      set({ finishedWhileHidden: false });
      await persist({ ...base, exerciseId, completionTarget: target, alerted: false });
    },

    startInterval: async ({ spec, contextLabel, exerciseId, target }) => {
      const base = createTimer({
        mode: 'interval',
        totalSeconds: spec.workSeconds,
        contextLabel,
        now: Date.now(),
        interval: spec,
      });
      set({ finishedWhileHidden: false, expanded: true });
      alertNow('work');
      await persist({
        ...base,
        exerciseId,
        intervalSpec: spec,
        completionTarget: target,
        alerted: false,
      });
    },

    pause: async () => {
      await update((timer) => pauseTimer(timer, Date.now()));
    },

    resume: async () => {
      await update((timer) => resumeTimer(timer, Date.now()));
    },

    /**
     * ±15s. The spec makes this two things at once: it moves the running
     * countdown, and it sets the rest for the remaining sets of that exercise in
     * this session.
     */
    adjust: async (deltaSeconds) => {
      const current = get().timer;
      if (current === undefined) return;

      if (current.mode === 'rest' && current.exerciseId !== undefined) {
        const exerciseId = current.exerciseId;
        set((state) => ({
          restOverrides: {
            ...state.restOverrides,
            [exerciseId]: Math.max(
              0,
              (state.restOverrides[exerciseId] ?? current.totalSeconds) + deltaSeconds,
            ),
          },
        }));
      }

      await persist(adjustTimer(current, deltaSeconds, Date.now()));
    },

    skip: async () => {
      set({ expanded: false, finishedWhileHidden: false });
      await persist(undefined);
    },

    dismiss: async () => {
      set({ finishedWhileHidden: false });
      await persist(undefined);
    },

    setExpanded: (expanded) => set({ expanded }),

    handleElapsed: (now, wasHidden) => {
      const current = get().timer;
      if (current === undefined || !hasElapsed(current, now)) return { kind: 'none' };
      if (current.alerted === true) return { kind: 'none' };

      if (current.mode === 'interval' && current.intervalSpec !== undefined) {
        const next = advanceInterval(current, current.intervalSpec, now);
        if (next !== undefined) {
          const phase = next.interval?.phase ?? 'work';
          alertNow(phase === 'work' ? 'work' : 'rest', current.contextLabel);
          void persist({ ...current, ...next, alerted: false });
          return { kind: 'interval-advanced' };
        }
        alertNow('finished', current.contextLabel);
        set({ finishedWhileHidden: wasHidden });
        void persist({ ...current, alerted: true });
        return { kind: 'interval-finished', target: current.completionTarget };
      }

      alertNow('finished', current.contextLabel);
      set({ finishedWhileHidden: wasHidden });
      void persist({ ...current, alerted: true });

      if (current.mode === 'hold') {
        return { kind: 'hold-finished', target: current.completionTarget };
      }
      return { kind: 'rest-finished' };
    },

    restSecondsFor: (exerciseId, prescribed) => get().restOverrides[exerciseId] ?? prescribed,
  };
});

/** Re-exported so callers do not reach into core for the common read. */
export type { TimerState };
