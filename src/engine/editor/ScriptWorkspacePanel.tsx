'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import { useEngineStore } from '@/store/editorStore';
import {
  composeRuntimePlan,
  defaultScribRegistry,
  type AtomicScribType,
  type ScribType,
} from '@/engine/scrib';
import { scriptRuntime } from '@/engine/gameplay/ScriptRuntime';
import type {
  RuntimeArtifactVerificationRecord,
  RuntimeArtifactRecord,
  RuntimeEventRecord,
  ScriptExecutionStatus,
  ScriptRuntimeDiagnostics,
} from '@/engine/gameplay/script-runtime-diagnostics';
import { MODE_AUTO_GUIDE, SCRIB_HYBRID_GUIDE } from './autoGuide';
import {
  FileCode2,
  LibraryBig,
  Link2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  TerminalSquare,
  Trash2,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type StudioTab = 'create' | 'assign' | 'edit' | 'library' | 'console';
type CreateTargetType = 'character' | 'terrain' | 'object' | 'scene' | 'weapon' | 'enemy';

interface ScriptEntry {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
}

interface ScriptCompileDiagnostic {
  category: 'error' | 'warning' | 'message' | 'suggestion';
  code: number;
  text: string;
}

interface ScriptCompileResult {
  ok: boolean;
  diagnostics: ScriptCompileDiagnostic[];
  summary?: string;
  runtime?: {
    verification?: RuntimeArtifactVerificationRecord | null;
  };
}

interface ScriptRuntimeHealthView {
  enabled: boolean;
  reviewedArtifactsRequired: boolean;
  sourceStorageMode: 'local' | 'shared';
  artifactStorageMode: 'local' | 'shared' | 'not-required';
  executionIsolation: 'worker-per-instance';
  consistencyModel: 'reviewed-artifact-read-through';
  multiInstanceMode: 'not-required' | 'single-instance-only' | 'shared-storage-ready';
  sourceStorageAvailable: boolean;
  artifactStorageAvailable: boolean;
  restartReady: boolean;
}

interface ScriptRuntimeHealthPayload {
  success: boolean;
  available: boolean;
  message: string;
  runtime?: ScriptRuntimeHealthView;
  live?: ScriptRuntimeLiveSummaryView | null;
}

interface ScriptRuntimeLiveSessionView {
  instanceId: string;
  currentSession: boolean;
  playState: 'PLAYING' | 'PAUSED' | 'IDLE';
  activeEntityScripts: number;
  activeScribNodes: number;
  activeScriptIds: string[];
  heartbeatAt: string;
  stale: boolean;
}

interface ScriptRuntimeLiveSummaryView {
  coordinationMode: 'heartbeat-sessions';
  ownershipMode: 'not-required' | 'implicit-local' | 'session-lease';
  heartbeatTtlMs: number;
  storageMode: 'local' | 'shared';
  activeSessions: number;
  playingSessions: number;
  staleSessions: number;
  currentSessionPresent: boolean;
  currentSessionOwnsLease: boolean;
  currentInstanceOwnsLease: boolean;
  lease: {
    status: 'not-required' | 'local-only' | 'unclaimed' | 'owned' | 'standby';
    ownerInstanceId: string | null;
    ownerPlayState: 'PLAYING' | 'PAUSED' | 'IDLE' | null;
    ownerHeartbeatAt: string | null;
    leaseExpiresAt: string | null;
    stale: boolean;
  };
  sessions: ScriptRuntimeLiveSessionView[];
}

interface ScriptRuntimeHeartbeatPayload {
  ok: boolean;
  heartbeatAt: string;
  lease?: ScriptRuntimeLiveSummaryView['lease'] | null;
  live?: ScriptRuntimeLiveSummaryView | null;
}

interface ScriptRuntimeVerificationsPayload {
  ok: boolean;
  verifications: RuntimeArtifactVerificationRecord[];
}

interface ScriptRuntimeFaultLedgerSnapshotPayload {
  ok: boolean;
  snapshot?: RuntimeFaultLedgerSnapshot;
  snapshots?: RuntimeFaultLedgerSnapshot[];
  retentionPolicy?: RuntimeFaultLedgerRetentionPolicy;
  prune?: RuntimeFaultLedgerPruneSummary;
  pruneAudit?: RuntimeFaultLedgerPruneAuditEntry[];
}

interface ConsoleLine {
  id: string;
  level: 'info' | 'success' | 'warn' | 'error';
  text: string;
}
interface AuthSessionPayload {
  authenticated?: boolean;
  user?: {
    role?: string;
  };
}

interface ScriptRuntimeWarningEventDetail {
  kind?: 'legacy-load-failed' | 'scrib-load-failed' | 'legacy-script-disabled';
  scriptId?: string;
  message?: string;
  suggestion?: string;
  failures?: number;
  retryInMs?: number;
}

interface RuntimeBlockingIssue {
  key: string;
  scriptId: string;
  source: 'legacy' | 'scrib' | 'node';
  action: 'verify-artifact' | 'retry-runtime' | 'retry-node';
  title: string;
  detail: string;
  tone: 'error' | 'warn';
  canVerify: boolean;
  nodeId?: string;
  sourceScribId?: string | null;
  codePath?: string | null;
  verification?: RuntimeArtifactVerificationRecord | null;
  retryAt?: string | null;
}

interface RuntimeFaultLedgerItem {
  key: string;
  severity: 'P0' | 'P1' | 'P2';
  source: RuntimeBlockingIssue['source'];
  scriptId: string;
  nodeId?: string;
  sourceScribId?: string | null;
  codePath?: string | null;
  target: string;
  state: string;
  action: RuntimeBlockingIssue['action'];
  detail: string;
  verification?: RuntimeArtifactVerificationRecord | null;
}

interface RuntimeFaultLedgerSnapshotItem {
  severity: 'P0' | 'P1' | 'P2';
  source: 'legacy' | 'scrib' | 'node';
  target: string;
  state: string;
  action: string;
  detail: string;
  verificationStatus: 'ok' | 'failed' | null;
  verificationOkCount: number;
  verificationFailedCount: number;
}

interface RuntimeFaultLedgerSnapshot {
  id: string;
  instanceId: string;
  sessionId: string | null;
  playState: string;
  generatedAt: string;
  itemCount: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  items: RuntimeFaultLedgerSnapshotItem[];
}

interface RuntimeFaultLedgerRetentionPolicy {
  maxSnapshots: number;
  maxAgeDays: number;
  source?: 'defaults' | 'env' | 'admin';
  updatedAt?: string | null;
  updatedBy?: string | null;
}

interface RuntimeFaultLedgerPruneCandidate {
  id: string;
  generatedAt: string;
  itemCount: number;
  p0Count: number;
  reason: 'count' | 'age' | 'count+age';
}

interface RuntimeFaultLedgerPruneSummary {
  dryRun: boolean;
  deleted: number;
  wouldDelete: number;
  retained: number;
  policy: RuntimeFaultLedgerRetentionPolicy;
  candidates: RuntimeFaultLedgerPruneCandidate[];
  auditId?: string | null;
}

interface RuntimeFaultLedgerPruneAuditEntry extends RuntimeFaultLedgerPruneSummary {
  id: string;
  createdAt: string;
  actorId: string | null;
  reason: string;
}

const TABS: Array<{ id: StudioTab; label: string }> = [
  { id: 'create', label: 'Crear' },
  { id: 'assign', label: 'Asignar' },
  { id: 'edit', label: 'Editar' },
  { id: 'library', label: 'Biblioteca' },
  { id: 'console', label: 'Consola' },
];

const CREATE_TARGET_OPTIONS: Array<{ value: CreateTargetType; label: string }> = [
  { value: 'character', label: 'character' },
  { value: 'terrain', label: 'terrain' },
  { value: 'object', label: 'object' },
  { value: 'scene', label: 'scene' },
  { value: 'weapon', label: 'weapon' },
  { value: 'enemy', label: 'enemy' },
];
const BASELINE_SCRIB_TYPES: AtomicScribType[] = ['movement', 'collider', 'cameraFollow'];
const SCRIPT_STUDIO_AUTH_HINT =
  'Inicia sesion con una cuenta autorizada para usar Scrib Studio.';
const SCRIPT_STUDIO_ROLE_HINT = 'Tu rol actual no tiene permisos para esta accion de scripts.';

function parseJsonLoose(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    try {
      const normalized = trimmed
        .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
        .replace(/'/g, '"');
      return JSON.parse(normalized) as Record<string, unknown>;
    } catch {
      throw new Error(
        'JSON inválido. Usa createScrib({ target, type, config }) o pega código TypeScript para guardarlo como script.'
      );
    }
  }
}

function looksLikeScriptSource(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//')) return true;
  return /\b(import|export|class|interface|function|const|let|var|enum|type)\b/.test(trimmed);
}

function parseInlineScript(raw: string): { relativePath: string; content: string } | null {
  const trimmed = raw.trim();
  if (!looksLikeScriptSource(trimmed)) return null;

  let fileName: string | null = null;
  let content = trimmed;

  const inlineHeader = trimmed.match(
    /^\/\/\s*([A-Za-z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|mjs|cjs|lua))\s+([\s\S]+)$/i
  );
  if (inlineHeader) {
    fileName = inlineHeader[1];
    content = inlineHeader[2].trimStart();
  } else {
    const firstLineBreak = trimmed.indexOf('\n');
    const firstLine = firstLineBreak >= 0 ? trimmed.slice(0, firstLineBreak).trim() : trimmed;
    const headerOnly = firstLine.match(/^\/\/\s*([A-Za-z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|mjs|cjs|lua))\s*$/i);
    if (headerOnly) {
      fileName = headerOnly[1];
      content = firstLineBreak >= 0 ? trimmed.slice(firstLineBreak + 1).trimStart() : '';
    }
  }

  if (!content.trim()) return null;

  const normalizedName = (fileName || `scribs/inline_${Date.now()}.scrib.ts`)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const relativePath = normalizedName.includes('/') ? normalizedName : `scribs/${normalizedName}`;

  return { relativePath, content };
}

function makeScribTemplate(type: AtomicScribType): string {
  if (type === 'transform') {
    return `// scribs/transform.scrib.ts
// Baseline transform dependency reviewed by Scrib Studio.

function readNumber(value, fallback) {
  return typeof value === 'number' && value === value ? value : fallback;
}

function readVector3(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    x: readNumber(source.x, fallback.x),
    y: readNumber(source.y, fallback.y),
    z: readNumber(source.z, fallback.z),
  };
}

function readQuaternion(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    x: readNumber(source.x, fallback.x),
    y: readNumber(source.y, fallback.y),
    z: readNumber(source.z, fallback.z),
    w: readNumber(source.w, fallback.w),
  };
}

export default function transform(entity, config, ctx) {
  const existing = entity?.components?.get?.('Transform');
  if (existing?.enabled && config?.force !== true) return;

  const data = existing?.data || {};
  ctx.setComponent?.('Transform', {
    position: readVector3(config?.position, readVector3(data.position, { x: 0, y: 0, z: 0 })),
    rotation: readQuaternion(config?.rotation, readQuaternion(data.rotation, { x: 0, y: 0, z: 0, w: 1 })),
    scale: readVector3(config?.scale, readVector3(data.scale, { x: 1, y: 1, z: 1 })),
  }, true);
}
`;
  }

  if (type === 'movement') {
    return `// scribs/movement.scrib.ts
// Baseline movement scrib reviewed by Scrib Studio.

function readNumber(value, fallback) {
  return typeof value === 'number' && value === value ? value : fallback;
}

function readBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function readVector3(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    x: readNumber(source.x, fallback.x),
    y: readNumber(source.y, fallback.y),
    z: readNumber(source.z, fallback.z),
  };
}

export default function movement(entity, config, ctx) {
  const speed = Math.max(0, readNumber(config?.speed, 5));
  const jumpForce = Math.max(0, readNumber(config?.jump, readNumber(config?.jumpForce, 7)));
  const runMultiplier = Math.max(1, readNumber(config?.runMultiplier, 1.6));
  const moveInput = readVector3(config?.moveInput, { x: 0, y: 0, z: 0 });

  ctx.setComponent?.('PlayerController', {
    speed,
    walkSpeed: speed,
    runSpeed: speed * runMultiplier,
    jumpForce,
    mass: Math.max(0.1, readNumber(config?.mass, 1)),
    height: Math.max(0.5, readNumber(config?.height, 1.8)),
    radius: Math.max(0.1, readNumber(config?.radius, 0.35)),
    sensitivity: Math.max(0.05, readNumber(config?.sensitivity, 1)),
    useGravity: readBool(config?.useGravity, true),
    moveInput,
    inputVector: moveInput,
    desiredMovement: moveInput,
  }, true);

  if (readBool(config?.autoMove, false)) {
    const transform = entity?.components?.get?.('Transform')?.data || {};
    const position = transform.position || {};
    const direction = readVector3(config?.direction, {
      x: readNumber(config?.dirX, 1),
      y: 0,
      z: readNumber(config?.dirZ, 0),
    });
    ctx.setTransform({
      x: readNumber(position.x, 0) + direction.x * speed * ctx.deltaTime,
      z: readNumber(position.z, 0) + direction.z * speed * ctx.deltaTime,
    });
  }
}
`;
  }

  if (type === 'collider') {
    return `// scribs/collider.scrib.ts
// Baseline collider scrib reviewed by Scrib Studio.

function readNumber(value, fallback) {
  return typeof value === 'number' && value === value ? value : fallback;
}

function readBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function readVector3(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    x: readNumber(source.x, fallback.x),
    y: readNumber(source.y, fallback.y),
    z: readNumber(source.z, fallback.z),
  };
}

export default function collider(entity, config, ctx) {
  const shape = config?.shape === 'sphere' || config?.shape === 'capsule' || config?.shape === 'mesh'
    ? config.shape
    : 'box';
  const size = readVector3(config?.size, { x: 1, y: 1, z: 1 });
  const center = readVector3(config?.center, { x: 0, y: 0, z: 0 });

  ctx.setComponent?.('Collider', {
    type: shape,
    isTrigger: readBool(config?.isTrigger, false),
    center,
    size,
    radius: Math.max(0.05, readNumber(config?.radius, 0.5)),
    height: Math.max(0.1, readNumber(config?.height, size.y)),
  }, true);

  if (readBool(config?.rigidbody, false)) {
    ctx.setComponent?.('Rigidbody', {
      mass: Math.max(0, readNumber(config?.mass, 1)),
      drag: Math.max(0, readNumber(config?.drag, 0.01)),
      angularDrag: Math.max(0, readNumber(config?.angularDrag, 0.05)),
      useGravity: readBool(config?.useGravity, true),
      isKinematic: readBool(config?.isKinematic, false),
      velocity: readVector3(config?.velocity, { x: 0, y: 0, z: 0 }),
      angularVelocity: readVector3(config?.angularVelocity, { x: 0, y: 0, z: 0 }),
    }, true);
  }
}
`;
  }

  if (type === 'cameraFollow') {
    return `// scribs/cameraFollow.scrib.ts
// Baseline camera follow scrib reviewed by Scrib Studio.

function readNumber(value, fallback) {
  return typeof value === 'number' && value === value ? value : fallback;
}

function readBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export default function cameraFollow(entity, config, ctx) {
  const distance = Math.max(0.1, readNumber(config?.distance, 6));
  const height = readNumber(config?.height, 2);

  ctx.setComponent?.('Camera', {
    fov: Math.max(10, Math.min(120, readNumber(config?.fov, 60))),
    near: Math.max(0.01, readNumber(config?.near, 0.1)),
    far: Math.max(1, readNumber(config?.far, 1000)),
    orthographic: readBool(config?.orthographic, false),
    orthoSize: Math.max(0.1, readNumber(config?.orthoSize, 10)),
    clearColor: { r: 0.02, g: 0.03, b: 0.04, a: 1 },
    isMain: readBool(config?.isMain, true),
  }, true);

  if (readBool(config?.attachPlayerController, true)) {
    ctx.setComponent?.('PlayerController', {
      speed: Math.max(0, readNumber(config?.speed, 5)),
      walkSpeed: Math.max(0, readNumber(config?.speed, 5)),
      runSpeed: Math.max(0, readNumber(config?.speed, 5)) * 1.6,
      jumpForce: Math.max(0, readNumber(config?.jumpForce, 7)),
      sensitivity: Math.max(0.05, readNumber(config?.sensitivity, 1)),
      cameraDistance: distance,
      cameraHeight: height,
    }, true);
  }

  if (readBool(config?.offsetCamera, false)) {
    const transform = entity?.components?.get?.('Transform')?.data || {};
    const position = transform.position || {};
    ctx.setTransform({
      y: readNumber(position.y, 0) + height,
      z: readNumber(position.z, 0) + distance,
    });
  }
}
`;
  }

  return `// scribs/${type}.scrib.ts
// Editable Scrib reviewed by Scrib Studio.

export default function(entity, config, ctx) {
  if (config?.debug) {
    console.log('[${type}]', entity?.name || ctx?.entityId);
  }
}
`;
}

function isScribScriptPath(path: string): boolean {
  return /\.scrib\.(ts|tsx|js|jsx|mjs|cjs|lua)$/i.test(path.replace(/\\/g, '/'));
}

function isScribRuntimeScript(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized.startsWith('scribs/') || isScribScriptPath(normalized);
}

function collectScribRuntimeTypes(type: ScribType): AtomicScribType[] {
  const out = new Set<AtomicScribType>();
  const visiting = new Set<AtomicScribType>();

  const visit = (atomicType: AtomicScribType) => {
    if (out.has(atomicType) || visiting.has(atomicType)) return;
    visiting.add(atomicType);
    const def = defaultScribRegistry.get(atomicType);
    def?.requires.forEach(visit);
    visiting.delete(atomicType);
    out.add(atomicType);
  };

  defaultScribRegistry.expandToAtomic(type).forEach(visit);
  return Array.from(out);
}

function id(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function asScribType(value: string): ScribType {
  return value as ScribType;
}

function runtimeStatusTone(status: ScriptExecutionStatus['status']) {
  if (status === 'ready') return 'border-green-500/30 bg-green-500/10 text-green-200';
  if (status === 'backoff') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'disabled') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function artifactStatusTone(status: RuntimeArtifactRecord['status']) {
  if (status === 'ready') return 'border-green-500/30 bg-green-500/10 text-green-200';
  if (status === 'stale') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'missing') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function healthTone(ready: boolean) {
  return ready
    ? 'border-green-500/30 bg-green-500/10 text-green-200'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-200';
}

function formatRuntimeMultiInstanceMode(
  mode: ScriptRuntimeHealthView['multiInstanceMode'] | undefined
) {
  if (mode === 'shared-storage-ready') return 'multiinstancia lista';
  if (mode === 'single-instance-only') return 'solo single-instance';
  if (mode === 'not-required') return 'no requerido';
  return 'sin definir';
}

function formatStorageMode(
  mode: ScriptRuntimeHealthView['sourceStorageMode'] | ScriptRuntimeHealthView['artifactStorageMode'] | undefined
) {
  if (mode === 'shared') return 'shared';
  if (mode === 'local') return 'local';
  if (mode === 'not-required') return 'no requerido';
  return 'sin definir';
}

function formatPlayState(value: ScriptRuntimeLiveSessionView['playState'] | undefined) {
  if (value === 'PLAYING') return 'playing';
  if (value === 'PAUSED') return 'paused';
  if (value === 'IDLE') return 'idle';
  return 'sin definir';
}

function formatArtifactState(status: RuntimeArtifactRecord['status']) {
  if (status === 'missing') return 'artifact faltante';
  if (status === 'stale') return 'artifact sin revisar';
  if (status === 'error') return 'artifact con error';
  return 'artifact listo';
}

function formatExecutionState(status: ScriptExecutionStatus['status']) {
  if (status === 'backoff') return 'runtime en backoff';
  if (status === 'disabled') return 'runtime deshabilitado';
  if (status === 'error') return 'runtime con error';
  return 'runtime listo';
}

function formatVerificationSummary(record?: RuntimeArtifactVerificationRecord | null): string {
  if (!record) return 'verify: sin historial';
  const last = record.lastStatus === 'ok' ? 'OK' : 'fallida';
  return `verify: ${last} | OK ${record.okCount} | fallos ${record.failedCount}`;
}

function verificationTone(record?: RuntimeArtifactVerificationRecord | null): string {
  if (!record) return 'text-slate-500';
  return record.lastStatus === 'ok' ? 'text-green-300' : 'text-red-300';
}

function formatRuntimeIssueSource(source: RuntimeBlockingIssue['source']): string {
  if (source === 'scrib') return 'Scrib';
  if (source === 'node') return 'Node';
  return 'Legacy';
}

function formatRuntimeAction(action: RuntimeBlockingIssue['action']): string {
  if (action === 'retry-node') return 'reactivar node';
  if (action === 'retry-runtime') return 'reintentar runtime';
  return 'verificar artifact';
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function runtimeFaultLedgerToCsv(items: RuntimeFaultLedgerItem[]): string {
  const headers = [
    'severity',
    'source',
    'target',
    'state',
    'action',
    'detail',
    'verificationStatus',
    'verificationOkCount',
    'verificationFailedCount',
  ];
  const rows = items.map((item) => [
    item.severity,
    item.source,
    item.target,
    item.state,
    formatRuntimeAction(item.action),
    item.detail,
    item.verification?.lastStatus || '',
    item.verification?.okCount || 0,
    item.verification?.failedCount || 0,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function p0TargetsFromSnapshot(snapshot?: RuntimeFaultLedgerSnapshot | null): Set<string> {
  return new Set(
    (snapshot?.items || [])
      .filter((item) => item.severity === 'P0')
      .map((item) => item.target)
  );
}

function p0TargetsFromLedger(items: RuntimeFaultLedgerItem[]): Set<string> {
  return new Set(items.filter((item) => item.severity === 'P0').map((item) => item.target));
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

function isScribRuntimeEvent(event: RuntimeEventRecord): boolean {
  if (event.kind === 'scrib_load_failed' || event.kind === 'scrib_node_disabled') return true;
  if (event.kind === 'scrib_node_retry_requested') return true;
  if (event.nodeId) return true;
  return Boolean(event.scriptId && isScribRuntimeScript(event.scriptId));
}

export function ScriptWorkspacePanel() {
  const {
    entities,
    scenes,
    activeSceneId,
    playRuntimeState,
    setPlayRuntimeState,
    engineMode,
    editor,
    scribInstances,
    addAsset,
    updateEntity,
    assignScribToEntity,
    assignScribToScene,
    setScribInstanceEnabled,
  } = useEngineStore();

  const selectedEntityId = editor.selectedEntities[0] || null;
  const selectedEntityName = selectedEntityId ? entities.get(selectedEntityId)?.name || selectedEntityId : null;
  const activeSceneName = scenes.find((item) => item.id === activeSceneId)?.name || null;
  const modeGuide = MODE_AUTO_GUIDE[engineMode];

  const defs = useMemo(() => defaultScribRegistry.list(), []);
  const atomicDefs = useMemo(() => defaultScribRegistry.list('atomic'), []);
  const composedDefs = useMemo(() => defaultScribRegistry.list('composed'), []);

  const [activeTab, setActiveTab] = useState<StudioTab>('create');
  const [status, setStatus] = useState('Listo.');

  const [createTargetType, setCreateTargetType] = useState<CreateTargetType>('character');
  const [createCapability, setCreateCapability] = useState<ScribType>('movement');
  const [createConfigText, setCreateConfigText] = useState('{\n  "speed": 5\n}');
  const [createTargetEntityId, setCreateTargetEntityId] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [assignTargetKey, setAssignTargetKey] = useState<string>('scene');
  const [assignType, setAssignType] = useState<ScribType>('movement');
  const [assignConfigText, setAssignConfigText] = useState('{}');
  const [assignLoading, setAssignLoading] = useState(false);

  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryScope, setLibraryScope] = useState<'entity' | 'scene'>('entity');
  const [libraryLoading, setLibraryLoading] = useState(false);

  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [scriptSearch, setScriptSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [newScriptName, setNewScriptName] = useState('scribs/movement.scrib.ts');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingScript, setLoadingScript] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [applyingScrib, setApplyingScrib] = useState<'entity' | 'scene' | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [renderAllLoading, setRenderAllLoading] = useState(false);
  const [verifyingArtifactPath, setVerifyingArtifactPath] = useState<string | null>(null);
  const [retryingRuntimePath, setRetryingRuntimePath] = useState<string | null>(null);
  const [recoveringNodeId, setRecoveringNodeId] = useState<string | null>(null);
  const [compileResult, setCompileResult] = useState<ScriptCompileResult | null>(null);

  const [consoleInput, setConsoleInput] = useState(
    'createScrib({ target: "player_01", type: "movement", config: { speed: 10 } })'
  );
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([]);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [runtimeLedgerFilter, setRuntimeLedgerFilter] = useState<'all' | 'P0' | 'P1' | 'P2'>('all');
  const [runtimeLedgerCsvSeverity, setRuntimeLedgerCsvSeverity] = useState<'all' | 'P0' | 'P1' | 'P2'>('all');
  const [runtimeLedgerCsvTarget, setRuntimeLedgerCsvTarget] = useState('');
  const [runtimeLedgerCsvFrom, setRuntimeLedgerCsvFrom] = useState('');
  const [runtimeLedgerCsvTo, setRuntimeLedgerCsvTo] = useState('');
  const [runtimeLedgerHistory, setRuntimeLedgerHistory] = useState<RuntimeFaultLedgerSnapshot[]>([]);
  const [selectedLedgerSnapshotId, setSelectedLedgerSnapshotId] = useState<string>('');
  const [runtimeLedgerRetentionPolicy, setRuntimeLedgerRetentionPolicy] = useState<RuntimeFaultLedgerRetentionPolicy | null>(null);
  const [runtimeLedgerRetentionDraft, setRuntimeLedgerRetentionDraft] = useState({
    maxSnapshots: '',
    maxAgeDays: '',
  });
  const [runtimeLedgerPruneSummary, setRuntimeLedgerPruneSummary] = useState<RuntimeFaultLedgerPruneSummary | null>(null);
  const [runtimeLedgerPruneAudit, setRuntimeLedgerPruneAudit] = useState<RuntimeFaultLedgerPruneAuditEntry[]>([]);
  const [runtimeLedgerHistoryLoading, setRuntimeLedgerHistoryLoading] = useState(false);
  const [runtimeLedgerPruning, setRuntimeLedgerPruning] = useState(false);
  const [runtimeLedgerDryRunning, setRuntimeLedgerDryRunning] = useState(false);
  const [runtimeLedgerPolicySaving, setRuntimeLedgerPolicySaving] = useState(false);
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false);
  const [runtimeHealth, setRuntimeHealth] = useState<ScriptRuntimeHealthView | null>(null);
  const [runtimeHealthAvailable, setRuntimeHealthAvailable] = useState<boolean | null>(null);
  const [runtimeLive, setRuntimeLive] = useState<ScriptRuntimeLiveSummaryView | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<ScriptRuntimeDiagnostics | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const lastLedgerSnapshotSignatureRef = useRef<string>('');

  const filteredLibrary = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase();
    if (!needle) return defs;
    return defs.filter((item) => item.type.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle));
  }, [defs, librarySearch]);

  const filteredScripts = useMemo(() => {
    const needle = scriptSearch.trim().toLowerCase();
    if (!needle) return scripts;
    return scripts.filter((item) => item.relativePath.toLowerCase().includes(needle));
  }, [scriptSearch, scripts]);

  const selectedScribType = useMemo(() => {
    if (!selectedPath) return null;
    const normalized = selectedPath.replace(/\\/g, '/');
    const match = normalized.match(/([^/]+)\.scrib\.(ts|tsx|js|jsx|mjs|cjs|lua)$/i);
    if (!match) return null;
    const type = asScribType(match[1]);
    return defs.some((def) => def.type === type) ? type : null;
  }, [defs, selectedPath]);

  const entityScribs = useMemo(() => {
    if (!selectedEntityId) return [];
    return Array.from(scribInstances.values()).filter((item) => item.target.scope === 'entity' && item.target.id === selectedEntityId);
  }, [scribInstances, selectedEntityId]);

  const sceneScribs = useMemo(() => {
    if (!activeSceneId) return [];
    return Array.from(scribInstances.values()).filter((item) => item.target.scope === 'scene' && item.target.id === activeSceneId);
  }, [scribInstances, activeSceneId]);

  const selectedRuntimeStatus = useMemo(() => {
    if (!selectedPath || !runtimeDiagnostics) return null;
    return runtimeDiagnostics.legacyScripts.statuses.find((item) => item.scriptId === selectedPath) || null;
  }, [runtimeDiagnostics, selectedPath]);

  const selectedArtifactStatus = useMemo(() => {
    if (!selectedPath || !runtimeDiagnostics) return null;
    return runtimeDiagnostics.artifacts.find((item) => item.scriptId === selectedPath) || null;
  }, [runtimeDiagnostics, selectedPath]);

  const verificationByScript = useMemo(() => {
    return new Map(
      (runtimeDiagnostics?.artifactVerifications || []).map((item) => [item.scriptId, item])
    );
  }, [runtimeDiagnostics]);

  const selectedVerificationStatus = useMemo(() => {
    if (!selectedPath) return null;
    return verificationByScript.get(selectedPath) || null;
  }, [selectedPath, verificationByScript]);

  const sortedRuntimeStatuses = useMemo(() => {
    const items = runtimeDiagnostics?.legacyScripts.statuses || [];
    return [...items]
      .sort((left, right) => {
        if (selectedPath && left.scriptId === selectedPath) return -1;
        if (selectedPath && right.scriptId === selectedPath) return 1;
        const leftRank =
          left.status === 'error' ? 0 : left.status === 'disabled' ? 1 : left.status === 'backoff' ? 2 : 3;
        const rightRank =
          right.status === 'error' ? 0 : right.status === 'disabled' ? 1 : right.status === 'backoff' ? 2 : 3;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.scriptId.localeCompare(right.scriptId);
      });
  }, [runtimeDiagnostics, selectedPath]);

  const visibleScribRuntimeStatuses = useMemo(() => {
    return sortedRuntimeStatuses
      .filter((item) => isScribRuntimeScript(item.scriptId))
      .slice(0, 5);
  }, [sortedRuntimeStatuses]);

  const visibleLegacyRuntimeStatuses = useMemo(() => {
    return sortedRuntimeStatuses
      .filter((item) => !isScribRuntimeScript(item.scriptId))
      .slice(0, 5);
  }, [sortedRuntimeStatuses]);

  const sortedRuntimeEvents = useMemo(() => {
    return [...(runtimeDiagnostics?.recentEvents || [])].reverse();
  }, [runtimeDiagnostics]);

  const visibleScribRuntimeEvents = useMemo(() => {
    return sortedRuntimeEvents.filter(isScribRuntimeEvent).slice(0, 4);
  }, [sortedRuntimeEvents]);

  const visibleLegacyRuntimeEvents = useMemo(() => {
    return sortedRuntimeEvents.filter((event) => !isScribRuntimeEvent(event)).slice(0, 4);
  }, [sortedRuntimeEvents]);

  const runtimeBlockingIssues = useMemo<RuntimeBlockingIssue[]>(() => {
    if (!runtimeDiagnostics) return [];
    const issues = new Map<string, RuntimeBlockingIssue>();

    runtimeDiagnostics.artifacts
      .filter((artifact) => artifact.status !== 'ready')
      .forEach((artifact) => {
        const source = isScribRuntimeScript(artifact.scriptId) ? 'scrib' : 'legacy';
        issues.set(`artifact:${artifact.scriptId}`, {
          key: `artifact:${artifact.scriptId}`,
          scriptId: artifact.scriptId,
          source,
          action: 'verify-artifact',
          title: formatArtifactState(artifact.status),
          detail:
            artifact.status === 'missing'
              ? 'No existe artifact revisado para ejecutar este código.'
              : artifact.status === 'stale'
                ? 'El código cambió después de la última revisión.'
                : 'El artifact no pudo prepararse para runtime.',
          tone: artifact.status === 'error' ? 'error' : 'warn',
          canVerify: true,
          verification: verificationByScript.get(artifact.scriptId) || null,
        });
      });

    runtimeDiagnostics.legacyScripts.statuses
      .filter((item) => item.status !== 'ready')
      .forEach((item) => {
        const source = isScribRuntimeScript(item.scriptId) ? 'scrib' : 'legacy';
        const artifactFixLikely = item.lastStatusCode === 404 || item.lastStatusCode === 409;
        issues.set(`status:${item.scriptId}`, {
          key: `status:${item.scriptId}`,
          scriptId: item.scriptId,
          source,
          action: artifactFixLikely ? 'verify-artifact' : 'retry-runtime',
          title: formatExecutionState(item.status),
          detail:
            item.status === 'backoff' && item.retryAt
              ? `${item.lastError || `Intentos: ${item.failures}`}; reintento automático: ${item.retryAt}`
              : artifactFixLikely
                ? item.lastError || `Intentos: ${item.failures}`
                : `${item.lastError || `Intentos: ${item.failures}`}; no apunta a artifact faltante, reintenta runtime.`,
          tone: item.status === 'backoff' ? 'warn' : 'error',
          canVerify: artifactFixLikely,
          verification: verificationByScript.get(item.scriptId) || null,
          retryAt: item.retryAt,
        });
      });

    const disabledDetails = new Map(
      (runtimeDiagnostics.composer.disabledScribNodeDetails || []).map((item) => [item.nodeId, item])
    );
    runtimeDiagnostics.composer.disabledScribNodes.forEach((nodeId) => {
      const detail = disabledDetails.get(nodeId);
      const codePath = detail?.code || null;
      issues.set(`scrib-node:${nodeId}`, {
        key: `scrib-node:${nodeId}`,
        scriptId: codePath || nodeId,
        source: 'node',
        action: 'retry-node',
        title: 'scrib node bloqueado',
        detail: `${detail?.scribType || 'scrib'} detenido en ${nodeId}. Reactiva el node para reintentar runtime; si vuelve a caer, revisa su artifact o evento reciente.`,
        tone: 'error',
        canVerify: false,
        nodeId,
        sourceScribId: detail?.sourceScribId || null,
        codePath,
        verification: codePath ? verificationByScript.get(codePath) || null : null,
      });
    });

    return Array.from(issues.values());
  }, [runtimeDiagnostics, verificationByScript]);

  const runtimeBannerIssues = useMemo(() => runtimeBlockingIssues.slice(0, 6), [runtimeBlockingIssues]);

  const runtimeFaultLedger = useMemo<RuntimeFaultLedgerItem[]>(() => {
    const severityRank = (item: RuntimeFaultLedgerItem): number => {
      if (item.severity === 'P0') return 0;
      if (item.severity === 'P1') return 1;
      return 2;
    };

    return runtimeBlockingIssues
      .map((issue): RuntimeFaultLedgerItem => {
        const severity: RuntimeFaultLedgerItem['severity'] =
          issue.source === 'node' || issue.action === 'retry-runtime'
            ? 'P0'
            : issue.tone === 'error'
              ? 'P1'
              : 'P2';
        return {
          key: issue.key,
          severity,
          source: issue.source,
          scriptId: issue.scriptId,
          nodeId: issue.nodeId,
          sourceScribId: issue.sourceScribId,
          codePath: issue.codePath,
          target: issue.nodeId || issue.scriptId,
          state: issue.title,
          action: issue.action,
          detail: issue.detail,
          verification: issue.verification,
        };
      })
      .sort((left, right) => {
        const rank = severityRank(left) - severityRank(right);
        if (rank !== 0) return rank;
        return left.target.localeCompare(right.target);
      });
  }, [runtimeBlockingIssues]);

  const filteredRuntimeFaultLedger = useMemo(() => {
    if (runtimeLedgerFilter === 'all') return runtimeFaultLedger;
    return runtimeFaultLedger.filter((item) => item.severity === runtimeLedgerFilter);
  }, [runtimeFaultLedger, runtimeLedgerFilter]);

  const selectedLedgerSnapshot = useMemo(() => {
    if (runtimeLedgerHistory.length === 0) return null;
    return runtimeLedgerHistory.find((item) => item.id === selectedLedgerSnapshotId) || runtimeLedgerHistory[0];
  }, [runtimeLedgerHistory, selectedLedgerSnapshotId]);

  const selectedLedgerSnapshotIndex = useMemo(() => {
    if (!selectedLedgerSnapshot) return -1;
    return runtimeLedgerHistory.findIndex((item) => item.id === selectedLedgerSnapshot.id);
  }, [runtimeLedgerHistory, selectedLedgerSnapshot]);

  const previousLedgerSnapshot = useMemo(() => {
    if (selectedLedgerSnapshotIndex < 0) return null;
    return runtimeLedgerHistory[selectedLedgerSnapshotIndex + 1] || null;
  }, [runtimeLedgerHistory, selectedLedgerSnapshotIndex]);

  const ledgerSnapshotDiff = useMemo(() => {
    const currentP0 = p0TargetsFromSnapshot(selectedLedgerSnapshot);
    const previousP0 = p0TargetsFromSnapshot(previousLedgerSnapshot);
    const olderP0 = new Set(
      runtimeLedgerHistory
        .slice(Math.max(0, selectedLedgerSnapshotIndex + 2))
        .flatMap((snapshot) => snapshot.items || [])
        .filter((item) => item.severity === 'P0')
        .map((item) => item.target)
    );
    const current = Array.from(currentP0).sort();
    const previous = Array.from(previousP0).sort();
    return {
      newP0: current.filter((target) => !previousP0.has(target) && !olderP0.has(target)),
      reappearedP0: current.filter((target) => !previousP0.has(target) && olderP0.has(target)),
      persistentP0: current.filter((target) => previousP0.has(target)),
      resolvedP0: previous.filter((target) => !currentP0.has(target)),
    };
  }, [previousLedgerSnapshot, runtimeLedgerHistory, selectedLedgerSnapshot, selectedLedgerSnapshotIndex]);

  const currentLedgerReappearedP0Targets = useMemo(() => {
    const currentP0 = p0TargetsFromLedger(runtimeFaultLedger);
    if (currentP0.size === 0) return new Set<string>();
    const previousDifferentIndex = runtimeLedgerHistory.findIndex(
      (snapshot) => !sameStringSet(p0TargetsFromSnapshot(snapshot), currentP0)
    );
    if (previousDifferentIndex < 0) return new Set<string>();

    const previousP0 = p0TargetsFromSnapshot(runtimeLedgerHistory[previousDifferentIndex]);
    const olderP0 = new Set(
      runtimeLedgerHistory
        .slice(previousDifferentIndex + 1)
        .flatMap((snapshot) => snapshot.items || [])
        .filter((item) => item.severity === 'P0')
        .map((item) => item.target)
    );
    return new Set(
      Array.from(currentP0).filter((target) => !previousP0.has(target) && olderP0.has(target))
    );
  }, [runtimeFaultLedger, runtimeLedgerHistory]);

  const runtimeFaultTimeline = useMemo(() => {
    const liveItems: RuntimeFaultLedgerSnapshotItem[] = runtimeFaultLedger.map((item) => ({
      severity: item.severity,
      source: item.source,
      target: item.target,
      state: item.state,
      action: formatRuntimeAction(item.action),
      detail: item.detail,
      verificationStatus: item.verification?.lastStatus || null,
      verificationOkCount: item.verification?.okCount || 0,
      verificationFailedCount: item.verification?.failedCount || 0,
    }));
    const frames = [
      { id: 'live', label: 'live', snapshotId: null as string | null, items: liveItems },
      ...runtimeLedgerHistory.slice(0, 5).map((snapshot, index) => ({
        id: snapshot.id,
        label: index === 0 ? 't-1' : `t-${index + 1}`,
        snapshotId: snapshot.id,
        items: snapshot.items || [],
      })),
    ];
    const targets = Array.from(
      new Set(frames.flatMap((frame) => frame.items.map((item) => item.target)))
    ).sort();
    return targets.slice(0, 6).map((target) => ({
      target,
      points: frames.map((frame) => {
        const match = frame.items.find((item) => item.target === target) || null;
        return {
          key: `${frame.id}:${target}`,
          label: frame.label,
          snapshotId: frame.snapshotId,
          severity: match?.severity || null,
        };
      }),
    }));
  }, [runtimeFaultLedger, runtimeLedgerHistory]);

  const currentRuntimeSession = useMemo(() => {
    return runtimeLive?.sessions.find((item) => item.currentSession) || null;
  }, [runtimeLive]);

  useEffect(() => {
    if (selectedEntityId) {
      setCreateTargetEntityId((current) => current || selectedEntityId);
      setAssignTargetKey((current) => (current === 'scene' ? current : selectedEntityId));
    }
  }, [selectedEntityId]);

  useEffect(() => {
    if (!runtimeLedgerRetentionPolicy) return;
    setRuntimeLedgerRetentionDraft({
      maxSnapshots: String(runtimeLedgerRetentionPolicy.maxSnapshots),
      maxAgeDays: String(runtimeLedgerRetentionPolicy.maxAgeDays),
    });
  }, [runtimeLedgerRetentionPolicy]);

  const refreshSession = async (): Promise<boolean> => {
    setSessionChecking(true);
    try {
      const payload = (await loadClientAuthSession()) as AuthSessionPayload;
      const authenticated = Boolean(payload.authenticated);
      setSessionReady(authenticated);
      setSessionRole(authenticated ? payload.user?.role || null : null);
      if (!authenticated) {
        setScripts([]);
        setSelectedPath(null);
        setContent('');
        setDirty(false);
      }
      return authenticated;
    } catch {
      setSessionReady(false);
      setSessionRole(null);
      return false;
    } finally {
      setSessionChecking(false);
    }
  };

  const ensureSessionReady = (): boolean => {
    if (sessionReady) return true;
    setStatus(SCRIPT_STUDIO_AUTH_HINT);
    return false;
  };

  const parseScriptApiPayload = async <T,>(
    response: Response,
    fallbackError: string
  ): Promise<T> => {
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

    if (response.status === 401) {
      setSessionReady(false);
      setSessionRole(null);
      throw new Error(SCRIPT_STUDIO_AUTH_HINT);
    }

    if (response.status === 403) {
      throw new Error(payload.error ? `${SCRIPT_STUDIO_ROLE_HINT} (${payload.error})` : SCRIPT_STUDIO_ROLE_HINT);
    }

    if (!response.ok) {
      throw new Error(payload.error || fallbackError);
    }

    return payload;
  };

  const syncRuntimeHeartbeat = async (diagnostics: ScriptRuntimeDiagnostics) => {
    const response = await fetch('/api/scripts/runtime/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        instanceId: diagnostics.instance.instanceId,
        playState: playRuntimeState,
        activeEntityScripts: diagnostics.legacyScripts.activeEntityScripts,
        activeScribNodes: diagnostics.composer.activeScribNodes,
        activeScriptIds: diagnostics.legacyScripts.activeScriptIds,
      }),
    });
    const payload = await parseScriptApiPayload<ScriptRuntimeHeartbeatPayload>(
      response,
      'No se pudo registrar el heartbeat del runtime'
    );
    scriptRuntime.markHeartbeatSuccess({
      heartbeatAt: payload.heartbeatAt,
      lease: payload.lease,
    });
    setRuntimeLive(payload.live || null);
  };

  const syncRuntimeVerifications = async () => {
    const response = await fetch('/api/scripts/runtime/verifications');
    const payload = await parseScriptApiPayload<ScriptRuntimeVerificationsPayload>(
      response,
      'No se pudo consultar el historial de verificación'
    );
    scriptRuntime.hydrateArtifactVerifications(payload.verifications || []);
  };

  const persistRuntimeFaultLedgerSnapshot = async (items: RuntimeFaultLedgerItem[]) => {
    if (!runtimeDiagnostics) return;
    const response = await fetch('/api/scripts/runtime/fault-ledger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instanceId: runtimeDiagnostics.instance.instanceId,
        playState: playRuntimeState,
        generatedAt: runtimeDiagnostics.generatedAt,
        items: items.map((item) => ({
          severity: item.severity,
          source: item.source,
          target: item.target,
          state: item.state,
          action: formatRuntimeAction(item.action),
          detail: item.detail,
          verificationStatus: item.verification?.lastStatus || null,
          verificationOkCount: item.verification?.okCount || 0,
          verificationFailedCount: item.verification?.failedCount || 0,
        })),
      }),
    });
    const payload = await parseScriptApiPayload<ScriptRuntimeFaultLedgerSnapshotPayload>(
      response,
      'No se pudo persistir el ledger forense'
    );
    if (payload.snapshot) {
      if (payload.retentionPolicy) {
        setRuntimeLedgerRetentionPolicy(payload.retentionPolicy);
      }
      if (payload.pruneAudit) {
        setRuntimeLedgerPruneAudit(payload.pruneAudit);
      }
      setRuntimeLedgerHistory((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== payload.snapshot!.id);
        const next = [payload.snapshot!, ...withoutDuplicate]
          .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
          .slice(0, 20);
        if (!selectedLedgerSnapshotId) {
          setSelectedLedgerSnapshotId(next[0]?.id || '');
        }
        return next;
      });
    }
  };

  const loadRuntimeFaultLedgerHistory = async (silent = false) => {
    if (!silent) setRuntimeLedgerHistoryLoading(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger?limit=20');
      const payload = await parseScriptApiPayload<ScriptRuntimeFaultLedgerSnapshotPayload>(
        response,
        'No se pudo leer el historial del ledger'
      );
      const snapshots = payload.snapshots || [];
      if (payload.retentionPolicy) {
        setRuntimeLedgerRetentionPolicy(payload.retentionPolicy);
      }
      if (payload.pruneAudit) {
        setRuntimeLedgerPruneAudit(payload.pruneAudit);
      }
      setRuntimeLedgerHistory(snapshots);
      if (snapshots.length > 0 && !snapshots.some((item) => item.id === selectedLedgerSnapshotId)) {
        setSelectedLedgerSnapshotId(snapshots[0].id);
      }
    } catch (error) {
      if (!silent) {
        addConsole('warn', `Historial ledger no disponible: ${String(error)}`);
      }
    } finally {
      if (!silent) setRuntimeLedgerHistoryLoading(false);
    }
  };

  const buildRuntimeFaultLedgerHistoryExportParams = (format: 'csv' | 'json') => {
    const params = new URLSearchParams({
      format,
      limit: '100',
    });
    if (runtimeLedgerCsvSeverity !== 'all') params.set('severity', runtimeLedgerCsvSeverity);
    if (runtimeLedgerCsvTarget.trim()) params.set('target', runtimeLedgerCsvTarget.trim());
    if (runtimeLedgerCsvFrom) params.set('from', runtimeLedgerCsvFrom);
    if (runtimeLedgerCsvTo) params.set('to', runtimeLedgerCsvTo);
    return params;
  };

  const exportRuntimeFaultLedgerHistory = async (format: 'csv' | 'json') => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof URL === 'undefined') {
      addConsole('warn', 'Export histórico requiere navegador.');
      return;
    }
    const params = buildRuntimeFaultLedgerHistoryExportParams(format);
    try {
      const response = await fetch(`/api/scripts/runtime/fault-ledger?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `runtime-fault-ledger-history.${format}`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      addConsole('success', `Export histórico ${format.toUpperCase()} solicitado al servidor.`);
    } catch (error) {
      addConsole('warn', `Export histórico ${format.toUpperCase()} falló: ${String(error)}`);
    }
  };

  const saveRuntimeFaultLedgerRetentionPolicy = async () => {
    setRuntimeLedgerPolicySaving(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update-retention-policy',
          retentionPolicy: {
            maxSnapshots: Number(runtimeLedgerRetentionDraft.maxSnapshots),
            maxAgeDays: Number(runtimeLedgerRetentionDraft.maxAgeDays),
          },
        }),
      });
      const payload = await parseScriptApiPayload<ScriptRuntimeFaultLedgerSnapshotPayload>(
        response,
        'No se pudo guardar la política de retención'
      );
      if (payload.retentionPolicy) {
        setRuntimeLedgerRetentionPolicy(payload.retentionPolicy);
      }
      if (payload.pruneAudit) {
        setRuntimeLedgerPruneAudit(payload.pruneAudit);
      }
      addConsole('success', 'Política de retención guardada.');
    } catch (error) {
      addConsole('warn', `Política de retención no guardada: ${String(error)}`);
    } finally {
      setRuntimeLedgerPolicySaving(false);
    }
  };

  const dryRunRuntimeFaultLedgerHistory = async () => {
    setRuntimeLedgerDryRunning(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger?limit=20', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'dry-run-prune' }),
      });
      const payload = await parseScriptApiPayload<ScriptRuntimeFaultLedgerSnapshotPayload>(
        response,
        'No se pudo simular el prune del ledger'
      );
      if (payload.retentionPolicy) {
        setRuntimeLedgerRetentionPolicy(payload.retentionPolicy);
      }
      if (payload.prune) {
        setRuntimeLedgerPruneSummary(payload.prune);
        addConsole(
          'info',
          `Dry run ledger: ${payload.prune.wouldDelete} candidatos a borrar, ${payload.prune.retained} retenidos.`
        );
      }
      if (payload.pruneAudit) {
        setRuntimeLedgerPruneAudit(payload.pruneAudit);
      }
      if (payload.snapshots) {
        setRuntimeLedgerHistory(payload.snapshots);
      }
    } catch (error) {
      addConsole('warn', `Dry run ledger falló: ${String(error)}`);
    } finally {
      setRuntimeLedgerDryRunning(false);
    }
  };

  const pruneRuntimeFaultLedgerHistory = async () => {
    setRuntimeLedgerPruning(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger?limit=20', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'prune' }),
      });
      const payload = await parseScriptApiPayload<ScriptRuntimeFaultLedgerSnapshotPayload>(
        response,
        'No se pudo podar el historial del ledger'
      );
      const snapshots = payload.snapshots || [];
      setRuntimeLedgerHistory(snapshots);
      if (payload.retentionPolicy) {
        setRuntimeLedgerRetentionPolicy(payload.retentionPolicy);
      }
      if (payload.prune) {
        setRuntimeLedgerPruneSummary(payload.prune);
        addConsole(
          'success',
          `Prune ledger: ${payload.prune.deleted} snapshots borrados, ${payload.prune.retained} retenidos.`
        );
      }
      if (payload.pruneAudit) {
        setRuntimeLedgerPruneAudit(payload.pruneAudit);
      }
      if (snapshots.length > 0 && !snapshots.some((item) => item.id === selectedLedgerSnapshotId)) {
        setSelectedLedgerSnapshotId(snapshots[0].id);
      }
      if (snapshots.length === 0) {
        setSelectedLedgerSnapshotId('');
      }
    } catch (error) {
      addConsole('warn', `Prune ledger falló: ${String(error)}`);
    } finally {
      setRuntimeLedgerPruning(false);
    }
  };

  const refreshRuntimeState = async (silent = false) => {
    if (!silent) {
      setRuntimeRefreshing(true);
    }

    try {
      const diagnostics = scriptRuntime.getDiagnostics();
      setRuntimeDiagnostics(diagnostics);
      if (!sessionReady) {
        setRuntimeHealth(null);
        setRuntimeHealthAvailable(null);
        setRuntimeLive(null);
        return;
      }

      try {
        await syncRuntimeHeartbeat(diagnostics);
      } catch (error) {
        scriptRuntime.markHeartbeatFailure(error);
        throw error;
      }
      await syncRuntimeVerifications();
      setRuntimeDiagnostics(scriptRuntime.getDiagnostics());

      const response = await fetch(
        `/api/scripts/health?instanceId=${encodeURIComponent(diagnostics.instance.instanceId)}`
      );
      const payload = await parseScriptApiPayload<ScriptRuntimeHealthPayload>(
        response,
        'No se pudo consultar el estado del runtime'
      );
      setRuntimeHealth(payload.runtime || null);
      setRuntimeHealthAvailable(Boolean(payload.available));
      setRuntimeLive(payload.live || null);
    } catch (error) {
      setRuntimeDiagnostics(scriptRuntime.getDiagnostics());
      if (!silent) {
        setStatus(`No se pudo actualizar runtime: ${String(error)}`);
      }
    } finally {
      if (!silent) {
        setRuntimeRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void loadScripts();
    void refreshRuntimeState(true);
  }, [sessionReady]);

  useEffect(() => {
    if (activeTab !== 'console') return;
    void refreshRuntimeState(true);
    if (sessionReady) void loadRuntimeFaultLedgerHistory(true);

    const intervalId = window.setInterval(() => {
      void refreshRuntimeState(true);
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTab, playRuntimeState, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !runtimeDiagnostics) return;
    const signature = JSON.stringify({
      instanceId: runtimeDiagnostics.instance.instanceId,
      playRuntimeState,
      items: runtimeFaultLedger.map((item) => ({
        key: item.key,
        severity: item.severity,
        action: item.action,
        target: item.target,
        state: item.state,
        verificationStatus: item.verification?.lastStatus || null,
        verificationOkCount: item.verification?.okCount || 0,
        verificationFailedCount: item.verification?.failedCount || 0,
      })),
    });
    if (lastLedgerSnapshotSignatureRef.current === signature) return;
    lastLedgerSnapshotSignatureRef.current = signature;
    void persistRuntimeFaultLedgerSnapshot(runtimeFaultLedger).catch((error) => {
      addConsole('warn', `Ledger forense no persistido: ${String(error)}`);
    });
  }, [sessionReady, runtimeDiagnostics, playRuntimeState, runtimeFaultLedger]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onRuntimeWarning = (event: Event) => {
      const detail = (event as CustomEvent<ScriptRuntimeWarningEventDetail>).detail || {};
      const scriptId = typeof detail.scriptId === 'string' ? detail.scriptId : 'script';
      const message = typeof detail.message === 'string' ? detail.message : 'Advertencia de runtime';
      const suggestion = typeof detail.suggestion === 'string' ? detail.suggestion : '';
      const isDisabled = detail.kind === 'legacy-script-disabled';
      const level: ConsoleLine['level'] = isDisabled ? 'error' : 'warn';

      setConsoleLogs((prev) => [
        ...prev,
        { id: id(), level, text: `[Runtime][${scriptId}] ${message}` },
        ...(suggestion
          ? [{ id: id(), level: 'info' as const, text: `Sugerencia: ${suggestion}` }]
          : []),
      ]);
      setStatus(`Runtime reportado para ${scriptId}`);
      void refreshRuntimeState(true);
    };

    window.addEventListener('script:runtime-warning', onRuntimeWarning as EventListener);
    return () => {
      window.removeEventListener('script:runtime-warning', onRuntimeWarning as EventListener);
    };
  }, []);

  const addConsole = (level: ConsoleLine['level'], text: string) => {
    setConsoleLogs((prev) => [...prev, { id: id(), level, text }]);
  };

  const dispatchHotReload = (path?: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('scrib:code-updated', { detail: { path, reason: 'scrib-studio' } }));
  };

  const dispatchCompose = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('scrib:runtime-compose'));
  };

  const compileScriptPath = async (
    path: string,
    contentOverride?: string,
    options?: { silent?: boolean }
  ): Promise<ScriptCompileResult> => {
    if (!ensureSessionReady()) {
      throw new Error(SCRIPT_STUDIO_AUTH_HINT);
    }
    const response = await fetch('/api/scripts/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        ...(typeof contentOverride === 'string' ? { content: contentOverride } : {}),
      }),
    });
    const payload = await parseScriptApiPayload<ScriptCompileResult>(
      response,
      `No se pudo revisar ${path}`
    );
    const result = payload as ScriptCompileResult;
    if (result.runtime?.verification) {
      scriptRuntime.hydrateArtifactVerifications([result.runtime.verification]);
    }
    if (!options?.silent || selectedPath === path) {
      setCompileResult(result);
    }
    return result;
  };

  const verifyRuntimeArtifact = async (path: string) => {
    setVerifyingArtifactPath(path);
    try {
      const result = await compileScriptPath(path, undefined, { silent: true });
      if (!result.ok) {
        throw new Error(result.summary || 'revisión con ajustes');
      }

      if (!result.runtime?.verification) {
        scriptRuntime.recordArtifactVerification({
          scriptId: path,
          ok: true,
          message: result.summary || 'Artifact revisado correctamente.',
        });
      }
      scriptRuntime.forceImmediateRetryForScript(path, 'artifact_verified');
      dispatchHotReload(path);
      let flushSummary = '';
      if (playRuntimeState === 'PLAYING') {
        const flush = await scriptRuntime.updateAndFlush(1 / 60, 1_500);
        flushSummary = ` | vuelta async: ${flush.settledTasks}/${flush.scheduledTasks}${flush.timedOut ? ' timeout' : ''}`;
      }
      await refreshRuntimeState(true);
      setStatus(`Artifact verificado: ${path}${flushSummary}`);
      addConsole('success', `Artifact verificado: ${path}${flushSummary}`);
    } catch (error) {
      scriptRuntime.recordArtifactVerification({ scriptId: path, ok: false, message: String(error) });
      setStatus(`No se pudo verificar artifact: ${String(error)}`);
      addConsole('error', `Artifact no verificado (${path}): ${String(error)}`);
    } finally {
      setVerifyingArtifactPath(null);
    }
  };

  const retryRuntimeScript = async (path: string) => {
    setRetryingRuntimePath(path);
    try {
      dispatchHotReload(path);
      setPlayRuntimeState('PLAYING');
      const flush = await scriptRuntime.updateAndFlush(1 / 60, 1_500);
      await refreshRuntimeState(true);
      const summary =
        `Runtime reintentado: ${path} | async ${flush.settledTasks}/${flush.scheduledTasks}` +
        `${flush.timedOut ? ' timeout' : ''}`;
      setStatus(summary);
      addConsole(flush.timedOut ? 'warn' : 'success', summary);
    } catch (error) {
      setStatus(`No se pudo reintentar runtime: ${String(error)}`);
      addConsole('error', `Runtime no reintentado (${path}): ${String(error)}`);
    } finally {
      setRetryingRuntimePath(null);
    }
  };

  const retryBlockedScribNode = async (issue: RuntimeBlockingIssue) => {
    const nodeId = issue.nodeId || issue.scriptId;
    setRecoveringNodeId(nodeId);
    try {
      if (issue.sourceScribId) {
        setScribInstanceEnabled(issue.sourceScribId, true);
      }
      scriptRuntime.retryDisabledScribNode(issue.nodeId);
      dispatchCompose();
      setPlayRuntimeState('PLAYING');
      const flush = await scriptRuntime.updateAndFlush(1 / 60, 1_500);
      await refreshRuntimeState(true);
      const summary =
        `Node reactivado: ${nodeId} | async ${flush.settledTasks}/${flush.scheduledTasks}` +
        `${flush.timedOut ? ' timeout' : ''}`;
      setStatus(summary);
      addConsole(flush.timedOut ? 'warn' : 'success', summary);
    } catch (error) {
      setStatus(`No se pudo reactivar node: ${String(error)}`);
      addConsole('error', `Node no reactivado (${nodeId}): ${String(error)}`);
    } finally {
      setRecoveringNodeId(null);
    }
  };

  const runRuntimeFaultLedgerAction = (item: RuntimeFaultLedgerItem) => {
    if (item.action === 'verify-artifact') {
      void verifyRuntimeArtifact(item.scriptId);
      return;
    }
    if (item.action === 'retry-runtime') {
      void retryRuntimeScript(item.scriptId);
      return;
    }
    void retryBlockedScribNode({
      key: item.key,
      scriptId: item.scriptId,
      source: 'node',
      action: 'retry-node',
      title: item.state,
      detail: item.detail,
      tone: 'error',
      canVerify: false,
      nodeId: item.nodeId,
      sourceScribId: item.sourceScribId,
      codePath: item.codePath,
      verification: item.verification,
    });
  };

  const exportRuntimeFaultLedgerCsv = () => {
    const csv = runtimeFaultLedgerToCsv(filteredRuntimeFaultLedger);
    const fileName = `runtime-fault-ledger-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      addConsole('warn', `CSV preparado (${filteredRuntimeFaultLedger.length} filas): ${fileName}`);
      return;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    addConsole('success', `Runtime Fault Ledger exportado: ${filteredRuntimeFaultLedger.length} filas.`);
  };

  const ensureScribFile = async (type: ScribType): Promise<string[]> => {
    if (!ensureSessionReady()) {
      throw new Error(SCRIPT_STUDIO_AUTH_HINT);
    }
    const atomic = collectScribRuntimeTypes(type);
    const reviewedPaths: string[] = [];
    for (const item of atomic) {
      const response = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: 'scribs',
          name: `${item}.scrib.ts`,
          content: makeScribTemplate(item),
          overwrite: false,
          onExists: 'return-existing',
        }),
      });
      const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(
        response,
        `No se pudo crear ${item}.scrib.ts`
      );
      const script = payload.script as ScriptEntry;
      const review = await compileScriptPath(script.relativePath, undefined, { silent: true });
      if (!review.ok) {
        throw new Error(
          `${script.relativePath}: ${review.summary || 'revisión con ajustes'}`
        );
      }
      reviewedPaths.push(script.relativePath);
    }
    return reviewedPaths;
  };

  const ensureBaselineScribs = async () => {
    setBaselineLoading(true);
    try {
      const reviewed = new Set<string>();
      for (const type of BASELINE_SCRIB_TYPES) {
        const paths = await ensureScribFile(type);
        paths.forEach((path) => reviewed.add(path));
      }
      await loadScripts();
      const list = Array.from(reviewed).sort();
      setStatus(`Baseline revisado: ${list.join(', ')}`);
      addConsole('success', `Baseline Scrib listo: ${list.join(', ')}`);
      dispatchHotReload();
    } catch (error) {
      setStatus(`No se pudo crear baseline: ${String(error)}`);
      addConsole('error', `Baseline falló: ${String(error)}`);
    } finally {
      setBaselineLoading(false);
    }
  };

  const assignToTarget = async (
    target: { scope: 'entity' | 'scene'; id: string },
    type: ScribType,
    config: Record<string, unknown>,
    origin: 'manual' | 'hybrid' | 'ai'
  ) => {
    if (!ensureSessionReady()) {
      throw new Error(SCRIPT_STUDIO_AUTH_HINT);
    }
    await ensureScribFile(type);
    const result = target.scope === 'entity'
      ? assignScribToEntity(target.id, type, { config, origin })
      : assignScribToScene(target.id, type, { config, origin });
    dispatchCompose();
    return result;
  };

  const loadScripts = async () => {
    if (!ensureSessionReady()) return;
    setLoadingList(true);
    try {
      const response = await fetch('/api/scripts');
      const payload = await parseScriptApiPayload<{ scripts?: ScriptEntry[] }>(
        response,
        'No se pudieron cargar scripts'
      );
      setScripts(Array.isArray(payload.scripts) ? (payload.scripts as ScriptEntry[]) : []);
    } catch (error) {
      setStatus(`Error listando scripts: ${String(error)}`);
    } finally {
      setLoadingList(false);
    }
  };

  const openScript = async (path: string) => {
    if (!ensureSessionReady()) return;
    if (dirty && selectedPath && selectedPath !== path) {
      const accepted = window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?');
      if (!accepted) return;
    }
    setLoadingScript(true);
    try {
      const response = await fetch(`/api/scripts?path=${encodeURIComponent(path)}`);
      const payload = await parseScriptApiPayload<{ script: { relativePath: string; content: string } }>(
        response,
        'No se pudo abrir script'
      );
      const script = payload.script as { relativePath: string; content: string };
      setSelectedPath(script.relativePath);
      setContent(script.content || '');
      setDirty(false);
      setCompileResult(null);
      setStatus(`Abierto: ${script.relativePath}`);
    } catch (error) {
      setStatus(`Error abriendo script: ${String(error)}`);
    } finally {
      setLoadingScript(false);
    }
  };

  const createScript = async () => {
    if (!ensureSessionReady()) return;
    const raw = newScriptName.trim();
    if (!raw) return;
    const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
    const directory = slash >= 0 ? raw.slice(0, slash) : '';
    const name = slash >= 0 ? raw.slice(slash + 1) : raw;

    try {
      const response = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory,
          name,
          content: name.endsWith('.scrib.ts')
            ? makeScribTemplate((name.replace('.scrib.ts', '') as AtomicScribType))
            : undefined,
        }),
      });
      const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(response, 'No se pudo crear script');
      const created = payload.script as ScriptEntry;
      const review = isScribScriptPath(created.relativePath)
        ? await compileScriptPath(created.relativePath, undefined, { silent: false })
        : null;
      addAsset({
        id: crypto.randomUUID(),
        name: created.name,
        type: 'script',
        path: `/api/scripts?path=${encodeURIComponent(created.relativePath)}`,
        size: created.size,
        createdAt: new Date(created.modifiedAt),
        metadata: { source: 'scrib-studio', relativePath: created.relativePath },
      });
      setStatus(
        review
          ? `Script creado y revisado: ${created.relativePath}`
          : `Script creado: ${created.relativePath}`
      );
      await loadScripts();
      await openScript(created.relativePath);
      if (review) {
        setCompileResult(review);
      }
    } catch (error) {
      setStatus(`Error creando script: ${String(error)}`);
    }
  };

  const saveScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    setSaving(true);
    try {
      const response = await fetch('/api/scripts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content }),
      });
      const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(response, 'No se pudo guardar');
      const updated = payload.script as ScriptEntry;
      const review = isScribScriptPath(updated.relativePath)
        ? await compileScriptPath(updated.relativePath, content, { silent: false })
        : null;
      setDirty(false);
      setStatus(
        review
          ? `${review.summary || 'Revisión completada'}: ${updated.relativePath}`
          : `Guardado: ${updated.relativePath}`
      );
      dispatchHotReload(updated.relativePath);
      await loadScripts();
    } catch (error) {
      setStatus(`Error guardando: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const reloadScript = async () => {
    if (!selectedPath) return;
    await openScript(selectedPath);
  };

  const duplicateScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    setDuplicating(true);
    try {
      const extension = selectedPath.includes('.') ? selectedPath.slice(selectedPath.lastIndexOf('.')) : '.ts';
      const basePath = selectedPath.slice(0, -extension.length);
      const copyPath = `${basePath}.copy${extension}`;
      const slash = copyPath.lastIndexOf('/');
      const directory = slash >= 0 ? copyPath.slice(0, slash) : '';
      const name = slash >= 0 ? copyPath.slice(slash + 1) : copyPath;

      const response = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, name, content }),
      });
      const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(response, 'No se pudo duplicar');
      const created = payload.script as ScriptEntry;
      setStatus(`Duplicado: ${created.relativePath}`);
      await loadScripts();
      await openScript(created.relativePath);
    } catch (error) {
      setStatus(`Error duplicando: ${String(error)}`);
    } finally {
      setDuplicating(false);
    }
  };

  const deleteScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    const accepted = window.confirm(`¿Borrar script ${selectedPath}?`);
    if (!accepted) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/scripts?path=${encodeURIComponent(selectedPath)}`, { method: 'DELETE' });
      await parseScriptApiPayload(response, 'No se pudo borrar');
      const deletedPath = selectedPath;
      setSelectedPath(null);
      setContent('');
      setDirty(false);
      setCompileResult(null);
      setStatus(`Borrado: ${deletedPath}`);
      dispatchHotReload(deletedPath);
      await loadScripts();
    } catch (error) {
      setStatus(`Error borrando: ${String(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const compileScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    setCompiling(true);
    try {
      const payload = await compileScriptPath(selectedPath, content, { silent: false });
      setStatus(
        payload.summary ||
          (payload.ok
            ? 'El script está listo para usarse.'
            : 'Se detectaron ajustes por revisar en el script.')
      );
    } catch (error) {
      setStatus(`Error compilando: ${String(error)}`);
    } finally {
      setCompiling(false);
    }
  };

  const bindScriptToEntity = () => {
    if (!selectedEntityId || !selectedPath) return;
    const entity = entities.get(selectedEntityId);
    if (!entity) return;
    const components = new Map(entity.components);
    const current = components.get('Script');
    components.set('Script', {
      id: current?.id || crypto.randomUUID(),
      type: 'Script',
      enabled: true,
      data: {
        scriptId: selectedPath,
        parameters: {},
        enabled: true,
      },
    });
    updateEntity(selectedEntityId, { components });
    setStatus(`Script vinculado a ${entity.name}`);
    dispatchHotReload(selectedPath);
  };

  const applySelectedScrib = async (scope: 'entity' | 'scene') => {
    if (!selectedScribType) {
      setStatus('El archivo actual no es un scrib aplicable. Usa un archivo *.scrib.ts.');
      return;
    }

    setApplyingScrib(scope);
    try {
      if (scope === 'entity') {
        if (!selectedEntityId) throw new Error('Selecciona una entidad para aplicar el scrib.');
        const result = await assignToTarget({ scope: 'entity', id: selectedEntityId }, selectedScribType, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib "${selectedScribType}" aplicado a entidad.`);
      } else {
        if (!activeSceneId) throw new Error('No hay escena activa para aplicar el scrib.');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, selectedScribType, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib "${selectedScribType}" aplicado a escena.`);
      }
    } catch (error) {
      setStatus(`No se pudo aplicar scrib: ${String(error)}`);
    } finally {
      setApplyingScrib(null);
    }
  };

  const handleCreateScrib = async () => {
    setCreateLoading(true);
    try {
      const config = parseJsonLoose(createConfigText);
      if (createTargetType === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, createCapability, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib creado en escena: ${createCapability}`);
      } else {
        const targetId = createTargetEntityId || selectedEntityId;
        if (!targetId) throw new Error('Selecciona entidad objetivo');
        const result = await assignToTarget({ scope: 'entity', id: targetId }, createCapability, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib creado en entidad: ${createCapability}`);
      }
    } catch (error) {
      setStatus(`No se pudo crear: ${String(error)}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAssignScrib = async () => {
    setAssignLoading(true);
    try {
      const config = parseJsonLoose(assignConfigText);
      if (assignTargetKey === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, assignType, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      } else {
        const result = await assignToTarget({ scope: 'entity', id: assignTargetKey }, assignType, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      }
      setStatus(`Asignación lista: ${assignType}`);
    } catch (error) {
      setStatus(`No se pudo asignar: ${String(error)}`);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleLibraryAssign = async (type: ScribType) => {
    setLibraryLoading(true);
    try {
      if (libraryScope === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, type, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      } else {
        if (!selectedEntityId) throw new Error('Selecciona entidad');
        const result = await assignToTarget({ scope: 'entity', id: selectedEntityId }, type, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      }
      setStatus(`Asignado desde biblioteca: ${type}`);
    } catch (error) {
      setStatus(`No se pudo usar la biblioteca: ${String(error)}`);
    } finally {
      setLibraryLoading(false);
    }
  };

  const runConsole = async () => {
    const raw = consoleInput.trim();
    if (!raw) return;
    setConsoleLoading(true);
    addConsole('info', `> ${raw}`);
    try {
      const inlineScript = parseInlineScript(raw);
      if (inlineScript) {
        if (!ensureSessionReady()) throw new Error(SCRIPT_STUDIO_AUTH_HINT);
        const slash = Math.max(inlineScript.relativePath.lastIndexOf('/'), inlineScript.relativePath.lastIndexOf('\\'));
        const directory = slash >= 0 ? inlineScript.relativePath.slice(0, slash) : '';
        const name = slash >= 0 ? inlineScript.relativePath.slice(slash + 1) : inlineScript.relativePath;
        const response = await fetch('/api/scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directory,
            name,
            content: inlineScript.content,
            overwrite: true,
          }),
        });
        const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(
          response,
          'No se pudo guardar script desde consola'
        );
        const saved = payload.script as ScriptEntry;
        const review = isScribScriptPath(saved.relativePath)
          ? await compileScriptPath(saved.relativePath, inlineScript.content, { silent: true })
          : null;
        setStatus(
          review
            ? `Script guardado y revisado desde consola: ${saved.relativePath}`
            : `Script guardado desde consola: ${saved.relativePath}`
        );
        addConsole('success', review ? `Script revisado: ${saved.relativePath}` : `Script guardado: ${saved.relativePath}`);
        dispatchHotReload(saved.relativePath);
        await loadScripts();
        await openScript(saved.relativePath);
        if (review) {
          setCompileResult(review);
        }
        return;
      }

      if (raw.toLowerCase() === 'help') {
        addConsole('info', 'Comandos: help, listScribs(), createScrib({...}) o pega código TS/JS para guardarlo.');
        return;
      }
      if (raw.toLowerCase() === 'listscribs()' || raw.toLowerCase() === 'listscribs') {
        addConsole('success', defaultScribRegistry.list().map((item) => item.type).join(', '));
        return;
      }

      const createMatch = raw.match(/^createScrib\s*\(([\s\S]+)\)\s*;?$/i);
      const payload = createMatch ? parseJsonLoose(createMatch[1]) : parseJsonLoose(raw);
      const type = asScribType(String(payload.type || '').trim());
      if (!type) throw new Error('Falta type');
      const config = (payload.config as Record<string, unknown>) || {};
      const origin = (payload.origin as 'manual' | 'hybrid' | 'ai') || 'manual';
      const scope = payload.scope === 'scene' || String(payload.target || '').toLowerCase() === 'scene' ? 'scene' : 'entity';
      const target = String(payload.target || '').trim();

      if (scope === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, type, config, origin);
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        addConsole('success', `createScrib scene OK: ${type}`);
      } else {
        const entityId = target || selectedEntityId || '';
        if (!entityId) throw new Error('Falta target entity');
        const result = await assignToTarget({ scope: 'entity', id: entityId }, type, config, origin);
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        addConsole('success', `createScrib entity OK: ${type}`);
      }
    } catch (error) {
      addConsole('error', String(error));
    } finally {
      setConsoleLoading(false);
    }
  };

  const renderAllScribRuntime = async () => {
    setRenderAllLoading(true);
    try {
      if (!activeSceneId) {
        throw new Error('No hay escena activa para Render All.');
      }

      const plan = composeRuntimePlan({
        scenes,
        activeSceneId,
        entities,
        scribInstances,
      });
      const errorCount = plan.diagnostics.filter((item) => item.level === 'error').length;
      const warningCount = plan.diagnostics.filter((item) => item.level === 'warning').length;
      addConsole(
        errorCount > 0 ? 'error' : warningCount > 0 ? 'warn' : 'success',
        `Render All composeRuntimePlan: ${plan.nodes.length} nodos, ${errorCount} errores, ${warningCount} avisos.`
      );
      if (!plan.ok) {
        throw new Error('composeRuntimePlan tiene errores; revisa la consola de Scrib Studio.');
      }

      scriptRuntime.invalidateComposer();
      dispatchCompose();
      setPlayRuntimeState('PLAYING');
      const flush = await scriptRuntime.updateAndFlush(1 / 60, 1_500);
      await refreshRuntimeState(true);
      const diagnostics = scriptRuntime.getDiagnostics();
      const disabledNodeIds = new Set(diagnostics.composer.disabledScribNodes);
      const unhealthyScripts = new Set(
        diagnostics.legacyScripts.statuses
          .filter((item) => item.status !== 'ready')
          .map((item) => item.scriptId)
      );
      const plannedNodes = plan.nodes.filter((node) => node.enabled);
      const failedNodes = plannedNodes.filter((node) =>
        disabledNodeIds.has(node.id) || unhealthyScripts.has(node.code)
      );
      const loadedNodes = Math.max(
        0,
        Math.min(plannedNodes.length, diagnostics.composer.activeScribNodes)
      );
      const summary =
        `Render All: ${loadedNodes}/${plannedNodes.length} nodos cargados, ` +
        `${failedNodes.length} fallidos, async ${flush.settledTasks}/${flush.scheduledTasks}` +
        `${flush.timedOut ? ', timeout' : ''}.`;
      addConsole(failedNodes.length > 0 || flush.timedOut ? 'warn' : 'success', summary);
      if (failedNodes.length > 0) {
        addConsole(
          'warn',
          `Render All fallidos: ${failedNodes.map((node) => `${node.id}:${node.code}`).join(', ')}`
        );
      }
      setStatus(summary);
    } catch (error) {
      setStatus(`Render All falló: ${String(error)}`);
      addConsole('error', `Render All falló: ${String(error)}`);
    } finally {
      setRenderAllLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-900" data-testid="scrib-studio">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-medium text-slate-100">Scrib Studio</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void ensureBaselineScribs()}
              disabled={!sessionReady || baselineLoading}
              title="Crear y revisar movement, collider y cameraFollow"
              data-testid="scrib-baseline-action"
            >
              {baselineLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileCode2 className="h-3 w-3 mr-1" />}
              Baseline
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => void renderAllScribRuntime()}
              disabled={!activeSceneId || renderAllLoading}
              title="Componer todos los Scribs y arrancar el runtime"
              data-testid="scrib-render-all-action"
            >
              {renderAllLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
              Render All
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-800 px-2 py-2 flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              activeTab === tab.id
                ? 'bg-blue-500/25 text-blue-200'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mx-3 mt-2 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
        <p className="text-xs text-cyan-100">
          Auto guía ({engineMode}): <span className="font-medium">{modeGuide.title}</span>
        </p>
        <p className="mt-1 text-[11px] text-cyan-200">{modeGuide.steps[0]}</p>
        {engineMode === 'MODE_HYBRID' && (
          <p className="mt-1 text-[11px] text-cyan-300">
            Recomendación Scrib: {SCRIB_HYBRID_GUIDE[0].path} ({SCRIB_HYBRID_GUIDE[0].language}) para {SCRIB_HYBRID_GUIDE[0].target}.
          </p>
        )}
      </div>
      {!sessionReady && (
        <div className="mx-3 mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-200">
            {sessionChecking ? 'Verificando sesion de Scrib Studio...' : SCRIPT_STUDIO_AUTH_HINT}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs"
            onClick={() => void refreshSession()}
            disabled={sessionChecking}
          >
            <RefreshCw className={cn('h-3 w-3 mr-1', sessionChecking && 'animate-spin')} />
            Reintentar sesion
          </Button>
        </div>
      )}
      {runtimeBannerIssues.length > 0 && (
        <div
          className="mx-3 mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2"
          data-testid="scrib-runtime-issues"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TerminalSquare className="h-3.5 w-3.5 text-amber-200" />
              <p className="text-xs font-medium text-amber-100">Runtime requiere revisión</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void refreshRuntimeState()}
                disabled={runtimeRefreshing}
                data-testid="scrib-runtime-issues-refresh"
              >
                <RefreshCw className={cn('h-3 w-3 mr-1', runtimeRefreshing && 'animate-spin')} />
                Refrescar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setActiveTab('console')}
                data-testid="scrib-runtime-issues-console"
              >
                <TerminalSquare className="h-3 w-3 mr-1" />
                Consola
              </Button>
            </div>
          </div>
          <div className="mt-2 grid gap-1">
            {runtimeBannerIssues.map((issue) => (
              <div
                key={issue.key}
                className={cn(
                  'rounded border px-2 py-1.5 text-[11px]',
                  issue.tone === 'error'
                    ? 'border-red-500/30 bg-red-500/10 text-red-100'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                )}
                data-testid="scrib-runtime-issue"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="mr-1 rounded border border-slate-600/50 bg-slate-950/50 px-1 text-[10px] uppercase tracking-normal text-slate-300">
                      {formatRuntimeIssueSource(issue.source)}
                    </span>
                    <span className="font-medium">{issue.title}</span>
                    <span className="mx-1 text-slate-500">|</span>
                    <span className="break-all font-mono">{issue.scriptId}</span>
                    <span className="mx-1 text-slate-500">|</span>
                    <span>{issue.detail}</span>
                    {issue.retryAt && <span className="ml-1 text-slate-400">retry: {issue.retryAt}</span>}
                    <span className={cn('ml-1', verificationTone(issue.verification))}>
                      {formatVerificationSummary(issue.verification)}
                    </span>
                  </div>
                  {issue.action === 'verify-artifact' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 text-[11px]"
                      onClick={() => void verifyRuntimeArtifact(issue.scriptId)}
                      disabled={verifyingArtifactPath !== null}
                      data-testid="scrib-runtime-issue-verify"
                      title={`Recompilar artifact revisado para ${issue.scriptId}`}
                    >
                      {verifyingArtifactPath === issue.scriptId ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <TerminalSquare className="h-3 w-3 mr-1" />
                      )}
                      Verificar artifact
                    </Button>
                  )}
                  {issue.action === 'retry-runtime' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 text-[11px]"
                      onClick={() => void retryRuntimeScript(issue.scriptId)}
                      disabled={retryingRuntimePath !== null}
                      data-testid="scrib-runtime-issue-retry-runtime"
                      title={`Reintentar runtime para ${issue.scriptId}`}
                    >
                      {retryingRuntimePath === issue.scriptId ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Reintentar runtime
                    </Button>
                  )}
                  {issue.action === 'retry-node' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 text-[11px]"
                      onClick={() => void retryBlockedScribNode(issue)}
                      disabled={recoveringNodeId !== null}
                      data-testid="scrib-runtime-issue-retry-node"
                      title={`Reactivar node ${issue.nodeId || issue.scriptId}`}
                    >
                      {recoveringNodeId === (issue.nodeId || issue.scriptId) ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      Reactivar node
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {activeTab === 'create' && (
          <div className="p-3 space-y-3">
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
              <div>
                <p className="text-xs text-slate-400">Paso 1: Elige el destino</p>
                <select
                  value={createTargetType}
                  onChange={(event) => setCreateTargetType(event.target.value as CreateTargetType)}
                  className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                >
                  {CREATE_TARGET_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-400">Paso 2: Elige la capacidad</p>
                <select
                  value={createCapability}
                  onChange={(event) => setCreateCapability(asScribType(event.target.value))}
                  className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                >
                  {defs.map((def) => (
                    <option key={def.type} value={def.type}>{def.type} ({def.kind})</option>
                  ))}
                </select>
              </div>
              {createTargetType !== 'scene' && (
                <div>
                  <p className="text-xs text-slate-400">Entidad destino</p>
                  <select
                    value={createTargetEntityId || ''}
                    onChange={(event) => setCreateTargetEntityId(event.target.value || null)}
                    className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                  >
                    <option value="">Seleccionar entidad</option>
                    {Array.from(entities.values()).map((entity) => (
                      <option key={entity.id} value={entity.id}>{entity.name} ({entity.id})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">Paso 3: Ajusta la configuración</p>
                <Textarea
                  value={createConfigText}
                  onChange={(event) => setCreateConfigText(event.target.value)}
                  className="mt-1 min-h-24 border-slate-700 bg-slate-900 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Usa JSON puro (sin comillas externas). Ejemplo: {"{"}"speed":5, "debug":true{"}"}.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleCreateScrib} disabled={createLoading}>
                {createLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Paso 4: Guardar
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'assign' && (
          <div className="p-3 h-full">
            <div className="grid h-full min-h-0 grid-cols-2 gap-3">
              <div className="rounded border border-slate-800 bg-slate-950 min-h-0 flex flex-col">
                <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">Árbol de escena</div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => setAssignTargetKey('scene')}
                      className={cn(
                        'w-full rounded border px-2 py-1.5 text-left text-xs',
                        assignTargetKey === 'scene' ? 'border-blue-500/60 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-900 text-slate-300'
                      )}
                    >
                      Escena: {activeSceneName || 'sin escena'}
                    </button>
                    {Array.from(entities.values()).map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => setAssignTargetKey(entity.id)}
                        className={cn(
                          'w-full rounded border px-2 py-1.5 text-left text-xs',
                          assignTargetKey === entity.id ? 'border-blue-500/60 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-900 text-slate-300'
                        )}
                      >
                        {entity.name}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
                <div className="text-xs text-slate-400">Capacidades</div>
                <select
                  value={assignType}
                  onChange={(event) => setAssignType(asScribType(event.target.value))}
                  className="h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                  data-testid="scrib-assign-type"
                >
                  {defs.map((def) => (
                    <option key={def.type} value={def.type}>{def.type} ({def.kind})</option>
                  ))}
                </select>
                <Textarea
                  value={assignConfigText}
                  onChange={(event) => setAssignConfigText(event.target.value)}
                  className="min-h-24 border-slate-700 bg-slate-900 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500">
                  Este bloque es la config del Scrib para ese target (entidad o escena).
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAssignScrib}
                  disabled={assignLoading}
                  data-testid="scrib-assign-action"
                >
                  {assignLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  Asignar
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="flex h-full">
            <div className="w-80 border-r border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-4 w-4 text-cyan-300" />
                  <p className="text-sm text-slate-200">Editar archivos</p>
                </div>
                <div className="relative">
                  <Search className="h-3 w-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                  <Input
                    value={scriptSearch}
                    onChange={(event) => setScriptSearch(event.target.value)}
                    className="h-8 pl-6 text-xs border-slate-700 bg-slate-900"
                    placeholder="buscar"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newScriptName}
                    onChange={(event) => setNewScriptName(event.target.value)}
                    className="h-8 text-xs border-slate-700 bg-slate-900"
                    placeholder="scribs/movement.scrib.ts"
                  />
                  <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={createScript}>
                    <Plus className="h-3 w-3 mr-1" />
                    Nuevo
                  </Button>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs w-full" onClick={loadScripts} disabled={loadingList}>
                  <RefreshCw className={cn('h-3 w-3 mr-1', loadingList && 'animate-spin')} />
                  Actualizar
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {filteredScripts.map((item) => (
                    <button
                      key={item.relativePath}
                      onClick={() => openScript(item.relativePath)}
                      className={cn(
                        'w-full rounded border px-2 py-2 text-left text-xs',
                        selectedPath === item.relativePath ? 'border-blue-500/60 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-900 text-slate-300'
                      )}
                    >
                      <div>{item.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{item.relativePath}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="border-b border-slate-800 px-3 py-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={saveScript} disabled={!selectedPath || saving}>
                  {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  guardar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => void applySelectedScrib('entity')}
                  disabled={!selectedScribType || !selectedEntityId || applyingScrib !== null}
                  title={selectedScribType ? 'Aplicar scrib abierto a la entidad seleccionada' : 'Abre un *.scrib.ts para aplicar'}
                >
                  {applyingScrib === 'entity' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  usar en entidad
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => void applySelectedScrib('scene')}
                  disabled={!selectedScribType || !activeSceneId || applyingScrib !== null}
                  title={selectedScribType ? 'Aplicar scrib abierto a la escena activa' : 'Abre un *.scrib.ts para aplicar'}
                >
                  {applyingScrib === 'scene' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  usar en escena
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reloadScript} disabled={!selectedPath || loadingScript}>
                  <RefreshCw className={cn('h-3 w-3 mr-1', loadingScript && 'animate-spin')} />
                  actualizar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={duplicateScript} disabled={!selectedPath || duplicating}>
                  {duplicating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                  duplicar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={deleteScript} disabled={!selectedPath || deleting}>
                  {deleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                  eliminar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={compileScript} disabled={!selectedPath || compiling}>
                  {compiling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <TerminalSquare className="h-3 w-3 mr-1" />}
                  verificar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={bindScriptToEntity} disabled={!selectedPath || !selectedEntityId}>
                  <Link2 className="h-3 w-3 mr-1" />
                  vincular script
                </Button>
              </div>
              <div className="flex-1 min-h-0 p-3">
                <Textarea
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    if (selectedPath) setDirty(true);
                  }}
                  className="h-full min-h-full resize-none border-slate-700 bg-slate-950 font-mono text-xs"
                  placeholder="Abre un script para editar"
                  disabled={!selectedPath}
                />
                {selectedPath && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Archivo activo: {selectedPath}. Aquí puedes editar el comportamiento del script.
                  </p>
                )}
              </div>
              <div className="border-t border-slate-800 px-3 py-2 text-[11px]">
                {!compileResult && <span className="text-slate-500">Sin revisión</span>}
                {compileResult && (
                  <span className={compileResult.ok ? 'text-green-300' : 'text-red-300'}>
                    {compileResult.ok ? 'Script listo' : 'Revisión con ajustes'} ({compileResult.diagnostics.length})
                  </span>
                )}
                {dirty && <span className="text-amber-300 ml-2">cambios sin guardar</span>}
                {selectedScribType && <span className="text-cyan-300 ml-2">scrib detectado: {selectedScribType}</span>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="p-3 space-y-3 h-full">
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <LibraryBig className="h-4 w-4 text-cyan-300" />
                <p className="text-sm text-slate-200">Biblioteca Scrib</p>
              </div>
              <div className="relative">
                <Search className="h-3 w-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                <Input
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                  className="h-8 pl-6 text-xs border-slate-700 bg-slate-900"
                  placeholder="filtrar"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={libraryScope === 'entity' ? 'secondary' : 'outline'} className="h-7 text-xs" onClick={() => setLibraryScope('entity')}>
                  Entidad
                </Button>
                <Button size="sm" variant={libraryScope === 'scene' ? 'secondary' : 'outline'} className="h-7 text-xs" onClick={() => setLibraryScope('scene')}>
                  Escena
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-152px)] rounded border border-slate-800 bg-slate-950">
              <div className="p-2 space-y-2">
                {filteredLibrary.map((def) => (
                  <div key={def.type} className="rounded border border-slate-800 bg-slate-900 p-2">
                    <div className="flex justify-between items-center gap-2">
                      <div>
                        <p className="text-xs text-slate-200">{def.type}</p>
                        <p className="text-[11px] text-slate-500">{def.kind}</p>
                      </div>
                      <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => handleLibraryAssign(def.type)} disabled={libraryLoading}>
                        Usar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="text-[11px] text-slate-500">
              Atomic: {atomicDefs.length} | Recipes: {composedDefs.length} | Entity scribs: {entityScribs.length} | Scene scribs: {sceneScribs.length}
            </div>
          </div>
        )}

        {activeTab === 'console' && (
          <div className="h-full p-3 space-y-3">
            <div className="rounded border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center gap-2 mb-2">
                <TerminalSquare className="h-4 w-4 text-cyan-300" />
                <p className="text-sm text-slate-200">Consola Scrib</p>
              </div>
              <Textarea
                value={consoleInput}
                onChange={(event) => setConsoleInput(event.target.value)}
                className="min-h-24 border-slate-700 bg-slate-900 font-mono text-xs"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="secondary" onClick={runConsole} disabled={consoleLoading}>
                  {consoleLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <TerminalSquare className="h-3 w-3 mr-1" />}
                  Ejecutar
                </Button>
                <Button size="sm" variant="outline" onClick={() => void refreshRuntimeState()} disabled={runtimeRefreshing}>
                  <RefreshCw className={cn('h-3 w-3 mr-1', runtimeRefreshing && 'animate-spin')} />
                  Runtime
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConsoleLogs([])}>
                  Limpiar
                </Button>
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-200">Estado operativo del runtime</p>
                <span className={cn('rounded border px-2 py-0.5 text-[11px]', healthTone(Boolean(runtimeHealthAvailable)))}>
                  {runtimeHealthAvailable ? 'runtime listo' : 'runtime degradado'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-slate-300">
                  Policy: {runtimeHealth?.enabled ? 'activa' : 'desactivada'} | Artifacts: {runtimeHealth?.reviewedArtifactsRequired ? 'requeridos' : 'opcionales'}
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-slate-300">
                  Multiinstancia: {formatRuntimeMultiInstanceMode(runtimeHealth?.multiInstanceMode)} | Aislamiento: {runtimeHealth?.executionIsolation || 'sin definir'}
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-slate-300">
                  Source storage: {formatStorageMode(runtimeHealth?.sourceStorageMode)} ({runtimeHealth?.sourceStorageAvailable ? 'ok' : 'fallando'})
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-slate-300">
                  Artifact storage: {formatStorageMode(runtimeHealth?.artifactStorageMode)} ({runtimeHealth?.artifactStorageAvailable ? 'ok' : 'fallando'})
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-slate-300">
                  Heartbeat local: {runtimeDiagnostics?.instance.heartbeatStatus || 'idle'} | Último sync: {runtimeDiagnostics?.instance.lastHeartbeatAt || 'nunca'}
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-slate-300">
                  Coordinación: {runtimeLive?.coordinationMode || 'sin datos'} ({runtimeLive?.storageMode || 'n/a'}) | Ownership: {runtimeLive?.ownershipMode || 'sin datos'} | TTL: {runtimeLive?.heartbeatTtlMs || 0}ms
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
                  Instancias vivas: {runtimeLive?.activeSessions || 0} | Playing: {runtimeLive?.playingSessions || 0} | Stale: {runtimeLive?.staleSessions || 0}
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
                  Sesión actual: {currentRuntimeSession ? formatPlayState(currentRuntimeSession.playState) : 'sin heartbeat'} | Presente: {runtimeLive?.currentSessionPresent ? 'sí' : 'no'}
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
                  Lease: {runtimeLive?.lease?.status || 'sin datos'} | Owner: {runtimeLive?.lease?.ownerInstanceId || 'ninguno'}
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
                  Lease sesión actual: {runtimeLive?.currentSessionOwnsLease ? 'sí' : 'no'} | Instancia actual: {runtimeLive?.currentInstanceOwnsLease ? 'sí' : 'no'}
                </div>
              </div>

              {runtimeDiagnostics?.instance.lastHeartbeatError && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-200">
                  Último error de heartbeat: {runtimeDiagnostics.instance.lastHeartbeatError}
                </div>
              )}

              {(runtimeDiagnostics?.pauses.authBlockedUntil || runtimeDiagnostics?.pauses.serverBlockedUntil) && (
                <div
                  className="rounded border border-red-500/30 bg-red-500/10 px-2 py-2 text-[11px] text-red-200"
                  data-testid="scrib-runtime-backoff-pauses"
                >
                  Backoff global:
                  {runtimeDiagnostics.pauses.authBlockedUntil ? ` auth hasta ${runtimeDiagnostics.pauses.authBlockedUntil}` : ''}
                  {runtimeDiagnostics.pauses.serverBlockedUntil ? ` server hasta ${runtimeDiagnostics.pauses.serverBlockedUntil}` : ''}
                </div>
              )}

              <div className="space-y-2" data-testid="runtime-fault-ledger">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">Runtime Fault Ledger</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {(['all', 'P0', 'P1', 'P2'] as const).map((severity) => (
                      <Button
                        key={severity}
                        size="sm"
                        variant={runtimeLedgerFilter === severity ? 'secondary' : 'outline'}
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setRuntimeLedgerFilter(severity)}
                        data-testid={`runtime-fault-ledger-filter-${severity}`}
                      >
                        {severity === 'all' ? 'All' : severity}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={exportRuntimeFaultLedgerCsv}
                      disabled={filteredRuntimeFaultLedger.length === 0}
                      data-testid="runtime-fault-ledger-export"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      CSV
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  {filteredRuntimeFaultLedger.length === 0 && (
                    <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-500">
                      Sin fallos activos de runtime.
                    </div>
                  )}
                  {filteredRuntimeFaultLedger.map((item) => (
                    <div
                      key={item.key}
                      className={cn(
                        'rounded border px-2 py-1.5 text-[11px]',
                        item.severity === 'P0' && 'border-red-500/30 bg-red-500/10 text-red-100',
                        item.severity === 'P1' && 'border-amber-500/30 bg-amber-500/10 text-amber-100',
                        item.severity === 'P2' && 'border-slate-700 bg-slate-900 text-slate-300'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="rounded border border-slate-600/50 bg-slate-950/50 px-1 text-[10px]">
                          {item.severity}
                        </span>
                        {item.severity === 'P0' && currentLedgerReappearedP0Targets.has(item.target) && (
                          <span
                            className="rounded border border-red-300/40 bg-red-300/10 px-1 text-[10px] text-red-100"
                            data-testid="runtime-fault-ledger-reappeared"
                          >
                            P0 reaparecido
                          </span>
                        )}
                        <span className="rounded border border-slate-600/50 bg-slate-950/50 px-1 text-[10px]">
                          {formatRuntimeIssueSource(item.source)}
                        </span>
                        <span className="break-all font-mono">{item.target}</span>
                        <span className="text-slate-500">|</span>
                        <span>{item.state}</span>
                        <span className="text-slate-500">|</span>
                        <span>{formatRuntimeAction(item.action)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto h-6 px-2 text-[10px]"
                          onClick={() => runRuntimeFaultLedgerAction(item)}
                          disabled={verifyingArtifactPath !== null || retryingRuntimePath !== null || recoveringNodeId !== null}
                          data-testid="runtime-fault-ledger-action"
                        >
                          {formatRuntimeAction(item.action)}
                        </Button>
                      </div>
                      <div className="mt-0.5 text-[10px] opacity-80">{item.detail}</div>
                      <div className={cn('text-[10px]', verificationTone(item.verification))}>
                        {formatVerificationSummary(item.verification)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2" data-testid="runtime-fault-ledger-history">
                <div className="grid gap-2">
                  <p className="text-[11px] text-slate-500">Historial Ledger</p>
                  <div className="grid w-full grid-cols-2 gap-1 md:grid-cols-5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-full overflow-hidden px-2 text-[10px]"
                      onClick={() => void loadRuntimeFaultLedgerHistory()}
                      disabled={runtimeLedgerHistoryLoading}
                      data-testid="runtime-fault-ledger-history-refresh"
                    >
                      <RefreshCw className={cn('h-3 w-3 mr-1', runtimeLedgerHistoryLoading && 'animate-spin')} />
                      Historial
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-full overflow-hidden px-2 text-[10px]"
                      onClick={() => void exportRuntimeFaultLedgerHistory('csv')}
                      disabled={runtimeLedgerHistory.length === 0}
                      data-testid="runtime-fault-ledger-history-export"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-full overflow-hidden px-2 text-[10px]"
                      onClick={() => void exportRuntimeFaultLedgerHistory('json')}
                      disabled={runtimeLedgerHistory.length === 0}
                      data-testid="runtime-fault-ledger-history-export-json"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-full overflow-hidden px-2 text-[10px]"
                      onClick={() => void dryRunRuntimeFaultLedgerHistory()}
                      disabled={runtimeLedgerDryRunning}
                      data-testid="runtime-fault-ledger-dry-run"
                    >
                      {runtimeLedgerDryRunning ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Search className="h-3 w-3 mr-1" />
                      )}
                      Dry run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-full overflow-hidden px-2 text-[10px]"
                      onClick={() => void pruneRuntimeFaultLedgerHistory()}
                      disabled={runtimeLedgerPruning}
                      data-testid="runtime-fault-ledger-prune"
                    >
                      {runtimeLedgerPruning ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3 mr-1" />
                      )}
                      Prune now
                    </Button>
                  </div>
                </div>
                <div
                  className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300"
                  data-testid="runtime-fault-ledger-retention"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-200">Retención forense</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        fuente: {runtimeLedgerRetentionPolicy?.source || 'n/a'}
                        {runtimeLedgerRetentionPolicy?.updatedAt ? ` | editada: ${runtimeLedgerRetentionPolicy.updatedAt}` : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => void saveRuntimeFaultLedgerRetentionPolicy()}
                      disabled={runtimeLedgerPolicySaving}
                      data-testid="runtime-fault-ledger-policy-save"
                    >
                      {runtimeLedgerPolicySaving ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3 mr-1" />
                      )}
                      Guardar política
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <Input
                      value={runtimeLedgerRetentionDraft.maxSnapshots}
                      onChange={(event) =>
                        setRuntimeLedgerRetentionDraft((current) => ({
                          ...current,
                          maxSnapshots: event.target.value,
                        }))
                      }
                      type="number"
                      min={0}
                      className="h-8 border-slate-700 bg-slate-950 text-[11px]"
                      data-testid="runtime-fault-ledger-policy-max"
                      aria-label="Máximo snapshots ledger"
                    />
                    <Input
                      value={runtimeLedgerRetentionDraft.maxAgeDays}
                      onChange={(event) =>
                        setRuntimeLedgerRetentionDraft((current) => ({
                          ...current,
                          maxAgeDays: event.target.value,
                        }))
                      }
                      type="number"
                      min={0}
                      className="h-8 border-slate-700 bg-slate-950 text-[11px]"
                      data-testid="runtime-fault-ledger-policy-days"
                      aria-label="Máximo días ledger"
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    max snapshots: {runtimeLedgerRetentionPolicy?.maxSnapshots ?? 'n/a'} | max días: {runtimeLedgerRetentionPolicy?.maxAgeDays ?? 'n/a'}
                    {runtimeLedgerPruneSummary
                      ? runtimeLedgerPruneSummary.dryRun
                        ? ` | dry run: ${runtimeLedgerPruneSummary.wouldDelete} candidatos, ${runtimeLedgerPruneSummary.retained} retenidos`
                        : ` | último prune: ${runtimeLedgerPruneSummary.deleted} borrados, ${runtimeLedgerPruneSummary.retained} retenidos`
                      : ''}
                  </div>
                  {runtimeLedgerPruneSummary && runtimeLedgerPruneSummary.candidates.length > 0 && (
                    <div className="mt-2 space-y-1" data-testid="runtime-fault-ledger-prune-candidates">
                      {runtimeLedgerPruneSummary.candidates.slice(0, 3).map((candidate) => (
                        <div key={candidate.id} className="break-all rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-400">
                          {candidate.reason}: {candidate.generatedAt} | {candidate.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {runtimeLedgerPruneAudit.length > 0 && (
                    <div className="mt-2 space-y-1" data-testid="runtime-fault-ledger-prune-audit">
                      <div className="text-[10px] text-slate-500">Audit prune</div>
                      {runtimeLedgerPruneAudit.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-400">
                          {entry.dryRun ? 'dry run' : 'prune'} | {entry.createdAt} | would {entry.wouldDelete} | deleted {entry.deleted}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className="grid grid-cols-2 gap-1 md:grid-cols-[80px_minmax(0,1fr)_130px_130px]"
                  data-testid="runtime-fault-ledger-history-filters"
                >
                  <select
                    value={runtimeLedgerCsvSeverity}
                    onChange={(event) => setRuntimeLedgerCsvSeverity(event.target.value as typeof runtimeLedgerCsvSeverity)}
                    className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-200"
                    data-testid="runtime-fault-ledger-history-severity"
                    aria-label="Severidad CSV histórico"
                  >
                    <option value="all">Todo</option>
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                  </select>
                  <Input
                    value={runtimeLedgerCsvTarget}
                    onChange={(event) => setRuntimeLedgerCsvTarget(event.target.value)}
                    placeholder="target"
                    className="h-8 border-slate-700 bg-slate-900 text-[11px]"
                    data-testid="runtime-fault-ledger-history-target"
                    aria-label="Target CSV histórico"
                  />
                  <Input
                    value={runtimeLedgerCsvFrom}
                    onChange={(event) => setRuntimeLedgerCsvFrom(event.target.value)}
                    type="date"
                    className="h-8 border-slate-700 bg-slate-900 text-[11px]"
                    data-testid="runtime-fault-ledger-history-from"
                    aria-label="Desde CSV histórico"
                  />
                  <Input
                    value={runtimeLedgerCsvTo}
                    onChange={(event) => setRuntimeLedgerCsvTo(event.target.value)}
                    type="date"
                    className="h-8 border-slate-700 bg-slate-900 text-[11px]"
                    data-testid="runtime-fault-ledger-history-to"
                    aria-label="Hasta CSV histórico"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  <div className="space-y-1">
                    {runtimeLedgerHistory.length === 0 && (
                      <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-500">
                        Sin snapshots históricos todavía.
                      </div>
                    )}
                    {runtimeLedgerHistory.length > 0 && (
                      <select
                        value={selectedLedgerSnapshot?.id || ''}
                        onChange={(event) => setSelectedLedgerSnapshotId(event.target.value)}
                        className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-200"
                        data-testid="runtime-fault-ledger-history-select"
                      >
                        {runtimeLedgerHistory.map((snapshot) => (
                          <option key={snapshot.id} value={snapshot.id}>
                            {snapshot.generatedAt} | P0 {snapshot.p0Count} | total {snapshot.itemCount}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedLedgerSnapshot && (
                      <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
                        <div className="font-medium">{selectedLedgerSnapshot.id}</div>
                        <div className="text-[10px] opacity-80">
                          {selectedLedgerSnapshot.generatedAt} | {selectedLedgerSnapshot.playState} | P0 {selectedLedgerSnapshot.p0Count} | P1 {selectedLedgerSnapshot.p1Count} | P2 {selectedLedgerSnapshot.p2Count}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
                    <div className="font-medium text-slate-200">Diff P0</div>
                    <div className="mt-1 grid gap-1 text-[10px]">
                      <div className="text-red-200">
                        reaparecidos: {ledgerSnapshotDiff.reappearedP0.length > 0 ? ledgerSnapshotDiff.reappearedP0.join(', ') : 'ninguno'}
                      </div>
                      <div className="text-amber-200">
                        nuevos: {ledgerSnapshotDiff.newP0.length > 0 ? ledgerSnapshotDiff.newP0.join(', ') : 'ninguno'}
                      </div>
                      <div className="text-slate-400">
                        persistentes: {ledgerSnapshotDiff.persistentP0.length > 0 ? ledgerSnapshotDiff.persistentP0.join(', ') : 'ninguno'}
                      </div>
                      <div className="text-green-300">
                        resueltos: {ledgerSnapshotDiff.resolvedP0.length > 0 ? ledgerSnapshotDiff.resolvedP0.join(', ') : 'ninguno'}
                      </div>
                    </div>
                  </div>
                </div>
                {selectedLedgerSnapshot && (selectedLedgerSnapshot.items || []).length > 0 && (
                  <div className="space-y-1">
                    {(selectedLedgerSnapshot.items || []).slice(0, 4).map((item, index) => (
                      <div
                        key={`${selectedLedgerSnapshot.id}-${item.target}-${index}`}
                        className={cn(
                          'rounded border px-2 py-1.5 text-[11px]',
                          item.severity === 'P0' && 'border-red-500/30 bg-red-500/10 text-red-100',
                          item.severity === 'P1' && 'border-amber-500/30 bg-amber-500/10 text-amber-100',
                          item.severity === 'P2' && 'border-slate-700 bg-slate-900 text-slate-300'
                        )}
                      >
                        <span className="mr-1 rounded border border-slate-600/50 bg-slate-950/50 px-1 text-[10px]">
                          {item.severity}
                        </span>
                        <span className="break-all font-mono">{item.target}</span>
                        <span className="mx-1 text-slate-500">|</span>
                        <span>{item.state}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-1" data-testid="runtime-fault-ledger-timeline">
                  <p className="text-[11px] text-slate-500">Timeline target</p>
                  {runtimeFaultTimeline.length === 0 && (
                    <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-500">
                      Sin targets para timeline.
                    </div>
                  )}
                  {runtimeFaultTimeline.map((row) => (
                    <div
                      key={row.target}
                      className="pointer-events-none relative rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300"
                    >
                      <div className="pointer-events-none break-all font-mono text-[10px] leading-4">{row.target}</div>
                      <div className="relative z-10 mt-1 flex min-h-5 flex-wrap gap-1">
                        {row.points.map((point) => (
                          <button
                            key={point.key}
                            type="button"
                            onClick={() => {
                              if (point.snapshotId) setSelectedLedgerSnapshotId(point.snapshotId);
                            }}
                            disabled={!point.snapshotId}
                            className={cn(
                              'pointer-events-auto relative z-20 min-h-5 rounded border px-1 py-0.5 text-[10px] leading-3 transition-colors',
                              point.severity === 'P0' && 'border-red-500/30 bg-red-500/10 text-red-100',
                              point.severity === 'P1' && 'border-amber-500/30 bg-amber-500/10 text-amber-100',
                              point.severity === 'P2' && 'border-slate-600 bg-slate-800 text-slate-300',
                              !point.severity && 'border-green-500/20 bg-green-500/10 text-green-300',
                              point.snapshotId && 'hover:border-cyan-300/50 hover:text-cyan-100',
                              point.snapshotId === selectedLedgerSnapshot?.id && 'ring-1 ring-cyan-300/60',
                              !point.snapshotId && 'cursor-default opacity-75'
                            )}
                            title={point.severity ? `${point.label}: ${point.severity}` : `${point.label}: clear`}
                            data-testid="runtime-fault-ledger-timeline-chip"
                          >
                            {point.label}:{point.severity || 'OK'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedPath && (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-500">Script activo en foco</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className={cn('rounded border px-2 py-2 text-[11px]', runtimeStatusTone(selectedRuntimeStatus?.status || 'error'))}>
                      Exec: {selectedRuntimeStatus?.status || 'sin estado'} | retries: {selectedRuntimeStatus?.failures || 0}
                      {selectedRuntimeStatus?.retryAt ? ` | next: ${selectedRuntimeStatus.retryAt}` : ''}
                    </div>
                    <div className={cn('rounded border px-2 py-2 text-[11px]', artifactStatusTone(selectedArtifactStatus?.status || 'error'))}>
                      Artifact: {selectedArtifactStatus?.status || 'sin artifact'} | hash: {selectedArtifactStatus?.compiledHash || 'n/a'}
                    </div>
                  </div>
                  <div className={cn('rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px]', verificationTone(selectedVerificationStatus))}>
                    {formatVerificationSummary(selectedVerificationStatus)}
                    {selectedVerificationStatus?.lastVerifiedAt ? ` | última: ${selectedVerificationStatus.lastVerifiedAt}` : ''}
                    {selectedVerificationStatus?.lastMessage ? ` | ${selectedVerificationStatus.lastMessage}` : ''}
                  </div>
                  {selectedRuntimeStatus?.lastError && (
                    <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-2 text-[11px] text-red-200">
                      Último error: {selectedRuntimeStatus.lastError}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] text-slate-500">Sesiones recientes del runtime</p>
                <div className="space-y-1">
                  {(runtimeLive?.sessions || []).length === 0 && (
                    <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-500">
                      Sin heartbeats recientes del runtime.
                    </div>
                  )}
                  {(runtimeLive?.sessions || []).map((session) => (
                    <div
                      key={session.instanceId}
                      className={cn(
                        'rounded border px-2 py-2 text-[11px]',
                        session.stale
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                          : session.currentSession
                            ? 'border-green-500/30 bg-green-500/10 text-green-200'
                            : 'border-slate-800 bg-slate-900 text-slate-300'
                      )}
                    >
                      <div className="font-medium">
                        {session.currentSession ? 'esta sesión' : session.instanceId}
                      </div>
                      <div className="text-[10px] opacity-80">
                        state: {formatPlayState(session.playState)} | scripts: {session.activeEntityScripts} | scribs: {session.activeScribNodes}
                      </div>
                      <div className="text-[10px] opacity-80">
                        heartbeat: {session.heartbeatAt} | {session.stale ? 'stale' : 'fresh'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2" data-testid="scrib-runtime-scrib-statuses">
                  <p className="text-[11px] text-cyan-300">Scrib nodes / artifacts</p>
                  <div className="space-y-1">
                    {visibleScribRuntimeStatuses.length === 0 &&
                      (runtimeDiagnostics?.composer.disabledScribNodes || []).length === 0 &&
                      visibleScribRuntimeEvents.length === 0 && (
                      <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-500">
                        Sin problemas Scrib instrumentados todavía.
                      </div>
                    )}
                    {visibleScribRuntimeStatuses.map((item) => {
                      const verification = verificationByScript.get(item.scriptId) || null;
                      return (
                        <div key={item.scriptId} className={cn('rounded border px-2 py-2 text-[11px]', runtimeStatusTone(item.status))}>
                          <div className="font-medium">{item.scriptId}</div>
                          <div className="text-[10px] opacity-80">
                            status: {item.status} | failures: {item.failures} | last: {item.lastStatusCode ?? 'n/a'}
                          </div>
                          <div className={cn('text-[10px]', verificationTone(verification))}>
                            {formatVerificationSummary(verification)}
                          </div>
                        </div>
                      );
                    })}
                    {(runtimeDiagnostics?.composer.disabledScribNodeDetails || []).map((node) => (
                      <div key={node.nodeId} className="rounded border border-red-500/30 bg-red-500/10 px-2 py-2 text-[11px] text-red-200">
                        <div className="font-medium">node bloqueado</div>
                        <div className="break-all text-[10px] opacity-80">{node.nodeId}</div>
                        <div className="break-all text-[10px] opacity-80">
                          code: {node.code || 'sin code'} | type: {node.scribType || 'n/a'} | source: {node.sourceScribId || 'n/a'}
                        </div>
                      </div>
                    ))}
                    {visibleScribRuntimeEvents.map((event) => (
                      <div key={event.id} className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-2 text-[11px] text-cyan-100">
                        <div className="font-medium">{event.kind}</div>
                        <div className="break-all">{event.scriptId || event.nodeId || 'scrib-runtime'}</div>
                        <div className="text-[10px] text-cyan-200/80">{event.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2" data-testid="scrib-runtime-legacy-statuses">
                  <p className="text-[11px] text-violet-300">Legacy scripts</p>
                  <div className="space-y-1">
                    {visibleLegacyRuntimeStatuses.length === 0 && visibleLegacyRuntimeEvents.length === 0 && (
                      <div className="rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-500">
                        Sin problemas legacy instrumentados todavía.
                      </div>
                    )}
                    {visibleLegacyRuntimeStatuses.map((item) => {
                      const verification = verificationByScript.get(item.scriptId) || null;
                      return (
                        <div key={item.scriptId} className={cn('rounded border px-2 py-2 text-[11px]', runtimeStatusTone(item.status))}>
                          <div className="font-medium">{item.scriptId}</div>
                          <div className="text-[10px] opacity-80">
                            status: {item.status} | failures: {item.failures} | last: {item.lastStatusCode ?? 'n/a'}
                          </div>
                          <div className={cn('text-[10px]', verificationTone(verification))}>
                            {formatVerificationSummary(verification)}
                          </div>
                        </div>
                      );
                    })}
                    {visibleLegacyRuntimeEvents.map((event) => (
                      <div key={event.id} className="rounded border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-[11px] text-violet-100">
                        <div className="font-medium">{event.kind}</div>
                        <div className="break-all">{event.scriptId || event.nodeId || 'legacy-runtime'}</div>
                        <div className="text-[10px] text-violet-200/80">{event.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-180px)] rounded border border-slate-800 bg-slate-950">
              <div className="p-2 space-y-1">
                {consoleLogs.length === 0 && <p className="text-[11px] text-slate-500">Usa help para ver comandos.</p>}
                {consoleLogs.map((line) => (
                  <div
                    key={line.id}
                    className={cn(
                      'rounded border px-2 py-1 text-[11px]',
                      line.level === 'success' && 'border-green-500/30 bg-green-500/10 text-green-200',
                      line.level === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                      line.level === 'error' && 'border-red-500/30 bg-red-500/10 text-red-200',
                      line.level === 'info' && 'border-slate-700 bg-slate-900 text-slate-300'
                    )}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
        {status} | Rol: {sessionRole || 'anonimo'} | Entidad: {selectedEntityName || 'ninguna'} | Escena: {activeSceneName || 'ninguna'}
      </div>
    </div>
  );
}
