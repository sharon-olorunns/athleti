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

/**
 * One rung of the pull-up ladder (section 8b). The user is working toward a first
 * unassisted rep, which is a staged progression rather than a single exercise, so
 * the stages are data rather than something to remember.
 */
export interface LadderStage {
  /** 1-indexed, contiguous. */
  stage: number;
  /** "Negatives — the one that works" */
  name: string;
  prescriptions: LadderPrescription[];
  /**
   * Plain-English criterion for moving up, e.g. "A controlled 8-second negative".
   * `null` on the last stage, which has nowhere to go.
   */
  gate: string | null;
  /** "Attempt one unassisted rep, fresh, before anything else." */
  attemptUnassistedFirst?: boolean;
}

/**
 * A stage's prescription. Deliberately thinner than `Prescription`: rest, timer
 * mode and the per-side flag come from the programme slot it lands in, so the
 * ladder describes the work and the day describes how it is run.
 */
export interface LadderPrescription {
  exerciseId: string;
  sets: number;
  reps?: string;
  holdSeconds?: number;
  note?: string;
}
