import { describe, expect, it } from 'vitest';
import {
  instrumentSandboxRuntimeGuards,
  SANDBOX_GUARD_FUNCTION_NAME,
} from '@/engine/gameplay/script-guard';

describe('Script guard instrumentation', () => {
  it('injects guard calls into loop bodies', () => {
    const source = `
exports.update = function update() {
  for (let i = 0; i < 3; i += 1) {
    const x = i;
    void x;
  }
};
`;

    const output = instrumentSandboxRuntimeGuards('loop-script.js', source);
    expect(output).toContain(`${SANDBOX_GUARD_FUNCTION_NAME}();`);
  });

  it('allows guard function to terminate infinite loops', () => {
    const source = `
exports.update = function update() {
  while (true) {}
};
`;

    const output = instrumentSandboxRuntimeGuards('infinite-script.js', source);
    const moduleRef: { exports: Record<string, unknown> } = { exports: {} };
    let ticks = 0;
    const guard = () => {
      ticks += 1;
      if (ticks > 32) {
        throw new Error('guard-trip');
      }
    };

    const evaluator = new Function(
      'exports',
      'module',
      SANDBOX_GUARD_FUNCTION_NAME,
      `"use strict";\n${output}`
    );

    evaluator(moduleRef.exports, moduleRef, guard);
    const update = moduleRef.exports.update as (() => void) | undefined;
    expect(update).toBeTypeOf('function');
    expect(() => update?.()).toThrow(/guard-trip/);
  });
});
