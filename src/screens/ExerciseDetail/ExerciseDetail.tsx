import type { CSSProperties } from 'react';
import { resolveAlternatives } from '@/core/alternatives';
import { performancesOf, strengthSeries, topSet } from '@/core/stats';
import { summariseSets } from '@/core/workout';
import { formatWeight } from '@/core/workout';
import { Chip } from '@/components/Chip';
import { LineChart } from '@/components/charts/LineChart';
import { equipmentLabel, PROGRESSION_TINT } from '@/components/labels';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import styles from './ExerciseDetail.module.css';

const shortDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });

/**
 * Section 5.3, reached by tapping an exercise name anywhere.
 *
 * The chart follows the progression currency: an estimated 1RM for load, total
 * hold seconds for time, and nothing at all for quality and fixed — plotting a
 * jump's weight would be meaningless and misleading, so those get the history
 * list and an explanation instead.
 */
export function ExerciseDetail({ exerciseId, onClose }: { exerciseId: string; onClose: () => void }) {
  const exercise = useApp((s) => s.exercise(exerciseId));
  const library = useApp((s) => s.library);
  const history = useWorkout((s) => s.history);

  if (exercise === undefined) return null;

  const performances = performancesOf(exerciseId, history);
  const series = strengthSeries(exercise, performances);
  const inverse = exercise.progression.inverse === true;
  const alternatives = resolveAlternatives(exercise, library);
  const tint = PROGRESSION_TINT[exercise.progression.type];

  return (
    <div className={styles.sheet} role="dialog" aria-label={exercise.name}>
      <header className={styles.head}>
        <button type="button" className={styles.back} onClick={onClose}>
          ← Back
        </button>
        <h1 className={styles.name}>{exercise.name}</h1>
        <div className={styles.chips}>
          {exercise.equipment.map((item) => (
            <Chip key={item} variant="muted">
              {equipmentLabel(item)}
            </Chip>
          ))}
          {exercise.kneeSensitive && (
            <Chip variant="tinted" tint="var(--knee)">
              knee-sensitive
            </Chip>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.chips}>
          {exercise.primaryMuscles.map((muscle) => (
            <Chip key={muscle}>{muscle}</Chip>
          ))}
          {exercise.secondaryMuscles.map((muscle) => (
            <Chip key={muscle} variant="muted">
              {muscle}
            </Chip>
          ))}
        </div>

        {exercise.cue !== undefined && <p className={styles.cue}>{exercise.cue}</p>}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How it progresses</h2>
          <div className={styles.rule} style={{ '--tint': tint } as CSSProperties}>
            <span className={styles.ruleLabel}>{exercise.progression.label}</span>
            {exercise.progression.note !== undefined && (
              <span className={styles.ruleNote}>{exercise.progression.note}</span>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Progress</h2>
          {series.kind === 'none' ? (
            <p className={styles.noChart}>
              No chart for this one. {exercise.progression.type === 'quality'
                ? 'Its progression is quality, not load — plotting a number here would be misleading.'
                : 'It is fixed: it prepares or maintains rather than progressing.'}
            </p>
          ) : (
            <div className={styles.chart}>
              <LineChart
                title={series.label}
                valueLabel={series.lowerIsBetter ? 'lower is better' : ''}
                series={[
                  { id: 'main', label: series.label, points: series.points, emphasis: true },
                ]}
              />
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>History</h2>
          {performances.length === 0 ? (
            <p className={styles.empty}>Not performed yet.</p>
          ) : (
            <ul>
              {performances.map(({ at, entry }) => {
                const best = topSet(entry.sets, inverse);
                return (
                  <li key={`${at}-${entry.exerciseId}`} className={styles.historyRow}>
                    <span className={styles.historyDate}>{shortDate(at)}</span>
                    <span className={styles.historySets}>
                      {summariseSets(entry.sets, exercise)}
                      {entry.substitutedForId !== undefined && (
                        <span className={styles.swapMark}>
                          stood in for {useApp.getState().exercise(entry.substitutedForId)?.name ??
                            entry.substitutedForId}
                        </span>
                      )}
                    </span>
                    {best?.weightKg !== undefined && (
                      <span className={styles.historyTop}>
                        top {formatWeight(best.weightKg)} kg
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Alternatives</h2>
          {alternatives.length === 0 ? (
            <p className={styles.empty}>None listed.</p>
          ) : (
            <ul>
              {alternatives.map((alternative) => (
                <li key={alternative.key} className={styles.altRow}>
                  <span className={styles.altHead}>
                    <span className={styles.altName}>{alternative.name}</span>
                    {alternative.kneeSafe && (
                      <Chip variant="tinted" tint="var(--pain-green)">
                        knee-safe
                      </Chip>
                    )}
                  </span>
                  <span className={styles.altReason}>{alternative.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
