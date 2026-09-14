import { useEffect, useState } from 'react';
import { isDeloadWeek, nextDayId } from '@/core/schedule';
import { durationLabel, sessionStats } from '@/core/session';
import { morningCheckDue, painTint } from '@/core/pain';
import { exportReminderDue } from '@/core/backup';
import { kneeTrend, painTimeline, recentPainPoints } from '@/core/stats';
import { Sparkline } from '@/components/charts/Sparkline';
import { permanentSubstitutionCandidate, substitutionKey } from '@/core/alternatives';
import { ladderExerciseIds } from '@/core/ladder';
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
export function TodayScreen({
  onStarted,
  onOpenSettings,
}: {
  onStarted: () => void;
  onOpenSettings: () => void;
}) {
  const programme = useApp((s) => s.programme);
  const days = useApp((s) => s.days);
  const ladder = useApp((s) => s.ladder)();
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
  const [exportDue, setExportDue] = useState(false);

  // Both prompts are offered once and remembered, so neither becomes a nag.
  useEffect(() => {
    void getMeta<string[]>(META_KEYS.dismissedMorningChecks).then((v) =>
      setDismissedMornings(v ?? []),
    );
    void getMeta<string[]>(META_KEYS.dismissedSubstitutions).then((v) => setDismissedSwaps(v ?? []));
  }, []);

  /*
   * The backup nudge: more than 30 days since the last export, or since the
   * first session if there has never been one. Offered once and dismissible —
   * losing everything to a cleared browser is the failure mode it guards.
   */
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getMeta<number>(META_KEYS.lastExportAt),
      getMeta<number>(META_KEYS.exportReminderDismissedAt),
    ]).then(([lastExport, dismissedAt]) => {
      if (cancelled) return;
      const earliest = history.reduce<number | undefined>(
        (min, session) => (min === undefined ? session.startedAt : Math.min(min, session.startedAt)),
        undefined,
      );
      const due = exportReminderDue(lastExport, earliest, Date.now());
      const alreadyDismissedSince = dismissedAt !== undefined && dismissedAt > (lastExport ?? 0);
      setExportDue(due && !alreadyDismissedSince);
    });
    return () => {
      cancelled = true;
    };
  }, [history]);

  if (programme === undefined) return null;


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

  const timeline = painTimeline(history, morningChecks);
  const kneePoints = recentPainPoints(timeline, Date.now());
  const trend = kneeTrend(
    timeline.morning.length > 0 ? timeline.morning : timeline.session,
    Date.now(),
  );
  const latestKnee = kneePoints[kneePoints.length - 1];

  const morning = morningCheckDue(history, morningChecks, Date.now(), dismissedMornings);
  const swapCandidate = permanentSubstitutionCandidate(
    history,
    dismissedSwaps,
    3,
    ladderExerciseIds(ladder),
  );
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

      {exportDue && (
        <section className={styles.card}>
          <p className={styles.cardTitle}>Back up your training</p>
          <p className={styles.cardBody}>
            It has been over a month. There is no server — an export is the only
            copy that survives a cleared browser.
          </p>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.cardButton}
              onClick={() => {
                setExportDue(false);
                void setMeta(META_KEYS.exportReminderDismissedAt, Date.now());
              }}
            >
              Not now
            </button>
            <button
              type="button"
              className={`${styles.cardButton} ${styles.cardPrimary}`}
              onClick={() => {
                setExportDue(false);
                onOpenSettings();
              }}
            >
              Export
            </button>
          </div>
        </section>
      )}

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

      {kneePoints.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Knee · last 14 days</h2>
          <div className={styles.knee}>
            {latestKnee !== undefined && (
              <span className={styles.kneeLatest} style={{ color: painTint(latestKnee.value) }}>
                {latestKnee.value}
              </span>
            )}
            <Sparkline points={kneePoints} />
            <span className={styles.kneeWords}>
              <span className={`${styles.kneeTrend} ${styles[trend] ?? ''}`}>
                {trend === 'unknown' ? 'not enough readings yet' : trend}
              </span>
            </span>
          </div>
        </section>
      )}

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
