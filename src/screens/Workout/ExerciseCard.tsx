import type { CSSProperties } from 'react';
import type { Exercise, LoggedExercise, Prescription, WorkoutSession } from '@/types';
import {
  findLoggedSet,
  lastPerformance,
  plannedRows,
  plannedSetCount,
  prefillForRow,
  prescriptionProgress,
  previousSetFor,
  summariseSets,
  type RowValues,
} from '@/core/workout';
import { entryFor } from '@/core/session';
import { targetText } from '@/core/prescription';
import { parseReps } from '@/core/reps';
import { contextLabelFor, type TimerCompletionTarget } from '@/core/timer';
import { useTimer } from '@/state/timerStore';
import { Chip } from '@/components/Chip';
import {
  equipmentLabel,
  PROGRESSION_MEANING,
  PROGRESSION_TINT,
} from '@/components/labels';
import { useWorkout } from '@/state/workoutStore';
import { SetRow } from './SetRow';
import styles from './ExerciseCard.module.css';

interface BodyProps {
  prescription: Prescription;
  exercise: Exercise | undefined;
  session: WorkoutSession;
  history: WorkoutSession[];
  plateIncrementKg: number;
  onOpenNotes: () => void;
}

/**
 * The expanded form of one exercise: what it is, how it progresses, its set rows
 * and the actions that apply to it.
 */
function ExerciseBody({
  prescription,
  exercise,
  session,
  history,
  plateIncrementKg,
  onOpenNotes,
}: BodyProps) {
  const completeRow = useWorkout((s) => s.completeRow);
  const uncompleteRow = useWorkout((s) => s.uncompleteRow);
  const setDraft = useWorkout((s) => s.setDraft);
  const drafts = useWorkout((s) => s.drafts);
  const addSet = useWorkout((s) => s.addSet);
  const addedSets = useWorkout((s) => s.addedSets);
  const skipExercise = useWorkout((s) => s.skipExercise);
  const focusKey = useWorkout((s) => s.focusKey);
  const startHold = useTimer((s) => s.startHold);
  const startInterval = useTimer((s) => s.startInterval);

  const exerciseId = prescription.exerciseId;
  const entry: LoggedExercise | undefined = entryFor(session, exerciseId);
  const previous = lastPerformance(exerciseId, history, session.id);
  const setCount = plannedSetCount(prescription, entry, addedSets[exerciseId] ?? 0);
  const rows = plannedRows(prescription, exercise, setCount);
  const skipped = entry?.skipped === true;

  // A range or a fixed count can be stepped; a composite flow cannot.
  const repSpec = parseReps(prescription.reps);
  const staticRepText =
    repSpec.kind === 'range' || repSpec.kind === 'fixed' ? undefined : repSpec.text;

  const progression = exercise?.progression;
  const tint = progression === undefined ? 'var(--fixed)' : PROGRESSION_TINT[progression.type];

  const exerciseName = exercise?.name ?? exerciseId;
  const restLabelFor = (setIndex: number) =>
    contextLabelFor(exerciseName, setIndex + 1, setCount);

  const targetFor = (row: { key: string; setIndex: number; side?: 'L' | 'R' }, values: RowValues) =>
    ({
      exerciseId,
      setIndex: row.setIndex,
      rowKey: row.key,
      values,
      restSeconds: prescription.restSeconds,
      restContextLabel: restLabelFor(row.setIndex),
      ...(row.side !== undefined ? { side: row.side } : {}),
    }) satisfies TimerCompletionTarget;

  /**
   * A hold is started by the user once they are in position, and an interval by
   * the round. Both log their set when they reach the end, so the phone can stay
   * on the floor.
   */
  const timerActionFor = (row: { key: string; setIndex: number; side?: 'L' | 'R' }) => {
    if (prescription.timerMode === 'hold' && prescription.holdSeconds !== undefined) {
      const seconds = prescription.holdSeconds;
      return {
        label: `Hold ${seconds}s`,
        onStart: () =>
          void startHold({
            seconds,
            contextLabel: restLabelFor(row.setIndex),
            exerciseId,
            target: targetFor(row, { seconds }),
          }),
      };
    }

    if (prescription.timerMode === 'interval' && prescription.interval !== undefined) {
      const spec = prescription.interval;
      return {
        label: `Start ${spec.rounds} rounds`,
        onStart: () =>
          void startInterval({
            spec,
            contextLabel: exerciseName,
            exerciseId,
            target: targetFor(row, { seconds: spec.workSeconds * spec.rounds }),
          }),
      };
    }

    return undefined;
  };

  return (
    <div>
      <div className={styles.nameRow}>
        <h3 className={styles.name}>{exercise?.name ?? exerciseId}</h3>
        <span className={styles.target}>
          {setCount} × {targetText(prescription)}
        </span>
      </div>

      <div className={styles.chips}>
        {prescription.kneeModified && (
          <Chip variant="solid" tint="var(--knee)">
            KNEE
          </Chip>
        )}
        {(exercise?.equipment ?? []).map((item) => (
          <Chip key={item} variant="muted">
            {equipmentLabel(item)}
          </Chip>
        ))}
      </div>

      <div className={styles.muscles}>
        {(exercise?.primaryMuscles ?? []).map((muscle) => (
          <Chip key={muscle} variant="muted">
            {muscle}
          </Chip>
        ))}
      </div>

      {exercise?.cue !== undefined && <p className={styles.cue}>{exercise.cue}</p>}
      {prescription.note !== undefined && <p className={styles.note}>{prescription.note}</p>}

      {progression !== undefined && progression.type !== 'fixed' && (
        // Milestone 4 replaces this with the engine's suggestion; the currency and
        // its meaning are already the point, and they come straight from the rule.
        <div className={styles.progression} style={{ '--tint': tint } as CSSProperties}>
          <span className={styles.progressionLabel}>{progression.label}</span>
          <span className={styles.progressionMeaning}>
            {PROGRESSION_MEANING[progression.type]}
          </span>
        </div>
      )}

      {previous !== undefined && (
        <p className={styles.lastTime}>Last time — {summariseSets(previous.sets, exercise)}</p>
      )}

      {skipped ? (
        <div className={styles.skipped}>
          <span>Skipped</span>
          <button
            type="button"
            className={styles.action}
            onClick={() => void skipExercise(exerciseId, false)}
          >
            Undo
          </button>
        </div>
      ) : (
        <>
          <ul className={styles.sets}>
            {rows.map((row, rowIndex) => {
              const logged = findLoggedSet(entry?.sets ?? [], row);
              const draft = drafts[`${exerciseId}|${row.key}`];
              const values: RowValues =
                logged !== undefined
                  ? loggedValues(logged)
                  : (draft ??
                    prefillForRow(row, {
                      prescription,
                      exercise,
                      sessionSets: (entry?.sets ?? []).filter(
                        (s) => s.completedAt !== undefined,
                      ),
                      previous,
                    }));

              return (
                <SetRow
                  key={row.key}
                  row={row}
                  exercise={exercise}
                  values={values}
                  logged={logged}
                  previous={previousSetFor(row, previous)}
                  focused={focusKey === `${exerciseId}|${row.key}`}
                  plateIncrementKg={plateIncrementKg}
                  staticRepText={staticRepText}
                  onChange={(next) => setDraft(exerciseId, row.key, next)}
                  onComplete={(next, wasClean) => {
                    const nextRow = rows[rowIndex + 1];
                    void completeRow(exerciseId, row, next, wasClean, {
                      ...(nextRow === undefined
                        ? {}
                        : { nextFocusKey: `${exerciseId}|${nextRow.key}` }),
                      rest: {
                        seconds: prescription.restSeconds,
                        contextLabel: restLabelFor(row.setIndex),
                      },
                    });
                  }}
                  onUncomplete={() => void uncompleteRow(exerciseId, row)}
                  timerAction={timerActionFor(row)}
                />
              );
            })}
          </ul>

          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => addSet(exerciseId)}>
              Add set
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => void skipExercise(exerciseId, true)}
            >
              Skip
            </button>
            <button type="button" className={styles.action} onClick={onOpenNotes}>
              Notes
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Only the fields the set actually recorded, so a row never invents a value. */
function loggedValues(logged: {
  weightKg?: number;
  reps?: number;
  seconds?: number;
  distanceM?: number;
}): RowValues {
  return {
    ...(logged.weightKg !== undefined ? { weightKg: logged.weightKg } : {}),
    ...(logged.reps !== undefined ? { reps: logged.reps } : {}),
    ...(logged.seconds !== undefined ? { seconds: logged.seconds } : {}),
    ...(logged.distanceM !== undefined ? { distanceM: logged.distanceM } : {}),
  };
}

interface CollapsedProps {
  prescription: Prescription;
  exercise: Exercise | undefined;
  session: WorkoutSession;
  onExpand: () => void;
}

/** `Trap bar deadlift — 4×5 @ 80kg ✓` */
function CollapsedExercise({ prescription, exercise, session, onExpand }: CollapsedProps) {
  const entry = entryFor(session, prescription.exerciseId);
  const skipped = entry?.skipped === true;

  return (
    <button type="button" className={styles.summaryRow} onClick={onExpand}>
      <span className={styles.summaryName}>{exercise?.name ?? prescription.exerciseId}</span>
      {skipped ? (
        <span className={styles.skippedTag}>SKIPPED</span>
      ) : (
        <>
          <span className={styles.summaryValue}>
            {summariseSets(entry?.sets ?? [], exercise)}
          </span>
          <span className={styles.tick}>✓</span>
        </>
      )}
    </button>
  );
}

/** Name, target and muscles — enough to see what is coming without opening it. */
function UpcomingExercise({
  prescription,
  exercise,
  onExpand,
}: {
  prescription: Prescription;
  exercise: Exercise | undefined;
  onExpand: () => void;
}) {
  return (
    <button type="button" className={styles.upcomingRow} onClick={onExpand}>
      <span>
        <span className={styles.upcomingName}>{exercise?.name ?? prescription.exerciseId}</span>
        <span className={styles.muscles}>
          {(exercise?.primaryMuscles ?? []).slice(0, 2).map((muscle) => (
            <Chip key={muscle} variant="muted">
              {muscle}
            </Chip>
          ))}
        </span>
      </span>
      <span className={styles.upcomingTarget}>
        {prescription.sets} × {targetText(prescription)}
      </span>
    </button>
  );
}

interface CardProps {
  item: { kind: 'single'; prescription: Prescription } | {
    kind: 'superset';
    label: string;
    restBetweenPairsSeconds: number;
    prescriptions: Prescription[];
  };
  session: WorkoutSession;
  history: WorkoutSession[];
  exerciseById: (id: string) => Exercise | undefined;
  plateIncrementKg: number;
  expanded: boolean;
  onExpand: () => void;
  onOpenNotes: () => void;
}

/**
 * One card. A superset stays a single card containing both exercises, joined by a
 * visible rail and labelled with the pairing instruction.
 */
export function ExerciseCard({
  item,
  session,
  history,
  exerciseById,
  plateIncrementKg,
  expanded,
  onExpand,
  onOpenNotes,
}: CardProps) {
  const prescriptions = item.kind === 'single' ? [item.prescription] : item.prescriptions;

  const allComplete = prescriptions.every((prescription) => {
    const exercise = exerciseById(prescription.exerciseId);
    const entry = entryFor(session, prescription.exerciseId);
    return prescriptionProgress(prescription, exercise, entry).complete;
  });

  const body = (
    <>
      {item.kind === 'superset' && <p className={styles.supersetLabel}>{item.label}</p>}
      <div className={item.kind === 'superset' ? styles.rail : undefined}>
        {prescriptions.map((prescription) => (
          <div key={prescription.exerciseId} className={styles.railPart}>
            {expanded ? (
              <ExerciseBody
                prescription={prescription}
                exercise={exerciseById(prescription.exerciseId)}
                session={session}
                history={history}
                plateIncrementKg={plateIncrementKg}
                onOpenNotes={onOpenNotes}
              />
            ) : allComplete ? (
              <CollapsedExercise
                prescription={prescription}
                exercise={exerciseById(prescription.exerciseId)}
                session={session}
                onExpand={onExpand}
              />
            ) : (
              <UpcomingExercise
                prescription={prescription}
                exercise={exerciseById(prescription.exerciseId)}
                onExpand={onExpand}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <section
      className={`${styles.card} ${expanded ? styles.current : ''} ${
        !expanded && allComplete ? styles.doneCard : ''
      }`}
    >
      {body}
    </section>
  );
}
