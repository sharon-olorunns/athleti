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
  /** Wake Lock during active workouts. */
  keepScreenAwake: boolean;
  /** Default true. */
  autoStartRestTimer: boolean;
  /** Default 2.5. */
  plateIncrementKg: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  units: 'kg',
  soundEnabled: true,
  vibrationEnabled: true,
  keepScreenAwake: true,
  autoStartRestTimer: true,
  plateIncrementKg: 2.5,
};
