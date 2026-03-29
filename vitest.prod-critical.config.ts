import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'tests/unit/auth-register-route.test.ts',
      'tests/unit/auth-session-route.test.ts',
      'tests/unit/production-env.test.ts',
      'tests/unit/remote-fetch-security.test.ts',
      'tests/integration/health-api.test.ts',
      'tests/integration/csrf-proxy.test.ts',
      'tests/integration/auth-api.test.ts',
      'tests/integration/security-hardening.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'output/prod-critical-coverage',
      include: [
        'scripts/production-env.mjs',
        'src/lib/security/remote-fetch.ts',
        'src/proxy.ts',
        'src/app/api/health/live/route.ts',
        'src/app/api/health/ready/route.ts',
        'src/app/api/auth/session/route.ts',
        'src/app/api/auth/register/route.ts',
      ],
      thresholds: {
        'scripts/production-env.mjs': {
          statements: 85,
          branches: 69,
          functions: 100,
          lines: 90,
        },
        'src/proxy.ts': {
          statements: 70,
          branches: 55,
          functions: 95,
          lines: 72,
        },
        'src/app/api/auth/register/route.ts': {
          statements: 80,
          branches: 70,
          functions: 75,
          lines: 85,
        },
        'src/app/api/auth/session/route.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/app/api/health/live/route.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/app/api/health/ready/route.ts': {
          statements: 75,
          branches: 55,
          functions: 50,
          lines: 75,
        },
        'src/lib/security/remote-fetch.ts': {
          statements: 55,
          branches: 40,
          functions: 70,
          lines: 65,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
