/** Everything the user actually did. Written on every mutation, never on session end. */

export interface LoggedSet {
  /** 0-based. */
  setIndex: number;
  /** Unilateral only. */
  side?: 'L' | 'R';
  weightKg?: number;
  reps?: number;
  seconds?: number;
  distanceM?: number;
  /** Hit the target with good form — drives progression. */
  wasClean: boolean;
  completedAt: number;
}

export interface LoggedExercise {
  /** What was ACTUALLY performed. */
  exerciseId: string;
  /** What the programme prescribed, if swapped. */
  substitutedForId?: string;
  substitutionReason?: string;
  sets: LoggedSet[];
  /** 0–10, if exercise.painTracked. */
  painScore?: number;
  /** For progression.type === 'quality'. */
  qualityConfirmed?: boolean;
  skipped?: boolean;
}

export interface WorkoutSession {
  id: string;
  programmeDayId: string;
  /** 1-indexed from programme start; week 5 = deload. */
  weekNumber: number;
  /** Epoch ms. */
  startedAt: number;
  finishedAt?: number;
  entries: LoggedExercise[];
  /** 0–10, optional, asked at session start. */
  prePainScore?: number;
  postPainScore?: number;
  notes?: string;
}
