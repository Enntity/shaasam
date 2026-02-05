import { describe, expect, it } from 'vitest';
import { normalizeCategories } from '@/lib/categories';

describe('normalizeCategories', () => {
  it('normalizes and deduplicates categories', () => {
    const result = normalizeCategories('Prompting, Research, prompting,  security ');
    expect(result.normalized).toContain('prompting');
    expect(result.normalized).toContain('research');
    expect(result.normalized).toContain('security');
    expect(result.normalized.length).toBe(3);
  });

  it('handles arrays', () => {
    const result = normalizeCategories(['Design', 'Product']);
    expect(result.normalized).toEqual(['design', 'product']);
  });
});
