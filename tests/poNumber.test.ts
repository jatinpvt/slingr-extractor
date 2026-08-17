import { describe, expect, it } from 'vitest';
import { normalizePoNumber, poNumberFilePart } from '../src/lib/poNumber.js';

describe('PO number handling', () => {
  it('accepts simple and full slash-separated PO numbers', () => {
    expect(normalizePoNumber('24382')).toBe('24382');
    expect(normalizePoNumber('80316 / 45000038')).toBe('80316 / 45000038');
    expect(normalizePoNumber(' 80316/45000038 ')).toBe('80316 / 45000038');
    expect(poNumberFilePart('80316 / 45000038')).toBe('80316_45000038');
  });

  it('rejects incomplete or malformed values', () => {
    expect(normalizePoNumber('80316 /')).toBeNull();
    expect(normalizePoNumber('/ 45000038')).toBeNull();
    expect(normalizePoNumber('PO 80316 / 45000038')).toBeNull();
  });
});
