import styles from './chart.module.css';

export interface BarRow {
  label: string;
  value: number;
  /** Optional second number shown after the value, e.g. a target. */
  note?: string;
}

interface Props {
  title: string;
  rows: BarRow[];
  valueLabel: string;
  /** Drawn as a reference line across every bar, e.g. the four-session target. */
  target?: number;
  formatValue?: (value: number) => string;
  emptyText?: string;
}

/**
 * Horizontal bars with direct labels.
 *
 * Every bar takes the same hue: these are nominal categories, and colouring them
 * by value would spend the identity channel re-encoding what bar length already
 * shows. The numbers are printed, so the chart never depends on reading a length.
 */
export function BarChart({
  title,
  rows,
  valueLabel,
  target,
  formatValue = (v) => String(v),
  emptyText = 'Nothing logged yet.',
}: Props) {
  if (rows.length === 0) {
    return (
      <figure className={styles.figure}>
        <figcaption className={styles.caption}>
          <span className={styles.title}>{title}</span>
        </figcaption>
        <p className={styles.empty}>{emptyText}</p>
      </figure>
    );
  }

  const max = Math.max(...rows.map((row) => row.value), target ?? 0, 1);

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>{title}</span>
        <span className={styles.axisLabel}>{valueLabel}</span>
      </figcaption>

      <ul className={styles.barList}>
        {rows.map((row) => (
          <li key={row.label} className={styles.barRow}>
            <span className={styles.barLabel}>{row.label}</span>
            <span className={styles.barTrackOuter}>
              <span
                className={styles.barFill}
                style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              />
              {target !== undefined && (
                <span
                  className={styles.barTarget}
                  // Clamped inside the track: a target equal to the maximum would
                  // otherwise sit on the clipped edge and never be seen.
                  style={{ left: `min(calc(100% - 2px), ${(target / max) * 100}%)` }}
                />
              )}
            </span>
            <span className={styles.barValue}>
              {formatValue(row.value)}
              {row.note !== undefined && <span className={styles.barNote}> {row.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
