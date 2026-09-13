import { useState } from 'react';
import type { WorkoutSession } from '@/types';
import { durationLabel, sessionStats } from '@/core/session';
import { sessionPainScore } from '@/core/stats';
import { painTint } from '@/core/pain';
import { summariseSets } from '@/core/workout';
import { Chip } from '@/components/Chip';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import styles from './History.module.css';

const longDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** Section 5.4: reverse-chronological sessions, each opening a read-only view. */
export function HistoryScreen({ onOpenExercise }: { onOpenExercise: (id: string) => void }) {
  const programme = useApp((s) => s.programme);
  const exerciseById = useApp((s) => s.exercise);
  const history = useWorkout((s) => s.history);

  const [openId, setOpenId] = useState<string | undefined>(undefined);

  const sessions = [...history].sort((a, b) => b.startedAt - a.startedAt);
  const open = sessions.find((session) => session.id === openId);
  const dayOf = (session: WorkoutSession) =>
    programme?.days.find((day) => day.id === session.programmeDayId);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>History</h1>
      <p className={styles.subtitle}>
        {sessions.length === 0
          ? 'No sessions yet.'
          : `${sessions.length} session${sessions.length === 1 ? '' : 's'} logged`}
      </p>

      {sessions.length === 0 && (
        <p className={styles.empty}>Finished workouts appear here.</p>
      )}

      {sessions.map((session) => {
        const day = dayOf(session);
        const stats = sessionStats(session, day, exerciseById);
        const pain = sessionPainScore(session);
        return (
          <button
            key={session.id}
            type="button"
            className={styles.row}
            onClick={() => setOpenId(session.id)}
          >
            <span className={styles.rowHead}>
              <span className={styles.rowTitle}>{day?.title ?? 'Session'}</span>
              <span className={styles.rowDate}>{longDate(session.startedAt)}</span>
            </span>
            <span className={styles.rowMeta}>
              <span>{durationLabel(stats.durationMs)}</span>
              <span className={styles.dot}>·</span>
              <span>
                {stats.completedSets}/{stats.plannedSets} sets
              </span>
              <span className={styles.dot}>·</span>
              <span className={stats.allSetsCompleted ? styles.complete : undefined}>
                {stats.completionPct}%
              </span>
              {pain !== undefined && (
                <>
                  <span className={styles.dot}>·</span>
                  <span className={styles.pain} style={{ color: painTint(pain) }}>
                    knee {pain}
                  </span>
                </>
              )}
            </span>
          </button>
        );
      })}

      {open !== undefined && (
        <SessionView
          session={open}
          onClose={() => setOpenId(undefined)}
          onOpenExercise={onOpenExercise}
        />
      )}
    </div>
  );
}

/** Read-only: a finished session is a record, not something to edit. */
function SessionView({
  session,
  onClose,
  onOpenExercise,
}: {
  session: WorkoutSession;
  onClose: () => void;
  onOpenExercise: (id: string) => void;
}) {
  const programme = useApp((s) => s.programme);
  const exerciseById = useApp((s) => s.exercise);

  const day = programme?.days.find((d) => d.id === session.programmeDayId);
  const stats = sessionStats(session, day, exerciseById);

  return (
    <div className={styles.sheet} role="dialog" aria-label="Session detail">
      <header className={styles.sheetHead}>
        <button type="button" className={styles.back} onClick={onClose}>
          ← Back
        </button>
        <h1 className={styles.title}>{day?.title ?? 'Session'}</h1>
        <p className={styles.subtitle}>
          {longDate(session.startedAt)} · week {session.weekNumber}
        </p>
        <div className={styles.stats}>
          <span className={styles.stat}>
            <span className={styles.statValue}>{durationLabel(stats.durationMs)}</span>
            <span className={styles.statLabel}>duration</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statValue}>
              {stats.completedSets}/{stats.plannedSets}
            </span>
            <span className={styles.statLabel}>sets</span>
          </span>
          {session.prePainScore !== undefined && (
            <span className={styles.stat}>
              <span className={styles.statValue} style={{ color: painTint(session.prePainScore) }}>
                {session.prePainScore}
              </span>
              <span className={styles.statLabel}>knee before</span>
            </span>
          )}
          {session.postPainScore !== undefined && (
            <span className={styles.stat}>
              <span className={styles.statValue} style={{ color: painTint(session.postPainScore) }}>
                {session.postPainScore}
              </span>
              <span className={styles.statLabel}>knee after</span>
            </span>
          )}
        </div>
      </header>

      <div className={styles.sheetBody}>
        {session.entries.map((entry) => {
          const exercise = exerciseById(entry.exerciseId);
          return (
            <div key={entry.exerciseId} className={styles.entry}>
              <span className={styles.entryHead}>
                <button
                  type="button"
                  className={styles.entryName}
                  onClick={() => onOpenExercise(entry.exerciseId)}
                >
                  {exercise?.name ?? entry.exerciseId}
                </button>
                <span className={styles.entrySummary}>
                  {entry.skipped === true ? 'skipped' : summariseSets(entry.sets, exercise)}
                </span>
              </span>

              {(entry.substitutedForId !== undefined ||
                entry.painScore !== undefined ||
                entry.qualityConfirmed !== undefined) && (
                <span className={styles.entryMeta}>
                  {entry.substitutedForId !== undefined && (
                    <Chip variant="muted">
                      for {exerciseById(entry.substitutedForId)?.name ?? entry.substitutedForId}
                    </Chip>
                  )}
                  {entry.painScore !== undefined && (
                    <Chip variant="tinted" tint={painTint(entry.painScore)}>
                      knee {entry.painScore}
                    </Chip>
                  )}
                  {entry.qualityConfirmed !== undefined && (
                    <Chip variant="muted">
                      quality {entry.qualityConfirmed ? 'held' : 'dropped'}
                    </Chip>
                  )}
                </span>
              )}

              {entry.sets.length > 0 && (
                <div className={styles.setList}>
                  {entry.sets.map((set) => (
                    <span
                      key={`${set.setIndex}-${set.side ?? ''}`}
                      className={`${styles.setLine} ${set.wasClean ? '' : styles.grind}`}
                    >
                      <span className={styles.setIndex}>
                        {set.setIndex + 1}
                        {set.side ?? ''}
                      </span>
                      <span>
                        {[
                          set.weightKg !== undefined ? `${set.weightKg} kg` : undefined,
                          set.reps !== undefined ? `${set.reps} reps` : undefined,
                          set.seconds !== undefined ? `${set.seconds}s` : undefined,
                          set.distanceM !== undefined ? `${set.distanceM} m` : undefined,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {set.wasClean ? '' : ' · grind'}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {session.notes !== undefined && <p className={styles.notes}>{session.notes}</p>}
      </div>
    </div>
  );
}
