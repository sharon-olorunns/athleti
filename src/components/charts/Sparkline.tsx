import type { SeriesPoint } from '@/core/stats';
import { scaleLinear } from '@/core/scale';

interface Props {
  points: SeriesPoint[];
  /** The pain scale is fixed 0–10, so the line means the same thing every time. */
  min?: number;
  max?: number;
  width?: number;
  height?: number;
}

/**
 * A bare trend line. No axes and no labels: the wording beside it carries the
 * reading, and the line only shows the shape.
 */
export function Sparkline({ points, min = 0, max = 10, width = 96, height = 28 }: Props) {
  if (points.length < 2) return null;

  const times = points.map((p) => p.at);
  const minAt = Math.min(...times);
  const maxAt = Math.max(...times);

  const d = points
    .map((point, i) => {
      const x = scaleLinear(point.at, minAt, maxAt, 2, width - 2);
      const y = scaleLinear(point.value, min, max, height - 3, 3);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last !== undefined && (
        <circle
          cx={scaleLinear(last.at, minAt, maxAt, 2, width - 2)}
          cy={scaleLinear(last.value, min, max, height - 3, 3)}
          r="3"
          fill="var(--accent)"
        />
      )}
    </svg>
  );
}
