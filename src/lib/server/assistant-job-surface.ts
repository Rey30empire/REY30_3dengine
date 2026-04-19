import { normalizeProjectKey } from '@/lib/project-key';
import {
  readProviderJobRecord,
  type AsyncProviderName,
  type ProviderJobRecord,
} from '@/lib/server/external-integration-store';
import { getCharacterGenerationJobRecord } from '@/lib/server/character-generation-store';

export type AssistantAsyncJobKind = 'video' | 'model3d' | 'character';
export type AssistantAsyncJobBackend =
  | 'openai-video'
  | 'runway-video'
  | 'meshy-model'
  | 'character-job';
export type AssistantAsyncJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface AssistantDurableJobView {
  jobId: string;
  projectKey: string;
  kind: AssistantAsyncJobKind;
  backend: AssistantAsyncJobBackend;
  status: AssistantAsyncJobStatus;
  stage: string | null;
  progress: number | null;
  persisted: boolean;
  refreshedFromProvider: boolean;
  requestedAt: string | null;
  updatedAt: string | null;
  readyToFinalize: boolean;
  error: string | null;
  asset:
    | {
        kind: AssistantAsyncJobKind;
        url?: string;
        thumbnailUrl?: string;
        path?: string;
      }
    | null;
}

function toIsoTimestamp(value: number | string | null | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return null;
}

function toProviderName(backend: AssistantAsyncJobBackend): AsyncProviderName | null {
  if (backend === 'openai-video') return 'openai';
  if (backend === 'runway-video') return 'runway';
  if (backend === 'meshy-model') return 'meshy';
  return null;
}

function mapProviderRecord(params: {
  backend: Extract<AssistantAsyncJobBackend, 'openai-video' | 'runway-video' | 'meshy-model'>;
  kind: Extract<AssistantAsyncJobKind, 'video' | 'model3d'>;
  projectKey: string;
  record: ProviderJobRecord;
  refreshedFromProvider: boolean;
}): AssistantDurableJobView {
  const asset =
    params.kind === 'video'
      ? params.record.result.url
        ? {
            kind: 'video' as const,
            url: params.record.result.url,
          }
        : null
      : params.record.result.url || params.record.result.thumbnailUrl
        ? {
            kind: 'model3d' as const,
            url: params.record.result.url,
            thumbnailUrl: params.record.result.thumbnailUrl,
          }
        : null;

  return {
    jobId: params.record.remoteTaskId,
    projectKey: params.projectKey,
    kind: params.kind,
    backend: params.backend,
    status: params.record.status,
    stage: params.record.result.rawStatus || params.record.status,
    progress:
      typeof params.record.result.progress === 'number'
        ? params.record.result.progress
        : params.record.status === 'completed'
          ? 100
          : null,
    persisted: true,
    refreshedFromProvider: params.refreshedFromProvider,
    requestedAt: toIsoTimestamp(params.record.requestedAt),
    updatedAt: toIsoTimestamp(params.record.updatedAt),
    readyToFinalize: false,
    error: params.record.status === 'failed' ? 'No se pudo completar la tarea.' : null,
    asset,
  };
}

export async function readAssistantDurableJob(params: {
  userId: string;
  projectKey?: string | null;
  backend: AssistantAsyncJobBackend;
  kind: AssistantAsyncJobKind;
  taskId: string;
  refreshedFromProvider?: boolean;
}): Promise<AssistantDurableJobView | null> {
  const projectKey = normalizeProjectKey(params.projectKey);
  const refreshedFromProvider = params.refreshedFromProvider === true;

  if (params.backend === 'character-job') {
    const record = await getCharacterGenerationJobRecord(params.taskId);
    if (!record || record.userId !== params.userId || record.projectKey !== projectKey) {
      return null;
    }

    return {
      jobId: record.jobId,
      projectKey,
      kind: 'character',
      backend: 'character-job',
      status: record.status,
      stage: record.stage,
      progress: record.progress,
      persisted: true,
      refreshedFromProvider,
      requestedAt: toIsoTimestamp(record.createdAt),
      updatedAt: toIsoTimestamp(record.updatedAt),
      readyToFinalize: record.status === 'completed',
      error: record.status === 'failed' ? 'No se pudo completar el personaje.' : null,
      asset: record.asset
        ? {
            kind: 'character',
            path: record.asset.path,
          }
        : null,
    };
  }

  const provider = toProviderName(params.backend);
  if (!provider) {
    return null;
  }

  const record = readProviderJobRecord({
    provider,
    userId: params.userId,
    projectKey,
    remoteTaskId: params.taskId,
  });
  if (!record) {
    return null;
  }

  return mapProviderRecord({
    backend: params.backend,
    kind: params.kind as 'video' | 'model3d',
    projectKey,
    record,
    refreshedFromProvider,
  });
}

export function buildAssistantEphemeralJob(params: {
  projectKey?: string | null;
  backend: AssistantAsyncJobBackend;
  kind: AssistantAsyncJobKind;
  taskId: string;
  status: AssistantAsyncJobStatus;
  progress?: number | null;
  stage?: string | null;
  error?: string | null;
  asset?: {
    url?: string;
    thumbnailUrl?: string;
    path?: string;
  } | null;
  readyToFinalize?: boolean;
  refreshedFromProvider?: boolean;
}): AssistantDurableJobView {
  return {
    jobId: params.taskId,
    projectKey: normalizeProjectKey(params.projectKey),
    kind: params.kind,
    backend: params.backend,
    status: params.status,
    stage: params.stage ?? params.status,
    progress:
      typeof params.progress === 'number'
        ? params.progress
        : params.status === 'completed'
          ? 100
          : null,
    persisted: false,
    refreshedFromProvider: params.refreshedFromProvider === true,
    requestedAt: null,
    updatedAt: null,
    readyToFinalize: params.readyToFinalize === true,
    error: params.error ?? null,
    asset: params.asset
      ? {
          kind: params.kind,
          url: params.asset.url,
          thumbnailUrl: params.asset.thumbnailUrl,
          path: params.asset.path,
        }
      : null,
  };
}
