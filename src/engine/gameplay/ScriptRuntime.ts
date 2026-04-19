// ============================================
// Unified Runtime - Legacy Script + Scrib Composer
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import {
  resolveAdvancedLightingSettings,
  type Component,
  type Entity,
  type EnvironmentSettings,
  type FogSettings,
  type Scene,
  type ScriptData,
} from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import { animationRuntimeBridge } from '@/engine/animation/animationRuntimeBridge';
import { battleRuntimeBridge } from '@/engine/gameplay/BattleRuntimeBridge';
import { audioRuntimeBridge } from '@/engine/audio/audioRuntimeBridge';
import { inputRuntimeBridge } from '@/engine/input/inputRuntimeBridge';
import { physicsRuntimeBridge } from '@/engine/physics/physicsRuntimeBridge';
import { uiRuntimeBridge } from '@/engine/ui-runtime';
import {
  composeRuntimePlan,
  type AtomicScribType,
  type ComposerRuntimePlan,
  type RuntimePlanNode,
} from '@/engine/scrib';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import type {
  DisabledScribNodeRecord,
  RuntimeArtifactRecord,
  RuntimeArtifactVerificationRecord,
  RuntimeEventRecord,
  ScriptExecutionStatus,
  ScriptRuntimeDiagnostics,
} from '@/engine/gameplay/script-runtime-diagnostics';
import { getScriptRuntimePolicy } from '@/lib/security/script-runtime-policy';
import { ScriptRuntimeWorkerHost } from '@/engine/gameplay/script-runtime-worker-host';
import type {
  ScriptRuntimeCommand,
  ScriptRuntimeInvocationContext,
  ScriptRuntimeModuleKind,
  ScriptRuntimePhase,
} from '@/engine/gameplay/script-runtime-protocol';

type RuntimeExecutionModel = 'local' | 'worker';
type ScriptPhase<T> = (ctx: T) => void | Promise<void>;

type ScriptExports = {
  executionModel: RuntimeExecutionModel;
  onStart?: ScriptPhase<ScriptContext>;
  update?: ScriptPhase<ScriptContext>;
  onStop?: ScriptPhase<ScriptContext>;
};

type ScribHandler = {
  executionModel: RuntimeExecutionModel;
  onStart?: ScriptPhase<ScribContext>;
  update?: ScriptPhase<ScribContext>;
  onStop?: ScriptPhase<ScribContext>;
};

type RuntimeHotReloadEventDetail = {
  path?: string;
  reason?: string;
};

type ScriptRuntimeWarningEventDetail = {
  kind: 'legacy-load-failed' | 'scrib-load-failed' | 'legacy-script-disabled';
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
  setComponent?: (componentType: string, data: Record<string, unknown>, enabled?: boolean) => void;
}

interface ScribContext extends ScriptContext {
  targetScope: 'entity' | 'scene';
  targetId: string;
  scribNodeId: string;
  scribSourceId: string;
  scribType: AtomicScribType;
  config: Record<string, unknown>;
  sceneId: string | null;
  scene?: Scene | null;
  setSceneEnvironment?: (environment: Partial<EnvironmentSettings>) => void;
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

export interface ScriptRuntimeFlushResult {
  scheduledTasks: number;
  settledTasks: number;
  pendingTasks: number;
  timedOut: boolean;
}

function createRuntimeInstanceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, '_');
    }
  } catch {
    // Fall through to timestamp-based id.
  }
  return `runtime_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export class ScriptRuntime {
  private readonly maxScribExecutionMs = 12;
  private readonly maxScribExecutionTicks = 6_000;
  private readonly maxScribConfigBytes = 12_000;
  private readonly runtimePolicy = getScriptRuntimePolicy();
  private readonly allowCustomRuntimeScripts = this.runtimePolicy.enabled;
  private readonly runtimeLoadTimeoutMs = Number(process.env.REY30_SCRIPT_RUNTIME_LOAD_TIMEOUT_MS || 400);
  private readonly runtimeInvokeTimeoutMs = Number(process.env.REY30_SCRIPT_RUNTIME_EXEC_TIMEOUT_MS || 40);
  private readonly scriptLoadRetryMs = 5_000;
  private readonly scriptAuthRetryMs = 15_000;
  private readonly scriptMissingRetryMs = 60_000;
  private readonly scriptServerRetryBaseMs = 20_000;
  private readonly scriptServerRetryMaxMs = 180_000;
  private readonly scriptServerGlobalPauseMs = 12_000;
  private readonly scriptWarnCooldownMs = 10_000;
  private readonly scriptDisableAfterFailures = 4;
  private readonly runtimeEventLimit = 30;
  private readonly runtimeInstanceId = createRuntimeInstanceId();

  private scriptCache: Map<string, Promise<ScriptExports>> = new Map();
  private activeByEntity: Map<string, ActiveScript> = new Map();
  private scriptLoadRetryAt: Map<string, number> = new Map();
  private scriptFailureCount: Map<string, number> = new Map();
  private scriptWarnedAt: Map<string, number> = new Map();
  private scriptLastError: Map<string, { message: string; statusCode: number | null }> = new Map();
  private scriptAuthBlockedUntil = 0;
  private scriptServerBlockedUntil = 0;
  private runtimeArtifacts: Map<string, RuntimeArtifactRecord> = new Map();
  private artifactVerifications: Map<string, RuntimeArtifactVerificationRecord> = new Map();
  private runtimeEvents: RuntimeEventRecord[] = [];
  private lastHeartbeatAt: string | null = null;
  private lastHeartbeatError: string | null = null;
  private heartbeatStatus: 'idle' | 'healthy' | 'error' = 'idle';
  private executionLeaseStatus: 'unknown' | 'local-only' | 'owned' | 'standby' = 'unknown';
  private executionLeaseOwnerInstanceId: string | null = null;
  private executionLeaseExpiresAt: string | null = null;

  private scribCodeCache: Map<string, Promise<ScribHandler>> = new Map();
  private activeScribByNode: Map<string, ActiveScribNode> = new Map();
  private disabledScribNodes: Set<string> = new Set();

  private composerPlan: ComposerRuntimePlan | null = null;
  private composerSignature = '';
  private composerDiagnosticSignature = '';
  private pendingRuntimeTasks = new Set<Promise<void>>();

  private readonly sandboxWorkerHost = new ScriptRuntimeWorkerHost({
    loadTimeoutMs: this.runtimeLoadTimeoutMs,
    invokeTimeoutMs: this.runtimeInvokeTimeoutMs,
  });
  private hotReloadBound = false;
  private activeExecutionGuard: ExecutionGuardState | null = null;

  constructor() {
    this.bindHotReloadEvents();
  }

  getDiagnostics(): ScriptRuntimeDiagnostics {
    const now = this.nowMs();
    const wallClockNow = Date.now();
    const activeScriptIds = Array.from(
      new Set(Array.from(this.activeByEntity.values()).map((item) => item.scriptId))
    ).sort();
    const disabledScribNodeDetails = this.buildDisabledScribNodeDetails();
    const statuses: ScriptExecutionStatus[] = Array.from(
      new Set([
        ...this.scriptFailureCount.keys(),
        ...this.scriptLoadRetryAt.keys(),
        ...this.runtimeArtifacts.keys(),
        ...this.artifactVerifications.keys(),
      ])
    )
      .sort()
      .map((scriptId) => {
        const failures = this.scriptFailureCount.get(scriptId) || 0;
        const retryAtMs = this.scriptLoadRetryAt.get(scriptId) || 0;
        const lastError = this.scriptLastError.get(scriptId) || null;
        const activeArtifact = this.runtimeArtifacts.get(scriptId) || null;

        let status: ScriptExecutionStatus['status'] = 'ready';
        if (failures >= this.scriptDisableAfterFailures) {
          status = 'disabled';
        } else if (retryAtMs > now) {
          status = 'backoff';
        } else if (lastError) {
          status = 'error';
        } else if (activeArtifact && activeArtifact.status !== 'ready') {
          status = 'error';
        }

        const retryInMs = retryAtMs > 0 ? Math.max(0, retryAtMs - now) : 0;
        return {
          scriptId,
          status,
          failures,
          retryAt: retryAtMs > 0 ? new Date(wallClockNow + retryInMs).toISOString() : null,
          lastError: lastError?.message || null,
          lastStatusCode: lastError?.statusCode ?? null,
        };
      });

    return {
      generatedAt: new Date().toISOString(),
      instance: {
        instanceId: this.runtimeInstanceId,
        heartbeatStatus: this.heartbeatStatus,
        lastHeartbeatAt: this.lastHeartbeatAt,
        lastHeartbeatError: this.lastHeartbeatError,
        executionLeaseStatus: this.executionLeaseStatus,
        executionLeaseOwnerInstanceId: this.executionLeaseOwnerInstanceId,
        executionLeaseExpiresAt: this.executionLeaseExpiresAt,
      },
      composer: {
        planReady: this.composerPlan !== null,
        signature: this.composerSignature,
        diagnosticSignature: this.composerDiagnosticSignature,
        activeScribNodes: this.activeScribByNode.size,
        disabledScribNodes: Array.from(this.disabledScribNodes).sort(),
        disabledScribNodeDetails,
      },
      legacyScripts: {
        activeEntityScripts: this.activeByEntity.size,
        activeScriptIds,
        cachedScripts: this.scriptCache.size,
        statuses,
      },
      artifacts: Array.from(this.runtimeArtifacts.values()).sort((a, b) =>
        a.scriptId.localeCompare(b.scriptId)
      ),
      artifactVerifications: Array.from(this.artifactVerifications.values()).sort((a, b) =>
        a.scriptId.localeCompare(b.scriptId)
      ),
      pauses: {
        authBlockedUntil:
          this.scriptAuthBlockedUntil > now
            ? new Date(wallClockNow + (this.scriptAuthBlockedUntil - now)).toISOString()
            : null,
        serverBlockedUntil:
          this.scriptServerBlockedUntil > now
            ? new Date(wallClockNow + (this.scriptServerBlockedUntil - now)).toISOString()
            : null,
      },
      recentEvents: [...this.runtimeEvents],
    };
  }

  recordArtifactVerification(params: {
    scriptId: string;
    ok: boolean;
    message?: string | null;
  }): void {
    const scriptId = this.normalizeScriptIdentifier(params.scriptId);
    const current = this.artifactVerifications.get(scriptId);
    const next: RuntimeArtifactVerificationRecord = {
      scriptId,
      okCount: (current?.okCount || 0) + (params.ok ? 1 : 0),
      failedCount: (current?.failedCount || 0) + (params.ok ? 0 : 1),
      lastStatus: params.ok ? 'ok' : 'failed',
      lastVerifiedAt: new Date().toISOString(),
      lastMessage: params.message || null,
    };
    this.artifactVerifications.set(scriptId, next);
    this.pushRuntimeEvent({
      kind: params.ok ? 'artifact_verification_ok' : 'artifact_verification_failed',
      scriptId,
      message: params.message || (params.ok ? 'Artifact verification completed.' : 'Artifact verification failed.'),
      metadata: {
        okCount: next.okCount,
        failedCount: next.failedCount,
      },
    });
  }

  hydrateArtifactVerifications(records: RuntimeArtifactVerificationRecord[]): void {
    records.forEach((record) => {
      if (!record?.scriptId) return;
      const scriptId = this.normalizeScriptIdentifier(record.scriptId);
      this.artifactVerifications.set(scriptId, {
        scriptId,
        okCount: Math.max(0, Number(record.okCount) || 0),
        failedCount: Math.max(0, Number(record.failedCount) || 0),
        lastStatus: record.lastStatus === 'ok' ? 'ok' : 'failed',
        lastVerifiedAt: record.lastVerifiedAt || new Date().toISOString(),
        lastMessage: record.lastMessage || null,
      });
    });
  }

  forceImmediateRetryForScript(scriptId: string, reason = 'manual_retry'): void {
    const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
    this.scriptCache.delete(normalizedScriptId);
    this.scribCodeCache.delete(normalizedScriptId);
    this.scriptLoadRetryAt.delete(normalizedScriptId);
    this.scriptFailureCount.delete(normalizedScriptId);
    this.scriptWarnedAt.delete(normalizedScriptId);
    this.scriptLastError.delete(normalizedScriptId);
    this.runtimeArtifacts.delete(normalizedScriptId);
    this.scriptAuthBlockedUntil = 0;
    this.scriptServerBlockedUntil = 0;
    this.pushRuntimeEvent({
      kind: 'script_load_recovered',
      scriptId: normalizedScriptId,
      message: 'Script retry forced after artifact verification.',
      metadata: { reason },
    });
  }

  retryDisabledScribNode(nodeId?: string): void {
    if (nodeId) {
      this.disabledScribNodes.delete(nodeId);
      this.stopScribNode(nodeId, useEngineStore.getState());
      this.pushRuntimeEvent({
        kind: 'scrib_node_retry_requested',
        nodeId,
        message: 'Scrib node retry requested from Scrib Studio.',
      });
    } else {
      const nodeIds = Array.from(this.disabledScribNodes);
      this.disabledScribNodes.clear();
      nodeIds.forEach((id) => this.stopScribNode(id, useEngineStore.getState()));
      this.pushRuntimeEvent({
        kind: 'scrib_node_retry_requested',
        message: 'Scrib node retry requested for all disabled nodes from Scrib Studio.',
        metadata: { nodeCount: nodeIds.length },
      });
    }
    this.invalidateComposer();
  }

  private buildDisabledScribNodeDetails(): DisabledScribNodeRecord[] {
    return Array.from(this.disabledScribNodes)
      .sort()
      .map((nodeId) => {
        const node = this.composerPlan?.nodes.find((item) => item.id === nodeId) || null;
        return {
          nodeId,
          sourceScribId: node?.sourceScribId || null,
          code: node?.code || null,
          scribType: node?.type || null,
          autoAdded: typeof node?.autoAdded === 'boolean' ? node.autoAdded : null,
        };
      });
  }

  markHeartbeatSuccess(params: {
    heartbeatAt: string;
    lease?: {
      status?: 'not-required' | 'local-only' | 'unclaimed' | 'owned' | 'standby';
      ownerInstanceId?: string | null;
      leaseExpiresAt?: string | null;
    } | null;
  } | string): void {
    const heartbeatAt = typeof params === 'string' ? params : params.heartbeatAt;
    this.lastHeartbeatAt = heartbeatAt;
    this.lastHeartbeatError = null;
    this.heartbeatStatus = 'healthy';
    const lease = typeof params === 'string' ? null : params.lease || null;
    if (!lease || lease.status === 'not-required' || lease.status === 'unclaimed') {
      this.executionLeaseStatus = 'unknown';
      this.executionLeaseOwnerInstanceId = lease?.ownerInstanceId ?? null;
      this.executionLeaseExpiresAt = lease?.leaseExpiresAt ?? null;
      return;
    }

    this.executionLeaseStatus =
      lease.status === 'local-only'
        ? 'local-only'
        : lease.status === 'owned'
          ? 'owned'
          : 'standby';
    this.executionLeaseOwnerInstanceId = lease.ownerInstanceId ?? null;
    this.executionLeaseExpiresAt = lease.leaseExpiresAt ?? null;
  }

  markHeartbeatFailure(error: unknown): void {
    this.lastHeartbeatError = String(error);
    this.heartbeatStatus = 'error';
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
    this.scriptLastError.clear();
    this.scriptAuthBlockedUntil = 0;
    this.scriptServerBlockedUntil = 0;
    this.runtimeArtifacts.clear();
    this.pendingRuntimeTasks.clear();
    inputRuntimeBridge.reset();
    animationRuntimeBridge.reset();
    physicsRuntimeBridge.reset();
    battleRuntimeBridge.reset();
    audioRuntimeBridge.reset();
    uiRuntimeBridge.reset();
    this.sandboxWorkerHost.reset('runtime_reset');
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
      this.scriptLastError.delete(normalizedScriptId);
      this.runtimeArtifacts.delete(normalizedScriptId);
      Array.from(this.activeByEntity.entries())
        .filter(([, active]) => active.scriptId === normalizedScriptId)
        .forEach(([entityId]) => this.stopScript(entityId));
      this.sandboxWorkerHost.reset('script_invalidated');
      return;
    }
    this.scriptCache.clear();
    this.scriptLoadRetryAt.clear();
    this.scriptFailureCount.clear();
    this.scriptWarnedAt.clear();
    this.scriptLastError.clear();
    this.scriptAuthBlockedUntil = 0;
    this.scriptServerBlockedUntil = 0;
    this.runtimeArtifacts.clear();
    Array.from(this.activeByEntity.keys()).forEach((entityId) => this.stopScript(entityId));
    this.sandboxWorkerHost.reset('all_scripts_invalidated');
  }

  invalidateScribCode(codeRef?: string): void {
    if (codeRef) {
      const normalizedCodeRef = this.resolveScribCodeRef(codeRef);
      this.scribCodeCache.delete(normalizedCodeRef);
      Array.from(this.activeScribByNode.entries())
        .filter(([, active]) => active.codeRef === normalizedCodeRef)
        .forEach(([nodeId]) => this.stopScribNode(nodeId, useEngineStore.getState()));
      this.sandboxWorkerHost.reset('scrib_invalidated');
      return;
    }
    this.scribCodeCache.clear();
    Array.from(this.activeScribByNode.keys()).forEach((nodeId) => this.stopScribNode(nodeId, useEngineStore.getState()));
    this.sandboxWorkerHost.reset('all_scribs_invalidated');
  }

  update(deltaTime: number): void {
    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      if (state.playRuntimeState === 'IDLE') {
        if (
          this.activeByEntity.size > 0
          || this.activeScribByNode.size > 0
          || inputRuntimeBridge.isActive
          || animationRuntimeBridge.isActive
          || physicsRuntimeBridge.isActive
          || audioRuntimeBridge.isActive
          || uiRuntimeBridge.isActive
        ) {
          this.reset();
        }
      }
      return;
    }

    this.ensureComposerPlan();
    if (this.requiresCoordinatedLease(state) && this.executionLeaseStatus === 'standby') {
      if (
        this.activeByEntity.size > 0 ||
        this.activeScribByNode.size > 0 ||
        inputRuntimeBridge.isActive ||
        animationRuntimeBridge.isActive ||
        physicsRuntimeBridge.isActive ||
        audioRuntimeBridge.isActive ||
        uiRuntimeBridge.isActive
      ) {
        this.reset();
      }
      return;
    }

    inputRuntimeBridge.update(deltaTime);
    this.executeComposerPlan(deltaTime, state);
    this.executeLegacyScriptComponents(deltaTime, state);
    animationRuntimeBridge.update(deltaTime);
    physicsRuntimeBridge.update(deltaTime);
    battleRuntimeBridge.update(deltaTime);
    audioRuntimeBridge.update(deltaTime);
    uiRuntimeBridge.update(deltaTime, this.composerPlan);
  }

  async updateAndFlush(deltaTime: number, timeoutMs = 1_500): Promise<ScriptRuntimeFlushResult> {
    this.update(deltaTime);
    return this.flushPendingRuntimeTasks(timeoutMs);
  }

  async flushPendingRuntimeTasks(timeoutMs = 1_500): Promise<ScriptRuntimeFlushResult> {
    const tasks = Array.from(this.pendingRuntimeTasks);
    if (tasks.length === 0) {
      return {
        scheduledTasks: 0,
        settledTasks: 0,
        pendingTasks: 0,
        timedOut: false,
      };
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const settled = await Promise.race([
      Promise.allSettled(tasks),
      timeout,
    ]);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const timedOut = settled === 'timeout';
    const settledTasks = timedOut
      ? tasks.filter((task) => !this.pendingRuntimeTasks.has(task)).length
      : tasks.length;
    return {
      scheduledTasks: tasks.length,
      settledTasks,
      pendingTasks: this.pendingRuntimeTasks.size,
      timedOut,
    };
  }

  private trackRuntimeTask(task: Promise<void>): void {
    this.pendingRuntimeTasks.add(task);
    void task
      .finally(() => {
        this.pendingRuntimeTasks.delete(task);
      })
      .catch(() => undefined);
  }

  private requiresCoordinatedLease(
    state: ReturnType<typeof useEngineStore.getState>
  ): boolean {
    if (this.activeByEntity.size > 0 || this.activeScribByNode.size > 0) {
      return true;
    }

    const hasLegacyScripts = Array.from(state.entities.values()).some((entity) => {
      const scriptComp = entity.components.get('Script');
      return Boolean(scriptComp?.enabled && (scriptComp.data as { scriptId?: unknown })?.scriptId);
    });
    if (hasLegacyScripts) {
      return true;
    }

    return Boolean(this.composerPlan?.nodes.some((node) => node.enabled));
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

      if (node.target.scope === 'entity') {
        const entity = state.entities.get(node.target.id);
        if (!entity || !entity.active) {
          this.stopScribNode(node.id, state);
          return;
        }
        this.trackRuntimeTask(this.runScribNode(node, entity, deltaTime, plan.sceneId));
        return;
      }

      if (node.target.scope === 'scene') {
        const scene = state.scenes.find((candidate) => candidate.id === node.target.id) || null;
        if (!scene) {
          this.stopScribNode(node.id, state);
          return;
        }
        this.trackRuntimeTask(this.runSceneScribNode(node, scene, deltaTime));
      }
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
      this.trackRuntimeTask(this.runEntityScript(entity, data.scriptId, deltaTime));
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
    const codeRef = this.resolveScribCodeRef(node.code || `builtin:${node.type}`);
    let handler = current?.handler;

    if (!current || current.codeRef !== codeRef) {
      try {
        handler = await this.loadScribHandler(node);
      } catch (error) {
        this.disableScribNode(node, error);
        return;
      }

      if (current) {
        await this.safeInvokeScrib(current.handler, 'onStop', this.makeScribContext(node, entity, 0, sceneId), node);
      }

      this.activeScribByNode.set(node.id, {
        nodeId: node.id,
        sourceScribId: node.sourceScribId,
        codeRef,
        handler,
      });

      await this.safeInvokeScrib(handler, 'onStart', this.makeScribContext(node, entity, deltaTime, sceneId), node);
    }

    await this.safeInvokeScrib(handler, 'update', this.makeScribContext(node, entity, deltaTime, sceneId), node);
    if (!handler?.update) {
      this.runBuiltInAtomic(node, entity, this.makeScribContext(node, entity, deltaTime, sceneId));
    }
  }

  private async runSceneScribNode(
    node: RuntimePlanNode,
    scene: Scene,
    deltaTime: number
  ): Promise<void> {
    if (this.estimateConfigSize(node.config) > this.maxScribConfigBytes) {
      this.disableScribNode(
        node,
        new Error(`Config exceeds sandbox limit (${this.maxScribConfigBytes} bytes).`)
      );
      return;
    }

    const current = this.activeScribByNode.get(node.id);
    const codeRef = this.resolveScribCodeRef(node.code || `builtin:${node.type}`);
    let handler = current?.handler;
    const sceneEntity = this.makeSceneProxyEntity(scene);

    if (!current || current.codeRef !== codeRef) {
      try {
        handler = await this.loadScribHandler(node);
      } catch (error) {
        this.disableScribNode(node, error);
        return;
      }

      if (current) {
        await this.safeInvokeScrib(
          current.handler,
          'onStop',
          this.makeSceneScribContext(node, scene, sceneEntity, 0),
          node
        );
      }

      this.activeScribByNode.set(node.id, {
        nodeId: node.id,
        sourceScribId: node.sourceScribId,
        codeRef,
        handler,
      });

      await this.safeInvokeScrib(
        handler,
        'onStart',
        this.makeSceneScribContext(node, scene, sceneEntity, deltaTime),
        node
      );
    }

    await this.safeInvokeScrib(
      handler,
      'update',
      this.makeSceneScribContext(node, scene, sceneEntity, deltaTime),
      node
    );
    if (!handler?.update) {
      this.runBuiltInAtomic(
        node,
        sceneEntity,
        this.makeSceneScribContext(node, scene, sceneEntity, deltaTime)
      );
    }
  }

  private async safeInvokeScrib(
    handler: ScribHandler | undefined,
    phase: ScriptRuntimePhase,
    ctx: ScribContext,
    node: RuntimePlanNode
  ): Promise<void> {
    const fn = handler?.[phase];
    if (!fn) return;
    try {
      if (handler?.executionModel === 'worker') {
        await fn(ctx);
        return;
      }
      this.withExecutionGuard(node.sourceScribId, () => {
        void fn(ctx);
      });
    } catch (error) {
      this.disableScribNode(node, error);
    }
  }

  private async safeInvokeLegacy(
    handler: ScriptExports | undefined,
    phase: ScriptRuntimePhase,
    ctx: ScriptContext,
    scriptId: string,
    onFailure: (error: unknown) => void
  ): Promise<void> {
    const fn = handler?.[phase];
    if (!fn) return;
    try {
      if (handler?.executionModel === 'worker') {
        await fn(ctx);
        return;
      }
      this.withExecutionGuard(scriptId, () => {
        void fn(ctx);
      });
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
    this.scriptLastError.set(scriptId, { message: reason, statusCode: null });
    this.pushRuntimeEvent({
      kind: 'legacy_script_disabled',
      scriptId,
      message: reason,
      metadata: {
        entityId: current.id,
      },
    });

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

  private pushRuntimeEvent(
    event: Omit<RuntimeEventRecord, 'id' | 'at'>
  ): void {
    const nextEvent: RuntimeEventRecord = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...event,
    };
    this.runtimeEvents = [...this.runtimeEvents, nextEvent].slice(-this.runtimeEventLimit);
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
    this.pushRuntimeEvent({
      kind: 'scrib_node_disabled',
      nodeId: node.id,
      scriptId: node.code || node.sourceScribId,
      message: reason,
      metadata: {
        scribType: node.type,
        autoAdded: node.autoAdded,
      },
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
        void this.safeInvokeScrib(active.handler, 'onStop', ctx, node);
      }
    } else if (node && node.target.scope === 'scene') {
      const scene = state.scenes.find((candidate) => candidate.id === node.target.id) || null;
      if (scene) {
        const ctx = this.makeSceneScribContext(node, scene, this.makeSceneProxyEntity(scene), 0);
        void this.safeInvokeScrib(active.handler, 'onStop', ctx, node);
      }
    }
    this.activeScribByNode.delete(nodeId);
  }

  private async loadScribHandler(node: RuntimePlanNode): Promise<ScribHandler> {
    const codeRef = this.resolveScribCodeRef(node.code || `builtin:${node.type}`);
    if (this.isBuiltInScribCodeRef(codeRef)) {
      return this.makeBuiltInHandler(node.type);
    }

    if (!this.allowCustomRuntimeScripts) {
      throw new Error('Custom Scrib execution is disabled by runtime policy.');
    }

    if (!this.scribCodeCache.has(codeRef)) {
      const promise = this.fetchAndCompileScrib(codeRef);
      this.scribCodeCache.set(codeRef, promise);
    }
    try {
      const handler = await this.scribCodeCache.get(codeRef)!;
      this.clearScriptLoadFailure(codeRef);
      return handler;
    } catch (error) {
      this.registerScriptLoadFailure(codeRef, error, {
        source: 'scrib',
        node,
      });
      throw error;
    }
  }

  private makeBuiltInHandler(type: AtomicScribType): ScribHandler {
    return {
      executionModel: 'local',
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
      targetScope: 'entity',
      targetId: entity.id,
      scribNodeId: node.id,
      scribSourceId: node.sourceScribId,
      scribType: node.type,
      config: node.config || {},
      sceneId,
    };
  }

  private makeSceneProxyEntity(scene: Scene): Entity {
    return {
      id: `scene:${scene.id}`,
      name: scene.name,
      active: true,
      parentId: null,
      children: [],
      tags: ['scene'],
      components: new Map(),
    };
  }

  private makeSceneScribContext(
    node: Pick<RuntimePlanNode, 'id' | 'sourceScribId' | 'type' | 'config'>,
    scene: Scene,
    entity: Entity,
    deltaTime: number
  ): ScribContext {
    const base = this.makeContext(entity, deltaTime);
    return {
      ...base,
      targetScope: 'scene',
      targetId: scene.id,
      scribNodeId: node.id,
      scribSourceId: node.sourceScribId,
      scribType: node.type,
      config: node.config || {},
      sceneId: scene.id,
      scene,
      setSceneEnvironment: (environment) => {
        const store = useEngineStore.getState();
        const currentScene = store.scenes.find((candidate) => candidate.id === scene.id);
        if (!currentScene) return;
        store.updateScene(scene.id, {
          environment: this.mergeSceneEnvironment(currentScene.environment, environment),
        });
      },
    };
  }

  private async fetchAndCompileScrib(scriptId: string): Promise<ScribHandler> {
    return this.loadWorkerBackedModule<ScribContext>(scriptId, 'scrib');
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
      await this.safeInvokeLegacy(exports, 'onStart', this.makeContext(entity, deltaTime), normalizedScriptId, disableLegacy);
    }

    await this.safeInvokeLegacy(exports, 'update', this.makeContext(entity, deltaTime), normalizedScriptId, disableLegacy);
  }

  private stopScript(entityId: string): void {
    const active = this.activeByEntity.get(entityId);
    if (!active) return;
    const state = useEngineStore.getState();
    const entity = state.entities.get(entityId);
    if (entity) {
      void this.safeInvokeLegacy(active.exports, 'onStop', this.makeContext(entity, 0), active.scriptId, () => {});
    }
    this.activeByEntity.delete(entityId);
  }

  private async loadScript(scriptId: string): Promise<ScriptExports> {
    if (!this.allowCustomRuntimeScripts) {
      throw new Error('Legacy Script execution is disabled by runtime policy.');
    }

    if (!this.scriptCache.has(scriptId)) {
      const promise = this.fetchAndCompileLegacyScript(scriptId);
      this.scriptCache.set(scriptId, promise);
    }
    return this.scriptCache.get(scriptId)!;
  }

  private async fetchAndCompileLegacyScript(scriptId: string): Promise<ScriptExports> {
    return this.loadWorkerBackedModule<ScriptContext>(scriptId, 'legacy');
  }

  private makeWorkerModuleKey(
    kind: ScriptRuntimeModuleKind,
    scriptId: string,
    compiledHash: string
  ): string {
    return `${kind}:${scriptId}:${compiledHash}`;
  }

  private async fetchRuntimeArtifact(scriptId: string): Promise<{
    compiledCode: string;
    compiledHash: string;
  }> {
    const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
    const url = `/api/scripts/runtime?path=${encodeURIComponent(normalizedScriptId)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const error = new Error(
        `HTTP ${res.status} fetching runtime artifact ${normalizedScriptId}`
      ) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    const payload = await res.json();
    if (
      typeof payload?.compiledCode !== 'string' ||
      typeof payload?.runtime?.compiledHash !== 'string'
    ) {
      throw new Error('Runtime artifact payload missing compiled output');
    }

    this.runtimeArtifacts.set(normalizedScriptId, {
      scriptId: normalizedScriptId,
      status: 'ready',
      compiledHash: payload.runtime.compiledHash,
      sourceHash:
        typeof payload?.runtime?.sourceHash === 'string' ? payload.runtime.sourceHash : null,
      generatedAt:
        typeof payload?.runtime?.generatedAt === 'string' ? payload.runtime.generatedAt : null,
    });

    return {
      compiledCode: payload.compiledCode,
      compiledHash: payload.runtime.compiledHash,
    };
  }

  private async loadWorkerBackedModule<TContext extends ScriptContext | ScribContext>(
    scriptId: string,
    kind: ScriptRuntimeModuleKind
  ): Promise<{
    executionModel: 'worker';
    onStart?: ScriptPhase<TContext>;
    update?: ScriptPhase<TContext>;
    onStop?: ScriptPhase<TContext>;
  }> {
    const normalizedScriptId = this.normalizeScriptIdentifier(scriptId);
    const artifact = await this.fetchRuntimeArtifact(normalizedScriptId);
    const moduleKey = this.makeWorkerModuleKey(kind, normalizedScriptId, artifact.compiledHash);
    const availablePhases = await this.sandboxWorkerHost.loadModule({
      moduleKey,
      moduleKind: kind,
      scriptId: normalizedScriptId,
      compiledHash: artifact.compiledHash,
      compiledCode: artifact.compiledCode,
    });

    const makePhase = (
      phase: ScriptRuntimePhase,
      available: boolean
    ): ScriptPhase<TContext> | undefined => {
      if (!available) return undefined;
      return async (ctx: TContext) => {
        const commands = await this.sandboxWorkerHost.invokeModule({
          moduleKey,
          moduleKind: kind,
          phase,
          context: this.serializeRuntimeContext(ctx),
          maxExecutionMs: this.maxScribExecutionMs,
          maxExecutionTicks: this.maxScribExecutionTicks,
        });
        this.applyRuntimeCommands(ctx, commands);
      };
    };

    return {
      executionModel: 'worker',
      onStart: makePhase('onStart', availablePhases.onStart),
      update: makePhase(
        'update',
        availablePhases.update || (kind === 'scrib' && availablePhases.default)
      ),
      onStop: makePhase('onStop', availablePhases.onStop),
    };
  }

  private serializeRuntimeContext(
    ctx: ScriptContext | ScribContext
  ): ScriptRuntimeInvocationContext {
    return {
      deltaTime: ctx.deltaTime,
      entityId: ctx.entityId,
      entity: ctx.entity,
      ...('targetScope' in ctx ? { targetScope: ctx.targetScope } : {}),
      ...('targetId' in ctx ? { targetId: ctx.targetId } : {}),
      ...('scribNodeId' in ctx ? { scribNodeId: ctx.scribNodeId } : {}),
      ...('scribSourceId' in ctx ? { scribSourceId: ctx.scribSourceId } : {}),
      ...('scribType' in ctx ? { scribType: ctx.scribType } : {}),
      ...('config' in ctx ? { config: ctx.config } : {}),
      ...('sceneId' in ctx ? { sceneId: ctx.sceneId } : {}),
      ...('scene' in ctx ? { scene: ctx.scene ?? null } : {}),
    };
  }

  private applyRuntimeCommands(
    ctx: ScriptContext | ScribContext,
    commands: ScriptRuntimeCommand[]
  ): void {
    if (commands.length === 0) return;
    const store = useEngineStore.getState();
    const entity = ctx.entity;
    const currentEntity = store.entities.get(entity.id) || entity;
    let components = new Map(currentEntity.components);
    let changed = false;

    for (const command of commands) {
      if (command.type === 'setSceneEnvironment') {
        const currentStore = useEngineStore.getState();
        const sceneId =
          'sceneId' in ctx && typeof ctx.sceneId === 'string'
            ? ctx.sceneId
            : currentStore.activeSceneId;
        const scene = sceneId
          ? currentStore.scenes.find((candidate) => candidate.id === sceneId)
          : null;
        if (!scene) continue;
        currentStore.updateScene(scene.id, {
          environment: this.mergeSceneEnvironment(scene.environment, command.environment),
        });
        continue;
      }

      if (command.type === 'setTransform') {
        if (!store.entities.has(currentEntity.id)) continue;
        const transform = components.get('Transform');
        if (!transform) continue;
        const current = (transform.data as {
          position?: { x?: number; y?: number; z?: number };
          [key: string]: unknown;
        }) || {};
        const currentPos = current.position || {};
        components.set('Transform', {
          ...transform,
          data: {
            ...current,
            position: {
              x:
                typeof command.transform.x === 'number'
                  ? command.transform.x
                  : currentPos.x ?? 0,
              y:
                typeof command.transform.y === 'number'
                  ? command.transform.y
                  : currentPos.y ?? 0,
              z:
                typeof command.transform.z === 'number'
                  ? command.transform.z
                  : currentPos.z ?? 0,
            },
          },
        });
        changed = true;
        continue;
      }

      if (command.type === 'setVelocity') {
        if (!store.entities.has(currentEntity.id)) continue;
        const rigidbody = components.get('Rigidbody');
        if (!rigidbody) continue;
        const current = (rigidbody.data as {
          velocity?: { x?: number; y?: number; z?: number };
          [key: string]: unknown;
        }) || {};
        components.set('Rigidbody', {
          ...rigidbody,
          data: {
            ...current,
            velocity: {
              x: command.velocity.x,
              y: command.velocity.y,
              z: command.velocity.z,
            },
          },
        });
        changed = true;
        continue;
      }

      if (command.type === 'setComponent') {
        if (!store.entities.has(currentEntity.id)) continue;
        const componentType = command.componentType.trim();
        if (!componentType) continue;
        const current = components.get(componentType);
        components.set(componentType, {
          id: current?.id || `${currentEntity.id}-${componentType}-runtime`,
          type: componentType as Component['type'],
          enabled: command.enabled ?? current?.enabled ?? true,
          data: {
            ...((current?.data as Record<string, unknown> | undefined) || {}),
            ...command.data,
          },
        });
        changed = true;
      }
    }

    if (!changed) return;
    store.updateEntityTransient(currentEntity.id, { components });
  }

  private mergeSceneEnvironment(
    current: EnvironmentSettings,
    patch: Partial<EnvironmentSettings>
  ): EnvironmentSettings {
    const currentAdvancedLighting = resolveAdvancedLightingSettings(current.advancedLighting);
    const nextAdvancedLighting = patch.advancedLighting
      ? {
          shadowQuality:
            patch.advancedLighting.shadowQuality ?? currentAdvancedLighting.shadowQuality,
          globalIllumination: {
            ...currentAdvancedLighting.globalIllumination,
            ...patch.advancedLighting.globalIllumination,
          },
          bakedLightmaps: {
            ...currentAdvancedLighting.bakedLightmaps,
            ...patch.advancedLighting.bakedLightmaps,
          },
        }
      : current.advancedLighting;
    const nextFog =
      patch.fog === undefined
        ? current.fog
        : patch.fog === null
          ? null
          : this.mergeFogSettings(current.fog, patch.fog);

    return {
      ...current,
      ...patch,
      ambientLight: patch.ambientLight
        ? { ...current.ambientLight, ...patch.ambientLight }
        : current.ambientLight,
      advancedLighting: nextAdvancedLighting,
      fog: nextFog,
      postProcessing: patch.postProcessing
        ? {
            ...current.postProcessing,
            ...patch.postProcessing,
            bloom: patch.postProcessing.bloom
              ? { ...current.postProcessing.bloom, ...patch.postProcessing.bloom }
              : current.postProcessing.bloom,
            ssao: patch.postProcessing.ssao
              ? { ...current.postProcessing.ssao, ...patch.postProcessing.ssao }
              : current.postProcessing.ssao,
            ssr: patch.postProcessing.ssr
              ? { ...current.postProcessing.ssr, ...patch.postProcessing.ssr }
              : current.postProcessing.ssr,
            colorGrading: patch.postProcessing.colorGrading
              ? { ...current.postProcessing.colorGrading, ...patch.postProcessing.colorGrading }
              : current.postProcessing.colorGrading,
            vignette: patch.postProcessing.vignette
              ? { ...current.postProcessing.vignette, ...patch.postProcessing.vignette }
              : current.postProcessing.vignette,
          }
        : current.postProcessing,
    };
  }

  private mergeFogSettings(
    current: FogSettings | null,
    patch: FogSettings
  ): FogSettings {
    return {
      enabled: patch.enabled ?? current?.enabled ?? true,
      type: patch.type ?? current?.type ?? 'exponential',
      color: {
        ...(current?.color || { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
        ...patch.color,
      },
      near: patch.near ?? current?.near,
      far: patch.far ?? current?.far,
      density: patch.density ?? current?.density,
    };
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
    const hadFailure =
      this.scriptFailureCount.has(scriptId) ||
      this.scriptLoadRetryAt.has(scriptId) ||
      this.scriptLastError.has(scriptId);
    this.scriptLoadRetryAt.delete(scriptId);
    this.scriptFailureCount.delete(scriptId);
    this.scriptWarnedAt.delete(scriptId);
    this.scriptLastError.delete(scriptId);
    if (this.scriptAuthBlockedUntil > 0 && this.nowMs() >= this.scriptAuthBlockedUntil) {
      this.scriptAuthBlockedUntil = 0;
    }
    if (this.scriptServerBlockedUntil > 0 && this.nowMs() >= this.scriptServerBlockedUntil) {
      this.scriptServerBlockedUntil = 0;
    }
    if (hadFailure) {
      this.pushRuntimeEvent({
        kind: 'script_load_recovered',
        scriptId,
        message: 'Runtime artifact recovered and script load resumed.',
      });
    }
  }

  private registerScriptLoadFailure(
    scriptId: string,
    error: unknown,
    options?: { source?: 'legacy' | 'scrib'; node?: RuntimePlanNode }
  ): void {
    const source = options?.source || 'legacy';
    if (source === 'scrib') {
      this.scribCodeCache.delete(scriptId);
    } else {
      this.scriptCache.delete(scriptId);
    }

    const now = this.nowMs();
    const statusCode = this.readScriptFetchStatusCode(error);
    const authFailure = this.isAuthScriptFetchError(error);
    const missingFailure = this.isMissingScriptFetchError(error);
    const reviewFailure = this.isReviewRequiredScriptFetchError(error);
    const serverFailure = this.isServerScriptFetchError(error);
    const failureCount = (this.scriptFailureCount.get(scriptId) || 0) + 1;
    this.scriptFailureCount.set(scriptId, failureCount);
    this.scriptLastError.set(scriptId, {
      message: String((error as { message?: unknown })?.message ?? error),
      statusCode,
    });

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
    this.runtimeArtifacts.set(scriptId, {
      scriptId,
      status: missingFailure ? 'missing' : reviewFailure ? 'stale' : 'error',
      compiledHash: this.runtimeArtifacts.get(scriptId)?.compiledHash ?? null,
      sourceHash: this.runtimeArtifacts.get(scriptId)?.sourceHash ?? null,
      generatedAt: this.runtimeArtifacts.get(scriptId)?.generatedAt ?? null,
    });
    if (authFailure) {
      this.scriptAuthBlockedUntil = Math.max(this.scriptAuthBlockedUntil, now + retryMs);
    }
    if (serverFailure) {
      this.scriptServerBlockedUntil = Math.max(
        this.scriptServerBlockedUntil,
        now + this.scriptServerGlobalPauseMs
      );
    }

    const messageBase = statusCode
      ? `Script ${scriptId} devolvió HTTP ${statusCode}.`
      : `Script ${scriptId} falló al cargar.`;
    this.pushRuntimeEvent({
      kind: source === 'scrib' ? 'scrib_load_failed' : 'script_load_failed',
      scriptId,
      nodeId: options?.node?.id,
      message: `${messageBase} Reintento en ${Math.round(retryMs / 1000)}s.`,
      metadata: {
        source,
        ...(options?.node ? { scribType: options.node.type, autoAdded: options.node.autoAdded } : {}),
        failures: failureCount,
        retryInMs: retryMs,
        statusCode,
        authFailure,
        missingFailure,
        reviewFailure,
        serverFailure,
      },
    });

    const lastWarnedAt = this.scriptWarnedAt.get(scriptId) || 0;
    if (now - lastWarnedAt < this.scriptWarnCooldownMs) {
      return;
    }
    const suggestion = this.buildScriptLoadFailureSuggestion({
      authFailure,
      missingFailure,
      serverFailure,
      reviewFailure,
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
    } else if (reviewFailure) {
      console.warn(
        '[ScriptRuntime] Script runtime artifact missing or stale. Compile required before retry.',
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
      kind: source === 'scrib' ? 'scrib-load-failed' : 'legacy-load-failed',
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
    reviewFailure?: boolean;
    scriptId: string;
  }): string {
    if (params.authFailure) {
      return 'Inicia sesion con una cuenta autorizada para usar scripts persistentes.';
    }
    if (params.missingFailure) {
      return `Crea o corrige el archivo ${params.scriptId} en Scrib Studio > Edit.`;
    }
    if (params.reviewFailure) {
      return `Guarda y verifica ${params.scriptId} en Scrib Studio antes de ejecutarlo.`;
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

  private isReviewRequiredScriptFetchError(error: unknown): boolean {
    if (typeof error === 'object' && error && 'status' in error) {
      const status = Number((error as { status?: unknown }).status);
      if (status === 409) return true;
    }

    const message = String((error as { message?: unknown })?.message ?? error);
    return message.includes('HTTP 409');
  }

  private isServerScriptFetchError(error: unknown): boolean {
    if (typeof error === 'object' && error && 'status' in error) {
      const status = Number((error as { status?: unknown }).status);
      if (status >= 500 && status < 600) return true;
    }

    const message = String((error as { message?: unknown })?.message ?? error);
    return message.includes('HTTP 5');
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

  private resolveScribCodeRef(codeRef: string): string {
    return this.normalizeScriptIdentifier(codeRef);
  }

  private isBuiltInScribCodeRef(codeRef: string): boolean {
    return !codeRef || codeRef.startsWith('builtin:');
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
      setVelocity: (velocity) => {
        const rigidbody = entity.components.get('Rigidbody');
        if (!rigidbody) return;
        const current = (rigidbody.data as {
          velocity?: { x?: number; y?: number; z?: number };
          [key: string]: unknown;
        }) || {};
        const components = new Map(entity.components);
        components.set('Rigidbody', {
          ...rigidbody,
          data: {
            ...current,
            velocity: {
              x: velocity.x,
              y: velocity.y,
              z: velocity.z,
            },
          },
        });
        store.updateEntityTransient(entity.id, { components });
      },
      setComponent: (componentType, data, enabled) => {
        const type = componentType.trim();
        if (!type) return;
        const current = entity.components.get(type);
        const components = new Map(entity.components);
        components.set(type, {
          id: current?.id || `${entity.id}-${type}-runtime`,
          type: type as Component['type'],
          enabled: enabled ?? current?.enabled ?? true,
          data: {
            ...((current?.data as Record<string, unknown> | undefined) || {}),
            ...data,
          },
        });
        store.updateEntityTransient(entity.id, { components });
      },
    };
  }
}

// Singleton runtime
export const scriptRuntime = new ScriptRuntime();
