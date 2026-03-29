import { describe, expect, it } from 'vitest';
import { normalizeProjectKey } from '@/lib/security/usage-finops';

describe('Usage FinOps helpers', () => {
  it('normalizes project keys to safe identifiers', () => {
    expect(normalizeProjectKey(' My Cool Project 01 ')).toBe('my_cool_project_01');
    expect(normalizeProjectKey('###')).toBeNull();
  });

  it('returns null for empty project keys', () => {
    expect(normalizeProjectKey('')).toBeNull();
    expect(normalizeProjectKey('   ')).toBeNull();
    expect(normalizeProjectKey(null)).toBeNull();
  });
});

