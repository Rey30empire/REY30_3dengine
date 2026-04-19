import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { loadWorkspaceEnv } from './scripts/env-utils.mjs';

loadWorkspaceEnv({
  baseDir: __dirname,
  envFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
});

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    setupFiles: ['tests/setup/test-isolation.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/engine/scrib/**/*.ts', 'src/engine/gameplay/ScriptRuntime.ts', 'src/app/api/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
