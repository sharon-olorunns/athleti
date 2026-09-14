import type { TimerMode } from './library';

export interface MorningCheck {
  /** ISO yyyy-mm-dd. */
  date: string;
  /** 0–10. */
  kneeScore: number;
  priorSessionId?: string;
}

export interface TimerState {
  mode: TimerMode;
  /** Epoch ms — the single source of truth. Never decrement a counter. */
  endsAt: number;
  totalSeconds: number;
  paused: boolean;
  remainingWhenPaused?: number;
  /** "Trap bar deadlift · set 2 of 4" */
  contextLabel: string;
  interval?: { round: number; totalRounds: number; phase: 'work' | 'rest' };
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  units: 'kg' | 'lb';
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  /**
   * Wake Lock during active workouts. Defaults ON: on iOS this is the only thing
   * that actually keeps the timer alive, so an hour of screen-on battery is the
   * trade (section 6).
   */
  keepScreenAwake: boolean;
  /**
   * The silent looping audio element that keeps the audio session alive while
   * Safari is backgrounded with the screen still on. Costs battery, does not
   * survive a locked screen, so it is off unless asked for.
   */
  backgroundAudioKeepAlive: boolean;
  /** 0-1. Full by default — a gym is loud. */
  alertVolume: number;
  /** Default true. */
  autoStartRestTimer: boolean;
  /** Default 2.5. */
  plateIncrementKg: number;
  /** Which rung of the pull-up ladder the pull-up slots resolve to (section 8b). */
  currentLadderStage: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  units: 'kg',
  soundEnabled: true,
  vibrationEnabled: true,
  keepScreenAwake: true,
  backgroundAudioKeepAlive: false,
  alertVolume: 1,
  autoStartRestTimer: true,
  plateIncrementKg: 2.5,
  currentLadderStage: 1,
};
