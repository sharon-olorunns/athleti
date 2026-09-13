import { describe, expect, it } from 'vitest';
import { nearestIndex, niceDomain, scaleLinear } from './scale';

describe('niceDomain', () => {
  it('rounds to readable ticks on the 1-2-5 ladder', () => {
    const domain = niceDomain([12, 87], 4);
    expect(domain.step).toBe(20);
    expect(domain.min).toBe(0);
    expect(domain.max).toBe(100);
    expect(domain.ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('covers every value', () => {
    for (const values of [[3, 9], [0.2, 0.9], [100, 3000], [-5, 5]]) {
      const domain = niceDomain(values);
      expect(domain.min).toBeLessThanOrEqual(Math.min(...values));
      expect(domain.max).toBeGreaterThanOrEqual(Math.max(...values));
    }
  });

  it('does not anchor at zero by default, so a 1RM line is not squashed', () => {
    const domain = niceDomain([90, 100], 4);
    expect(domain.min).toBeGreaterThan(0);
  });

  it('anchors at zero when asked, which is right for counts', () => {
    const domain = niceDomain([90, 100], 4, true);
    expect(domain.min).toBe(0);
  });

  it('gives a flat series a plot with height', () => {
    const domain = niceDomain([5, 5, 5]);
    expect(domain.max).toBeGreaterThan(domain.min);
  });

  it('handles a single value', () => {
    const domain = niceDomain([42]);
    expect(domain.max).toBeGreaterThan(domain.min);
  });

  it('has a sane default with no values at all', () => {
    expect(niceDomain([])).toEqual({ min: 0, max: 1, step: 1, ticks: [0, 1] });
  });

  it('produces ticks free of floating-point dust', () => {
    const domain = niceDomain([0, 1], 5);
    for (const tick of domain.ticks) {
      expect(String(tick)).not.toMatch(/00000|99999/);
    }
  });

  it('keeps ticks ordered and evenly spaced', () => {
    const { ticks, step } = niceDomain([3, 47]);
    for (let i = 1; i < ticks.length; i += 1) {
      expect((ticks[i] ?? 0) - (ticks[i - 1] ?? 0)).toBeCloseTo(step);
    }
  });
});

describe('scaleLinear', () => {
  it('maps the domain onto the range', () => {
    expect(scaleLinear(0, 0, 10, 0, 100)).toBe(0);
    expect(scaleLinear(5, 0, 10, 0, 100)).toBe(50);
    expect(scaleLinear(10, 0, 10, 0, 100)).toBe(100);
  });

  it('inverts for an SVG y axis, where zero is at the top', () => {
    expect(scaleLinear(0, 0, 10, 100, 0)).toBe(100);
    expect(scaleLinear(10, 0, 10, 100, 0)).toBe(0);
  });

  it('centres rather than dividing by zero on an empty domain', () => {
    expect(scaleLinear(5, 5, 5, 0, 100)).toBe(50);
  });
});

describe('nearestIndex', () => {
  it('finds the closest point', () => {
    expect(nearestIndex([0, 10, 20, 30], 19)).toBe(2);
    expect(nearestIndex([0, 10, 20, 30], 4)).toBe(0);
  });

  it('is -1 with no points', () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });
});
