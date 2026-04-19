import type {
  ScriptRuntimeCommand,
  ScriptRuntimeAvailablePhases,
  ScriptRuntimeInvocationContext,
  ScriptRuntimeModuleKind,
  ScriptRuntimePhase,
} from './script-runtime-protocol';
import { SANDBOX_GUARD_FUNCTION_NAME } from './script-guard';

type LoadedModuleRecord = {
  moduleKind: ScriptRuntimeModuleKind;
  scriptId: string;
  exports: Record<string, unknown>;
  availablePhases: ScriptRuntimeAvailablePhases;
};

interface ExecutionGuardState {
  scriptId: string;
  startedAt: number;
  ticks: number;
  maxExecutionMs: number;
  maxExecutionTicks: number;
}

const loadedModules = new Map<string, LoadedModuleRecord>();
let activeGuard: ExecutionGuardState | null = null;
const MODULE_LOAD_MAX_EXECUTION_MS = 50;
const MODULE_LOAD_MAX_EXECUTION_TICKS = 6_000;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function assertGuardState(): void {
  if (!activeGuard) return;
  activeGuard.ticks += 1;

  if (activeGuard.ticks > activeGuard.maxExecutionTicks) {
    throw new Error(
      `[Sandbox:${activeGuard.scriptId}] execution exceeded tick budget (${activeGuard.maxExecutionTicks}).`
    );
  }

  const elapsed = nowMs() - activeGuard.startedAt;
  if (elapsed > activeGuard.maxExecutionMs) {
    throw new Error(
      `[Sandbox:${activeGuard.scriptId}] execution exceeded ${activeGuard.maxExecutionMs}ms budget (${elapsed.toFixed(2)}ms).`
    );
  }
}

function withExecutionGuard<T>(
  params: {
    scriptId: string;
    maxExecutionMs: number;
    maxExecutionTicks: number;
  },
  work: () => T
): T {
  const previous = activeGuard;
  activeGuard = {
    scriptId: params.scriptId,
    startedAt: nowMs(),
    ticks: 0,
    maxExecutionMs: params.maxExecutionMs,
    maxExecutionTicks: params.maxExecutionTicks,
  };

  try {
    const result = work();
    assertGuardState();
    return result;
  } finally {
    activeGuard = previous;
  }
}

function getSafeGlobal(scriptId: string) {
  const safeConsole = {
    log: (...args: unknown[]) => console.log(`[Sandbox:${scriptId}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[Sandbox:${scriptId}]`, ...args),
    error: (...args: unknown[]) => console.error(`[Sandbox:${scriptId}]`, ...args),
  };

  return {
    console: safeConsole,
    Math,
    Date,
    JSON,
  };
}

function resolveAvailablePhases(exportsRef: Record<string, unknown>): ScriptRuntimeAvailablePhases {
  return {
    onStart: typeof exportsRef.onStart === 'function',
    update: typeof exportsRef.update === 'function',
    onStop: typeof exportsRef.onStop === 'function',
    default: typeof exportsRef.default === 'function',
  };
}

export function loadScriptRuntimeModule(params: {
  moduleKey: string;
  moduleKind: ScriptRuntimeModuleKind;
  scriptId: string;
  compiledCode: string;
}): ScriptRuntimeAvailablePhases {
  const moduleRef: { exports: Record<string, unknown> } = { exports: {} };
  const safeGlobal = getSafeGlobal(params.scriptId);
  const evaluator = new Function(
    'exports',
    'module',
    'globalThis',
    'self',
    'window',
    'document',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'process',
    'require',
    'Function',
    SANDBOX_GUARD_FUNCTION_NAME,
    `"use strict";\n${params.compiledCode}`
  );

  withExecutionGuard(
    {
      scriptId: params.scriptId,
      maxExecutionMs: MODULE_LOAD_MAX_EXECUTION_MS,
      maxExecutionTicks: MODULE_LOAD_MAX_EXECUTION_TICKS,
    },
    () => {
      evaluator(
        moduleRef.exports,
        moduleRef,
        safeGlobal,
        safeGlobal,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        assertGuardState
      );
    }
  );

  const availablePhases = resolveAvailablePhases(moduleRef.exports);
  loadedModules.set(params.moduleKey, {
    moduleKind: params.moduleKind,
    scriptId: params.scriptId,
    exports: moduleRef.exports,
    availablePhases,
  });

  return availablePhases;
}

export function unloadScriptRuntimeModule(moduleKey: string): void {
  loadedModules.delete(moduleKey);
}

function buildCommandContext(
  context: ScriptRuntimeInvocationContext,
  commands: ScriptRuntimeCommand[]
): ScriptRuntimeInvocationContext & {
  setTransform: (transform: Partial<{ x: number; y: number; z: number }>) => void;
  setVelocity: (velocity: { x: number; y: number; z: number }) => void;
  setComponent: (componentType: string, data: Record<string, unknown>, enabled?: boolean) => void;
  setSceneEnvironment: (
    environment: Extract<ScriptRuntimeCommand, { type: 'setSceneEnvironment' }>['environment']
  ) => void;
} {
  return {
    ...context,
    config: context.config || {},
    setTransform: (transform) => {
      commands.push({
        type: 'setTransform',
        transform: {
          ...(typeof transform.x === 'number' ? { x: transform.x } : {}),
          ...(typeof transform.y === 'number' ? { y: transform.y } : {}),
          ...(typeof transform.z === 'number' ? { z: transform.z } : {}),
        },
      });
    },
    setVelocity: (velocity) => {
      commands.push({
        type: 'setVelocity',
        velocity,
      });
    },
    setComponent: (componentType, data, enabled) => {
      commands.push({
        type: 'setComponent',
        componentType,
        data,
        enabled,
      });
    },
    setSceneEnvironment: (environment) => {
      commands.push({
        type: 'setSceneEnvironment',
        environment,
      });
    },
  };
}

export function invokeScriptRuntimeModule(params: {
  moduleKey: string;
  phase: ScriptRuntimePhase;
  context: ScriptRuntimeInvocationContext;
  maxExecutionMs: number;
  maxExecutionTicks: number;
}): ScriptRuntimeCommand[] {
  const loaded = loadedModules.get(params.moduleKey);
  if (!loaded) {
    throw new Error('Sandbox module not loaded.');
  }

  const commands: ScriptRuntimeCommand[] = [];
  const ctx = buildCommandContext(params.context, commands);
  const exportsRef = loaded.exports;

  withExecutionGuard(
    {
      scriptId: loaded.scriptId,
      maxExecutionMs: params.maxExecutionMs,
      maxExecutionTicks: params.maxExecutionTicks,
    },
    () => {
      if (loaded.moduleKind === 'scrib') {
        if (params.phase === 'update' && typeof exportsRef.default === 'function') {
          (exportsRef.default as (entity: unknown, config: Record<string, unknown>, ctx: unknown) => void)(
            ctx.entity,
            ctx.config || {},
            ctx
          );
          return;
        }
      }

      const candidate = exportsRef[params.phase];
      if (typeof candidate === 'function') {
        (candidate as (ctx: unknown) => void)(ctx);
      }
    }
  );

  return commands;
}

export function resetScriptRuntimeExecutorForTest(): void {
  loadedModules.clear();
  activeGuard = null;
}
