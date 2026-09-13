import { useId, useState } from 'react';
import type { SeriesPoint } from '@/core/stats';
import { nearestIndex, niceDomain, scaleLinear } from '@/core/scale';
import styles from './chart.module.css';

export interface Band {
  from: number;
  to: number;
  /** A CSS colour; drawn at low alpha behind the marks. */
  tint: string;
  label: string;
}

export interface Series {
  id: string;
  label: string;
  points: SeriesPoint[];
  /** The series that is the point of the chart. */
  emphasis: boolean;
}

interface Props {
  title: string;
  series: Series[];
  /** Axis label for the value scale. */
  valueLabel: string;
  /** Shaded value ranges, e.g. the pain traffic light. */
  bands?: Band[];
  /** Fixed value domain, when the scale is meaningful in itself (0–10 pain). */
  domain?: { min: number; max: number };
  /** Explicit ticks, so gridlines can line up with band boundaries. */
  ticks?: number[];
  /** Counts and volumes start at zero; a 1RM does not. */
  zeroBased?: boolean;
  formatValue?: (value: number) => string;
}

const WIDTH = 320;
const HEIGHT = 150;
const PAD = { top: 8, right: 8, bottom: 18, left: 28 };

const shortDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * A time-series line chart.
 *
 * Where two series appear, one is the subject and the other is context: the
 * subject takes the accent hue and the context a recessive gray, rather than two
 * competing hues. Both are named in the legend, so identity is never colour alone.
 *
 * There is no hover on a phone, so inspection is by tap: touching the plot selects
 * the nearest reading and prints it below the chart.
 */
export function LineChart({
  title,
  series,
  valueLabel,
  bands = [],
  domain,
  ticks: fixedTicks,
  zeroBased = false,
  formatValue = (v) => String(Math.round(v * 10) / 10),
}: Props) {
  const clipId = useId();
  const [selected, setSelected] = useState<number | undefined>(undefined);

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return (
      <figure className={styles.figure}>
        <figcaption className={styles.caption}>
          <span className={styles.title}>{title}</span>
        </figcaption>
        <p className={styles.empty}>Nothing logged yet.</p>
      </figure>
    );
  }

  const times = all.map((p) => p.at);
  const minAt = Math.min(...times);
  const maxAt = Math.max(...times);

  const valueDomain =
    domain ?? niceDomain(all.map((p) => p.value), 4, zeroBased);
  const ticks =
    fixedTicks ??
    (domain === undefined
      ? (valueDomain as ReturnType<typeof niceDomain>).ticks
      : [domain.min, (domain.min + domain.max) / 2, domain.max]);

  const x = (at: number) => scaleLinear(at, minAt, maxAt, PAD.left, WIDTH - PAD.right);
  const y = (value: number) =>
    scaleLinear(value, valueDomain.min, valueDomain.max, HEIGHT - PAD.bottom, PAD.top);

  const path = (points: SeriesPoint[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  // Tap selects from whichever series is the subject.
  const subject = series.find((s) => s.emphasis) ?? series[0];
  const subjectTimes = (subject?.points ?? []).map((p) => p.at);

  const onPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = scaleLinear(
      ((event.clientX - rect.left) / rect.width) * WIDTH,
      PAD.left,
      WIDTH - PAD.right,
      minAt,
      maxAt,
    );
    const index = nearestIndex(subjectTimes, at);
    setSelected(index === -1 ? undefined : index);
  };

  const selectedPoint = selected === undefined ? undefined : subject?.points[selected];
  const multiple = series.filter((s) => s.points.length > 0).length > 1;

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>{title}</span>
        <span className={styles.axisLabel}>{valueLabel}</span>
      </figcaption>

      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${title}. ${valueLabel}.`}
        onPointerDown={onPoint}
        onPointerMove={(event) => {
          if (event.buttons > 0) onPoint(event);
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={PAD.left}
              y={PAD.top}
              width={WIDTH - PAD.left - PAD.right}
              height={HEIGHT - PAD.top - PAD.bottom}
            />
          </clipPath>
        </defs>

        {/* Bands sit behind everything, at low alpha so they never compete. */}
        {bands.map((band) => (
          <rect
            key={band.label}
            x={PAD.left}
            y={y(Math.min(band.to, valueDomain.max))}
            width={WIDTH - PAD.left - PAD.right}
            height={Math.max(0, y(Math.max(band.from, valueDomain.min)) - y(Math.min(band.to, valueDomain.max)))}
            fill={band.tint}
            opacity={0.13}
          />
        ))}

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={styles.grid}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className={styles.axisText} x={0} y={y(tick) + 3}>
              {formatValue(tick)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {series.map((s) =>
            s.points.length === 0 ? null : (
              <g key={s.id}>
                <path
                  className={`${styles.line} ${s.emphasis ? styles.primary : styles.secondary}`}
                  d={path(s.points)}
                />
                {s.points.map((point) => (
                  <circle
                    key={`${s.id}-${point.at}`}
                    className={s.emphasis ? styles.marker : styles.markerSecondary}
                    cx={x(point.at)}
                    cy={y(point.value)}
                    r={s.emphasis ? 4.5 : 3.5}
                  />
                ))}
              </g>
            ),
          )}

          {selectedPoint !== undefined && (
            <line
              className={styles.selected}
              x1={x(selectedPoint.at)}
              x2={x(selectedPoint.at)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
            />
          )}
        </g>

        <text className={styles.axisText} x={PAD.left} y={HEIGHT - 4}>
          {shortDate(minAt)}
        </text>
        <text className={styles.axisText} x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end">
          {shortDate(maxAt)}
        </text>
      </svg>

      {multiple && (
        <div className={styles.legend}>
          {series
            .filter((s) => s.points.length > 0)
            .map((s) => (
              <span key={s.id} className={styles.legendItem}>
                <span
                  className={styles.swatch}
                  style={{ background: s.emphasis ? 'var(--accent)' : 'var(--text-faint)' }}
                />
                {s.label}
              </span>
            ))}
        </div>
      )}

      <p className={styles.readout}>
        {selectedPoint === undefined ? (
          'Tap the chart to read a value.'
        ) : (
          <>
            {shortDate(selectedPoint.at)} —{' '}
            <span className={styles.readoutValue}>{formatValue(selectedPoint.value)}</span>{' '}
            {subject?.label}
          </>
        )}
      </p>
    </figure>
  );
}
