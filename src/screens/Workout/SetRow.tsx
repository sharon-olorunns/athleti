import { useEffect, useRef, useState } from 'react';
import type { Exercise, LoggedSet, TrackedField } from '@/types';
import type { PlannedRow, RowValues } from '@/core/workout';
import { formatWeight, stepFor } from '@/core/workout';
import { Stepper } from '@/components/Stepper';
import styles from './SetRow.module.css';

interface Props {
  row: PlannedRow;
  exercise: Exercise | undefined;
  values: RowValues;
  logged: LoggedSet | undefined;
  previous: LoggedSet | undefined;
  focused: boolean;
  plateIncrementKg: number;
  /**
   * Shown instead of a rep stepper when the prescription has no single rep count
   * to step — the mobility flows prescribe "6 / 30s / 8" across three movements.
   */
  staticRepText: string | undefined;
  onChange: (values: RowValues) => void;
  onComplete: (values: RowValues, wasClean: boolean) => void;
  onUncomplete: () => void;
}

const UNIT: Record<TrackedField, string> = {
  weight: 'kg',
  reps: 'reps',
  seconds: 'sec',
  distance: 'm',
};

/**
 * One set. Pre-filled with what was done last time, so the common case is a
 * single tap on the ✓ rather than any data entry at all.
 */
export function SetRow({
  row,
  exercise,
  values,
  logged,
  previous,
  focused,
  plateIncrementKg,
  staticRepText,
  onChange,
  onComplete,
  onUncomplete,
}: Props) {
  const isDone = logged !== undefined;
  const [wasClean, setWasClean] = useState(true);
  const ref = useRef<HTMLLIElement>(null);

  // A completed row shows how it was actually logged, not the local toggle.
  const clean = isDone ? logged.wasClean : wasClean;
  const tracks = exercise?.tracks ?? [];

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);

  const update = (field: keyof RowValues, value: number) => {
    onChange({ ...values, [field]: value });
  };

  return (
    <li
      ref={ref}
      className={`${styles.row} ${isDone ? styles.done : ''} ${focused && !isDone ? styles.focused : ''}`}
    >
      <div className={styles.head}>
        <span className={styles.label}>Set {row.label}</span>
        {previous !== undefined && (
          <span className={styles.prev}>prev {describeSet(previous, tracks)}</span>
        )}
      </div>

      <div className={styles.inputs}>
        {tracks.includes('weight') && (
          <Stepper
            label={`Weight, set ${row.label}`}
            value={values.weightKg}
            onChange={(v) => update('weightKg', v)}
            step={stepFor('weight', plateIncrementKg)}
            decimals={1}
            unit={UNIT.weight}
            disabled={isDone}
          />
        )}
        {tracks.includes('reps') && staticRepText !== undefined && (
          <span className={styles.staticTarget}>{staticRepText}</span>
        )}
        {tracks.includes('reps') && staticRepText === undefined && (
          <Stepper
            label={`Reps, set ${row.label}`}
            value={values.reps}
            onChange={(v) => update('reps', v)}
            step={stepFor('reps', plateIncrementKg)}
            unit={UNIT.reps}
            disabled={isDone}
          />
        )}
        {tracks.includes('seconds') && (
          <Stepper
            label={`Seconds, set ${row.label}`}
            value={values.seconds}
            onChange={(v) => update('seconds', v)}
            step={stepFor('seconds', plateIncrementKg)}
            unit={UNIT.seconds}
            disabled={isDone}
          />
        )}
        {tracks.includes('distance') && (
          <Stepper
            label={`Distance, set ${row.label}`}
            value={values.distanceM}
            onChange={(v) => update('distanceM', v)}
            step={stepFor('distance', plateIncrementKg)}
            unit={UNIT.distance}
            disabled={isDone}
          />
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.quality} ${clean ? styles.clean : styles.grind}`}
          aria-pressed={!clean}
          onClick={() => {
            if (isDone) {
              // Re-log the same set with the other quality rather than forcing an undo.
              onComplete(values, !clean);
            } else {
              setWasClean(!clean);
            }
          }}
        >
          {clean ? 'Clean' : 'Grind'}
        </button>

        <button
          type="button"
          className={`${styles.complete} ${isDone ? styles.completeDone : ''}`}
          aria-label={isDone ? `Un-complete set ${row.label}` : `Complete set ${row.label}`}
          onClick={() => (isDone ? onUncomplete() : onComplete(values, wasClean))}
        >
          ✓
        </button>
      </div>
    </li>
  );
}

/** "8 @ 60" / "45s" / "20 m @ 40" — compact enough for ghost text. */
function describeSet(set: LoggedSet, tracks: readonly TrackedField[]): string {
  const parts: string[] = [];
  if (tracks.includes('reps') && set.reps !== undefined) parts.push(String(set.reps));
  if (tracks.includes('seconds') && set.seconds !== undefined) parts.push(`${set.seconds}s`);
  if (tracks.includes('distance') && set.distanceM !== undefined) parts.push(`${set.distanceM} m`);
  const core = parts.join(' ');
  if (tracks.includes('weight') && set.weightKg !== undefined) {
    return core === '' ? `${formatWeight(set.weightKg)}` : `${core} @ ${formatWeight(set.weightKg)}`;
  }
  return core;
}
