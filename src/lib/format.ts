import type { MeasurementValue } from '../types.js';

export function formatPercentage(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return `${trimNumber(value)}%`;
  const s = String(value).trim();
  return s.endsWith('%') ? s : `${s}%`;
}

export function formatMeasuredPercentage(field: MeasurementValue | null | undefined): string {
  if (!field || field.value == null) return '';
  const prefix = field.comparison === 'lessThan' ? '<' : field.comparison === 'greaterThan' ? '>' : '';
  return `${prefix}${trimNumber(field.value)}%`;
}

export function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | '' {
  if (numerator == null || denominator == null || denominator === 0) return '';
  return Number((numerator / denominator).toFixed(4));
}
