import type { Exercise, ProgrammeDay } from '@/types';
import { exerciseIdsOf, totalSetRows } from '@/core/prescription';
import { Chip } from '@/components/Chip';
import { CNS_LABEL, CNS_TINT, minutesLabel } from '@/components/labels';
import { BlockView } from './BlockView';
import styles from './DayView.module.css';

interface Props {
  day: ProgrammeDay;
  exercise: (id: string) => Exercise | undefined;
  onOpenExercise: (id: string) => void;
}

/** One programme day, read-only, exactly as prescribed. */
export function DayView({ day, exercise, onOpenExercise }: Props) {
  const setRows = totalSetRows(day, exercise);
  const exerciseCount = exerciseIdsOf(day).length;

  return (
    <div className={styles.day}>
      <p className={styles.label}>{day.dayLabel}</p>
      <h2 className={styles.title}>{day.title}</h2>

      <div className={styles.chips}>
        <Chip variant="tinted" tint={CNS_TINT[day.cnsLoad]}>
          {CNS_LABEL[day.cnsLoad]}
        </Chip>
        <Chip>{minutesLabel(day.targetMinutes)}</Chip>
        {day.atHome && <Chip variant="muted">At home</Chip>}
      </div>

      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={`${styles.statValue} num`}>{exerciseCount}</span>
          <span className={styles.statLabel}>exercises</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statValue} num`}>{setRows}</span>
          <span className={styles.statLabel}>sets to log</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statValue} num`}>{day.blocks.length}</span>
          <span className={styles.statLabel}>blocks</span>
        </div>
      </div>

      {day.note !== undefined && <p className={styles.note}>{day.note}</p>}

      {day.blocks.map((block) => (
        <BlockView
          key={block.letter}
          block={block}
          exercise={exercise}
          onOpenExercise={onOpenExercise}
        />
      ))}
    </div>
  );
}
