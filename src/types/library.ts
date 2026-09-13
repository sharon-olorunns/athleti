/**
 * The exercise library: seeded from `seed-programme.json`, extendable by the user.
 * Types here mirror section 4 of the requirements verbatim.
 */

/**
 * How an exercise is allowed to get harder. Applying the wrong currency ruins the
 * exercise — adding load to a jump turns it into a strength exercise — so this
 * discriminator drives the whole progression engine.
 */
export type ProgressionType = 'load' | 'quality' | 'time' | 'fixed';

export type Equipment =
  | 'barbell' | 'trap-bar' | 'dumbbell' | 'kettlebell' | 'cable'
  | 'machine' | 'smith' | 'landmine' | 'sled' | 'band'
  | 'bodyweight' | 'med-ball' | 'plate' | 'erg' | 'box';

/** Which inputs a set row shows. */
export type TrackedField = 'weight' | 'reps' | 'seconds' | 'distance';

export type CnsLoad = 'high' | 'moderate' | 'low';

export type TimerMode = 'rest' | 'hold' | 'interval';

export interface ProgressionRule {
  type: ProgressionType;
  /** Shown verbatim in the UI, e.g. "+2.5–5 kg/wk". */
  label: string;
  /** For 'load': enables double progression. */
  repRange?: [number, number];
  /** Smallest sensible jump. */
  incrementKg?: number;
  /** true = the number goes DOWN (assisted pull-up). */
  inverse?: boolean;
  /** true = hard-block weight suggestions (Nordics, plyos). */
  neverAddLoad?: boolean;
  /** For 'time'. */
  holdIncrementSeconds?: number;
  /** Longer explanation, shown on exercise detail. */
  note?: string;
}

export interface Alternative {
  /** Set if the substitute already exists in the library. */
  exerciseId?: string;
  name: string;
  /** "machine taken", "no sled", "knee sore" */
  reason: string;
  kneeSafe: boolean;
}

export interface Exercise {
  /** kebab-case, stable, never reused. */
  id: string;
  name: string;
  equipment: Equipment[];
  /** Display strings, e.g. "Glute max". */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  tracks: TrackedField[];
  /** Logged per side. */
  unilateral: boolean;
  progression: ProgressionRule;
  /** One-line coaching note shown on the card. */
  cue?: string;
  /** Loads the front of the knee. */
  kneeSensitive: boolean;
  /** Prompts for a pain score after the exercise. */
  painTracked: boolean;
  /** Deferred until the week-5 reassessment. */
  phase1Excluded: boolean;
  /** When phase1Excluded. */
  reintroduceWeek?: number;
  alternatives: Alternative[];
}
