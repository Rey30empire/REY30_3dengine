import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  evaluateDependencySecurity,
} from '../../scripts/dependency-security-check.mjs';

function makeSnapshot(overrides?: {
  defuVersion?: string;
  lodashVersion?: string;
  lodashEsVersion?: string;
  nextVersion?: string;
  nextIntlVersion?: string;
  picomatchVersion?: string;
}) {
  return [
    {
      name: 'nextjs_tailwind_shadcn_ts',
      version: '0.2.0',
      path: '/repo',
      dependencies: {
        next: {
          from: 'next',
          name: 'next',
          version: overrides?.nextVersion || '16.2.3',
          path: '/repo/node_modules/next',
        },
        'next-intl': {
          from: 'next-intl',
          name: 'next-intl',
          version: overrides?.nextIntlVersion || '4.9.1',
          path: '/repo/node_modules/next-intl',
          dependencies: {
            '@parcel/watcher': {
              from: '@parcel/watcher',
              name: '@parcel/watcher',
              version: '2.5.6',
              path: '/repo/node_modules/@parcel/watcher',
              dependencies: {
                picomatch: {
                  from: 'picomatch',
                  name: 'picomatch',
                  version: overrides?.picomatchVersion || '4.0.4',
                  path: '/repo/node_modules/picomatch',
                },
              },
            },
          },
        },
        prisma: {
          from: 'prisma',
          name: 'prisma',
          version: '6.19.2',
          path: '/repo/node_modules/prisma',
          dependencies: {
            '@prisma/config': {
              from: '@prisma/config',
              name: '@prisma/config',
              version: '6.19.2',
              path: '/repo/node_modules/@prisma/config',
              dependencies: {
                c12: {
                  from: 'c12',
                  name: 'c12',
                  version: '3.1.0',
                  path: '/repo/node_modules/c12',
                  dependencies: {
                    defu: {
                      from: 'defu',
                      name: 'defu',
                      version: overrides?.defuVersion || '6.1.7',
                      path: '/repo/node_modules/defu',
                    },
                  },
                },
              },
            },
          },
        },
        recharts: {
          from: 'recharts',
          name: 'recharts',
          version: '2.15.4',
          path: '/repo/node_modules/recharts',
          dependencies: {
            lodash: {
              from: 'lodash',
              name: 'lodash',
              version: overrides?.lodashVersion || '4.18.1',
              path: '/repo/node_modules/lodash',
            },
          },
        },
        '@reactuses/core': {
          from: '@reactuses/core',
          name: '@reactuses/core',
          version: '6.1.11',
          path: '/repo/node_modules/@reactuses/core',
          dependencies: {
            'lodash-es': {
              from: 'lodash-es',
              name: 'lodash-es',
              version: overrides?.lodashEsVersion || '4.18.1',
              path: '/repo/node_modules/lodash-es',
            },
          },
        },
      },
    },
  ];
}

describe('dependency security check', () => {
  it('compares semantic versions numerically', () => {
    expect(compareSemver('16.2.10', '16.2.3')).toBe(1);
    expect(compareSemver('4.0.4', '4.0.4')).toBe(0);
    expect(compareSemver('6.1.4', '6.1.7')).toBe(-1);
  });

  it('passes when resolved production versions satisfy the policy floor', () => {
    const result = evaluateDependencySecurity(makeSnapshot());

    expect(result.ok).toBe(true);
    expect(result.summary.packagesFailing).toBe(0);
    expect(result.packages.every((entry) => entry.ok)).toBe(true);
  });

  it('fails when a resolved transitive dependency stays below the minimum secure version', () => {
    const result = evaluateDependencySecurity(
      makeSnapshot({
        defuVersion: '6.1.4',
      })
    );

    expect(result.ok).toBe(false);
    const defu = result.packages.find((entry) => entry.name === 'defu');
    expect(defu?.ok).toBe(false);
    expect(defu?.offenders[0]?.version).toBe('6.1.4');
    expect(defu?.offenders[0]?.path).toContain('/repo/node_modules/defu');
  });

  it('fails when a required framework package is missing from the production tree', () => {
    const snapshot = makeSnapshot();
    const dependencies = snapshot[0].dependencies as Record<string, unknown>;
    delete dependencies.next;

    const result = evaluateDependencySecurity(snapshot);

    expect(result.ok).toBe(false);
    const nextEntry = result.packages.find((entry) => entry.name === 'next');
    expect(nextEntry?.present).toBe(false);
    expect(nextEntry?.ok).toBe(false);
  });
});
