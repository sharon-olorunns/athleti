/**
 * Chart scale maths. Pure.
 *
 * Kept out of the components so axis ranges and tick placement are unit-tested
 * rather than eyeballed on screen.
 */

export interface NiceDomain {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** The 1-2-5 ladder, which is what produces readable tick values. */
function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * A rounded axis domain with readable ticks.
 *
 * `zeroBased` anchors the axis at zero, which is right for counts and volumes.
 * Measures where the interesting range sits far from zero — an estimated 1RM —
 * leave it off so the line is not squashed into the top of the plot.
 */
export function niceDomain(
  values: readonly number[],
  targetTicks = 4,
  zeroBased = false,
): NiceDomain {
  if (values.length === 0) return { min: 0, max: 1, step: 1, ticks: [0, 1] };

  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (zeroBased) lo = Math.min(0, lo);

  if (lo === hi) {
    // A flat series still needs a plot with height.
    const pad = Math.abs(lo) < 1 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
    if (zeroBased) lo = Math.min(0, lo);
  }

  const step = niceStep((hi - lo) / Math.max(1, targetTicks));
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;

  const ticks: number[] = [];
  // Accumulate by index rather than by repeated addition, which drifts on decimals.
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i += 1) {
    ticks.push(Number((min + i * step).toPrecision(12)));
  }

  return { min, max, step, ticks };
}

/** Map a value in [domainMin, domainMax] onto [rangeMin, rangeMax]. */
export function scaleLinear(
  value: number,
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): number {
  if (domainMax === domainMin) return (rangeMin + rangeMax) / 2;
  const t = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + t * (rangeMax - rangeMin);
}

/** The index of the point nearest an x position, for tap-to-inspect. */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < xs.length; i += 1) {
    const distance = Math.abs((xs[i] ?? 0) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
