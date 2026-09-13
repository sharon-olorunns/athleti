import type { Exercise, ReintroductionEntry } from '@/types';
import { Chip } from '@/components/Chip';
import { PROGRESSION_TINT } from '@/components/labels';
import styles from './DeferredView.module.css';

interface Props {
  schedule: ReintroductionEntry[];
  exercise: (id: string) => Exercise | undefined;
  currentWeek: number;
}

/**
 * The phase1Excluded exercises and when they come back. They are deliberately
 * absent from every day's blocks, so this is the only place they appear — without
 * it the deferred work would be invisible.
 */
export function DeferredView({ schedule, exercise, currentWeek }: Props) {
  const byWeek = [...schedule].sort((a, b) => a.week - b.week);

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>Deferred exercises</h2>
      <p className={styles.intro}>
        Held back during Phase 1 and reintroduced from the week-5 reassessment onwards. These do
        not appear in any day until then.
      </p>

      {byWeek.map((entry) => {
        const due = currentWeek >= entry.week;
        return (
          <section key={entry.week} className={styles.entry}>
            <header className={styles.entryHead}>
              <span className={styles.week}>Week {entry.week}</span>
              {due ? (
                <Chip variant="tinted" tint="var(--cns-low)">
                  due
                </Chip>
              ) : (
                <Chip variant="muted">in {entry.week - currentWeek} weeks</Chip>
              )}
            </header>

            <p className={styles.startAt}>
              <span className={styles.startAtLabel}>Start at</span>
              {entry.startAt}
            </p>

            <ul className={styles.list}>
              {entry.exerciseIds.map((id) => {
                const found = exercise(id);
                return (
                  <li key={id} className={styles.item}>
                    <p className={styles.name}>{found?.name ?? id}</p>
                    {found !== undefined && (
                      <>
                        <div className={styles.chips}>
                          <Chip variant="tinted" tint={PROGRESSION_TINT[found.progression.type]}>
                            {found.progression.label}
                          </Chip>
                          {found.kneeSensitive && (
                            <Chip variant="tinted" tint="var(--knee)">
                              knee-sensitive
                            </Chip>
                          )}
                          {found.painTracked && <Chip variant="muted">pain tracked</Chip>}
                        </div>
                        {found.progression.note !== undefined && (
                          <p className={styles.cue}>{found.progression.note}</p>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
