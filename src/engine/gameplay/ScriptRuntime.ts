// ============================================
// Unified Runtime - Legacy Script + Scrib Composer
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import type { Entity, ScriptData } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import * as ts from 'typescript';
import { battleEngine } from '@/engine/gameplay/BattleEngine';
import { ensureBattleActorsForHealth, ensureBattleRuntimeBridge } from '@/engine/gameplay/BattleRuntimeBridge';
import {
  composeRuntimePlan,
  type AtomicScribType,
  type ComposerRuntimePlan,
  type RuntimePlanNode,
} from '@/engine/scrib';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { assertSafeScriptContent } from '@/engine/gameplay/script-sandbox';
import {
  instrumentSandboxRuntimeGuards,
  SANDBOX_GUARD_FUNCTION_NAME,
} from '@/engine/gameplay/script-guard';

type ScriptExports = {
  onStart?: (ctx: ScriptContext) => void;
  update?: (ctx: ScriptContext) => void;
  onStop?: (ctx: ScriptContext) => void;
};

type ScribHandler = {
  onStart?: (ctx: ScribContext) => void;
  update?: (ctx: ScribContext) => void;
  onStop?: (ctx: ScribContext) => void;
};

type RuntimeHotReloadEventDetail = {
  path?: string;
  reason?: string;
};

type ScriptRuntimeWarningEventDetail = {
  kind: 'legacy-load-failed' | 'legacy-script-disabled';
  scriptId: string;
  message: string;
  suggestion: string;
  failures?: number;
  retryInMs?: number;
  statusCode?: number;
};

export interface ScriptContext {
  deltaTime: number;
  entityId: string;
  entity: Entity;
  setTransform: (transform: Partial<{ x: number; y: number; z: number }>) => void;
  setVelocity?: (velocity: { x: number; y: number; z: number }) => void;
}

interface ScribContext extends ScriptContext {
  scribNodeId: string;
  scribSourceId: string;
  scribType: AtomicScribType;
  config: Record<string, unknown>;
  sceneId: string | null;
}

interface ActiveScript {
  scriptId: string;
  exports: ScriptExports;
}

interface ActiveScribNode {
  nodeId: string;
  sourceScribId: string;
  codeRef: string;
  handler: ScribHandler;
}

interface ExecutionGuardState {
  scriptId: string;
  startedAt: number;
  ticks: number;
}

export class ScriptRuntime {
  private readonly maxScribExecutionMs = 12;
  private readonly maxScribExecutionTicks = 6_000;
  private readonly maxScribConfigBytes = 12_000;
  private readonly allowCustomRuntimeScripts = process.env.NODE_ENV !== 'production';
  private readonly scriptLoadRetryMs = 5_000;
  private readonly scriptAuthRetryMs = 15_000;
  private readonly scriptMissingRetryMs = 60_000;
  private readonly scriptServerRetryBaseMs = 20_000;
  private readonly scriptServerRetryMaxMs = 180_000;
  private readonly scriptServerGlobalPauseMs = 12_000;
  private readonly scriptWarnCooldownMs = 10_000;
  private readonly scriptDisableAfterFailures = 4;

  private scriptCache: Map<string, Promise<ScriptExports>> = new Map();
  private activeByEntity: Map<string, ActiveScript> = new Map();
  private scriptLoadRetryAt: Map<string, number> = new Map();
  private scriptFailureCount: Map<string, number> = new Map();
  private scriptWarnedAt: Map<string, number> = new Map();
  private scriptAuthBlockedUntil = 0;
  private scriptServerBlockedUntil = 0;

  private scribCodeCache: Map<string, Promise<ScribHandler>> = new Map();
  private activeScribByNode: Map<string, ActiveScribNode> = new Map();
  private disabledScribNodes: Set<string> = new Set();

  private composerPlan: ComposerRuntimePlan | null = null;
  private composerSignature = '';
  private composerDiagnosticSignature = '';

  private hotReloadBound = false;
  private activeExecutionGuard: ExecutionGuardState | null = null;

  constructor() {
    this.bindHotReloadEvents();
  }

  reset(): void {
    const state = useEngineStore.getState();

    Array.from(this.activeByEntity.keys()).forEach((entityId) => this.stopScript(entityId));

    Array.from(this.activeScribByNode.keys()).forEach((nodeId) => {
      this.stopScribNode(nodeId, state);
    });

    this.activeByEntity.clear();
    this.activeScribByNode.clear();
    this.disabledScribNodes.clear();
    this.scriptLoadRetryAt.clear();
    this.scriptFailureCount.clear();
    this.scriptWarnedAt.clear();
    this.scriptAuthBlockedUntil = 0;
    this.scriptServerBlockedUntil = 0;
  }

  invalidateComposer(): void {
    this.composerSignature = '';
  }

  invalidateScript(scriptId?: string): void {
    if (scriptId) {
      const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
      this.scriptCache.delete(normalizedScriptId);
      this.scriptLoadRetryAt.delete(normalizedScriptId);
      this.scriptFailureCount.delete(normalizedScriptId);
      this.scriptWarnedAt.delete(normalizedScriptId);
      Array.from(this.activeByEntity.entries())
        .filter(([, active]) => active.scriptId === normalizedScriptId)
        .forEach(([entityId]) => this.stopScript(entityId));
      return;
    }
    this.scriptCache.clear();
    this.scriptLoadRetryAt.clear();
    this.scriptFailureCount.clear();
    this.scriptWarnedAt.clear();
    this.scriptAuthBlockedUntil = 0;
    this.scriptServerBlockedUntil = 0;
    Array.from(this.activeByEntity.keys()).forEach((entityId) => this.stopScript(entityId));
  }

  invalidateScribCode(codeRef?: string): void {
    if (codeRef) {
      this.scribCodeCache.delete(codeRef);
      Array.from(this.activeScribByNode.entries())
        .filter(([, active]) => active.codeRef === codeRef)
        .forEach(([nodeId]) => this.stopScribNode(nodeId, useEngineStore.getState()));
      return;
    }
    this.scribCodeCache.clear();
    Array.from(this.activeScribByNode.keys()).forEach((nodeId) => this.stopScribNode(nodeId, useEngineStore.getState()));
  }

  update(deltaTime: number): void {
    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      if (state.playRuntimeState === 'IDLE') {
        if (this.activeByEntity.size > 0 || this.activeScribByNode.size > 0) {
          this.reset();
        }
        battleEngine.reset();
      }
      return;
    }

    this.ensureComposerPlan();

    const entities = Array.from(state.entities.values());
    ensureBattleRuntimeBridge();
    ensureBattleActorsForHealth(entities);
    battleEngine.syncEntities(new Set(entities.map((entity) => entity.id)));
    battleEngine.tick(deltaTime);

    this.executeComposerPlan(deltaTime, state);
    this.executeLegacyScriptComponents(deltaTime, state);
  }

  private bindHotReloadEvents(): void {
    if (typeof window === 'undefined' || this.hotReloadBound) return;

    window.addEventListener('scrib:code-updated', this.onHotReloadEvent as EventListener);
    window.addEventListener('scrib:runtime-compose', this.onComposeEvent as EventListener);
    this.hotReloadBound = true;
  }

  private onHotReloadEvent = (event: Event): void => {
    const detail = (event as CustomEvent<RuntimeHotReloadEventDetail>).detail || {};
    const path = typeof detail.path === 'string' ? detail.path : '';
    if (path) {
      this.invalidateScript(path);
      this.invalidateScribCode(path);
    } else {
      this.invalidateScript();
      this.invalidateScribCode();
    }
    this.invalidateComposer();
  };

  private onComposeEvent = (): void => {
    this.invalidateComposer();
  };

  private ensureComposerPlan(): void {
    const state = useEngineStore.getState();
    const signature = this.buildComposerSignature(state);
    if (signature === this.composerSignature && this.composerPlan) {
      return;
    }

    const nextPlan = composeRuntimePlan({
      scenes: state.scenes,
      activeSceneId: state.activeSceneId,
      entities: state.entities,
      scribInstances: state.scribInstances,
    });

    if (this.composerPlan) {
      const nextNodeIds = new Set(nextPlan.nodes.map((node) => node.id));
      this.composerPlan.nodes
        .filter((node) => !nextNodeIds.has(node.id))
        .forEach((node) => this.stopScribNode(node.id, state));
    }

    const activeNodeIds = new Set(nextPlan.nodes.map((node) => node.id));
    this.disabledScribNodes.forEach((id) => {
      if (!activeNodeIds.has(id)) this.disabledScribNodes.delete(id);
    });

    const diagSignature = `${nextPlan.version}:${nextPlan.diagnostics.map((item) => `${item.level}:${item.code}`).join('|')}`;
    if (nextPlan.diagnostics.length > 0 && diagSignature !== this.composerDiagnosticSignature) {
      const errors = nextPlan.diagnostics.filter((item) => item.level === 'error').length;
      const warnings = nextPlan.diagnostics.filter((item) => item.level === 'warning').length;
      console.warn(`[ScribComposer] diagnostics: ${errors} error(s), ${warnings} warning(s).`);
      this.composerDiagnosticSignature = diagSignature;
    }

    this.composerPlan = nextPlan;
    this.composerSignature = signature;
  }

  private buildComposerSignature(state: ReturnType<typeof useEngineStore.getState>): string {
    const entityIds = Array.from(state.entities.keys()).sort().join(',');
    const scribSignature = Array.from(state.scribInstances.values())
      .map((item) =>
        [
          item.id,
          item.type,
          item.target.scope,
          item.target.id,
          item.enabled ? '1' : '0',
          item.updatedAt,
          item.code,
        ].join('|')
      )
      .sort()
      .join(';');
    return `${state.activeSceneId || 'no-scene'}::${entityIds}::${scribSignature}`;
  }

  private executeComposerPlan(
    deltaTime: number,
    state: ReturnType<typeof useEngineStore.getState>
  ): void {
    const plan = this.composerPlan;
    if (!plan || plan.nodes.length === 0) return;

    plan.nodes.forEach((node) => {
      if (!node.enabled || this.disabledScribNodes.has(node.id)) return;
      if (node.target.scope !== 'entity') return;

      const entity = state.entities.get(node.target.id);
      if (!entity || !entity.active) {
        this.stopScribNode(node.id, state);
        return;
      }
      void this.runScribNode(node, entity, deltaTime, plan.sceneId);
    });

    const validNodeIds = new Set(plan.nodes.map((node) => node.id));
    Array.from(this.activeScribByNode.keys())
      .filter((nodeId) => !validNodeIds.has(nodeId))
      .forEach((nodeId) => this.stopScribNode(nodeId, state));
  }

  private executeLegacyScriptComponents(
    deltaTime: number,
    state: ReturnType<typeof useEngineStore.getState>
  ): void {
    const entities = Array.from(state.entities.values());
    const seenLegacyEntityIds = new Set<string>();

    entities.forEach((entity) => {
      const scriptComp = entity.components.get('Script');
      if (!scriptComp || !scriptComp.enabled) {
        this.stopScript(entity.id);
        return;
      }

      const data = scriptComp.data as unknown as ScriptData;
      if (!data.scriptId) {
        this.stopScript(entity.id);
        return;
      }

      seenLegacyEntityIds.add(entity.id);
      void this.runEntityScript(entity, data.scriptId, deltaTime);
    });

    Array.from(this.activeByEntity.keys())
      .filter((entityId) => !seenLegacyEntityIds.has(entityId))
      .forEach((entityId) => this.stopScript(entityId));
  }

  private async runScribNode(
    node: RuntimePlanNode,
    entity: Entity,
    deltaTime: number,
    sceneId: string | null
  ): Promise<void> {
    if (this.estimateConfigSize(node.config) > this.maxScribConfigBytes) {
      this.disableScribNode(
        node,
        new Error(`Config exceeds sandbox limit (${this.maxScribConfigBytes} bytes).`)
      );
      return;
    }

    const current = this.activeScribByNode.get(node.id);
    const codeRef = node.code || `builtin:${node.type}`;
    let handler = current?.handler;

    if (!current || current.codeRef !== codeRef) {
      try {
        handler = await this.loadScribHandler(node);
      } catch (error) {
        this.disableScribNode(node, error);
        return;
      }

      if (current) {
        this.safeInvokeScrib(current.handler.onStop, this.makeScribContext(node, entity, 0, sceneId), node);
      }

      this.activeScribByNode.set(node.id, {
        nodeId: node.id,
        sourceScribId: node.sourceScribId,
        codeRef,
        handler,
      });

      this.safeInvokeScrib(handler.onStart, this.makeScribContext(node, entity, deltaTime, sceneId), node);
    }

    this.safeInvokeScrib(handler?.update, this.makeScribContext(node, entity, deltaTime, sceneId), node);
    if (!handler?.update) {
      this.runBuiltInAtomic(node, entity, this.makeScribContext(node, entity, deltaTime, sceneId));
    }
  }

  private safeInvokeScrib(
    fn: ((ctx: ScribContext) => void) | undefined,
    ctx: ScribContext,
    node: RuntimePlanNode
  ): void {
    if (!fn) return;
    try {
      this.withExecutionGuard(node.sourceScribId, () => fn(ctx));
    } catch (error) {
      this.disableScribNode(node, error);
    }
  }

  private safeInvokeLegacy(
    fn: ((ctx: ScriptContext) => void) | undefined,
    ctx: ScriptContext,
    scriptId: string,
    onFailure: (error: unknown) => void
  ): void {
    if (!fn) return;
    try {
      this.withExecutionGuard(scriptId, () => fn(ctx));
    } catch (error) {
      console.warn('[ScriptRuntime] Legacy script disabled after runtime fault', { scriptId, error });
      onFailure(error);
    }
  }

  private disableLegacyScriptComponent(entity: Entity, scriptId: string, reason: string): void {
    const state = useEngineStore.getState();
    const current = state.entities.get(entity.id) || entity;
    const scriptComp = current.components.get('Script');
    if (!scriptComp || !scriptComp.enabled) {
      this.stopScript(current.id);
      return;
    }

    const nextComponents = new Map(current.components);
    nextComponents.set('Script', {
      ...scriptComp,
      enabled: false,
    });
    state.updateEntity(current.id, { components: nextComponents });
    this.stopScript(current.id);

    this.scriptCache.delete(scriptId);
    this.scriptLoadRetryAt.delete(scriptId);
    this.scriptFailureCount.delete(scriptId);
    this.scriptWarnedAt.delete(scriptId);

    const suggestion =
      'Abre Scrib Studio > Edit, corrige/compila el script y luego vuelve a habilitar el componente Script en la entidad.';
    this.emitRuntimeWarning({
      kind: 'legacy-script-disabled',
      scriptId,
      message: `Script deshabilitado: ${reason}`,
      suggestion,
    });
  }

  private withExecutionGuard<T>(scriptId: string, work: () => T): T {
    const previous = this.activeExecutionGuard;
    this.activeExecutionGuard = {
      scriptId,
      startedAt: this.nowMs(),
      ticks: 0,
    };

    try {
      const result = work();
      this.assertActiveExecutionBudget();
      return result;
    } finally {
      this.activeExecutionGuard = previous;
    }
  }

  private readonly sandboxGuard = (): void => {
    if (!this.activeExecutionGuard) return;
    this.activeExecutionGuard.ticks += 1;
    this.assertActiveExecutionBudget();
  };

  private assertActiveExecutionBudget(): void {
    if (!this.activeExecutionGuard) return;

    if (this.activeExecutionGuard.ticks > this.maxScribExecutionTicks) {
      throw new Error(
        `[Sandbox:${this.activeExecutionGuard.scriptId}] execution exceeded tick budget (${this.maxScribExecutionTicks}).`
      );
    }

    const elapsed = this.nowMs() - this.activeExecutionGuard.startedAt;
    if (elapsed > this.maxScribExecutionMs) {
      throw new Error(
        `[Sandbox:${this.activeExecutionGuard.scriptId}] execution exceeded ${this.maxScribExecutionMs}ms budget (${elapsed.toFixed(2)}ms).`
      );
    }
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private disableScribNode(node: RuntimePlanNode, error: unknown): void {
    const reason = String(error);
    console.error(`[ScribRuntime] Disabling node ${node.id} (${node.type})`, error);
    console.warn('[security][scrib-blocked]', {
      nodeId: node.id,
      scribType: node.type,
      reason,
    });
    engineTelemetry.recordScribRuntimeError({
      nodeId: node.id,
      type: node.type,
      autoAdded: node.autoAdded,
      reason,
    });
    this.disabledScribNodes.add(node.id);
    this.stopScribNode(node.id, useEngineStore.getState());
    if (!node.autoAdded) {
      useEngineStore.getState().setScribInstanceEnabled(node.sourceScribId, false);
    }
  }

  private stopScribNode(nodeId: string, state: ReturnType<typeof useEngineStore.getState>): void {
    const active = this.activeScribByNode.get(nodeId);
    if (!active) return;

    const node = this.composerPlan?.nodes.find((item) => item.id === nodeId);
    if (node && node.target.scope === 'entity') {
      const entity = state.entities.get(node.target.id);
      if (entity) {
        const ctx = this.makeScribContext(node, entity, 0, this.composerPlan?.sceneId || null);
        try {
          active.handler.onStop?.(ctx);
        } catch (error) {
          console.warn(`[ScribRuntime] onStop failed for node ${nodeId}`, error);
        }
      }
    }
    this.activeScribByNode.delete(nodeId);
  }

  private async loadScribHandler(node: RuntimePlanNode): Promise<ScribHandler> {
    if (!node.code || node.code.startsWith('scribs/')) {
      return this.makeBuiltInHandler(node.type);
    }

    if (!this.allowCustomRuntimeScripts) {
      throw new Error('Custom Scrib execution is disabled in production.');
    }

    const codeRef = node.code;
    if (!this.scribCodeCache.has(codeRef)) {
      const promise = this.fetchAndCompileScrib(codeRef);
      this.scribCodeCache.set(codeRef, promise);
    }
    return this.scribCodeCache.get(codeRef)!;
  }

  private makeBuiltInHandler(type: AtomicScribType): ScribHandler {
    return {
      update: (ctx) => this.runBuiltInAtomic({} as RuntimePlanNode, ctx.entity, { ...ctx, scribType: type }),
    };
  }

  private runBuiltInAtomic(
    node: Pick<RuntimePlanNode, 'type' | 'config'>,
    entity: Entity,
    ctx: Pick<ScribContext, 'deltaTime' | 'setTransform' | 'config' | 'scribType'>
  ): void {
    const config = node.config || ctx.config || {};

    if (ctx.scribType === 'movement' || node.type === 'movement') {
      const autoMove = config.autoMove === true;
      if (!autoMove) return;
      const speed = typeof config.speed === 'number' ? config.speed : 2;
      const dirX = typeof config.dirX === 'number' ? config.dirX : 1;
      const dirZ = typeof config.dirZ === 'number' ? config.dirZ : 0;
      ctx.setTransform({
        x: this.readTransform(entity, 'x') + dirX * speed * ctx.deltaTime,
        z: this.readTransform(entity, 'z') + dirZ * speed * ctx.deltaTime,
      });
      return;
    }

    if (ctx.scribType === 'physics' || node.type === 'physics') {
      const simulate = config.simulate === true;
      const gravity = typeof config.gravity === 'number' ? config.gravity : 9.81;
      if (!simulate) return;
      const y = this.readTransform(entity, 'y');
      const nextY = Math.max(0, y - gravity * ctx.deltaTime);
      ctx.setTransform({ y: nextY });
      return;
    }

    if (ctx.scribType === 'ai' || node.type === 'ai') {
      const patrol = config.patrol === true;
      if (!patrol) return;
      const amplitude = typeof config.amplitude === 'number' ? config.amplitude : 0.25;
      const speed = typeof config.speed === 'number' ? config.speed : 1;
      const x = this.readTransform(entity, 'x');
      ctx.setTransform({ x: x + Math.sin(Date.now() * 0.001 * speed) * amplitude * ctx.deltaTime });
      return;
    }
  }

  private readTransform(entity: Entity, axis: 'x' | 'y' | 'z'): number {
    const transform = entity.components.get('Transform');
    const data = transform?.data as { position?: { x?: number; y?: number; z?: number } } | undefined;
    const position = data?.position || {};
    const value = position[axis];
    return typeof value === 'number' ? value : axis === 'y' ? 0.5 : 0;
  }

  private makeScribContext(
    node: Pick<RuntimePlanNode, 'id' | 'sourceScribId' | 'type' | 'config'>,
    entity: Entity,
    deltaTime: number,
    sceneId: string | null
  ): ScribContext {
    const base = this.makeContext(entity, deltaTime);
    return {
      ...base,
      scribNodeId: node.id,
      scribSourceId: node.sourceScribId,
      scribType: node.type,
      config: node.config || {},
      sceneId,
    };
  }

  private async fetchAndCompileScrib(scriptId: string): Promise<ScribHandler> {
    const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
    const content = await this.fetchScriptContent(normalizedScriptId);
    const moduleRef = this.compileModule(normalizedScriptId, content) as Record<string, unknown>;

    const onStart = typeof moduleRef.onStart === 'function' ? (moduleRef.onStart as (ctx: ScribContext) => void) : undefined;
    const update = typeof moduleRef.update === 'function' ? (moduleRef.update as (ctx: ScribContext) => void) : undefined;
    const onStop = typeof moduleRef.onStop === 'function' ? (moduleRef.onStop as (ctx: ScribContext) => void) : undefined;
    const defaultFn = typeof moduleRef.default === 'function'
      ? (moduleRef.default as (entity: Entity, config: Record<string, unknown>, ctx: ScribContext) => void)
      : undefined;

    if (defaultFn) {
      return {
        onStart,
        update: (ctx) => defaultFn(ctx.entity, ctx.config, ctx),
        onStop,
      };
    }

    return { onStart, update, onStop };
  }

  private async runEntityScript(entity: Entity, scriptId: string, deltaTime: number): Promise<void> {
    const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
    const cached = this.activeByEntity.get(entity.id);
    const disableLegacy = (error: unknown) => {
      const reason = `Runtime fault: ${String((error as { message?: unknown })?.message ?? error)}`;
      this.disableLegacyScriptComponent(entity, normalizedScriptId, reason);
    };

    let exports: ScriptExports | null = null;
    if (cached && cached.scriptId === normalizedScriptId) {
      exports = cached.exports;
    } else {
      if (cached && cached.scriptId !== normalizedScriptId) {
        this.stopScript(entity.id);
      }
      if (this.shouldBackoffScriptLoad(normalizedScriptId)) {
        return;
      }
      exports = await this.loadScript(normalizedScriptId).catch((err) => {
        this.registerScriptLoadFailure(normalizedScriptId, err);
        return null;
      });
      if (!exports) {
        const failures = this.scriptFailureCount.get(normalizedScriptId) || 0;
        if (failures >= this.scriptDisableAfterFailures) {
          this.disableLegacyScriptComponent(
            entity,
            normalizedScriptId,
            `Load failed ${failures} times. Script auto-disabled to prevent runtime storm.`
          );
        }
        return;
      }
      this.clearScriptLoadFailure(normalizedScriptId);
      this.stopScript(entity.id);
      this.activeByEntity.set(entity.id, { scriptId: normalizedScriptId, exports });
      this.safeInvokeLegacy(exports.onStart, this.makeContext(entity, deltaTime), normalizedScriptId, disableLegacy);
    }

    this.safeInvokeLegacy(exports.update, this.makeContext(entity, deltaTime), normalizedScriptId, disableLegacy);
  }

  private stopScript(entityId: string): void {
    const active = this.activeByEntity.get(entityId);
    if (!active) return;
    const state = useEngineStore.getState();
    const entity = state.entities.get(entityId);
    if (entity) {
      this.safeInvokeLegacy(active.exports.onStop, this.makeContext(entity, 0), active.scriptId, () => {});
    }
    this.activeByEntity.delete(entityId);
  }

  private async loadScript(scriptId: string): Promise<ScriptExports> {
    if (!this.allowCustomRuntimeScripts) {
      throw new Error('Legacy Script execution is disabled in production.');
    }

    if (!this.scriptCache.has(scriptId)) {
      const promise = this.fetchAndCompileLegacyScript(scriptId);
      this.scriptCache.set(scriptId, promise);
    }
    return this.scriptCache.get(scriptId)!;
  }

  private async fetchAndCompileLegacyScript(scriptId: string): Promise<ScriptExports> {
    const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
    const content = await this.fetchScriptContent(normalizedScriptId);
    const moduleRef = this.compileModule(normalizedScriptId, content) as ScriptExports;
    return moduleRef;
  }

  private shouldBackoffScriptLoad(scriptId: string): boolean {
    const now = this.nowMs();
    if (now < this.scriptAuthBlockedUntil) {
      return true;
    }
    if (now < this.scriptServerBlockedUntil) {
      return true;
    }
    const retryAt = this.scriptLoadRetryAt.get(scriptId) || 0;
    return now < retryAt;
  }

  private clearScriptLoadFailure(scriptId: string): void {
    this.scriptLoadRetryAt.delete(scriptId);
    this.scriptFailureCount.delete(scriptId);
    this.scriptWarnedAt.delete(scriptId);
    if (this.scriptAuthBlockedUntil > 0 && this.nowMs() >= this.scriptAuthBlockedUntil) {
      this.scriptAuthBlockedUntil = 0;
    }
    if (this.scriptServerBlockedUntil > 0 && this.nowMs() >= this.scriptServerBlockedUntil) {
      this.scriptServerBlockedUntil = 0;
    }
  }

  private registerScriptLoadFailure(scriptId: string, error: unknown): void {
    this.scriptCache.delete(scriptId);

    const now = this.nowMs();
    const statusCode = this.readScriptFetchStatusCode(error);
    const authFailure = this.isAuthScriptFetchError(error);
    const missingFailure = this.isMissingScriptFetchError(error);
    const serverFailure = this.isServerScriptFetchError(error);
    const failureCount = (this.scriptFailureCount.get(scriptId) || 0) + 1;
    this.scriptFailureCount.set(scriptId, failureCount);

    const serverRetryMs = Math.min(
      this.scriptServerRetryMaxMs,
      this.scriptServerRetryBaseMs * failureCount
    );
    const retryMs = authFailure
      ? this.scriptAuthRetryMs
      : missingFailure
        ? this.scriptMissingRetryMs
        : serverFailure
          ? serverRetryMs
          : this.scriptLoadRetryMs;
    this.scriptLoadRetryAt.set(scriptId, now + retryMs);
    if (authFailure) {
      this.scriptAuthBlockedUntil = Math.max(this.scriptAuthBlockedUntil, now + retryMs);
    }
    if (serverFailure) {
      this.scriptServerBlockedUntil = Math.max(
        this.scriptServerBlockedUntil,
        now + this.scriptServerGlobalPauseMs
      );
    }

    const lastWarnedAt = this.scriptWarnedAt.get(scriptId) || 0;
    if (now - lastWarnedAt < this.scriptWarnCooldownMs) {
      return;
    }

    const messageBase = statusCode
      ? `Script ${scriptId} devolvió HTTP ${statusCode}.`
      : `Script ${scriptId} falló al cargar.`;
    const suggestion = this.buildScriptLoadFailureSuggestion({
      authFailure,
      missingFailure,
      serverFailure,
      scriptId,
    });

    if (authFailure) {
      console.warn(
        '[ScriptRuntime] Script fetch blocked by auth. Login required before retry.',
        { scriptId, retryInMs: retryMs }
      );
    } else if (missingFailure) {
      console.warn(
        '[ScriptRuntime] Script file not found. Waiting before next retry.',
        { scriptId, retryInMs: retryMs }
      );
    } else if (serverFailure) {
      console.warn(
        '[ScriptRuntime] Script API returned 5xx. Applying backoff to avoid request storms.',
        { scriptId, retryInMs: retryMs, failures: failureCount }
      );
    } else {
      console.warn('[ScriptRuntime] Failed to load script', scriptId, error);
    }

    this.emitRuntimeWarning({
      kind: 'legacy-load-failed',
      scriptId,
      message: `${messageBase} Reintento en ${Math.round(retryMs / 1000)}s.`,
      suggestion,
      failures: failureCount,
      retryInMs: retryMs,
      statusCode: statusCode ?? undefined,
    });
    this.scriptWarnedAt.set(scriptId, now);
  }

  private readScriptFetchStatusCode(error: unknown): number | null {
    if (typeof error === 'object' && error && 'status' in error) {
      const status = Number((error as { status?: unknown }).status);
      if (Number.isFinite(status) && status > 0) return status;
    }

    const message = String((error as { message?: unknown })?.message ?? error);
    const match = message.match(/HTTP\s+(\d{3})/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private buildScriptLoadFailureSuggestion(params: {
    authFailure: boolean;
    missingFailure: boolean;
    serverFailure: boolean;
    scriptId: string;
  }): string {
    if (params.authFailure) {
      return 'Inicia sesión en Config APIs -> Usuario para autorizar /api/scripts.';
    }
    if (params.missingFailure) {
      return `Crea o corrige el archivo ${params.scriptId} en Scrib Studio > Edit.`;
    }
    if (params.serverFailure) {
      return 'Revisa logs de /api/scripts y corrige el error del servidor antes de volver a ejecutar.';
    }
    return 'Abre Scrib Studio > Console para validar scriptId y configuración del componente Script.';
  }

  private emitRuntimeWarning(detail: ScriptRuntimeWarningEventDetail): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<ScriptRuntimeWarningEventDetail>('script:runtime-warning', { detail }));
  }

  private isAuthScriptFetchError(error: unknown): boolean {
    if (typeof error === 'object' && error && 'status' in error) {
      const status = Number((error as { status?: unknown }).status);
      if (status === 401 || status === 403) return true;
    }

    const message = String((error as { message?: unknown })?.message ?? error);
    return (
      message.includes('HTTP 401') ||
      message.includes('HTTP 403') ||
      message.includes('UNAUTHORIZED') ||
      message.includes('FORBIDDEN')
    );
  }

  private isMissingScriptFetchError(error: unknown): boolean {
    if (typeof error === 'object' && error && 'status' in error) {
      const status = Number((error as { status?: unknown }).status);
      if (status === 404) return true;
    }

    const message = String((error as { message?: unknown })?.message ?? error);
    return message.includes('HTTP 404');
  }

  private isServerScriptFetchError(error: unknown): boolean {
    if (typeof error === 'object' && error && 'status' in error) {
      const status = Number((error as { status?: unknown }).status);
      if (status >= 500 && status < 600) return true;
    }

    const message = String((error as { message?: unknown })?.message ?? error);
    return message.includes('HTTP 5');
  }

  private async fetchScriptContent(scriptId: string): Promise<string> {
    const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
    const url = `/api/scripts?path=${encodeURIComponent(normalizedScriptId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const error = new Error(`HTTP ${res.status} fetching script ${normalizedScriptId}`) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    const payload = await res.json();
    const content = payload?.script?.content;
    if (typeof content !== 'string') {
      throw new Error('Script content missing');
    }
    return content;
  }

  private normalizeScriptIdentifier(scriptId: string): string {
    const cleaned = scriptId.replace(/\\/g, '/').trim();
    if (!cleaned) return cleaned;

    const withoutLeading = cleaned.replace(/^\/+/, '');
    if (withoutLeading.startsWith('scripts/')) {
      return withoutLeading.slice('scripts/'.length);
    }
    return withoutLeading;
  }

  private compileModule(scriptId: string, content: string): Record<string, unknown> {
    assertSafeScriptContent(scriptId, content);
    const transpiled = ts.transpileModule(content, {
      fileName: scriptId,
      reportDiagnostics: false,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        strict: false,
        jsx: ts.JsxEmit.ReactJSX,
        skipLibCheck: true,
      },
    }).outputText;
    const instrumented = instrumentSandboxRuntimeGuards(scriptId, transpiled);

    const moduleRef: { exports: Record<string, unknown> } = { exports: {} };
    const safeConsole = {
      log: (...args: unknown[]) => console.log(`[Sandbox:${scriptId}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[Sandbox:${scriptId}]`, ...args),
      error: (...args: unknown[]) => console.error(`[Sandbox:${scriptId}]`, ...args),
    };
    const safeGlobal = {
      console: safeConsole,
      Math,
      Date,
      JSON,
      Input: (globalThis as Record<string, unknown>).Input,
      Entity: (globalThis as Record<string, unknown>).Entity,
    };

    const fn = new Function(
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
      `"use strict";\n${instrumented}`
    );

    this.withExecutionGuard(scriptId, () => {
      fn(
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
        this.sandboxGuard
      );
    });
    return moduleRef.exports;
  }

  private estimateConfigSize(config: Record<string, unknown> | undefined): number {
    if (!config) return 0;
    try {
      return JSON.stringify(config).length;
    } catch {
      return this.maxScribConfigBytes + 1;
    }
  }

  private makeContext(entity: Entity, deltaTime: number): ScriptContext {
    const store = useEngineStore.getState();
    return {
      deltaTime,
      entityId: entity.id,
      entity,
      setTransform: (t) => {
        const comp = entity.components.get('Transform');
        if (!comp) return;
        const current = (comp.data as {
          position?: { x?: number; y?: number; z?: number };
          [key: string]: unknown;
        }) || {};
        const currentPos = current.position || {};
        const next = {
          ...current,
          position: {
            x: 'x' in t ? t.x : currentPos.x ?? 0,
            y: 'y' in t ? t.y : currentPos.y ?? 0,
            z: 'z' in t ? t.z : currentPos.z ?? 0,
          },
        };
        const components = new Map(entity.components);
        components.set('Transform', { ...comp, data: next });
        // Runtime ticks should not push undo history on every frame.
        store.updateEntityTransient(entity.id, { components });
      },
    };
  }
}

// Singleton runtime
export const scriptRuntime = new ScriptRuntime();
