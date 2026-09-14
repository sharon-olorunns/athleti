import { useState } from 'react';
import type { WorkoutSession } from '@/types';
import { attemptsUnassisted, canAdvance, gateFor, nextStage, stageFor } from '@/core/ladder';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import styles from './LadderPanel.module.css';

/**
 * The pull-up ladder, on the card of whichever exercise the current stage put in
 * the slot (section 8b).
 *
 * The user cannot see which rung they are on from the exercise name alone —
 * "negative pull-up" is stage 2's work and also part of stage 3's — so the stage,
 * its name and its gate are stated here, next to the work they describe.
 *
 * Advancing is a button and never a calculation. "A controlled 8-second negative"
 * is a judgement the user makes at the bar; an app that inferred it from logged
 * reps would move them up on a set that felt nothing like one.
 */
export function LadderPanel({ session }: { session: WorkoutSession }) {
  const ladder = useApp((s) => s.ladder)();
  const stageNumber = useApp((s) => s.settings.currentLadderStage);
  const advanceLadder = useApp((s) => s.advanceLadder);
  const saveUnassistedAttempt = useWorkout((s) => s.saveUnassistedAttempt);

  const [confirming, setConfirming] = useState(false);

  const current = stageFor(ladder, stageNumber);
  if (current === undefined) return null;

  const gate = gateFor(ladder, stageNumber);
  const upNext = stageFor(ladder, nextStage(ladder, stageNumber));
  const asksAttempt = attemptsUnassisted(ladder, stageNumber);
  const attempted = session.unassistedAttempt;
  const succeeded = session.unassistedSuccess === true;

  return (
    <section className={styles.panel} aria-label="Pull-up ladder">
      <header className={styles.head}>
        <span className={styles.eyebrow}>Pull-up ladder</span>
        <span className={styles.stage}>
          Stage {current.stage} of {ladder.length} · {current.name}
        </span>
      </header>

      {gate !== undefined && (
        <p className={styles.gate}>
          <span className={styles.gateLabel}>Move up when</span>
          {gate}
        </p>
      )}

      {canAdvance(ladder, stageNumber) &&
        (confirming ? (
          <div className={styles.confirm}>
            <span className={styles.confirmText}>
              Move to stage {upNext?.stage}
              {upNext !== undefined ? ` · ${upNext.name}` : ''}? The pull-up slots change from
              your next session.
            </span>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.button}
                onClick={() => setConfirming(false)}
              >
                Not yet
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                onClick={() => {
                  void advanceLadder();
                  setConfirming(false);
                }}
              >
                Move up
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.button}
            onClick={() => setConfirming(true)}
          >
            I&rsquo;ve met the gate
          </button>
        ))}

      {asksAttempt && (
        <div className={styles.attempt}>
          <span className={styles.attemptQuestion}>
            {attempted === undefined
              ? 'One unassisted rep, fresh, before anything else. How did it go?'
              : succeeded
                ? 'Unassisted rep logged for this session.'
                : attempted
                  ? 'Attempt logged for this session.'
                  : 'No attempt this session.'}
          </span>
          <div className={styles.attemptButtons}>
            <button
              type="button"
              className={`${styles.attemptButton} ${succeeded ? styles.got : ''}`}
              aria-pressed={succeeded}
              onClick={() => void saveUnassistedAttempt(true, true)}
            >
              Got it
            </button>
            <button
              type="button"
              className={`${styles.attemptButton} ${
                attempted === true && !succeeded ? styles.missed : ''
              }`}
              aria-pressed={attempted === true && !succeeded}
              onClick={() => void saveUnassistedAttempt(true, false)}
            >
              Missed it
            </button>
            <button
              type="button"
              className={`${styles.attemptButton} ${attempted === false ? styles.missed : ''}`}
              aria-pressed={attempted === false}
              onClick={() => void saveUnassistedAttempt(false, false)}
            >
              Not today
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
