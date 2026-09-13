import { useEffect, useRef, useState } from 'react';
import styles from './Stepper.module.css';

interface Props {
  value: number | undefined;
  onChange: (value: number) => void;
  step: number;
  unit: string;
  /** Screen-reader name, e.g. "Weight, set 2". */
  label: string;
  min?: number;
  /** Decimal places for display: weights need one, reps none. */
  decimals?: number;
  disabled?: boolean;
}

/**
 * `− 60.0 kg +`. Steppers are the primary input; the number itself is a numeric
 * input so tapping it opens the keypad for a direct edit.
 */
export function Stepper({
  value,
  onChange,
  step,
  unit,
  label,
  min = 0,
  decimals = 0,
  disabled = false,
}: Props) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const display = value === undefined ? '' : formatValue(value, decimals);

  // While the user is typing, their text is authoritative; otherwise the stepper is.
  useEffect(() => {
    if (!editing) setText(display);
  }, [display, editing]);

  const nudge = (direction: 1 | -1) => {
    const base = value ?? 0;
    const next = Math.max(min, roundToStep(base + direction * step, step));
    onChange(next);
    setText(formatValue(next, decimals));
  };

  const commit = () => {
    setEditing(false);
    const parsed = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(parsed)) {
      onChange(Math.max(min, parsed));
    } else {
      setText(display);
    }
  };

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => nudge(-1)}
        disabled={disabled || (value ?? 0) <= min}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>

      <div className={styles.field}>
        <input
          ref={inputRef}
          className={`${styles.input} ${value === undefined ? styles.empty : ''}`}
          type="number"
          inputMode="decimal"
          value={text}
          placeholder="–"
          aria-label={label}
          disabled={disabled}
          onFocus={(event) => {
            setEditing(true);
            event.currentTarget.select();
          }}
          onChange={(event) => setText(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') inputRef.current?.blur();
          }}
        />
        <span className={styles.unit}>{unit}</span>
      </div>

      <button
        type="button"
        className={styles.button}
        onClick={() => nudge(1)}
        disabled={disabled}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}

/** Keep steps on the grid: 61.25 + 2.5 reads as 63.75, not 63.7500000001. */
function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(value.toFixed(decimals + 1));
}

function formatValue(value: number, decimals: number): string {
  if (decimals === 0) return String(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}
