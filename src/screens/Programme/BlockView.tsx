import type { Block, Exercise } from '@/types';
import { PrescriptionRow } from './PrescriptionRow';
import styles from './BlockView.module.css';

interface Props {
  block: Block;
  exercise: (id: string) => Exercise | undefined;
}

/**
 * One block of a day. `estimatedMinutes` is shown for pacing and never used to
 * drive anything.
 */
export function BlockView({ block, exercise }: Props) {
  return (
    <section className={styles.block}>
      <div className={styles.head}>
        <span className={styles.letter}>{block.letter}</span>
        <h3 className={styles.name}>{block.name}</h3>
        <span className={styles.estimate}>~{block.estimatedMinutes} min</span>
      </div>

      <ul className={styles.items}>
        {block.items.map((item, index) =>
          item.kind === 'single' ? (
            <PrescriptionRow
              key={`${item.prescription.exerciseId}-${index}`}
              prescription={item.prescription}
              exercise={exercise(item.prescription.exerciseId)}
            />
          ) : (
            <li key={`superset-${index}`} className={styles.superset}>
              <p className={styles.supersetLabel}>{item.label}</p>
              <ul className={styles.supersetItems}>
                {item.prescriptions.map((prescription, pairIndex) => (
                  <PrescriptionRow
                    key={`${prescription.exerciseId}-${pairIndex}`}
                    prescription={prescription}
                    exercise={exercise(prescription.exerciseId)}
                  />
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
