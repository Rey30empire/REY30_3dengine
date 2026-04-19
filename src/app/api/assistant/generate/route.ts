import { NextRequest, NextResponse } from 'next/server';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { decryptText, encryptText, isMissingEncryptionSecretError } from '@/lib/security/crypto';
import { CSRF_HEADER_NAME } from '@/lib/security/csrf';
import {
  buildAssistantEphemeralJob,
  readAssistantDurableJob,
  type AssistantDurableJobView,
} from '@/lib/server/assistant-job-surface';
import { syncAssistantPlannerFromJobView } from '@/lib/server/assistant-planner-link';
import { getUserScopedConfig } from '@/lib/security/user-api-config';

type AssistantGenerateKind = 'image' | 'video' | 'model3d' | 'character';
type AssistantTaskBackend =
  | 'openai-video'
  | 'runway-video'
  | 'meshy-model'
  | 'character-job';

type AssistantTaskTokenPayload = {
  v: 1;
  kind: Exclude<AssistantGenerateKind, 'image'>;
  backend: AssistantTaskBackend;
  taskId: string;
  projectKey?: string;
  planId?: string;
};

type AssistantTaskTokenEnvelope = Omit<AssistantTaskTokenPayload, 'v'> & {
  v: 4;
  userId: string;
  projectKey: string;
  issuedAt: number;
  expiresAt: number;
};

type AssistantTaskTokenEnvelopeV3 = Omit<AssistantTaskTokenPayload, 'v'> & {
  v: 3;
  userId: string;
  projectKey: string;
  issuedAt: number;
  expiresAt: number;
};

type AssistantLegacyTaskTokenEnvelope = Omit<AssistantTaskTokenPayload, 'v'> & {
  v: 2;
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

type AssistantGenerateBody = {
  kind?: AssistantGenerateKind;
  prompt?: string;
  style?: string;
  duration?: number;
  ratio?: string;
  taskToken?: string;
  planId?: string;
  references?: string[];
  operation?: 'start' | 'finalize';
};

const TASK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SAFE_INTERNAL_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FORWARDED_REQUEST_HEADERS = ['origin', 'x-forwarded-host', 'x-forwarded-proto'] as const;

function decodeLegacyTaskToken(token: string): AssistantTaskTokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Partial<AssistantTaskTokenPayload>;
    if (
      parsed?.v !== 1 ||
      !parsed.kind ||
      !parsed.backend ||
      !parsed.taskId ||
      typeof parsed.taskId !== 'string'
    ) {
      return null;
    }
    return parsed as AssistantTaskTokenPayload;
  } catch {
    return null;
  }
}

function resolveAssistantProjectKey(request: NextRequest): string {
  return normalizeProjectKey(request.headers.get('x-rey30-project'));
}

function encodeTaskToken(
  userId: string,
  projectKey: string,
  payload: Omit<AssistantTaskTokenPayload, 'v' | 'projectKey'>
): string {
  const now = Date.now();
  const envelope: AssistantTaskTokenEnvelope = {
    ...payload,
    v: 4,
    userId,
    projectKey: normalizeProjectKey(projectKey),
    issuedAt: now,
    expiresAt: now + TASK_TOKEN_TTL_MS,
  };
  return encryptText(JSON.stringify(envelope));
}

function decodeTaskToken(token: string, userId: string): AssistantTaskTokenPayload | null {
  try {
    const parsed = JSON.parse(decryptText(token)) as
      | Partial<AssistantTaskTokenEnvelope>
      | Partial<AssistantTaskTokenEnvelopeV3>
      | Partial<AssistantLegacyTaskTokenEnvelope>;
    if (
      (parsed?.v !== 4 && parsed?.v !== 3 && parsed?.v !== 2) ||
      parsed.userId !== userId ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now() ||
      !parsed.kind ||
      !parsed.backend ||
      !parsed.taskId ||
      typeof parsed.taskId !== 'string'
    ) {
      return null;
    }

    return {
      v: 1,
      kind: parsed.kind,
      backend: parsed.backend,
      taskId: parsed.taskId,
      projectKey:
        (parsed.v === 4 || parsed.v === 3) && typeof parsed.projectKey === 'string'
          ? normalizeProjectKey(parsed.projectKey)
          : undefined,
      planId:
        (parsed.v === 4 || parsed.v === 3) && typeof parsed.planId === 'string'
          ? parsed.planId.trim() || undefined
          : undefined,
    };
  } catch {
    return decodeLegacyTaskToken(token);
  }
}

async function callInternalJson(
  request: NextRequest,
  path: string,
  init?: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    projectKey?: string | null;
  }
): Promise<{ response: Response; data: Record<string, any> }> {
  const url = new URL(path, request.url);
  const method = init?.method || 'GET';
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const project = init?.projectKey || request.headers.get('x-rey30-project');

  if (cookie) headers.set('cookie', cookie);
  if (project) headers.set('x-rey30-project', project);
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value?.trim()) {
      headers.set(headerName, value);
    }
  }
  if (!SAFE_INTERNAL_METHODS.has(method)) {
    const csrfToken = request.headers.get(CSRF_HEADER_NAME);
    if (csrfToken?.trim()) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(url, {
    method,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function resolveAssistantJob(params: {
  userId: string;
  projectKey: string;
  kind: Exclude<AssistantGenerateKind, 'image'>;
  backend: AssistantTaskBackend;
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
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
}): Promise<AssistantDurableJobView> {
  const durable = await readAssistantDurableJob({
    userId: params.userId,
    projectKey: params.projectKey,
    backend: params.backend,
    kind: params.kind,
    taskId: params.taskId,
    refreshedFromProvider: params.refreshedFromProvider,
  });

  if (durable) {
    return durable;
  }

  return buildAssistantEphemeralJob({
    projectKey: params.projectKey,
    backend: params.backend,
    kind: params.kind,
    taskId: params.taskId,
    status: params.status,
    progress: params.progress,
    stage: params.stage,
    error: params.error,
    asset: params.asset,
    readyToFinalize: params.readyToFinalize,
    refreshedFromProvider: params.refreshedFromProvider,
  });
}

async function syncPlannerJobIfNeeded(params: {
  userId: string;
  planId?: string | null;
  job: AssistantDurableJobView | null;
}) {
  if (!params.job || !params.planId?.trim()) {
    return;
  }

  try {
    await Promise.resolve(
      syncAssistantPlannerFromJobView({
        userId: params.userId,
        planId: params.planId,
        job: params.job,
      })
    );
  } catch {
    // Best-effort bridge: planner sync must not break assistant generation.
  }
}

function errorFromData(data: Record<string, any>, fallback: string): string {
  if (typeof data.error === 'string' && data.error.trim()) return data.error;
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail;
  return fallback;
}

function sanitizeStatus(status: number, fallback: number = 502): number {
  return status >= 400 && status <= 599 ? status : fallback;
}

function internalFailureResponse(params: {
  status: number;
  fallback: string;
  data: Record<string, any>;
}): NextResponse {
  const detail = errorFromData(params.data, '');
  if (detail) {
    console.warn('[assistant/generate] internal failure:', {
      status: params.status,
      detail,
    });
  }

  return NextResponse.json(
    { success: false, error: params.fallback },
    { status: sanitizeStatus(params.status) }
  );
}

function normalizeTaskStatus(raw: string): 'queued' | 'processing' | 'completed' | 'failed' | 'canceled' {
  const value = raw.trim().toLowerCase();
  if (!value) return 'processing';
  if (value.includes('queue') || value.includes('pending')) return 'queued';
  if (value.includes('cancel')) return 'canceled';
  if (value.includes('fail') || value.includes('error')) return 'failed';
  if (value.includes('complete') || value.includes('succeed') || value === 'done') return 'completed';
  return 'processing';
}

function resolveVideoBackend(scoped: Awaited<ReturnType<typeof getUserScopedConfig>>): AssistantTaskBackend | null {
  const runwayReady =
    !!scoped.apiConfig.runway.enabled &&
    !!scoped.apiConfig.runway.apiKey &&
    !!scoped.apiConfig.runway.capabilities.video;
  const openaiReady =
    !!scoped.apiConfig.openai.enabled &&
    !!scoped.apiConfig.openai.apiKey &&
    !!scoped.apiConfig.openai.capabilities.video;

  if (scoped.apiConfig.routing.video === 'runway' && runwayReady) return 'runway-video';
  if (openaiReady) return 'openai-video';
  if (runwayReady) return 'runway-video';
  return null;
}

function resolveImageReady(scoped: Awaited<ReturnType<typeof getUserScopedConfig>>): boolean {
  return (
    !!scoped.apiConfig.openai.enabled &&
    !!scoped.apiConfig.openai.apiKey &&
    !!scoped.apiConfig.openai.capabilities.image
  );
}

function resolveModel3DReady(scoped: Awaited<ReturnType<typeof getUserScopedConfig>>): boolean {
  return (
    !!scoped.apiConfig.meshy.enabled &&
    !!scoped.apiConfig.meshy.apiKey &&
    !!scoped.apiConfig.meshy.capabilities.threeD
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const body = (await request.json().catch(() => ({}))) as AssistantGenerateBody;
    const kind = body.kind;
    const prompt = (body.prompt || '').trim();
    const projectKey = resolveAssistantProjectKey(request);
    const requestedPlanId = (body.planId || '').trim() || null;

    if (!kind || !['image', 'video', 'model3d', 'character'].includes(kind)) {
      return NextResponse.json({ success: false, error: 'kind inválido.' }, { status: 400 });
    }

    const scoped = await getUserScopedConfig(user.id);

    if (kind === 'image') {
      if (!prompt) {
        return NextResponse.json({ success: false, error: 'prompt es requerido.' }, { status: 400 });
      }
      if (!resolveImageReady(scoped)) {
        return NextResponse.json(
          { success: false, error: 'La generación de imagen no está disponible para esta sesión.' },
          { status: 409 }
        );
      }

      const { response, data } = await callInternalJson(request, '/api/openai', {
        method: 'POST',
        body: {
          action: 'image',
          prompt,
          size: scoped.apiConfig.openai.imageSize,
        },
      });

      if (!response.ok) {
        return internalFailureResponse({
          status: response.status,
          fallback: 'No se pudo generar la imagen.',
          data,
        });
      }

      return NextResponse.json({
        success: true,
        asset: {
          kind: 'image',
          url: typeof data.imageUrl === 'string' ? data.imageUrl : '',
        },
        revisedPrompt: typeof data.revisedPrompt === 'string' ? data.revisedPrompt : '',
      });
    }

    if (kind === 'video') {
      if (!prompt) {
        return NextResponse.json({ success: false, error: 'prompt es requerido.' }, { status: 400 });
      }

      const backend = resolveVideoBackend(scoped);
      if (!backend) {
        return NextResponse.json(
          { success: false, error: 'La generación de video no está disponible para esta sesión.' },
          { status: 409 }
        );
      }

      const { response, data } = await callInternalJson(
        request,
        backend === 'runway-video' ? '/api/runway' : '/api/openai',
        {
          method: 'POST',
          body:
            backend === 'runway-video'
              ? {
                  action: 'textToVideo',
                  promptText: prompt,
                  duration: body.duration || scoped.apiConfig.runway.duration,
                  ratio: body.ratio || scoped.apiConfig.runway.ratio,
                }
              : {
                  action: 'video',
                  prompt,
                  size: scoped.apiConfig.openai.videoSize,
                  duration: body.duration || 5,
                },
        }
      );

      if (!response.ok) {
        return internalFailureResponse({
          status: response.status,
          fallback: 'No se pudo iniciar la generación de video.',
          data,
        });
      }

      const rawTaskId =
        typeof data.id === 'string'
          ? data.id
          : typeof data.taskId === 'string'
            ? data.taskId
            : typeof data.videoId === 'string'
              ? data.videoId
              : '';
      const directUrl = typeof data.url === 'string' ? data.url : '';

      if (directUrl) {
        return NextResponse.json({
          success: true,
          status: 'completed',
          asset: {
            kind: 'video',
            url: directUrl,
          },
        });
      }

      if (!rawTaskId) {
        return NextResponse.json(
          { success: false, error: 'No se recibió un identificador de tarea de video.' },
          { status: 502 }
        );
      }

      const job = await resolveAssistantJob({
        userId: user.id,
        projectKey,
        kind: 'video',
        backend,
        taskId: rawTaskId,
        status: 'queued',
        refreshedFromProvider: true,
      });
      await syncPlannerJobIfNeeded({
        userId: user.id,
        planId: requestedPlanId,
        job,
      });

      return NextResponse.json({
        success: true,
        status: 'queued',
        taskToken: encodeTaskToken(user.id, projectKey, {
          kind: 'video',
          backend,
          taskId: rawTaskId,
          planId: requestedPlanId ?? undefined,
        }),
        job,
      });
    }

    if (kind === 'model3d') {
      if (!prompt) {
        return NextResponse.json({ success: false, error: 'prompt es requerido.' }, { status: 400 });
      }
      if (!resolveModel3DReady(scoped)) {
        return NextResponse.json(
          { success: false, error: 'La generación 3D no está disponible para esta sesión.' },
          { status: 409 }
        );
      }

      const { response, data } = await callInternalJson(request, '/api/meshy', {
        method: 'POST',
        body: {
          mode: 'preview',
          prompt: `${prompt}, game ready, optimized mesh, PBR textures`,
          art_style: body.style || scoped.apiConfig.meshy.defaultArtStyle,
          negative_prompt: 'blurry, low quality, distorted, deformed',
        },
      });

      if (!response.ok) {
        return internalFailureResponse({
          status: response.status,
          fallback: 'No se pudo iniciar la generación 3D.',
          data,
        });
      }

      const rawTaskId =
        typeof data.result === 'string'
          ? data.result
          : typeof data.id === 'string'
            ? data.id
            : '';

      if (!rawTaskId) {
        return NextResponse.json(
          { success: false, error: 'No se recibió un identificador de tarea 3D.' },
          { status: 502 }
        );
      }

      const job = await resolveAssistantJob({
        userId: user.id,
        projectKey,
        kind: 'model3d',
        backend: 'meshy-model',
        taskId: rawTaskId,
        status: 'queued',
        refreshedFromProvider: true,
      });
      await syncPlannerJobIfNeeded({
        userId: user.id,
        planId: requestedPlanId,
        job,
      });

      return NextResponse.json({
        success: true,
        status: 'queued',
        taskToken: encodeTaskToken(user.id, projectKey, {
          kind: 'model3d',
          backend: 'meshy-model',
          taskId: rawTaskId,
          planId: requestedPlanId ?? undefined,
        }),
        job,
      });
    }

    if (body.operation === 'finalize') {
      const rawToken = (body.taskToken || '').trim();
      const decoded = rawToken ? decodeTaskToken(rawToken, user.id) : null;
      if (rawToken && (!decoded || decoded.kind !== 'character' || decoded.backend !== 'character-job')) {
        return NextResponse.json(
          { success: false, error: 'taskToken de personaje inválido.' },
          { status: 400 }
        );
      }
      if (!prompt) {
        return NextResponse.json({ success: false, error: 'prompt es requerido.' }, { status: 400 });
      }

      const { response, data } = await callInternalJson(request, '/api/character/full', {
        method: 'POST',
        projectKey: decoded?.projectKey || projectKey,
        body: {
          prompt,
          style: body.style || 'realista',
          targetEngine: 'generic',
          includeAnimations: true,
          includeBlendshapes: true,
          references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
          remoteJobId: decoded?.taskId,
        },
      });

      if (!response.ok) {
        return internalFailureResponse({
          status: response.status,
          fallback: 'No se pudo completar el personaje.',
          data,
        });
      }

      const assetPayload =
        typeof data.asset === 'object' && data.asset !== null ? (data.asset as Record<string, unknown>) : null;
      const packagePath =
        typeof data.packagePath === 'string' && data.packagePath.trim().length > 0
          ? data.packagePath.replace(/^\/+/, '')
          : '';
      const finalizedJob =
        decoded?.taskId
          ? buildAssistantEphemeralJob({
              projectKey: decoded.projectKey || projectKey,
              backend: 'character-job',
              kind: 'character',
              taskId: decoded.taskId,
              status: 'completed',
              stage: 'finalized',
              readyToFinalize: false,
              refreshedFromProvider: true,
              asset: assetPayload
                ? {
                    path:
                      typeof assetPayload.path === 'string'
                        ? assetPayload.path
                        : packagePath || undefined,
                  }
                : packagePath
                  ? {
                      path: packagePath,
                    }
                  : null,
            })
          : null;
      await syncPlannerJobIfNeeded({
        userId: user.id,
        planId: decoded?.planId || requestedPlanId,
        job: finalizedJob,
      });

      return NextResponse.json({
        success: true,
        status: 'completed',
        asset: assetPayload
          ? {
              kind: 'character',
              ...assetPayload,
            }
          : packagePath
            ? {
                kind: 'character',
                path: packagePath,
              }
            : undefined,
        quality: data.quality || null,
        packageSummary: data.packageSummary || null,
        job: finalizedJob,
      });
    }

    const { response, data } = await callInternalJson(request, '/api/character/jobs', {
      method: 'POST',
      body: {
        prompt,
        style: body.style || 'realista',
        targetEngine: 'generic',
        includeAnimations: true,
        includeBlendshapes: true,
        references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
      },
    });

    if (!response.ok) {
      return internalFailureResponse({
        status: response.status,
        fallback: 'No se pudo iniciar la creación del personaje.',
        data,
      });
    }

    const rawTaskId =
      typeof data.taskId === 'string'
        ? data.taskId
        : typeof data.jobId === 'string'
          ? data.jobId
          : '';
    if (!rawTaskId) {
      return NextResponse.json(
        { success: false, error: 'No se recibió un identificador de personaje.' },
        { status: 502 }
      );
    }

      const job = await resolveAssistantJob({
        userId: user.id,
        projectKey,
        kind: 'character',
        backend: 'character-job',
        taskId: rawTaskId,
        status: typeof data.status === 'string' ? normalizeTaskStatus(data.status) : 'queued',
        refreshedFromProvider: true,
      });
      await syncPlannerJobIfNeeded({
        userId: user.id,
        planId: requestedPlanId,
        job,
      });

      return NextResponse.json({
        success: true,
        status: typeof data.status === 'string' ? normalizeTaskStatus(data.status) : 'queued',
        taskToken: encodeTaskToken(user.id, projectKey, {
          kind: 'character',
          backend: 'character-job',
          taskId: rawTaskId,
          planId: requestedPlanId ?? undefined,
        }),
        job,
      });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isMissingEncryptionSecretError(error)) {
      return NextResponse.json(
        { success: false, error: 'El servicio del asistente no está disponible en este momento.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'No se pudo procesar la solicitud del asistente.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const { searchParams } = new URL(request.url);
    const token = (searchParams.get('taskToken') || '').trim();
    const decoded = decodeTaskToken(token, user.id);

    if (!decoded) {
      return NextResponse.json({ success: false, error: 'taskToken inválido.' }, { status: 400 });
    }
    const projectKey = normalizeProjectKey(decoded.projectKey);

    if (decoded.backend === 'runway-video') {
      const { response, data } = await callInternalJson(
        request,
        `/api/runway?taskId=${encodeURIComponent(decoded.taskId)}`,
        { projectKey }
      );
      if (!response.ok) {
        const job = await readAssistantDurableJob({
          userId: user.id,
          projectKey,
          kind: 'video',
          backend: 'runway-video',
          taskId: decoded.taskId,
          refreshedFromProvider: false,
        });
        if (job) {
          await syncPlannerJobIfNeeded({
            userId: user.id,
            planId: decoded.planId,
            job,
          });
          return NextResponse.json({
            success: true,
            status: job.status,
            asset: job.asset || undefined,
            job,
          });
        }
        return internalFailureResponse({
          status: response.status,
          fallback: 'No se pudo consultar el video.',
          data,
        });
      }

      const outputs = Array.isArray(data.output) ? data.output : Array.isArray(data.outputs) ? data.outputs : [];
      const directUrl =
        (typeof data.url === 'string' ? data.url : '') ||
        (typeof outputs[0]?.url === 'string' ? outputs[0].url : '') ||
        (typeof outputs[0] === 'string' ? outputs[0] : '') ||
        '';
      const status = normalizeTaskStatus(String(data.status || 'processing'));

      const resolvedStatus = directUrl ? 'completed' : status;
      const job = await resolveAssistantJob({
        userId: user.id,
        projectKey,
        kind: 'video',
        backend: 'runway-video',
        taskId: decoded.taskId,
        status: resolvedStatus,
        asset: directUrl
          ? {
              url: directUrl,
            }
          : null,
        refreshedFromProvider: true,
      });
      await syncPlannerJobIfNeeded({
        userId: user.id,
        planId: decoded.planId,
        job,
      });

      return NextResponse.json({
        success: true,
        status: resolvedStatus,
        asset: directUrl
          ? {
              kind: 'video',
              url: directUrl,
            }
          : undefined,
        job,
      });
    }

    if (decoded.backend === 'openai-video') {
      const { response, data } = await callInternalJson(
        request,
        `/api/openai?action=videoStatus&videoId=${encodeURIComponent(decoded.taskId)}`,
        { projectKey }
      );
      if (!response.ok) {
        const job = await readAssistantDurableJob({
          userId: user.id,
          projectKey,
          kind: 'video',
          backend: 'openai-video',
          taskId: decoded.taskId,
          refreshedFromProvider: false,
        });
        if (job) {
          await syncPlannerJobIfNeeded({
            userId: user.id,
            planId: decoded.planId,
            job,
          });
          return NextResponse.json({
            success: true,
            status: job.status,
            asset: job.asset || undefined,
            job,
          });
        }
        return internalFailureResponse({
          status: response.status,
          fallback: 'No se pudo consultar el video.',
          data,
        });
      }

      const directUrl =
        (typeof data.url === 'string' ? data.url : '') ||
        (Array.isArray(data.output) && typeof data.output[0]?.url === 'string' ? data.output[0].url : '');
      const status = normalizeTaskStatus(String(data.status || data.state || 'processing'));

      const resolvedStatus = directUrl ? 'completed' : status;
      const job = await resolveAssistantJob({
        userId: user.id,
        projectKey,
        kind: 'video',
        backend: 'openai-video',
        taskId: decoded.taskId,
        status: resolvedStatus,
        asset: directUrl
          ? {
              url: directUrl,
            }
          : null,
        refreshedFromProvider: true,
      });
      await syncPlannerJobIfNeeded({
        userId: user.id,
        planId: decoded.planId,
        job,
      });

      return NextResponse.json({
        success: true,
        status: resolvedStatus,
        asset: directUrl
          ? {
              kind: 'video',
              url: directUrl,
            }
          : undefined,
        job,
      });
    }

    if (decoded.backend === 'meshy-model') {
      const { response, data } = await callInternalJson(
        request,
        `/api/meshy?taskId=${encodeURIComponent(decoded.taskId)}`,
        { projectKey }
      );
      if (!response.ok) {
        const job = await readAssistantDurableJob({
          userId: user.id,
          projectKey,
          kind: 'model3d',
          backend: 'meshy-model',
          taskId: decoded.taskId,
          refreshedFromProvider: false,
        });
        if (job) {
          await syncPlannerJobIfNeeded({
            userId: user.id,
            planId: decoded.planId,
            job,
          });
          return NextResponse.json({
            success: true,
            status: job.status,
            progress: job.progress ?? undefined,
            asset: job.asset || undefined,
            preview: job.asset?.thumbnailUrl
              ? { thumbnailUrl: job.asset.thumbnailUrl }
              : undefined,
            job,
          });
        }
        return internalFailureResponse({
          status: response.status,
          fallback: 'No se pudo consultar el modelo 3D.',
          data,
        });
      }

      const status = normalizeTaskStatus(String(data.status || data.state || 'processing'));
      const modelUrl =
        typeof data.url === 'string'
          ? data.url
          : typeof data.model_urls?.glb === 'string'
            ? data.model_urls.glb
            : '';
      const thumbnailUrl =
        typeof data.thumbnailUrl === 'string'
          ? data.thumbnailUrl
          : typeof data.thumbnail_url === 'string'
            ? data.thumbnail_url
            : '';

      const resolvedStatus = modelUrl ? 'completed' : status;
      const job = await resolveAssistantJob({
        userId: user.id,
        projectKey,
        kind: 'model3d',
        backend: 'meshy-model',
        taskId: decoded.taskId,
        status: resolvedStatus,
        progress: typeof data.progress === 'number' ? data.progress : null,
        asset:
          modelUrl || thumbnailUrl
            ? {
                url: modelUrl || undefined,
                thumbnailUrl: thumbnailUrl || undefined,
              }
            : null,
        refreshedFromProvider: true,
      });
      await syncPlannerJobIfNeeded({
        userId: user.id,
        planId: decoded.planId,
        job,
      });

      return NextResponse.json({
        success: true,
        status: resolvedStatus,
        progress: typeof data.progress === 'number' ? data.progress : undefined,
        asset: modelUrl
          ? {
              kind: 'model3d',
              url: modelUrl,
              thumbnailUrl,
            }
          : undefined,
        preview: thumbnailUrl ? { thumbnailUrl } : undefined,
        job,
      });
    }

    const { response, data } = await callInternalJson(
      request,
      `/api/character/jobs?jobId=${encodeURIComponent(decoded.taskId)}`,
      { projectKey }
    );
    if (!response.ok) {
      const job = await readAssistantDurableJob({
        userId: user.id,
        projectKey,
        kind: 'character',
        backend: 'character-job',
        taskId: decoded.taskId,
        refreshedFromProvider: false,
      });
      if (job) {
        await syncPlannerJobIfNeeded({
          userId: user.id,
          planId: decoded.planId,
          job,
        });
        return NextResponse.json({
          success: true,
          status: job.status,
          progress: job.progress ?? 0,
          stage: job.stage || 'queued',
          readyToFinalize: job.readyToFinalize,
          error: job.error,
          asset: job.asset || null,
          job,
        });
      }
      return internalFailureResponse({
        status: response.status,
        fallback: 'No se pudo consultar el personaje.',
        data,
      });
    }

    const status = normalizeTaskStatus(String(data.status || 'processing'));
    const job = await resolveAssistantJob({
      userId: user.id,
      projectKey,
      kind: 'character',
      backend: 'character-job',
      taskId: decoded.taskId,
      status,
      progress: typeof data.progress === 'number' ? data.progress : 0,
      stage: typeof data.stage === 'string' ? data.stage : 'queued',
      error: status === 'failed' ? 'No se pudo completar el personaje.' : null,
      readyToFinalize: status === 'completed',
      asset:
        data.asset && typeof data.asset === 'object' && data.asset !== null
          ? {
              path:
                typeof (data.asset as { path?: unknown }).path === 'string'
                  ? (data.asset as { path?: string }).path
                  : undefined,
            }
          : null,
      refreshedFromProvider: true,
    });
    await syncPlannerJobIfNeeded({
      userId: user.id,
      planId: decoded.planId,
      job,
    });
    return NextResponse.json({
      success: true,
      status,
      progress: typeof data.progress === 'number' ? data.progress : 0,
      stage: typeof data.stage === 'string' ? data.stage : 'queued',
      readyToFinalize: status === 'completed',
      error: status === 'failed' ? 'No se pudo completar el personaje.' : null,
      asset:
        data.asset && typeof data.asset === 'object' && data.asset !== null
          ? data.asset
          : job.asset,
      job,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isMissingEncryptionSecretError(error)) {
      return NextResponse.json(
        { success: false, error: 'El servicio del asistente no está disponible en este momento.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'No se pudo consultar el estado de la tarea.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const { searchParams } = new URL(request.url);
    const token = (searchParams.get('taskToken') || '').trim();
    const decoded = decodeTaskToken(token, user.id);

    if (!decoded || decoded.kind !== 'character' || decoded.backend !== 'character-job') {
      return NextResponse.json({ success: false, error: 'taskToken inválido.' }, { status: 400 });
    }
    const projectKey = normalizeProjectKey(decoded.projectKey);

    const { response, data } = await callInternalJson(
      request,
      `/api/character/jobs?jobId=${encodeURIComponent(decoded.taskId)}`,
      { method: 'DELETE', projectKey }
    );

    if (!response.ok) {
      return internalFailureResponse({
        status: response.status,
        fallback: 'No se pudo cancelar la tarea.',
        data,
      });
    }

    const status = normalizeTaskStatus(String(data.status || 'canceled'));
    const job = await resolveAssistantJob({
      userId: user.id,
      projectKey,
      kind: 'character',
      backend: 'character-job',
      taskId: decoded.taskId,
      status,
      progress: typeof data.progress === 'number' ? data.progress : 100,
      stage: typeof data.stage === 'string' ? data.stage : 'canceled',
      refreshedFromProvider: true,
    });
    await syncPlannerJobIfNeeded({
      userId: user.id,
      planId: decoded.planId,
      job,
    });

    return NextResponse.json({
      success: true,
      status,
      progress: typeof data.progress === 'number' ? data.progress : 100,
      stage: typeof data.stage === 'string' ? data.stage : 'canceled',
      job,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isMissingEncryptionSecretError(error)) {
      return NextResponse.json(
        { success: false, error: 'El servicio del asistente no está disponible en este momento.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'No se pudo cancelar la tarea del asistente.' },
      { status: 500 }
    );
  }
}
