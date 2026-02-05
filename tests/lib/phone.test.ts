import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/lib/phone';

describe('normalizePhone', () => {
  it('normalizes valid numbers', () => {
    expect(normalizePhone('14155550123')).toBe('+14155550123');
    expect(normalizePhone('+1 (415) 555-0123')).toBe('+14155550123');
  });

  it('rejects invalid numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('+123')).toBeNull();
  });
});
