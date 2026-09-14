import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Exercise, LoggedExercise, Prescription, WorkoutSession } from '@/types';
import type { Units } from '@/core/units';
import {
  findLoggedSet,
  lastPerformance,
  performanceHistory,
  plannedRows,
  plannedSetCount,
  prefillForRow,
  prescriptionProgress,
  previousSetFor,
  summariseSets,
  type RowValues,
} from '@/core/workout';
import { qualityQuestion, suggestedSetsFor, suggestProgression } from '@/core/progression';
import { entryFor } from '@/core/session';
import { effectiveExerciseId, substitutionFor } from '@/core/alternatives';
import { lastPainScore, offersKneeSafeSwap } from '@/core/pain';
import { PainScale } from '@/components/pain/PainScale';
import { SwapSheet } from '@/components/swap/SwapSheet';
import { targetText } from '@/core/prescription';
import { parseReps } from '@/core/reps';
import { contextLabelFor, type TimerCompletionTarget } from '@/core/timer';
import { useTimer } from '@/state/timerStore';
import { Chip } from '@/components/Chip';
import { equipmentLabel, PROGRESSION_TINT } from '@/components/labels';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import { ladderExerciseIds } from '@/core/ladder';
import { LadderPanel } from './LadderPanel';
import { SetRow } from './SetRow';
import styles from './ExerciseCard.module.css';

interface BodyProps {
  prescription: Prescription;
  exerciseById: (id: string) => Exercise | undefined;
  session: WorkoutSession;
  history: WorkoutSession[];
  plateIncrementKg: number;
  units: Units;
  onOpenNotes: () => void;
}

/**
 * The expanded form of one exercise: what it is, how it progresses, its set rows
 * and the actions that apply to it.
 */
function ExerciseBody({
  prescription,
  exerciseById,
  session,
  history,
  plateIncrementKg,
  units,
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
  const confirmQuality = useWorkout((s) => s.confirmQuality);
  const swapExercise = useWorkout((s) => s.swapExercise);
  const revertSwap = useWorkout((s) => s.revertSwap);
  const savePainScore = useWorkout((s) => s.savePainScore);
  const library = useApp((s) => s.library);
  const ladder = useApp((s) => s.ladder)();

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapFromPain, setSwapFromPain] = useState(false);

  // A swap replaces the exercise for this session only; everything below works
  // from what is actually being performed, so history accrues under its own id.
  const prescribedId = prescription.exerciseId;
  const prescribedExercise = exerciseById(prescribedId);
  const exerciseId = effectiveExerciseId(session, prescribedId);
  const substitution = substitutionFor(session, prescribedId);
  const exercise = exerciseById(exerciseId);
  const entry: LoggedExercise | undefined = entryFor(session, exerciseId);
  const previous = lastPerformance(exerciseId, history, session.id);
  const skipped = entry?.skipped === true;

  // The engine decides what to prompt for and how many sets to show today.
  const suggestion =
    exercise === undefined
      ? undefined
      : suggestProgression({
          exercise,
          prescription,
          history: performanceHistory(exerciseId, history, session.id),
          weekNumber: session.weekNumber,
          units,
        });

  const setCount = plannedSetCount(
    { ...prescription, sets: suggestion?.suggestedSets ?? prescription.sets },
    entry,
    addedSets[exerciseId] ?? 0,
  );
  const rows = plannedRows(prescription, exercise, setCount);

  const question = exercise === undefined ? undefined : qualityQuestion(exercise, prescription);
  const allSetsLogged = rows.length > 0 && (entry?.sets.length ?? 0) >= rows.length;

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

      {substitution !== undefined && prescribedExercise !== undefined && (
        <span className={styles.swapped}>
          Swapped for {prescribedExercise.name}
          {substitution.substitutionReason !== undefined
            ? ` · ${substitution.substitutionReason}`
            : ''}
        </span>
      )}

      {exercise?.cue !== undefined && <p className={styles.cue}>{exercise.cue}</p>}
      {prescription.note !== undefined && <p className={styles.note}>{prescription.note}</p>}

      {/*
        Keyed off what the programme prescribes, not what is being performed: a
        slot swapped out for the day is still the ladder's slot, and the stage
        still has to be visible.
      */}
      {ladderExerciseIds(ladder).has(prescribedId) && <LadderPanel session={session} />}

      {suggestion !== undefined && suggestion.message !== '' && (
        <div className={styles.progression} style={{ '--tint': tint } as CSSProperties}>
          <span className={styles.progressionMessage}>{suggestion.message}</span>
          {suggestion.hint !== undefined && (
            <span className={styles.progressionHint}>{suggestion.hint}</span>
          )}
          {suggestion.deloaded && (
            <span className={styles.deloadTag}>
              DELOAD · {prescription.sets} → {suggestion.suggestedSets} sets
            </span>
          )}
        </div>
      )}

      {previous !== undefined && (
        <p className={styles.lastTime}>
          Last time — {summariseSets(previous.sets, exercise, units)}
        </p>
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
                      ...(suggestion !== undefined ? { suggested: suggestion.prefill } : {}),
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
                  units={units}
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

          {exercise?.painTracked === true && allSetsLogged && (
            <div className={styles.pain}>
              <PainScale
                question="Knee during that?"
                value={entry?.painScore}
                onSelect={(score) => {
                  void savePainScore(exerciseId, score);
                  // A red score offers the swap sheet directly.
                  if (offersKneeSafeSwap(score)) {
                    setSwapFromPain(true);
                    setSwapOpen(true);
                  }
                }}
                onSkip={() => undefined}
                skipLabel="Not now"
              />
              {entry?.painScore !== undefined && offersKneeSafeSwap(entry.painScore) && (
                <button
                  type="button"
                  className={styles.painSwap}
                  onClick={() => {
                    setSwapFromPain(true);
                    setSwapOpen(true);
                  }}
                >
                  Swap to a knee-safe alternative
                </button>
              )}
            </div>
          )}

          {question !== undefined && allSetsLogged && (
            <div className={styles.quality}>
              <span className={styles.qualityQuestion}>{question}</span>
              <div className={styles.qualityButtons}>
                <button
                  type="button"
                  className={`${styles.qualityButton} ${
                    entry?.qualityConfirmed === true ? styles.qualityYes : ''
                  }`}
                  aria-pressed={entry?.qualityConfirmed === true}
                  onClick={() => void confirmQuality(exerciseId, true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`${styles.qualityButton} ${
                    entry?.qualityConfirmed === false ? styles.qualityNo : ''
                  }`}
                  aria-pressed={entry?.qualityConfirmed === false}
                  onClick={() => void confirmQuality(exerciseId, false)}
                >
                  No
                </button>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setSwapFromPain(false);
                setSwapOpen(true);
              }}
            >
              Swap
            </button>
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

      {swapOpen && (
        <SwapSheet
          prescribed={prescribedExercise}
          currentId={exerciseId}
          library={library}
          lastPainScore={lastPainScore(history)}
          fromPainScore={swapFromPain}
          onChoose={(substitute, reason) => {
            void swapExercise(prescribedId, substitute, reason);
            setSwapOpen(false);
          }}
          onRevert={() => {
            void revertSwap(prescribedId);
            setSwapOpen(false);
          }}
          onClose={() => setSwapOpen(false)}
        />
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
  units: Units;
  onExpand: () => void;
}

/** `Trap bar deadlift — 4×5 @ 80kg ✓` */
function CollapsedExercise({ prescription, exercise, session, units, onExpand }: CollapsedProps) {
  const entry = entryFor(session, effectiveExerciseId(session, prescription.exerciseId));
  const skipped = entry?.skipped === true;

  return (
    <button type="button" className={styles.summaryRow} onClick={onExpand}>
      <span className={styles.summaryName}>{exercise?.name ?? prescription.exerciseId}</span>
      {skipped ? (
        <span className={styles.skippedTag}>SKIPPED</span>
      ) : (
        <>
          <span className={styles.summaryValue}>
            {summariseSets(entry?.sets ?? [], exercise, units)}
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
  sets,
  onExpand,
}: {
  prescription: Prescription;
  exercise: Exercise | undefined;
  sets: number;
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
        {sets} × {targetText(prescription)}
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
  units: Units;
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
  units,
  expanded,
  onExpand,
  onOpenNotes,
}: CardProps) {
  const prescriptions = item.kind === 'single' ? [item.prescription] : item.prescriptions;

  const allComplete = prescriptions.every((prescription) => {
    const performedId = effectiveExerciseId(session, prescription.exerciseId);
    const exercise = exerciseById(performedId);
    const entry = entryFor(session, performedId);
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
                exerciseById={exerciseById}
                session={session}
                history={history}
                plateIncrementKg={plateIncrementKg}
                units={units}
                onOpenNotes={onOpenNotes}
              />
            ) : allComplete ? (
              <CollapsedExercise
                prescription={prescription}
                exercise={exerciseById(effectiveExerciseId(session, prescription.exerciseId))}
                session={session}
                units={units}
                onExpand={onExpand}
              />
            ) : (
              <UpcomingExercise
                prescription={prescription}
                exercise={exerciseById(effectiveExerciseId(session, prescription.exerciseId))}
                sets={suggestedSetsFor(
                  exerciseById(prescription.exerciseId),
                  prescription,
                  session.weekNumber,
                )}
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
