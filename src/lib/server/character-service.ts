export type CharacterServiceHealth = {
  success: boolean;
  configured: boolean;
  available: boolean;
  status: string;
  message: string;
};

export type CharacterJobRequest = {
  prompt: string;
  style?: string;
  targetEngine?: 'unity' | 'unreal' | 'generic';
  includeAnimations?: boolean;
  includeBlendshapes?: boolean;
  references?: string[];
};

export type CharacterTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';

export type CharacterJobStatus = {
  success: boolean;
  jobId: string;
  status: CharacterTaskStatus;
  progress: number;
  stage: string;
  error: string | null;
};

export type CharacterJobResult = {
  success: boolean;
  jobId: string;
  packagePath: string;
  payload: Record<string, unknown>;
};

export type CharacterBaseMeshResult = {
  success: boolean;
  mesh: Record<string, unknown>;
  quality: Record<string, unknown>;
  review: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

const REMOTE_TIMEOUT_MS = Number(process.env.REY30_CHARACTER_BACKEND_TIMEOUT_MS || 120_000);
const REMOTE_POLL_MS = Number(process.env.REY30_CHARACTER_BACKEND_POLL_MS || 1_000);

export class CharacterServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CharacterServiceError';
    this.status = status;
  }
}

export function getCharacterBackendBaseUrl(): string | null {
  const raw = (process.env.REY30_CHARACTER_BACKEND_URL || '').trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function isCharacterBackendConfigured(): boolean {
  return Boolean(getCharacterBackendBaseUrl());
}

export function isCharacterLocalFallbackEnabled(): boolean {
  return String(process.env.REY30_CHARACTER_LOCAL_FALLBACK || '').trim().toLowerCase() === 'true';
}

export function normalizeCharacterTaskStatus(raw: string): CharacterTaskStatus {
  const value = raw.trim().toLowerCase();
  if (!value) return 'processing';
  if (value.includes('queue') || value.includes('pending')) return 'queued';
  if (value.includes('cancel')) return 'canceled';
  if (value.includes('fail') || value.includes('error')) return 'failed';
  if (value.includes('complete') || value.includes('succeed') || value === 'done') return 'completed';
  return 'processing';
}

function normalizeCharacterBackendError(
  data: Record<string, unknown>,
  fallback: string
): string {
  if (typeof data.error === 'string' && data.error.trim().length > 0) return data.error;
  if (typeof data.detail === 'string' && data.detail.trim().length > 0) return data.detail;
  return fallback;
}

async function fetchCharacterBackendJson(
  routePath: string,
  init: RequestInit,
  timeoutMs = 15_000
): Promise<{ response: Response; data: Record<string, unknown> }> {
  const base = getCharacterBackendBaseUrl();
  if (!base) {
    throw new CharacterServiceError(
      501,
      'La creación de personajes no está disponible en esta sesión.'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}${routePath}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    return { response, data };
  } catch (error) {
    if (String(error).includes('AbortError')) {
      throw new CharacterServiceError(504, 'La creación de personajes tardó demasiado en responder.');
    }
    throw new CharacterServiceError(503, 'La creación de personajes no está disponible en este momento.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCharacterServiceHealth(): Promise<CharacterServiceHealth> {
  const remoteBackendUrl = getCharacterBackendBaseUrl();
  if (!remoteBackendUrl) {
    return {
      success: false,
      configured: false,
      available: false,
      status: 'not_configured',
      message: 'La creación de personajes no está habilitada en esta sesión.',
    };
  }

  try {
    const { response, data } = await fetchCharacterBackendJson('/healthz', { method: 'GET' }, 10_000);
    if (!response.ok) {
      return {
        success: false,
        configured: true,
        available: false,
        status: 'down',
        message: 'La creación de personajes no está disponible en este momento.',
      };
    }

    return {
      success: true,
      configured: true,
      available: true,
      status: typeof data.status === 'string' ? data.status : 'ok',
      message: 'La creación de personajes está disponible.',
    };
  } catch (error) {
    console.error('[character-service] health check failed:', error);
    return {
      success: false,
      configured: Boolean(remoteBackendUrl),
      available: false,
      status: 'error',
      message: 'No se pudo verificar la creación de personajes.',
    };
  }
}

export async function generateCharacterBaseMesh(
  request: CharacterJobRequest
): Promise<CharacterBaseMeshResult> {
  const { response, data } = await fetchCharacterBackendJson(
    '/v1/character/base-mesh',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        style: request.style || 'realista',
        targetEngine: request.targetEngine || 'generic',
        includeAnimations: request.includeAnimations !== false,
        includeBlendshapes: request.includeBlendshapes !== false,
        references: Array.isArray(request.references) ? request.references.slice(0, 6) : [],
      }),
    },
    25_000
  );

  if (!response.ok) {
    throw new CharacterServiceError(
      response.status,
      normalizeCharacterBackendError(data, 'No se pudo generar la malla base del personaje.')
    );
  }

  return {
    success: true,
    mesh: typeof data.mesh === 'object' && data.mesh !== null ? (data.mesh as Record<string, unknown>) : {},
    quality:
      typeof data.quality === 'object' && data.quality !== null
        ? (data.quality as Record<string, unknown>)
        : {},
    review:
      typeof data.review === 'object' && data.review !== null ? (data.review as Record<string, unknown>) : {},
    metadata:
      typeof data.metadata === 'object' && data.metadata !== null
        ? (data.metadata as Record<string, unknown>)
        : {},
  };
}

export async function createCharacterJob(
  request: CharacterJobRequest
): Promise<{ success: true; jobId: string; status: CharacterTaskStatus }> {
  const { response, data } = await fetchCharacterBackendJson(
    '/v1/character/jobs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        style: request.style || 'realista',
        targetEngine: request.targetEngine || 'generic',
        includeAnimations: request.includeAnimations !== false,
        includeBlendshapes: request.includeBlendshapes !== false,
        references: Array.isArray(request.references) ? request.references.slice(0, 6) : [],
      }),
    },
    15_000
  );

  if (!response.ok) {
    throw new CharacterServiceError(
      response.status,
      normalizeCharacterBackendError(data, 'No se pudo iniciar la creación del personaje.')
    );
  }

  const jobId = typeof data.jobId === 'string' ? data.jobId : '';
  if (!jobId) {
    throw new CharacterServiceError(502, 'La creación de personajes devolvió un identificador inválido.');
  }

  return {
    success: true,
    jobId,
    status: normalizeCharacterTaskStatus(typeof data.status === 'string' ? data.status : 'queued'),
  };
}

export async function getCharacterJobStatus(jobId: string): Promise<CharacterJobStatus> {
  const { response, data } = await fetchCharacterBackendJson(
    `/v1/character/jobs/${encodeURIComponent(jobId)}`,
    { method: 'GET' },
    10_000
  );

  if (!response.ok) {
    throw new CharacterServiceError(
      response.status,
      normalizeCharacterBackendError(data, 'No se pudo consultar el estado del personaje.')
    );
  }

  const status = normalizeCharacterTaskStatus(typeof data.status === 'string' ? data.status : 'queued');
  return {
    success: true,
    jobId,
    status,
    progress: typeof data.progress === 'number' ? data.progress : 0,
    stage: typeof data.stage === 'string' ? data.stage : 'queued',
    error:
      status === 'failed' && typeof data.error === 'string' && data.error.trim().length > 0
        ? data.error
        : null,
  };
}

export async function cancelCharacterJob(jobId: string): Promise<CharacterJobStatus> {
  const { response, data } = await fetchCharacterBackendJson(
    `/v1/character/jobs/${encodeURIComponent(jobId)}`,
    { method: 'DELETE' },
    10_000
  );

  if (!response.ok) {
    throw new CharacterServiceError(
      response.status,
      normalizeCharacterBackendError(data, 'No se pudo cancelar la creación del personaje.')
    );
  }

  return {
    success: true,
    jobId,
    status: normalizeCharacterTaskStatus(typeof data.status === 'string' ? data.status : 'canceled'),
    progress: typeof data.progress === 'number' ? data.progress : 100,
    stage: typeof data.stage === 'string' ? data.stage : 'canceled',
    error: null,
  };
}

export async function getCharacterJobResult(jobId: string): Promise<CharacterJobResult> {
  const { response, data } = await fetchCharacterBackendJson(
    `/v1/character/jobs/${encodeURIComponent(jobId)}/result`,
    { method: 'GET' },
    10_000
  );

  if (!response.ok) {
    throw new CharacterServiceError(
      response.status,
      normalizeCharacterBackendError(data, 'No se pudo obtener el resultado del personaje.')
    );
  }

  return {
    success: true,
    jobId,
    packagePath: typeof data.packagePath === 'string' ? data.packagePath : '',
    payload:
      typeof data.payload === 'object' && data.payload !== null
        ? (data.payload as Record<string, unknown>)
        : {},
  };
}

export async function waitForCharacterJobCompletion(
  jobId: string,
  options?: { timeoutMs?: number; pollMs?: number }
): Promise<CharacterJobStatus> {
  const timeoutMs = options?.timeoutMs ?? REMOTE_TIMEOUT_MS;
  const pollMs = options?.pollMs ?? REMOTE_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getCharacterJobStatus(jobId);
    if (status.status === 'completed' || status.status === 'failed' || status.status === 'canceled') {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new CharacterServiceError(504, 'La creación de personajes tardó demasiado en completarse.');
}
