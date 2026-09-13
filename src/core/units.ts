/**
 * Weight display. Pure.
 *
 * Weights are kilograms everywhere inside the app — the seed is in kilograms and
 * so is every stored `weightKg`. Conversion happens only at the boundary: on the
 * way to a screen, and on the way back from an input.
 */
import type { Settings } from '@/types';

export type Units = Settings['units'];

export const LB_PER_KG = 2.2046226218;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** A stored kilogram value as the number to show. */
export function toDisplayWeight(kg: number, units: Units): number {
  return units === 'lb' ? kgToLb(kg) : kg;
}

/** A number typed into a weight field, back to kilograms for storage. */
export function fromDisplayWeight(value: number, units: Units): number {
  return units === 'lb' ? lbToKg(value) : value;
}

export function weightUnitLabel(units: Units): string {
  return units === 'lb' ? 'lb' : 'kg';
}

/**
 * A weight with no unit suffix. Kilograms keep their half-plate precision;
 * pounds are shown to the nearest tenth, since a converted value is never round.
 */
export function formatWeightValue(kg: number, units: Units = 'kg'): string {
  const value = toDisplayWeight(kg, units);
  if (units === 'lb') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** "62.5 kg" / "137.8 lb" — a weight ready to read. */
export function formatWeight(kg: number, units: Units = 'kg'): string {
  return `${formatWeightValue(kg, units)} ${weightUnitLabel(units)}`;
}

/**
 * The step a weight field moves by, in display units.
 *
 * The increment is stored in kilograms because the plates are, so in pounds the
 * step is that same kilogram jump converted. The underlying weight therefore
 * stays on the real plate grid rather than drifting onto round-looking pounds
 * that no gym actually has.
 */
export function displayStep(plateIncrementKg: number, units: Units): number {
  return units === 'lb' ? kgToLb(plateIncrementKg) : plateIncrementKg;
}

/** Decimal places a weight field should show. */
export function weightDecimals(units: Units): number {
  return units === 'lb' ? 1 : 1;
}
