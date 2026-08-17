import { describe, expect, it } from 'vitest';
import { formatMeasuredPercentage } from '../src/lib/format.js';

describe('formatMeasuredPercentage', () => {
  it.each([
    ['equal', '1.25%'],
    ['lessThan', '<1.25%'],
    ['lessOrEqual', '<=1.25%'],
    ['greaterThan', '>1.25%'],
    ['greaterOrEqual', '>=1.25%'],
  ])('preserves the %s comparison', (comparison, expected) => {
    expect(formatMeasuredPercentage({ comparison, value: 1.25, measurement: 'percentage' })).toBe(expected);
  });

  it('does not guess an unknown comparison', () => {
    expect(formatMeasuredPercentage({ comparison: 'unknown', value: 1.25, measurement: 'percentage' })).toBe('');
  });
});
