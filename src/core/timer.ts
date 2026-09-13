/**
 * Timer maths. Pure.
 *
 * The single rule everything here follows: `endsAt` is an absolute epoch
 * timestamp and the remaining time is derived from the current time on every
 * read. Nothing decrements a counter. Background tabs throttle timers to once a
 * minute or suspend them outright, so a counting timer drifts badly or stops —
 * which is exactly the failure that makes a gym timer useless.
 *
 * While paused, `endsAt` is meaningless and `remainingWhenPaused` holds the
 * truth. It is in **milliseconds**, so it composes with `endsAt` arithmetic
 * without rounding creeping in across repeated pauses.
 */
import type { TimerMode, TimerState } from '@/types';
import type { RowValues } from './workout';

export interface IntervalSpec {
  workSeconds: number;
  restSeconds: number;
  rounds: number;
}

export interface CreateTimerParams {
  mode: TimerMode;
  totalSeconds: number;
  /** "Trap bar deadlift · set 2 of 4" */
  contextLabel: string;
  now: number;
  /** Only for interval mode; the timer starts on round 1 of the work phase. */
  interval?: IntervalSpec;
}

export function createTimer({
  mode,
  totalSeconds,
  contextLabel,
  now,
  interval,
}: CreateTimerParams): TimerState {
  const seconds = mode === 'interval' && interval ? interval.workSeconds : totalSeconds;
  return {
    mode,
    endsAt: now + seconds * 1000,
    totalSeconds: seconds,
    paused: false,
    contextLabel,
    ...(mode === 'interval' && interval
      ? { interval: { round: 1, totalRounds: interval.rounds, phase: 'work' as const } }
      : {}),
  };
}

/** Milliseconds left, never negative. */
export function remainingMs(state: TimerState, now: number): number {
  if (state.paused) return Math.max(0, state.remainingWhenPaused ?? 0);
  return Math.max(0, state.endsAt - now);
}

/**
 * Seconds left as displayed. Rounded up, so a timer reads "90" for the whole
 * first second rather than flashing 89 immediately.
 */
export function remainingSeconds(state: TimerState, now: number): number {
  return Math.ceil(remainingMs(state, now) / 1000);
}

export function hasElapsed(state: TimerState, now: number): boolean {
  return !state.paused && now >= state.endsAt;
}

/** How long ago the timer finished — drives "rest finished 40s ago". */
export function overdueMs(state: TimerState, now: number): number {
  if (state.paused) return 0;
  return Math.max(0, now - state.endsAt);
}

/** Elapsed fraction, 0 to 1, for the progress ring. */
export function progress(state: TimerState, now: number): number {
  const totalMs = state.totalSeconds * 1000;
  if (totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs(state, now) / totalMs));
}

/** The last ten seconds, when the display changes colour and the ring pulses. */
export function isFinalCountdown(state: TimerState, now: number, thresholdSeconds = 10): boolean {
  const remaining = remainingMs(state, now);
  return remaining > 0 && remaining <= thresholdSeconds * 1000;
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.paused) return state;
  return { ...state, paused: true, remainingWhenPaused: remainingMs(state, now) };
}

export function resumeTimer(state: TimerState, now: number): TimerState {
  if (!state.paused) return state;
  const remaining = state.remainingWhenPaused ?? 0;
  const { remainingWhenPaused: _dropped, ...rest } = state;
  return { ...rest, paused: false, endsAt: now + remaining };
}

/**
 * The ±15s controls. The total moves with the remaining time so the ring keeps
 * showing a truthful proportion, and nothing can go below zero.
 */
export function adjustTimer(state: TimerState, deltaSeconds: number, now: number): TimerState {
  const deltaMs = deltaSeconds * 1000;
  const currentRemaining = remainingMs(state, now);
  const nextRemaining = Math.max(0, currentRemaining + deltaMs);
  const actualDeltaMs = nextRemaining - currentRemaining;
  const totalSeconds = Math.max(
    Math.ceil(nextRemaining / 1000),
    state.totalSeconds + actualDeltaMs / 1000,
  );

  if (state.paused) {
    return { ...state, remainingWhenPaused: nextRemaining, totalSeconds };
  }
  return { ...state, endsAt: now + nextRemaining, totalSeconds };
}

/**
 * Move an interval timer to its next phase, or return undefined when the work is
 * finished. The trailing rest after the final round is not run: the session is
 * over at the end of the last work period, and a countdown that keeps going
 * would only be in the way.
 */
export function advanceInterval(
  state: TimerState,
  spec: IntervalSpec,
  now: number,
): TimerState | undefined {
  const current = state.interval;
  if (current === undefined) return undefined;

  if (current.phase === 'work') {
    if (current.round >= current.totalRounds) return undefined;
    return {
      ...state,
      endsAt: now + spec.restSeconds * 1000,
      totalSeconds: spec.restSeconds,
      paused: false,
      interval: { ...current, phase: 'rest' },
    };
  }

  return {
    ...state,
    endsAt: now + spec.workSeconds * 1000,
    totalSeconds: spec.workSeconds,
    paused: false,
    interval: { ...current, round: current.round + 1, phase: 'work' },
  };
}

/** "40s ago", "2m ago" — how stale a finished timer is. */
export function overdueLabel(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/** "1:30" / "45" — the countdown itself, as shown on the bar and the ring. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  if (safe < 60) return String(safe);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

/** "Trap bar deadlift · set 2 of 4" */
export function contextLabelFor(exerciseName: string, setNumber: number, totalSets: number): string {
  return `${exerciseName} · set ${setNumber} of ${totalSets}`;
}

/**
 * The set a hold or interval timer logs when it reaches the end.
 *
 * `TimerState` deliberately carries only what the spec defines, so this travels
 * alongside it in storage: without it, a hold resumed after a reload would count
 * down and then have nothing to complete.
 */
export interface TimerCompletionTarget {
  exerciseId: string;
  setIndex: number;
  side?: 'L' | 'R';
  rowKey: string;
  /** The values to log for the set. */
  values: RowValues;
  /** The rest to start once the set is logged, from the prescription. */
  restSeconds: number;
  /** Context label for that follow-on rest timer. */
  restContextLabel: string;
}
