import { afterEach, describe, expect, it } from 'vitest';
import {
  invokeScriptRuntimeModule,
  loadScriptRuntimeModule,
  resetScriptRuntimeExecutorForTest,
} from '@/engine/gameplay/script-runtime-executor';
import { compileScriptRuntimeArtifact } from '@/lib/server/script-runtime-compiler';

describe('script runtime executor', () => {
  afterEach(() => {
    resetScriptRuntimeExecutorForTest();
  });

  it('captures transform commands from reviewed legacy modules', () => {
    const compiled = compileScriptRuntimeArtifact({
      scriptId: 'runtime/legacy.ts',
      sourceText: 'export function update(ctx) { ctx.setTransform({ x: 3, z: 4 }); }',
    });

    expect(compiled.ok).toBe(true);
    loadScriptRuntimeModule({
      moduleKey: 'legacy:runtime/legacy.ts:hash',
      moduleKind: 'legacy',
      scriptId: 'runtime/legacy.ts',
      compiledCode: compiled.artifact!.compiledCode,
    });

    const commands = invokeScriptRuntimeModule({
      moduleKey: 'legacy:runtime/legacy.ts:hash',
      phase: 'update',
      context: {
        deltaTime: 0.016,
        entityId: 'entity-1',
        entity: {
          id: 'entity-1',
          name: 'Cube',
          components: new Map(),
          children: [],
          parentId: null,
          active: true,
          tags: [],
        },
      },
      maxExecutionMs: 12,
      maxExecutionTicks: 6000,
    });

    expect(commands).toEqual([
      {
        type: 'setTransform',
        transform: { x: 3, z: 4 },
      },
    ]);
  });

  it('executes default scrib handlers with config and entity snapshot', () => {
    const compiled = compileScriptRuntimeArtifact({
      scriptId: 'runtime/custom-scrib.ts',
      sourceText:
        'export default function(entity, config, ctx) { ctx.setTransform({ x: (config.speed || 0) + (entity.name === "Cube" ? 1 : 0) }); }',
    });

    expect(compiled.ok).toBe(true);
    loadScriptRuntimeModule({
      moduleKey: 'scrib:runtime/custom-scrib.ts:hash',
      moduleKind: 'scrib',
      scriptId: 'runtime/custom-scrib.ts',
      compiledCode: compiled.artifact!.compiledCode,
    });

    const commands = invokeScriptRuntimeModule({
      moduleKey: 'scrib:runtime/custom-scrib.ts:hash',
      phase: 'update',
      context: {
        deltaTime: 0.016,
        entityId: 'entity-1',
        entity: {
          id: 'entity-1',
          name: 'Cube',
          components: new Map(),
          children: [],
          parentId: null,
          active: true,
          tags: [],
        },
        config: { speed: 6 },
        scribNodeId: 'node-1',
        scribSourceId: 'scrib-1',
        scribType: 'movement',
        sceneId: 'scene-1',
      },
      maxExecutionMs: 12,
      maxExecutionTicks: 6000,
    });

    expect(commands).toEqual([
      {
        type: 'setTransform',
        transform: { x: 7 },
      },
    ]);
  });

  it('captures component and scene environment commands from reviewed scrib modules', () => {
    const compiled = compileScriptRuntimeArtifact({
      scriptId: 'runtime/scene-tools.scrib.ts',
      sourceText:
        'export default function(entity, config, ctx) { ctx.setComponent("Collider", { type: "box", isTrigger: true }, true); ctx.setSceneEnvironment({ fog: null }); }',
    });

    expect(compiled.ok).toBe(true);
    loadScriptRuntimeModule({
      moduleKey: 'scrib:runtime/scene-tools.scrib.ts:hash',
      moduleKind: 'scrib',
      scriptId: 'runtime/scene-tools.scrib.ts',
      compiledCode: compiled.artifact!.compiledCode,
    });

    const commands = invokeScriptRuntimeModule({
      moduleKey: 'scrib:runtime/scene-tools.scrib.ts:hash',
      phase: 'update',
      context: {
        deltaTime: 0.016,
        entityId: 'scene:scene-1',
        entity: {
          id: 'scene:scene-1',
          name: 'Scene Proxy',
          components: new Map(),
          children: [],
          parentId: null,
          active: true,
          tags: ['scene'],
        },
        targetScope: 'scene',
        targetId: 'scene-1',
        config: {},
        scribNodeId: 'node-1',
        scribSourceId: 'scrib-1',
        scribType: 'ui',
        sceneId: 'scene-1',
      },
      maxExecutionMs: 12,
      maxExecutionTicks: 6000,
    });

    expect(commands).toEqual([
      {
        type: 'setComponent',
        componentType: 'Collider',
        data: { type: 'box', isTrigger: true },
        enabled: true,
      },
      {
        type: 'setSceneEnvironment',
        environment: { fog: null },
      },
    ]);
  });

  it('trips the execution guard on infinite loops after instrumentation', () => {
    const compiled = compileScriptRuntimeArtifact({
      scriptId: 'runtime/infinite.ts',
      sourceText: 'export function update() { while (true) {} }',
    });

    expect(compiled.ok).toBe(true);
    loadScriptRuntimeModule({
      moduleKey: 'legacy:runtime/infinite.ts:hash',
      moduleKind: 'legacy',
      scriptId: 'runtime/infinite.ts',
      compiledCode: compiled.artifact!.compiledCode,
    });

    expect(() =>
      invokeScriptRuntimeModule({
        moduleKey: 'legacy:runtime/infinite.ts:hash',
        phase: 'update',
        context: {
          deltaTime: 0.016,
          entityId: 'entity-1',
          entity: {
            id: 'entity-1',
            name: 'Cube',
            components: new Map(),
            children: [],
            parentId: null,
            active: true,
            tags: [],
          },
        },
        maxExecutionMs: 12,
        maxExecutionTicks: 32,
      })
    ).toThrow(/tick budget/i);
  });
});
