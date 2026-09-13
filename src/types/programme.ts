/** The seeded programme: five days of blocks and prescriptions. */
import type { CnsLoad, TimerMode } from './library';

export interface Prescription {
  exerciseId: string;
  sets: number;
  /** "5", "6-8", "8-10" — a range means double progression. */
  reps?: string;
  /** Isometrics. */
  holdSeconds?: number;
  /** Sled, carries. */
  distanceM?: number;
  restSeconds: number;
  perSide: boolean;
  /** Drop this when short on time. */
  cutFirst: boolean;
  /** Show the KNEE badge. */
  kneeModified: boolean;
  timerMode: TimerMode;
  interval?: { workSeconds: number; restSeconds: number; rounds: number };
  note?: string;
}

export type BlockItem =
  | { kind: 'single'; prescription: Prescription }
  | {
      kind: 'superset';
      label: string;
      restBetweenPairsSeconds: number;
      prescriptions: Prescription[];
    };

export interface Block {
  /** "W", "A", "B", "C" */
  letter: string;
  /** "Power & acceleration" */
  name: string;
  /** Display and pacing only — never drives logic. */
  estimatedMinutes: number;
  items: BlockItem[];
}

export interface ProgrammeDay {
  id: string;
  /** "Day 1 · Mon" */
  dayLabel: string;
  /** "Lower Strength + Power" */
  title: string;
  cnsLoad: CnsLoad;
  targetMinutes: number;
  /** Day 3 is not a gym trip. */
  atHome: boolean;
  blocks: Block[];
  note?: string;
}

export interface Programme {
  id: string;
  name: string;
  /** "Phase 1 — knee-adapted" */
  phase: string;
  days: ProgrammeDay[];
  /** Seed carries programme-level notes; kept for the Programme screen. */
  notes?: string;
}

/**
 * When the phase1Excluded exercises come back, straight from the seed. Shown on
 * the Programme screen so the deferred work is visible rather than lost.
 */
export interface ReintroductionEntry {
  week: number;
  exerciseIds: string[];
  /** "Low box, 3 × 3. Step down, never jump down." */
  startAt: string;
}
