import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorkspaceEnv } from '../../scripts/env-utils.mjs';

function withEnvSnapshot(run: () => void) {
  const snapshot = { ...process.env };

  try {
    run();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, snapshot);
  }
}

describe('loadWorkspaceEnv', () => {
  it('allows production-local loaders to prefer .env.production over .env.local', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-env-utils-'));

    try {
      writeFileSync(path.join(tempDir, '.env'), 'REY30_REGISTRATION_MODE=allowlist\n');
      writeFileSync(path.join(tempDir, '.env.local'), 'REY30_REGISTRATION_MODE=open\n');
      writeFileSync(
        path.join(tempDir, '.env.production'),
        'REY30_REGISTRATION_MODE=invite_only\nREY30_BOOTSTRAP_OWNER_TOKEN=prod-owner\n'
      );

      withEnvSnapshot(() => {
        delete process.env.REY30_REGISTRATION_MODE;
        delete process.env.REY30_BOOTSTRAP_OWNER_TOKEN;

        loadWorkspaceEnv({
          baseDir: tempDir,
          envFiles: ['.env', '.env.local', '.env.production'],
        });

        expect(process.env.REY30_REGISTRATION_MODE).toBe('invite_only');
        expect(process.env.REY30_BOOTSTRAP_OWNER_TOKEN).toBe('prod-owner');
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not override environment variables that were already injected by the parent process', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-env-utils-'));

    try {
      writeFileSync(path.join(tempDir, '.env.production'), 'PORT=3000\n');

      withEnvSnapshot(() => {
        process.env.PORT = '4010';

        loadWorkspaceEnv({
          baseDir: tempDir,
          envFiles: ['.env.production'],
        });

        expect(process.env.PORT).toBe('4010');
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('maps NETLIFY_DATABASE_URL into DATABASE_URL when the deploy platform injects only the Netlify variable', () => {
    withEnvSnapshot(() => {
      delete process.env.DATABASE_URL;
      process.env.NETLIFY_DATABASE_URL =
        'postgresql://netlify:secret@ep-example-pooler.us-east-1.aws.neon.tech/rey30';

      loadWorkspaceEnv({
        baseDir: process.cwd(),
        envFiles: [],
      });

      expect(process.env.DATABASE_URL).toBe(process.env.NETLIFY_DATABASE_URL);
    });
  });
});
