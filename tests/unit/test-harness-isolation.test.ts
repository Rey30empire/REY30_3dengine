import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const SENTINEL_KEY = 'REY30_TEST_HARNESS_SENTINEL';
const originalSentinel = process.env[SENTINEL_KEY];
const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-vitest-isolation-'));

afterAll(() => {
  if (originalSentinel === undefined) {
    delete process.env[SENTINEL_KEY];
  } else {
    process.env[SENTINEL_KEY] = originalSentinel;
  }

  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd);
  }

  rmSync(tempDir, { recursive: true, force: true });
});

describe('Vitest harness isolation', () => {
  it('allows a test to dirty env, cwd, and globals', () => {
    process.env[SENTINEL_KEY] = 'dirty';
    process.chdir(tempDir);
    vi.stubGlobal('fetch', vi.fn());

    expect(process.env[SENTINEL_KEY]).toBe('dirty');
    expect(process.cwd()).toBe(tempDir);
    expect(globalThis.fetch).not.toBe(originalFetch);
  });

  it('restores env, cwd, and globals before the next test', () => {
    expect(process.env[SENTINEL_KEY]).toBe(originalSentinel);
    expect(process.cwd()).toBe(originalCwd);
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
