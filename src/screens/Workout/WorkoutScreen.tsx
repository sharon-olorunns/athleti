import { useEffect, useMemo, useRef, useState } from 'react';
import { currentItemIndex, workoutItems } from '@/core/workout';
import { formatClock, sessionStats } from '@/core/session';
import { minutesLabel } from '@/components/labels';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import { ExerciseCard } from './ExerciseCard';
import styles from './WorkoutScreen.module.css';

/** Ticks once a second so the elapsed clock stays live. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function WorkoutScreen({ onFinished }: { onFinished: () => void }) {
  const programme = useApp((s) => s.programme);
  const exerciseById = useApp((s) => s.exercise);
  const settings = useApp((s) => s.settings);

  const session = useWorkout((s) => s.session);
  const history = useWorkout((s) => s.history);
  const finish = useWorkout((s) => s.finish);
  const discard = useWorkout((s) => s.discard);
  const saveNotes = useWorkout((s) => s.saveNotes);

  const [expandedIndex, setExpandedIndex] = useState<number | undefined>(undefined);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const now = useNow(session !== undefined);
  const day = programme?.days.find((d) => d.id === session?.programmeDayId);
  const items = useMemo(() => workoutItems(day), [day]);

  const autoIndex = currentItemIndex(day, session, exerciseById);
  // The user can open any card; otherwise the first unfinished one is expanded.
  const openIndex = expandedIndex ?? autoIndex;

  // Finishing a card should bring the next one to the thumb, not leave the user
  // scrolling for it.
  const currentCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expandedIndex === undefined && autoIndex >= 0) {
      currentCardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [autoIndex, expandedIndex]);

  if (session === undefined || day === undefined) return null;

  const stats = sessionStats(session, day, exerciseById, now);
  const targetMs = day.targetMinutes * 60000;
  const overTarget = stats.durationMs > targetMs;
  const unlogged = stats.plannedSets - stats.completedSets;
  const nothingLogged = stats.completedSets === 0;

  const doFinish = (markSkipped: boolean) => {
    void finish(markSkipped, day).then(onFinished);
  };

  return (
    <div className={styles.screen}>
      <button
        type="button"
        className={styles.header}
        onClick={() => {
          setNotesDraft(session.notes ?? '');
          setNotesOpen(true);
        }}
      >
        <span className={styles.headerText}>
          <span className={styles.dayTitle}>{day.title}</span>
          <span className={styles.dayMeta}>
            {day.dayLabel} · week {session.weekNumber}
          </span>
        </span>
        <span className={styles.clockWrap}>
          <span className={`${styles.clock} ${overTarget ? styles.over : ''}`}>
            {formatClock(stats.durationMs)}
          </span>
          <span className={styles.target}>/ {minutesLabel(day.targetMinutes)}</span>
        </span>
      </button>

      <main className={styles.content}>
        {items.map(({ block, item, index }, position) => {
          const isFirstOfBlock =
            position === 0 || items[position - 1]?.block.letter !== block.letter;
          return (
            <div key={index} ref={index === openIndex ? currentCardRef : undefined}>
              {isFirstOfBlock && (
                <div className={styles.blockHead}>
                  <span className={styles.letter}>{block.letter}</span>
                  <span className={styles.blockName}>{block.name}</span>
                  <span className={styles.blockEstimate}>~{block.estimatedMinutes} min</span>
                </div>
              )}
              <ExerciseCard
                item={item}
                session={session}
                history={history}
                exerciseById={exerciseById}
                plateIncrementKg={settings.plateIncrementKg}
                expanded={index === openIndex}
                onExpand={() => setExpandedIndex(index === openIndex ? undefined : index)}
                onOpenNotes={() => {
                  setNotesDraft(session.notes ?? '');
                  setNotesOpen(true);
                }}
              />
            </div>
          );
        })}

        {autoIndex === -1 && <p className={styles.allDone}>Every set logged. Nice.</p>}
      </main>

      <div className={styles.finishBar}>
        {confirmingFinish && unlogged > 0 && (
          <div className={styles.prompt}>
            <p className={styles.promptText}>
              {unlogged} set{unlogged === 1 ? '' : 's'} still unlogged. Mark the rest as skipped?
            </p>
            <div className={styles.promptActions}>
              <button
                type="button"
                className={styles.promptButton}
                onClick={() => setConfirmingFinish(false)}
              >
                Keep going
              </button>
              <button
                type="button"
                className={`${styles.promptButton} ${styles.promptPrimary}`}
                onClick={() => doFinish(true)}
              >
                Skip &amp; finish
              </button>
            </div>
          </div>
        )}

        <div className={styles.progressText}>
          <span>
            {stats.completedSets} / {stats.plannedSets} sets
          </span>
          <span>{stats.completionPct}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${stats.completionPct}%` }} />
        </div>

        {nothingLogged ? (
          // Nothing logged means nothing to lose, so leaving is a clean discard.
          <button
            type="button"
            className={`${styles.finish} ${styles.discard}`}
            onClick={() => void discard().then(onFinished)}
          >
            Discard workout
          </button>
        ) : (
          <button
            type="button"
            className={styles.finish}
            onClick={() => (unlogged > 0 ? setConfirmingFinish(true) : doFinish(false))}
          >
            Finish workout
          </button>
        )}
      </div>

      {notesOpen && (
        <>
          <div
            className={styles.scrim}
            role="presentation"
            onClick={() => setNotesOpen(false)}
          />
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>Session notes</h2>
            <textarea
              className={styles.textarea}
              value={notesDraft}
              autoFocus
              placeholder="How did it go?"
              onChange={(event) => setNotesDraft(event.currentTarget.value)}
            />
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.promptButton}
                onClick={() => setNotesOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.promptButton} ${styles.promptPrimary}`}
                onClick={() => {
                  void saveNotes(notesDraft);
                  setNotesOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
