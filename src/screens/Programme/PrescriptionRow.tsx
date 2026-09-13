import type { Exercise, Prescription } from '@/types';
import { logsPerSide, targetText } from '@/core/prescription';
import { Chip } from '@/components/Chip';
import { equipmentLabel, PROGRESSION_TINT, restPhrase } from '@/components/labels';
import styles from './PrescriptionRow.module.css';

interface Props {
  prescription: Prescription;
  exercise: Exercise | undefined;
  onOpenExercise: (id: string) => void;
}

/** One prescribed exercise, exactly as the programme specifies it. Read-only. */
export function PrescriptionRow({ prescription, exercise, onOpenExercise }: Props) {
  if (exercise === undefined) {
    // The seed is validated on load, so this only shows if the library lost a row.
    return (
      <li className={styles.row}>
        <p className={styles.missing}>Unknown exercise: {prescription.exerciseId}</p>
      </li>
    );
  }

  const perSide = logsPerSide(prescription, exercise);
  const target = targetText(prescription);
  const rounds =
    prescription.timerMode === 'interval' && prescription.interval
      ? prescription.interval.rounds
      : prescription.sets;

  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <h4 className={styles.name}>
          <button
            type="button"
            className={styles.nameButton}
            onClick={() => onOpenExercise(exercise.id)}
          >
            {exercise.name}
          </button>
        </h4>
        <div>
          <span className={`${styles.target} num`}>
            {target === '' ? `${rounds}×` : `${rounds} × ${target}`}
          </span>
          {perSide && <span className={styles.perSide}>per side</span>}
        </div>
      </div>

      <div className={styles.meta}>
        {prescription.kneeModified && (
          <Chip variant="solid" tint="var(--knee)" title="Knee-modified prescription">
            KNEE
          </Chip>
        )}
        <Chip variant="tinted" tint={PROGRESSION_TINT[exercise.progression.type]}>
          {exercise.progression.label}
        </Chip>
        {exercise.equipment.map((item) => (
          <Chip key={item} variant="muted">
            {equipmentLabel(item)}
          </Chip>
        ))}
        {prescription.cutFirst && (
          <Chip variant="muted" title="Drop this one first when short on time">
            cut first
          </Chip>
        )}
        <span className={styles.rest}>{restPhrase(prescription.restSeconds)}</span>
      </div>

      {exercise.cue !== undefined && <p className={styles.cue}>{exercise.cue}</p>}
      {prescription.note !== undefined && <p className={styles.note}>{prescription.note}</p>}
    </li>
  );
}
