import crypto from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import {
  createAgentPlannerRecord,
  type AgentPlannerRecord,
} from '@/engine/ai/agentPlanner';
import type { EditorProjectSaveSummary } from '@/engine/serialization';
import { normalizeProjectKey, sanitizeProjectKeySegment } from '@/lib/project-key';
import {
  withAIAgentPlanWriteLock,
  writeAIAgentPlannerRecord,
} from '@/lib/server/ai-agent-plan-storage';
import { readEditorProjectRecord } from '@/lib/server/editor-project-storage';

export type ReviewReanalysisJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ReviewReanalysisBlockDecisionStatus = 'approved' | 'rejected' | 'deferred';

export type ReviewReanalysisDocumentKind =
  | 'markdown'
  | 'text'
  | 'json'
  | 'audit'
  | 'spec'
  | 'unknown';

export type ReviewReanalysisRiskLevel = 'low' | 'medium' | 'high';

export type ReviewReanalysisOriginalDocument = {
  id: string;
  title: string;
  kind: ReviewReanalysisDocumentKind;
  content: string;
  excerpt: string;
  sourcePath: string | null;
  checksum: {
    algorithm: 'sha256';
    value: string;
  };
  detectedTopics: string[];
  receivedAt: string;
};

export type ReviewReanalysisDetectedScope = {
  summary: string;
  focusAreas: string[];
  constraints: string[];
  exclusions: string[];
  confidence: number | null;
  source: string | null;
  tags: string[];
};

export type ReviewReanalysisProjectRevision = {
  projectKey: string;
  slot: string;
  updatedAt: number;
  checksum: {
    algorithm: 'sha256';
    value: string;
  };
  summary: EditorProjectSaveSummary;
  activeSceneId: string | null;
  sceneNames: string[];
  assetNames: string[];
};

export type ReviewReanalysisScopeBlock = {
  id: string;
  title: string;
  kind:
    | 'project_revision'
    | 'document_alignment'
    | 'detected_scope'
    | 'implementation_focus'
    | 'risk'
    | 'acceptance';
  priority: 'low' | 'medium' | 'high';
  status: 'pending_review';
  summary: string;
  evidenceRefs: string[];
  requiredDecisions: string[];
  suggestedOwner: 'human_reviewer' | 'technical_lead' | 'agentic_orchestrator';
};

export type ReviewReanalysisScope = {
  version: 1;
  status: 'draft_review';
  generatedAt: string;
  projectRevision: ReviewReanalysisProjectRevision;
  documents: Array<{
    id: string;
    title: string;
    kind: ReviewReanalysisDocumentKind;
    checksum: {
      algorithm: 'sha256';
      value: string;
    };
    excerpt: string;
    detectedTopics: string[];
  }>;
  detectedScope: ReviewReanalysisDetectedScope;
  reviewBlocks: ReviewReanalysisScopeBlock[];
  acceptanceCriteria: string[];
  recommendedNextActions: string[];
  riskLevel: ReviewReanalysisRiskLevel;
  trace: Array<{
    at: string;
    actor: 'review_reanalysis_worker';
    event: string;
    message: string;
  }>;
};

export type ReviewReanalysisBlockDecision = {
  blockId: string;
  decision: ReviewReanalysisBlockDecisionStatus;
  note: string | null;
  decidedBy: string;
  decidedAt: string;
};

export type ReviewReanalysisPlannerTask = {
  id: string;
  blockId: string;
  title: string;
  summary: string;
  priority: ReviewReanalysisScopeBlock['priority'];
  suggestedOwner: ReviewReanalysisScopeBlock['suggestedOwner'];
  evidenceRefs: string[];
  requiredDecisions: string[];
  status: 'planned';
};

export type ReviewReanalysisPlannerLink = {
  planId: string;
  createdAt: string;
  approvedBlockIds: string[];
  taskIds: string[];
};

export type ReviewReanalysisJob = {
  id: string;
  userId: string;
  projectKey: string;
  slot: string;
  status: ReviewReanalysisJobStatus;
  reason: string | null;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  projectRevision: ReviewReanalysisProjectRevision;
  originalDocuments: ReviewReanalysisOriginalDocument[];
  detectedScope: ReviewReanalysisDetectedScope;
  scope: ReviewReanalysisScope | null;
  blockDecisions: Record<string, ReviewReanalysisBlockDecision>;
  plannerTasks: ReviewReanalysisPlannerTask[];
  plannerLink: ReviewReanalysisPlannerLink | null;
  error: string | null;
};

export class ReviewReanalysisJobError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ReviewReanalysisJobError';
    this.code = code;
    this.status = status;
  }
}

type UnknownRecord = Record<string, unknown>;

const DEFAULT_SLOT = 'editor_project_current';
const MAX_DOCUMENTS = 12;
const MAX_DOCUMENT_BYTES = 120_000;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildDefaultStorageRoot() {
  if (process.env.NODE_ENV === 'test') {
    const poolId = process.env.VITEST_POOL_ID || 'default';
    return path.join(process.cwd(), '.vitest', 'review-reanalysis', `${process.pid}-${poolId}`);
  }
  return path.join(process.cwd(), 'download', 'review-reanalysis');
}

export function getReviewReanalysisStorageRoot() {
  return process.env.REY30_REVIEW_REANALYSIS_ROOT?.trim() || buildDefaultStorageRoot();
}

function sanitizeSlot(value: string | null | undefined) {
  return sanitizeProjectKeySegment(value || DEFAULT_SLOT) || DEFAULT_SLOT;
}

function getProjectRoot(userId: string, projectKey: string) {
  return path.join(
    getReviewReanalysisStorageRoot(),
    sanitizeProjectKeySegment(userId) || 'anonymous',
    normalizeProjectKey(projectKey)
  );
}

function getJobFilePath(userId: string, projectKey: string, jobId: string) {
  return path.join(
    getProjectRoot(userId, projectKey),
    `${sanitizeProjectKeySegment(jobId) || 'review_reanalysis_job'}.json`
  );
}

function writeJsonAtomic(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      rmSync(filePath, { force: true });
      renameSync(tempPath, filePath);
      return;
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeStringList(value: unknown, limit = 16) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .map((item) => normalizeString(item))
        .filter(Boolean)
        .slice(0, limit)
    ),
  ];
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(1, value));
}

function inferDocumentKind(value: unknown): ReviewReanalysisDocumentKind {
  const kind = normalizeString(value).toLowerCase();
  if (kind === 'markdown' || kind === 'md') return 'markdown';
  if (kind === 'text' || kind === 'txt') return 'text';
  if (kind === 'json') return 'json';
  if (kind === 'audit') return 'audit';
  if (kind === 'spec' || kind === 'scope') return 'spec';
  return 'unknown';
}

function excerpt(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 420 ? `${normalized.slice(0, 420)}...` : normalized;
}

function detectTopics(content: string) {
  const lower = content.toLowerCase();
  const topicMap: Array<[string, string[]]> = [
    ['agentic_orchestration', ['agent', 'orchestrator', 'multiagente', 'multi-agent', 'pipeline']],
    ['tooling', ['tool', 'tools', 'herramienta', 'tool call']],
    ['validation', ['validacion', 'validación', 'validator', 'rechaza', 'approve', 'approved']],
    ['memory_traceability', ['memoria', 'trace', 'traza', 'timeline', 'audit']],
    ['scene_3d', ['escena', 'scene', '3d', 'entidad', 'entity']],
    ['physics', ['physics', 'fisica', 'física', 'collider', 'rigidbody']],
    ['rendering_lighting', ['render', 'lighting', 'iluminacion', 'iluminación', 'niebla']],
    ['build_export', ['build', 'export', 'deploy', 'runtime']],
    ['ui_review', ['ui', 'panel', 'historial', 'debug', 'timeline']],
  ];

  return topicMap
    .filter(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))
    .map(([topic]) => topic);
}

function normalizeOriginalDocuments(value: unknown): ReviewReanalysisOriginalDocument[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ReviewReanalysisJobError(
      'ORIGINAL_DOCUMENTS_REQUIRED',
      'Se requiere al menos un documento original para reanalizar.',
      400
    );
  }
  if (value.length > MAX_DOCUMENTS) {
    throw new ReviewReanalysisJobError(
      'TOO_MANY_ORIGINAL_DOCUMENTS',
      `El reanálisis acepta máximo ${MAX_DOCUMENTS} documentos por job.`,
      400
    );
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new ReviewReanalysisJobError(
        'INVALID_ORIGINAL_DOCUMENT',
        'Cada documento original debe ser un objeto con contenido.',
        400
      );
    }

    const content = normalizeString(entry.content);
    if (!content) {
      throw new ReviewReanalysisJobError(
        'EMPTY_ORIGINAL_DOCUMENT',
        'Cada documento original debe incluir content no vacío.',
        400
      );
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_DOCUMENT_BYTES) {
      throw new ReviewReanalysisJobError(
        'ORIGINAL_DOCUMENT_TOO_LARGE',
        `Un documento original supera ${MAX_DOCUMENT_BYTES} bytes.`,
        413
      );
    }

    const id =
      sanitizeProjectKeySegment(normalizeString(entry.id)) ||
      `doc_${String(index + 1).padStart(2, '0')}`;
    const title = normalizeString(entry.title, `Documento original ${index + 1}`);
    const receivedAt = normalizeString(entry.receivedAt, new Date().toISOString());

    return {
      id,
      title,
      kind: inferDocumentKind(entry.kind),
      content,
      excerpt: excerpt(content),
      sourcePath: normalizeString(entry.sourcePath) || null,
      checksum: {
        algorithm: 'sha256',
        value: sha256(content),
      },
      detectedTopics: detectTopics(content),
      receivedAt,
    };
  });
}

function normalizeDetectedScope(value: unknown): ReviewReanalysisDetectedScope {
  const data = isRecord(value) ? value : {};
  return {
    summary: normalizeString(data.summary, 'Scope detectado pendiente de revisión.'),
    focusAreas: normalizeStringList(data.focusAreas, 24),
    constraints: normalizeStringList(data.constraints, 24),
    exclusions: normalizeStringList(data.exclusions, 24),
    confidence: normalizeConfidence(data.confidence),
    source: normalizeString(data.source) || null,
    tags: normalizeStringList(data.tags, 24),
  };
}

function buildProjectRevision(params: {
  projectKey: string;
  slot: string;
  updatedAt: number;
  summary: EditorProjectSaveSummary;
  saveData: unknown;
}): ReviewReanalysisProjectRevision {
  const snapshot = isRecord(params.saveData) && isRecord(params.saveData.custom)
    ? params.saveData.custom.snapshot
    : null;
  const session = isRecord(snapshot) && isRecord(snapshot.session) ? snapshot.session : null;
  const scenes = Array.isArray(session?.scenes) ? session.scenes : [];
  const assets = Array.isArray(session?.assets) ? session.assets : [];

  return {
    projectKey: normalizeProjectKey(params.projectKey),
    slot: sanitizeSlot(params.slot),
    updatedAt: params.updatedAt,
    checksum: {
      algorithm: 'sha256',
      value: sha256(JSON.stringify(params.saveData)),
    },
    summary: params.summary,
    activeSceneId: normalizeString(session?.activeSceneId) || null,
    sceneNames: scenes
      .map((scene) => (isRecord(scene) ? normalizeString(scene.name) : ''))
      .filter(Boolean)
      .slice(0, 20),
    assetNames: assets
      .map((asset) => (isRecord(asset) ? normalizeString(asset.name) : ''))
      .filter(Boolean)
      .slice(0, 40),
  };
}

function isReviewReanalysisJob(value: unknown): value is ReviewReanalysisJob {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.projectKey === 'string' &&
    typeof value.slot === 'string' &&
    ['queued', 'processing', 'completed', 'failed'].includes(String(value.status)) &&
    Array.isArray(value.originalDocuments) &&
    isRecord(value.projectRevision) &&
    isRecord(value.detectedScope)
  );
}

function normalizePersistedReviewReanalysisJob(value: ReviewReanalysisJob): ReviewReanalysisJob {
  return {
    ...value,
    blockDecisions: isRecord(value.blockDecisions) ? value.blockDecisions as Record<string, ReviewReanalysisBlockDecision> : {},
    plannerTasks: Array.isArray(value.plannerTasks) ? value.plannerTasks : [],
    plannerLink: isRecord(value.plannerLink) ? value.plannerLink as ReviewReanalysisPlannerLink : null,
  };
}

function readJobFile(filePath: string) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    return isReviewReanalysisJob(parsed) ? normalizePersistedReviewReanalysisJob(parsed) : null;
  } catch {
    return null;
  }
}

function writeReviewReanalysisJob(job: ReviewReanalysisJob) {
  writeJsonAtomic(getJobFilePath(job.userId, job.projectKey, job.id), job);
  return job;
}

function chooseRiskLevel(params: {
  documents: ReviewReanalysisOriginalDocument[];
  detectedScope: ReviewReanalysisDetectedScope;
  projectRevision: ReviewReanalysisProjectRevision;
}): ReviewReanalysisRiskLevel {
  const focusSize = params.detectedScope.focusAreas.length;
  const confidence = params.detectedScope.confidence ?? 0.5;
  const hasManyTopics = new Set(params.documents.flatMap((doc) => doc.detectedTopics)).size >= 6;
  if (confidence < 0.5 || focusSize > 8 || hasManyTopics || params.projectRevision.summary.entityCount > 150) {
    return 'high';
  }
  if (confidence < 0.75 || focusSize > 4 || params.documents.length > 3) {
    return 'medium';
  }
  return 'low';
}

function makeBlock(params: Omit<ReviewReanalysisScopeBlock, 'status'>): ReviewReanalysisScopeBlock {
  return {
    ...params,
    status: 'pending_review',
  };
}

function focusBlockFor(area: string, index: number): ReviewReanalysisScopeBlock {
  const normalized = area.toLowerCase();
  const owner = normalized.includes('ui') || normalized.includes('panel')
    ? 'technical_lead'
    : normalized.includes('agent') || normalized.includes('orquest')
      ? 'agentic_orchestrator'
      : 'human_reviewer';

  return makeBlock({
    id: `focus_${index + 1}_${sanitizeProjectKeySegment(area).toLowerCase() || 'scope'}`,
    title: `Revisar foco: ${area}`,
    kind: 'implementation_focus',
    priority: normalized.includes('valid') || normalized.includes('tool') || normalized.includes('persist')
      ? 'high'
      : 'medium',
    summary: `Confirmar que "${area}" pertenece al siguiente ciclo y que no invade trabajo fuera de P2.`,
    evidenceRefs: ['detected_scope.focusAreas', 'original_documents.detectedTopics'],
    requiredDecisions: [
      'aceptar foco',
      'rechazar foco',
      'dividir en fase posterior',
    ],
    suggestedOwner: owner,
  });
}

export function buildReviewableReanalysisScope(job: ReviewReanalysisJob): ReviewReanalysisScope {
  const generatedAt = new Date().toISOString();
  const riskLevel = chooseRiskLevel({
    documents: job.originalDocuments,
    detectedScope: job.detectedScope,
    projectRevision: job.projectRevision,
  });
  const topicCount = new Set(job.originalDocuments.flatMap((doc) => doc.detectedTopics)).size;
  const focusBlocks = job.detectedScope.focusAreas.slice(0, 8).map(focusBlockFor);

  const reviewBlocks: ReviewReanalysisScopeBlock[] = [
    makeBlock({
      id: 'corrected_project_revision',
      title: 'Project corregido usado como base',
      kind: 'project_revision',
      priority: 'high',
      summary: `Reanalizar contra ${job.projectRevision.summary.projectName}: ${job.projectRevision.summary.sceneCount} escena(s), ${job.projectRevision.summary.entityCount} entidad(es), ${job.projectRevision.summary.assetCount} asset(s).`,
      evidenceRefs: ['projectRevision.checksum', 'projectRevision.summary'],
      requiredDecisions: ['confirmar revision correcta', 'rechazar por project desactualizado'],
      suggestedOwner: 'human_reviewer',
    }),
    makeBlock({
      id: 'original_documents_alignment',
      title: 'Alineación con documentos originales',
      kind: 'document_alignment',
      priority: 'high',
      summary: `${job.originalDocuments.length} documento(s) originales preservados con checksum; ${topicCount} tema(s) detectado(s) para contrastar contra el scope.`,
      evidenceRefs: job.originalDocuments.map((doc) => `document:${doc.id}`),
      requiredDecisions: ['aceptar documentos fuente', 'marcar documento faltante', 'marcar contradicción'],
      suggestedOwner: 'technical_lead',
    }),
    makeBlock({
      id: 'detected_scope_review',
      title: 'Scope detectado revisable',
      kind: 'detected_scope',
      priority: 'high',
      summary: job.detectedScope.summary,
      evidenceRefs: ['detectedScope.summary', 'detectedScope.constraints', 'detectedScope.exclusions'],
      requiredDecisions: ['aprobar scope', 'pedir reanálisis más estrecho', 'bloquear por ambigüedad'],
      suggestedOwner: 'human_reviewer',
    }),
    ...focusBlocks,
    makeBlock({
      id: 'risk_gate',
      title: 'Gate de riesgo P2',
      kind: 'risk',
      priority: riskLevel === 'high' ? 'high' : 'medium',
      summary: `Riesgo estimado: ${riskLevel}. No ejecutar mutaciones hasta que el scope revisable esté aceptado.`,
      evidenceRefs: ['projectRevision.summary', 'detectedScope.confidence', 'originalDocuments.detectedTopics'],
      requiredDecisions: ['aceptar riesgo', 'reducir scope', 'separar en P3'],
      suggestedOwner: 'technical_lead',
    }),
    makeBlock({
      id: 'acceptance_gate',
      title: 'Criterios de aceptación del reanálisis',
      kind: 'acceptance',
      priority: 'high',
      summary: 'El resultado de P2 solo queda listo cuando el scope revisable tiene decisiones humanas y trazabilidad al Project corregido.',
      evidenceRefs: ['reviewBlocks', 'acceptanceCriteria'],
      requiredDecisions: ['aprobar para planificación', 'rechazar y reanalizar'],
      suggestedOwner: 'human_reviewer',
    }),
  ];

  return {
    version: 1,
    status: 'draft_review',
    generatedAt,
    projectRevision: job.projectRevision,
    documents: job.originalDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title,
      kind: doc.kind,
      checksum: doc.checksum,
      excerpt: doc.excerpt,
      detectedTopics: doc.detectedTopics,
    })),
    detectedScope: job.detectedScope,
    reviewBlocks,
    acceptanceCriteria: [
      'El Project corregido referenciado por checksum coincide con la versión esperada.',
      'Todos los documentos originales relevantes están presentes y tienen checksum verificable.',
      'El scope detectado tiene decisiones explícitas antes de convertirlo en plan de implementación.',
      'Cualquier ambigüedad queda marcada como bloqueo o se divide a una fase posterior.',
      'P2 no muta escenas, assets ni tools; solo produce scope revisable y trazable.',
    ],
    recommendedNextActions: [
      'Revisar y aprobar/rechazar cada bloque del scope generado.',
      'Convertir solo bloques aprobados en tareas de implementación P2.',
      'Crear un nuevo reanálisis si el Project corregido cambia de checksum.',
    ],
    riskLevel,
    trace: [
      {
        at: generatedAt,
        actor: 'review_reanalysis_worker',
        event: 'scope.generated',
        message: 'Scope revisable generado desde Project corregido, documentos originales y scope detectado.',
      },
    ],
  };
}

export function createReviewReanalysisJob(params: {
  userId: string;
  projectKey: string;
  slot: string;
  originalDocuments: unknown;
  detectedScope: unknown;
  reason?: string | null;
  requestedBy?: string | null;
}) {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  const project = readEditorProjectRecord({
    userId: params.userId,
    projectKey,
    slot,
  });
  if (!project) {
    throw new ReviewReanalysisJobError(
      'CORRECTED_PROJECT_NOT_FOUND',
      'No existe Project corregido persistido para iniciar el reanálisis.',
      409
    );
  }

  const originalDocuments = normalizeOriginalDocuments(params.originalDocuments);
  const detectedScope = normalizeDetectedScope(params.detectedScope);
  const requestedAt = new Date().toISOString();
  const job: ReviewReanalysisJob = {
    id: `review_reanalysis_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    userId: params.userId,
    projectKey,
    slot,
    status: 'queued',
    reason: normalizeString(params.reason) || null,
    requestedBy: normalizeString(params.requestedBy, params.userId),
    requestedAt,
    startedAt: null,
    completedAt: null,
    updatedAt: requestedAt,
    projectRevision: buildProjectRevision({
      projectKey,
      slot,
      updatedAt: project.updatedAt,
      summary: project.summary,
      saveData: project.saveData,
    }),
    originalDocuments,
    detectedScope,
    scope: null,
    blockDecisions: {},
    plannerTasks: [],
    plannerLink: null,
    error: null,
  };

  return writeReviewReanalysisJob(job);
}

export function readReviewReanalysisJob(params: {
  userId: string;
  projectKey: string;
  jobId: string;
}) {
  return readJobFile(
    getJobFilePath(params.userId, normalizeProjectKey(params.projectKey), params.jobId)
  );
}

export function listReviewReanalysisJobs(params: {
  userId: string;
  projectKey: string;
  limit?: number;
}) {
  const root = getProjectRoot(params.userId, normalizeProjectKey(params.projectKey));
  if (!existsSync(root)) {
    return [];
  }
  const limit = Math.max(1, Math.min(100, params.limit ?? 25));
  return readdirSync(root)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => readJobFile(path.join(root, fileName)))
    .flatMap((job) => (job ? [job] : []))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export async function processReviewReanalysisJob(params: {
  userId: string;
  projectKey: string;
  jobId: string;
  force?: boolean;
}) {
  const current = readReviewReanalysisJob(params);
  if (!current) {
    return null;
  }
  if (current.status === 'completed' && !params.force) {
    return current;
  }
  if (current.status === 'processing' && !params.force) {
    return current;
  }

  const startedAt = new Date().toISOString();
  const processing = writeReviewReanalysisJob({
    ...current,
    status: 'processing',
    startedAt,
    updatedAt: startedAt,
    error: null,
  });

  try {
    const scope = buildReviewableReanalysisScope(processing);
    const completedAt = new Date().toISOString();
    return writeReviewReanalysisJob({
      ...processing,
      status: 'completed',
      scope,
      completedAt,
      updatedAt: completedAt,
      plannerTasks: [],
      plannerLink: null,
      error: null,
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    return writeReviewReanalysisJob({
      ...processing,
      status: 'failed',
      completedAt: failedAt,
      updatedAt: failedAt,
      error: error instanceof Error ? error.message : 'Reanalysis failed.',
    });
  }
}

export function scheduleReviewReanalysisJob(params: {
  userId: string;
  projectKey: string;
  jobId: string;
}) {
  const timer = setTimeout(() => {
    void processReviewReanalysisJob(params).catch(() => undefined);
  }, 0);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

export async function retryReviewReanalysisJob(params: {
  userId: string;
  projectKey: string;
  jobId: string;
  requestedBy: string;
  force?: boolean;
  staleAfterMs?: number;
}) {
  const current = readReviewReanalysisJob(params);
  if (!current) {
    return null;
  }

  const staleAfterMs = Math.max(0, params.staleAfterMs ?? 5 * 60_000);
  const startedAtTime = current.startedAt ? new Date(current.startedAt).getTime() : 0;
  const isStaleProcessing =
    current.status === 'processing' &&
    (!startedAtTime || Date.now() - startedAtTime >= staleAfterMs);
  const canRetry =
    current.status === 'failed' ||
    current.status === 'queued' ||
    isStaleProcessing ||
    params.force === true;

  if (!canRetry) {
    throw new ReviewReanalysisJobError(
      'REANALYSIS_JOB_NOT_RETRYABLE',
      'El job no está fallido ni processing atascado; usa force para reprocesarlo explícitamente.',
      409
    );
  }

  const now = new Date().toISOString();
  writeReviewReanalysisJob({
    ...current,
    status: 'queued',
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    scope: null,
    plannerTasks: [],
    plannerLink: null,
    error: null,
    reason: current.reason
      ? `${current.reason} | retry by ${params.requestedBy} at ${now}`
      : `retry by ${params.requestedBy} at ${now}`,
  });

  return processReviewReanalysisJob({
    userId: params.userId,
    projectKey: params.projectKey,
    jobId: params.jobId,
    force: true,
  });
}

export function decideReviewReanalysisBlock(params: {
  userId: string;
  projectKey: string;
  jobId: string;
  blockId: string;
  decision: ReviewReanalysisBlockDecisionStatus;
  note?: string | null;
  decidedBy: string;
}) {
  const current = readReviewReanalysisJob(params);
  if (!current) {
    return null;
  }
  if (!current.scope) {
    throw new ReviewReanalysisJobError(
      'REANALYSIS_SCOPE_NOT_READY',
      'El scope revisable aún no existe para decidir bloques.',
      409
    );
  }
  const block = current.scope.reviewBlocks.find((entry) => entry.id === params.blockId);
  if (!block) {
    throw new ReviewReanalysisJobError(
      'REANALYSIS_SCOPE_BLOCK_NOT_FOUND',
      'No existe ese bloque dentro del scope revisable.',
      404
    );
  }

  const decidedAt = new Date().toISOString();
  const decision: ReviewReanalysisBlockDecision = {
    blockId: block.id,
    decision: params.decision,
    note: normalizeString(params.note) || null,
    decidedBy: normalizeString(params.decidedBy, params.userId),
    decidedAt,
  };

  return writeReviewReanalysisJob({
    ...current,
    blockDecisions: {
      ...current.blockDecisions,
      [block.id]: decision,
    },
    updatedAt: decidedAt,
    plannerTasks: [],
    plannerLink: null,
  });
}

function taskFromApprovedBlock(block: ReviewReanalysisScopeBlock): ReviewReanalysisPlannerTask {
  return {
    id: `p2_task_${sanitizeProjectKeySegment(block.id).toLowerCase() || crypto.randomUUID().slice(0, 8)}`,
    blockId: block.id,
    title: block.title,
    summary: block.summary,
    priority: block.priority,
    suggestedOwner: block.suggestedOwner,
    evidenceRefs: block.evidenceRefs,
    requiredDecisions: block.requiredDecisions,
    status: 'planned',
  };
}

function buildP2PlannerPrompt(params: {
  job: ReviewReanalysisJob;
  tasks: ReviewReanalysisPlannerTask[];
}) {
  const taskLines = params.tasks
    .map((task, index) => `${index + 1}. [${task.priority}] ${task.title}: ${task.summary}`)
    .join('\n');
  return [
    `P2 review-to-reanalysis aprobado para ${params.job.projectRevision.summary.projectName}.`,
    `Job origen: ${params.job.id}.`,
    `Project checksum: sha256:${params.job.projectRevision.checksum.value}.`,
    'Convertir SOLO estos bloques aprobados en trabajo ejecutable:',
    taskLines,
  ].join('\n');
}

export async function createPlannerFromApprovedReviewScope(params: {
  userId: string;
  projectKey: string;
  jobId: string;
  requestedBy: string;
  forceNew?: boolean;
  approvedBlockIds?: string[];
}): Promise<{ job: ReviewReanalysisJob; plan: AgentPlannerRecord; tasks: ReviewReanalysisPlannerTask[] } | null> {
  const current = readReviewReanalysisJob(params);
  if (!current) {
    return null;
  }
  if (!current.scope || current.status !== 'completed') {
    throw new ReviewReanalysisJobError(
      'REANALYSIS_SCOPE_NOT_READY',
      'El job debe estar completed y con scope generado antes de crear planner P2.',
      409
    );
  }
  if (current.plannerLink && !params.forceNew) {
    throw new ReviewReanalysisJobError(
      'REANALYSIS_PLANNER_ALREADY_LINKED',
      'Este reanálisis ya tiene un planner enlazado; usa forceNew para crear otro.',
      409
    );
  }

  const allApprovedBlocks = current.scope.reviewBlocks.filter(
    (block) => current.blockDecisions[block.id]?.decision === 'approved'
  );
  const selectedBlockIds = (params.approvedBlockIds ?? [])
    .map((blockId) => blockId.trim())
    .filter(Boolean);
  const selectedBlockIdSet = new Set(selectedBlockIds);
  const approvedBlocks = selectedBlockIdSet.size
    ? allApprovedBlocks.filter((block) => selectedBlockIdSet.has(block.id))
    : allApprovedBlocks;
  const invalidSelectedIds = selectedBlockIds.filter(
    (blockId) => !allApprovedBlocks.some((block) => block.id === blockId)
  );
  if (invalidSelectedIds.length > 0) {
    throw new ReviewReanalysisJobError(
      'INVALID_APPROVED_SCOPE_BLOCK_SELECTION',
      `Los bloques seleccionados no están aprobados o no existen: ${invalidSelectedIds.join(', ')}.`,
      409
    );
  }
  if (approvedBlocks.length === 0) {
    throw new ReviewReanalysisJobError(
      'NO_APPROVED_SCOPE_BLOCKS',
      'No hay bloques aprobados para convertir en tareas P2.',
      409
    );
  }

  const tasks = approvedBlocks.map(taskFromApprovedBlock);
  const createdAt = new Date().toISOString();
  let plan = createAgentPlannerRecord({
    planId: crypto.randomUUID(),
    projectKey: current.projectKey,
    prompt: buildP2PlannerPrompt({ job: current, tasks }),
    level: 'level1_copilot',
    style: 'p2-review-to-reanalysis',
    target: 'agentic-editor',
    rigRequired: false,
    createdAt,
    customSummary: `P2 planner desde reanálisis ${current.id}: ${tasks.length} tarea(s) aprobada(s).`,
    customCheckpoints: [
      'Ejecutar solo customTasks aprobadas desde el scope revisable.',
      'No ejecutar bloques rechazados o diferidos.',
      'Cerrar cada customStage con evidencia y decisión trazable.',
    ],
    customTasks: tasks.map((task) => ({
      taskId: task.id,
      stageId: task.id,
      title: task.title,
      summary: task.summary,
      priority: task.priority,
      owner: task.suggestedOwner,
      evidenceRefs: task.evidenceRefs,
      requiredDecisions: task.requiredDecisions,
      sourceBlockId: task.blockId,
    })),
  });

  await withAIAgentPlanWriteLock({
    userId: params.userId,
    projectKey: current.projectKey,
    work: async () =>
      writeAIAgentPlannerRecord({
        userId: params.userId,
        projectKey: current.projectKey,
        plan,
      }),
  });

  const linkedAt = new Date().toISOString();
  const job = writeReviewReanalysisJob({
    ...current,
    plannerTasks: tasks,
    plannerLink: {
      planId: plan.planId,
      createdAt: linkedAt,
      approvedBlockIds: approvedBlocks.map((block) => block.id),
      taskIds: tasks.map((task) => task.id),
    },
    updatedAt: linkedAt,
  });

  return { job, plan, tasks };
}

export function clearReviewReanalysisStorageForTest() {
  rmSync(getReviewReanalysisStorageRoot(), { recursive: true, force: true });
}
