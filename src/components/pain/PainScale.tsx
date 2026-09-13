import { useState } from 'react';
import { painBand, painHint, PAIN_SCALE } from '@/core/pain';
import styles from './PainScale.module.css';

interface Props {
  question: string;
  value: number | undefined;
  onSelect: (score: number) => void;
  /** Omitted where there is nothing to skip past, such as the session prompts. */
  onSkip?: () => void;
  skipLabel?: string;
}

const BAND_CLASS = { green: styles.green, amber: styles.amber, red: styles.red } as const;
const SELECTED_CLASS = {
  green: styles.selectedGreen,
  amber: styles.selectedAmber,
  red: styles.selectedRed,
} as const;

/**
 * The 0–10 scale, colour-banded 0–3 green, 4–6 amber, 7–10 red.
 *
 * Nothing here interprets a score beyond those bands and the one hint the
 * programme prescribes. It is a log, not a diagnosis.
 */
export function PainScale({ question, value, onSelect, onSkip, skipLabel = 'Skip' }: Props) {
  const [editing, setEditing] = useState(false);
  const recorded = value !== undefined && !editing;

  if (recorded) {
    const band = painBand(value);
    return (
      <div className={styles.wrap}>
        <div className={styles.recorded}>
          <span>{question}</span>
          <span className={`${styles.recordedValue} ${BAND_CLASS[band]}`}>{value}</span>
          <button type="button" className={styles.change} onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
        {painHint(value) !== undefined && <span className={styles.hint}>{painHint(value)}</span>}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.question}>{question}</span>
      <div className={styles.grid}>
        {PAIN_SCALE.map((score) => {
          const band = painBand(score);
          const isSelected = value === score;
          return (
            <button
              key={score}
              type="button"
              className={`${styles.score} ${BAND_CLASS[band]} ${
                isSelected ? `${styles.selected} ${SELECTED_CLASS[band]}` : ''
              }`}
              aria-label={`Score ${score}`}
              aria-pressed={isSelected}
              onClick={() => {
                setEditing(false);
                onSelect(score);
              }}
            >
              {score}
            </button>
          );
        })}
        {onSkip !== undefined && (
          <button
            type="button"
            className={styles.skip}
            onClick={() => {
              setEditing(false);
              onSkip();
            }}
          >
            {skipLabel}
          </button>
        )}
      </div>
    </div>
  );
}
