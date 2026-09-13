import { useEffect, useState } from 'react';
import { isDeloadWeek, nextDayId } from '@/core/schedule';
import { durationLabel, sessionStats } from '@/core/session';
import { morningCheckDue } from '@/core/pain';
import { permanentSubstitutionCandidate, substitutionKey } from '@/core/alternatives';
import { getMeta, META_KEYS, setMeta } from '@/db/db';
import { Chip } from '@/components/Chip';
import { PainScale } from '@/components/pain/PainScale';
import { CNS_LABEL, CNS_TINT, minutesLabel } from '@/components/labels';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import styles from './TodayScreen.module.css';

/** "Mon 8 Sep" — short enough for a summary line. */
function shortDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Section 5.1 — what am I doing, and how is it going.
 *
 * The knee sparkline and the export reminder belong here too, but they need pain
 * data and exports, which arrive in later milestones.
 */
export function TodayScreen({ onStarted }: { onStarted: () => void }) {
  const programme = useApp((s) => s.programme);
  const exerciseById = useApp((s) => s.exercise);
  const currentWeek = useApp((s) => s.currentWeek());

  const morningChecks = useApp((s) => s.morningChecks);
  const saveMorningCheck = useApp((s) => s.saveMorningCheck);
  const makeSubstitutionPermanent = useApp((s) => s.makeSubstitutionPermanent);

  const session = useWorkout((s) => s.session);
  const history = useWorkout((s) => s.history);
  const start = useWorkout((s) => s.start);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [dismissedMornings, setDismissedMornings] = useState<string[]>([]);
  const [dismissedSwaps, setDismissedSwaps] = useState<string[]>([]);

  // Both prompts are offered once and remembered, so neither becomes a nag.
  useEffect(() => {
    void getMeta<string[]>(META_KEYS.dismissedMorningChecks).then((v) =>
      setDismissedMornings(v ?? []),
    );
    void getMeta<string[]>(META_KEYS.dismissedSubstitutions).then((v) => setDismissedSwaps(v ?? []));
  }, []);

  if (programme === undefined) return null;

  const days = programme.days;
  const lastSession = history[0];
  const suggestedId = nextDayId(
    days.map((d) => d.id),
    lastSession?.programmeDayId,
  );
  const suggested = days.find((d) => d.id === suggestedId) ?? days[0];
  const active = session !== undefined;
  const activeDay = days.find((d) => d.id === session?.programmeDayId);

  const lastDay = days.find((d) => d.id === lastSession?.programmeDayId);
  const lastStats =
    lastSession === undefined ? undefined : sessionStats(lastSession, lastDay, exerciseById);

  const begin = (dayId: string) => {
    void start(dayId).then(onStarted);
  };

  const morning = morningCheckDue(history, morningChecks, Date.now(), dismissedMornings);
  const swapCandidate = permanentSubstitutionCandidate(history, dismissedSwaps);
  const swapPrescribed = swapCandidate === undefined ? undefined : exerciseById(swapCandidate.prescribedId);
  const swapPerformed = swapCandidate === undefined ? undefined : exerciseById(swapCandidate.performedId);

  const dismissMorning = (date: string) => {
    const next = [...dismissedMornings, date];
    setDismissedMornings(next);
    void setMeta(META_KEYS.dismissedMorningChecks, next);
  };

  const dismissSwap = (key: string) => {
    const next = [...dismissedSwaps, key];
    setDismissedSwaps(next);
    void setMeta(META_KEYS.dismissedSubstitutions, next);
  };

  return (
    <div className={styles.screen}>
      <p className={styles.greeting}>{programme.name}</p>
      <div className={styles.chips}>
        <Chip variant="tinted" tint="var(--accent)">
          {programme.phase}
        </Chip>
        <Chip>Week {currentWeek}</Chip>
        {isDeloadWeek(currentWeek) && (
          <Chip variant="solid" tint="var(--cns-moderate)">
            DELOAD
          </Chip>
        )}
      </div>

      {morning !== undefined && (
        <section className={styles.card}>
          <p className={styles.cardTitle}>How was the knee this morning?</p>
          <p className={styles.cardBody}>
            The morning after matters more than the score during a session.
          </p>
          <div className={styles.scale}>
            <PainScale
              question=""
              value={undefined}
              onSelect={(score) => {
                void saveMorningCheck({
                  date: morning.date,
                  kneeScore: score,
                  priorSessionId: morning.priorSessionId,
                });
              }}
              onSkip={() => dismissMorning(morning.date)}
              skipLabel="Dismiss"
            />
          </div>
        </section>
      )}

      {swapCandidate !== undefined && swapPrescribed !== undefined && swapPerformed !== undefined && (
        <section className={styles.card}>
          <p className={styles.cardTitle}>Make this substitution permanent?</p>
          <p className={styles.cardBody}>
            You have done {swapPerformed.name} in place of {swapPrescribed.name}{' '}
            {swapCandidate.count} times. Update the programme to prescribe it?
          </p>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.cardButton}
              onClick={() =>
                dismissSwap(substitutionKey(swapCandidate.prescribedId, swapCandidate.performedId))
              }
            >
              Keep as is
            </button>
            <button
              type="button"
              className={`${styles.cardButton} ${styles.cardPrimary}`}
              onClick={() => {
                void makeSubstitutionPermanent(
                  swapCandidate.prescribedId,
                  swapCandidate.performedId,
                );
                dismissSwap(substitutionKey(swapCandidate.prescribedId, swapCandidate.performedId));
              }}
            >
              Update programme
            </button>
          </div>
        </section>
      )}

      <section className={styles.next}>
        <p className={styles.nextLabel}>{active ? 'In progress' : 'Up next'}</p>
        <h1 className={styles.nextTitle}>{(active ? activeDay : suggested)?.title}</h1>

        {(() => {
          const day = active ? activeDay : suggested;
          if (day === undefined) return null;
          return (
            <div className={styles.nextMeta}>
              <Chip variant="muted">{day.dayLabel}</Chip>
              <Chip variant="tinted" tint={CNS_TINT[day.cnsLoad]}>
                {CNS_LABEL[day.cnsLoad]}
              </Chip>
              <Chip>{minutesLabel(day.targetMinutes)}</Chip>
              {day.atHome && <Chip variant="muted">At home</Chip>}
            </div>
          );
        })()}

        {!active && (
          <>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setPickerOpen(!pickerOpen)}
              aria-expanded={pickerOpen}
            >
              {pickerOpen ? 'Hide other days' : 'Start a different day'}
            </button>

            {pickerOpen && (
              <div className={styles.picker}>
                {days.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    className={styles.pickerDay}
                    onClick={() => begin(day.id)}
                  >
                    <span className={styles.pickerLabel}>{day.dayLabel.split('·')[0]}</span>
                    <span className={styles.pickerTitle}>{day.title}</span>
                    <Chip variant="tinted" tint={CNS_TINT[day.cnsLoad]}>
                      {minutesLabel(day.targetMinutes)}
                    </Chip>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Last session</h2>
        {lastSession === undefined || lastStats === undefined ? (
          <p className={styles.empty}>Nothing logged yet.</p>
        ) : (
          <div className={styles.last}>
            <div className={styles.lastHead}>
              <span className={styles.lastTitle}>{lastDay?.title ?? 'Session'}</span>
              <span className={styles.lastDate}>{shortDate(lastSession.startedAt)}</span>
            </div>
            <div className={styles.lastMeta}>
              <span>{durationLabel(lastStats.durationMs)}</span>
              <span>·</span>
              <span>
                {lastStats.completedSets}/{lastStats.plannedSets} sets
              </span>
              <span>·</span>
              <span className={lastStats.allSetsCompleted ? styles.complete : styles.incomplete}>
                {lastStats.allSetsCompleted ? 'all sets completed' : `${lastStats.completionPct}%`}
              </span>
            </div>
          </div>
        )}
      </section>

      <div className={styles.actionBar}>
        {active ? (
          <button
            type="button"
            className={`${styles.start} ${styles.resume}`}
            onClick={onStarted}
          >
            Resume workout
          </button>
        ) : (
          <button
            type="button"
            className={styles.start}
            onClick={() => suggested !== undefined && begin(suggested.id)}
          >
            Start workout
          </button>
        )}
      </div>
    </div>
  );
}
