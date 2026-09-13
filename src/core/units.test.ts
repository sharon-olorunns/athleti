import { describe, expect, it } from 'vitest';
import {
  displayStep,
  formatWeight,
  formatWeightValue,
  fromDisplayWeight,
  kgToLb,
  lbToKg,
  toDisplayWeight,
  weightUnitLabel,
} from './units';

describe('conversion', () => {
  it('converts both ways', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 2);
    expect(lbToKg(220.46)).toBeCloseTo(100, 2);
  });

  it('round-trips without drift', () => {
    for (const kg of [2.5, 20, 62.5, 137.5]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 10);
    }
  });

  it('leaves kilograms alone', () => {
    expect(toDisplayWeight(62.5, 'kg')).toBe(62.5);
    expect(fromDisplayWeight(62.5, 'kg')).toBe(62.5);
  });

  it('is lossless through the display boundary', () => {
    // What a screen shows and what an input returns must agree exactly.
    expect(fromDisplayWeight(toDisplayWeight(80, 'lb'), 'lb')).toBeCloseTo(80, 10);
  });
});

describe('formatWeight', () => {
  it('keeps half-plate precision in kilograms', () => {
    expect(formatWeight(62.5)).toBe('62.5 kg');
    expect(formatWeight(60)).toBe('60 kg');
  });

  it('shows pounds to a tenth, since a converted value is never round', () => {
    expect(formatWeight(60, 'lb')).toBe('132.3 lb');
    expect(formatWeight(62.5, 'lb')).toBe('137.8 lb');
  });

  it('formats the bare value without a unit', () => {
    expect(formatWeightValue(62.5)).toBe('62.5');
    expect(formatWeightValue(62.5, 'lb')).toBe('137.8');
  });

  it('defaults to kilograms, so existing callers are unaffected', () => {
    expect(formatWeight(80)).toBe('80 kg');
  });
});

describe('weightUnitLabel', () => {
  it('names the unit', () => {
    expect(weightUnitLabel('kg')).toBe('kg');
    expect(weightUnitLabel('lb')).toBe('lb');
  });
});

describe('displayStep', () => {
  it('steps by the plate increment in kilograms', () => {
    expect(displayStep(2.5, 'kg')).toBe(2.5);
  });

  /**
   * The plates are kilograms, so the step in pounds is that same jump converted.
   * Stepping by a round 5 lb instead would drift the stored weight off the plate
   * grid onto numbers no gym has.
   */
  it('steps by the converted increment in pounds, keeping the plate grid real', () => {
    expect(displayStep(2.5, 'lb')).toBeCloseTo(5.51, 2);
  });

  it('follows a changed increment', () => {
    expect(displayStep(1.25, 'kg')).toBe(1.25);
    expect(displayStep(5, 'lb')).toBeCloseTo(11.02, 2);
  });
});
