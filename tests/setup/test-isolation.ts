import { afterEach, beforeEach, vi } from 'vitest';

let envSnapshot: NodeJS.ProcessEnv = { ...process.env };
let cwdSnapshot = process.cwd();

beforeEach(() => {
  envSnapshot = { ...process.env };
  cwdSnapshot = process.cwd();
});

afterEach(() => {
  vi.useRealTimers();

  if (process.cwd() !== cwdSnapshot) {
    process.chdir(cwdSnapshot);
  }

  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
});
