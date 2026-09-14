import { useMemo, useState } from 'react';
import { searchLibrary } from '@/core/alternatives';
import { gateFor, stageFor, unassistedAttempts } from '@/core/ladder';
import {
  kneeTrend,
  painTimeline,
  performancesOf,
  strengthSeries,
  weeklyAdherence,
  weeklyVolumeByMuscle,
} from '@/core/stats';
import { toDisplayWeight, weightUnitLabel } from '@/core/units';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart, type Band } from '@/components/charts/LineChart';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import styles from './Progress.module.css';

/**
 * The pain traffic light as shaded ranges. These are status colours and they mean
 * good/bad, which is exactly the case status colours are reserved for — so the
 * two data series wear accent and gray instead and never impersonate a band.
 */
const PAIN_BANDS: Band[] = [
  { from: 0, to: 3, tint: 'var(--pain-green)', label: '0–3' },
  { from: 3, to: 6, tint: 'var(--pain-amber)', label: '4–6' },
  { from: 6, to: 10, tint: 'var(--pain-red)', label: '7–10' },
];

const TREND_WORD = {
  settling: 'settling',
  flat: 'flat',
  worsening: 'worsening',
  unknown: 'not enough readings yet',
} as const;

export function ProgressScreen() {
  const library = useApp((s) => s.library);
  const exerciseById = useApp((s) => s.exercise);
  const morningChecks = useApp((s) => s.morningChecks);
  const units = useApp((s) => s.settings.units);
  const days = useApp((s) => s.days);
  const ladder = useApp((s) => s.ladder)();
  const ladderStage = useApp((s) => s.settings.currentLadderStage);
  const history = useWorkout((s) => s.history);

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | undefined>(undefined);

  const timeline = useMemo(() => painTimeline(history, morningChecks), [history, morningChecks]);
  const trend = kneeTrend(
    timeline.morning.length > 0 ? timeline.morning : timeline.session,
    Date.now(),
  );

  const volume = useMemo(() => weeklyVolumeByMuscle(history, exerciseById), [history, exerciseById]);
  const adherence = useMemo(
    () => weeklyAdherence(history, days.length),
    [history, days.length],
  );

  // Only exercises that have actually been performed can be charted.
  const performed = useMemo(() => {
    const ids = new Set(
      history.flatMap((session) =>
        session.entries.filter((entry) => entry.sets.length > 0).map((entry) => entry.exerciseId),
      ),
    );
    return new Map([...library.entries()].filter(([id]) => ids.has(id)));
  }, [history, library]);

  const results = useMemo(
    () => (query.trim() === '' ? [...performed.values()] : searchLibrary(query, performed)),
    [query, performed],
  );

  const pickedExercise = picked === undefined ? undefined : library.get(picked);
  const series = strengthSeries(
    pickedExercise,
    picked === undefined ? [] : performancesOf(picked, history),
  );

  // Weights are stored in kilograms; the axis converts at the display boundary.
  const weightSeries = series.kind === 'e1rm' || series.kind === 'assistance';
  const strengthLabel = weightSeries
    ? series.label.replace('(kg)', `(${weightUnitLabel(units)})`)
    : series.label;
  const strengthPoints = weightSeries
    ? series.points.map((p) => ({ ...p, value: toDisplayWeight(p.value, units) }))
    : series.points;

  const latestWeek = volume[volume.length - 1];

  const stage = stageFor(ladder, ladderStage);
  const attempts = useMemo(() => unassistedAttempts(history), [history]);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Progress</h1>

      {/* The chart that answers "is this actually getting better". */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Knee</h2>
        <p className={styles.sectionNote}>
          Morning-after scores matter more than the number during a session — pain
          settling within 24 hours is the rule.
        </p>

        <div className={styles.bandKey}>
          {PAIN_BANDS.map((band) => (
            <span key={band.label} className={styles.bandItem}>
              <span
                className={styles.bandSwatch}
                style={{ background: band.tint, opacity: 0.45 }}
              />
              {band.label}
            </span>
          ))}
        </div>

        <LineChart
          title="Knee pain"
          valueLabel="0–10"
          bands={PAIN_BANDS}
          domain={{ min: 0, max: 10 }}
          // Gridlines on the band boundaries, so the scale and the traffic light
          // agree rather than cutting across each other.
          ticks={[0, 3, 6, 10]}
          formatValue={(v) => String(Math.round(v))}
          series={[
            { id: 'morning', label: 'Morning after', points: timeline.morning, emphasis: true },
            { id: 'session', label: 'During session', points: timeline.session, emphasis: false },
          ]}
        />

        <p className={styles.trend}>
          Last 14 days:{' '}
          <span className={`${styles.trendWord} ${styles[trend] ?? ''}`}>{TREND_WORD[trend]}</span>
        </p>
      </section>

      {stage !== undefined && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pull-up ladder</h2>
          <p className={styles.sectionNote}>
            Stage {stage.stage} of {ladder.length} · {stage.name}
          </p>

          {gateFor(ladder, ladderStage) !== undefined && (
            <p className={styles.trend}>
              Move up when:{' '}
              <span className={styles.trendWord}>{gateFor(ladder, ladderStage)}</span>
            </p>
          )}

          {attempts.firstSuccessAt !== undefined && (
            /* The thing this whole feature exists for. It gets a line of its own. */
            <p className={styles.milestone}>
              First unassisted rep ·{' '}
              {new Date(attempts.firstSuccessAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          )}

          {attempts.asked === 0 ? (
            <p className={styles.empty}>
              Fresh unassisted attempts start being logged at stage 3.
            </p>
          ) : (
            <div className={styles.attemptStats}>
              <span className={styles.attemptStat}>
                <span className={styles.attemptValue}>{attempts.streak}</span>
                session{attempts.streak === 1 ? '' : 's'} in a row attempted
              </span>
              <span className={styles.attemptStat}>
                <span className={styles.attemptValue}>
                  {attempts.attempted}/{attempts.asked}
                </span>
                attempted overall
              </span>
              <span className={styles.attemptStat}>
                <span className={styles.attemptValue}>{attempts.successes}</span>
                clean rep{attempts.successes === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Strength</h2>
        <p className={styles.sectionNote}>
          Pick an exercise. Jumps and warm-ups have no chart by design.
        </p>

        <input
          className={styles.picker}
          type="search"
          placeholder="Search performed exercises…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          aria-label="Search exercises"
        />

        {results.length === 0 ? (
          <p className={styles.empty}>Nothing logged yet.</p>
        ) : (
          <div className={styles.results}>
            {results.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className={`${styles.result} ${picked === exercise.id ? styles.resultActive : ''}`}
                onClick={() => setPicked(exercise.id)}
              >
                {exercise.name}
              </button>
            ))}
          </div>
        )}

        {pickedExercise !== undefined &&
          (series.kind === 'none' ? (
            <p className={styles.empty}>
              {pickedExercise.name} progresses by {pickedExercise.progression.label.replace(/^[↑↓]\s*/u, '').toLowerCase()},
              not by a number worth plotting.
            </p>
          ) : (
            <LineChart
              title={pickedExercise.name}
              valueLabel={
                series.lowerIsBetter ? `${strengthLabel} · lower is better` : strengthLabel
              }
              series={[
                { id: 'main', label: strengthLabel, points: strengthPoints, emphasis: true },
              ]}
            />
          ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Weekly volume</h2>
        <p className={styles.sectionNote}>
          Working sets per muscle. A set counts for each of the exercise&apos;s primary muscles.
        </p>
        {latestWeek === undefined ? (
          <p className={styles.empty}>Nothing logged yet.</p>
        ) : (
          <div className={styles.weekBlock}>
            <p className={styles.weekLabel}>Week {latestWeek.weekNumber}</p>
            <BarChart
              title=""
              valueLabel="sets"
              rows={latestWeek.muscles.slice(0, 8).map((m) => ({ label: m.muscle, value: m.sets }))}
            />
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Adherence</h2>
        <p className={styles.sectionNote}>
          Sessions completed each week, against the {days.length} the programme prescribes.
        </p>
        <BarChart
          title=""
          valueLabel="of 4"
          target={4}
          rows={adherence.map((week) => ({
            label: `Week ${week.weekNumber}`,
            value: week.completed,
            note: `of ${week.target}`,
          }))}
        />
      </section>
    </div>
  );
}
