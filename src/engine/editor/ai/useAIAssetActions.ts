'use client';

import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Asset, ChatMessage } from '@/types/engine';
import type { CapabilityStatus } from './providerStatus';
import type { GenerationTask } from './generationTask';
import {
  requestAIAgentPlannerUpdate,
  requestAssistantImage,
  requestAssistantModel3D,
  requestAssistantTaskStatus,
  requestAssistantVideo,
  requestCharacterFinalize,
  requestCharacterJobStart,
  requestCharacterJobStatus,
  requestCharacterJobCancel,
} from './requestClient';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toHumanCharacterStage(stage: string): string {
  const value = stage.trim().toLowerCase();
  if (!value) return 'processing';
  if (value === 'queued') return 'en cola';
  if (value === 'parse_prompt') return 'analizando prompt';
  if (value === 'build_mesh') return 'dando forma al personaje';
  if (value === 'rig_and_package') return 'afinando personaje';
  if (value === 'done') return 'completado';
  if (value === 'failed') return 'falló';
  if (value === 'canceled') return 'cancelado';
  return value.replace(/_/g, ' ');
}

function toHumanModelStage(status: string): string {
  const value = status.trim().toLowerCase();
  if (!value) return 'procesando';
  if (value === 'queued' || value === 'pending') return 'en cola';
  if (value === 'processing' || value === 'in_progress' || value === 'running') return 'dando forma al modelo';
  if (value === 'texturing' || value === 'refining') return 'acabado final';
  if (value === 'completed') return 'completado';
  if (value === 'failed') return 'falló';
  return value.replace(/_/g, ' ');
}

const MODEL_POLL_MS = 2_000;
const MODEL_MAX_POLLS = 45;

function toEngineCharacterAsset(value: unknown, fallbackPrompt: string): Asset | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const path = typeof record.path === 'string' ? record.path.trim().replace(/^\/+/, '') : '';
  if (!path) return null;

  const createdAtRaw = typeof record.createdAt === 'string' ? record.createdAt : '';
  const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();

  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : `${fallbackPrompt.slice(0, 28) || 'character'}_package`,
    type:
      record.type === 'prefab' ||
      record.type === 'mesh' ||
      record.type === 'texture' ||
      record.type === 'material' ||
      record.type === 'modifier_preset' ||
      record.type === 'script' ||
      record.type === 'animation' ||
      record.type === 'audio' ||
      record.type === 'video' ||
      record.type === 'scene' ||
      record.type === 'shader' ||
      record.type === 'font'
        ? (record.type as Asset['type'])
        : 'prefab',
    path,
    size: typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : 0,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    metadata:
      typeof record.metadata === 'object' && record.metadata !== null
        ? (record.metadata as Asset['metadata'])
        : {},
  };
}

type AssistantPlannerLinkedJob = {
  jobId: string;
  kind: 'video' | 'model3d' | 'character';
  backend: 'openai-video' | 'runway-video' | 'meshy-model' | 'character-job';
  asset?: {
    url?: string;
    thumbnailUrl?: string;
    path?: string;
  } | null;
};

export function useAIAssetActions(params: {
  projectName: string;
  activePlannerPlanId?: string | null;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addAsset: (asset: Asset) => void;
  getCapabilityStatus: () => Promise<CapabilityStatus>;
  setActiveTask: Dispatch<SetStateAction<GenerationTask | null>>;
}) {
  const {
    projectName,
    activePlannerPlanId,
    addChatMessage,
    addAsset,
    getCapabilityStatus,
    setActiveTask,
  } = params;
  const activeCharacterJobIdRef = useRef<string | null>(null);
  const activeCharacterAbortRef = useRef<AbortController | null>(null);

  const sealAssistantResultApplied = useCallback(
    async (params: {
      job?: AssistantPlannerLinkedJob | null;
      summary: string;
      asset?: {
        url?: string;
        thumbnailUrl?: string;
        path?: string;
      } | null;
    }) => {
      if (!activePlannerPlanId || !params.job?.jobId) {
        return;
      }

      try {
        await requestAIAgentPlannerUpdate({
          projectName,
          planId: activePlannerPlanId,
          action: 'assistant_apply',
          taskId: params.job.jobId,
          kind: params.job.kind,
          backend: params.job.backend,
          summary: params.summary,
          asset: params.asset ?? params.job.asset ?? null,
        });
      } catch {
        // Best-effort planner seal: never block the user-facing import.
      }
    },
    [activePlannerPlanId, projectName]
  );

  const generateImageAsset = useCallback(async (prompt: string) => {
    const capabilityStatus = await getCapabilityStatus();

    if (!capabilityStatus.image.available) {
      addChatMessage({
        role: 'assistant',
        content: '⚠️ **Generación de imagen no disponible**\n\nEsta sesión todavía no tiene habilitada la creación de imágenes.',
        metadata: { type: 'config-warning' },
      });
      return;
    }

    const { response, data } = await requestAssistantImage({
      prompt,
      projectName: projectName || 'untitled_project',
    });
    const imageUrl =
      typeof data.asset?.url === 'string'
        ? data.asset.url
        : typeof data.imageUrl === 'string'
          ? data.imageUrl
          : '';
    if (!response.ok || !imageUrl) {
      throw new Error(data.error || 'No se pudo generar la imagen');
    }

    addAsset({
      id: crypto.randomUUID(),
      name: `${prompt.slice(0, 24) || 'texture'}_ai.png`,
      type: 'texture',
      path: imageUrl,
      size: 0,
      createdAt: new Date(),
      metadata: {
        format: 'png',
        prompt,
      },
    });

    addChatMessage({
      role: 'assistant',
      content: `✅ **Imagen generada**\n\nPrompt: "${prompt}"\nLista para usar como textura o referencia visual.`,
      metadata: {
        type: 'image',
        thumbnailUrl: imageUrl,
      },
    });
  }, [activePlannerPlanId, addAsset, addChatMessage, getCapabilityStatus, projectName]);

  const generateVideoAsset = useCallback(async (prompt: string) => {
    const capabilityStatus = await getCapabilityStatus();
    const videoAvailable = capabilityStatus.video.available;
    let taskId = '';
    let videoUrl = '';
    let assistantJob: AssistantPlannerLinkedJob | null = null;

    if (!videoAvailable) {
      addChatMessage({
        role: 'assistant',
        content: '⚠️ **Generación de video no disponible**\n\nEsta sesión todavía no tiene habilitada la creación de video.',
        metadata: { type: 'config-warning' },
      });
      return;
    }

    const { response, data } = await requestAssistantVideo({
      prompt,
      projectName: projectName || 'untitled_project',
      planId: activePlannerPlanId,
    });
    if (!response.ok) {
      throw new Error(data.error || 'No se pudo iniciar la generación de video');
    }
    assistantJob =
      data.job && typeof data.job === 'object'
        ? (data.job as AssistantPlannerLinkedJob)
        : null;

    taskId =
      typeof data.taskToken === 'string'
        ? data.taskToken
        : typeof data.taskId === 'string'
          ? data.taskId
          : '';
    videoUrl =
      typeof data.asset?.url === 'string'
        ? data.asset.url
        : typeof data.url === 'string'
          ? data.url
          : '';

    for (let attempt = 0; attempt < 12 && taskId && !videoUrl; attempt += 1) {
      await sleep(2500);
      const { data: statusData } = await requestAssistantTaskStatus(taskId);
      assistantJob =
        statusData.job && typeof statusData.job === 'object'
          ? (statusData.job as AssistantPlannerLinkedJob)
          : assistantJob;
      videoUrl =
        typeof statusData.asset?.url === 'string'
          ? statusData.asset.url
          : typeof statusData.url === 'string'
            ? statusData.url
            : '';
      const statusValue = String(statusData.status || '').toLowerCase();
      if (videoUrl || statusValue.includes('complete')) {
        break;
      }
      if (statusValue.includes('fail')) {
        throw new Error(statusData.error || 'No se pudo completar el video');
      }
    }

    if (videoUrl) {
      addAsset({
        id: crypto.randomUUID(),
        name: `${prompt.slice(0, 24) || 'clip'}_ai.mp4`,
        type: 'video',
        path: videoUrl,
        size: 0,
        createdAt: new Date(),
        metadata: {
          format: 'mp4',
          prompt,
        },
      });
      await sealAssistantResultApplied({
        job: assistantJob,
        summary: 'El clip generado por AI quedó agregado a assets del proyecto.',
        asset: {
          url: videoUrl,
        },
      });
    }

    addChatMessage({
      role: 'assistant',
      content: videoUrl
        ? `✅ **Video generado**\n\nPrompt: "${prompt}"\nEl clip ya quedó agregado a assets.`
        : `⏳ **Video en preparación**\n\nPrompt: "${prompt}"\nTodavía lo estoy procesando; revisa más tarde el resultado.`,
      metadata: {
        type: 'video',
        modelUrl: videoUrl,
      },
    });
  }, [addAsset, addChatMessage, getCapabilityStatus, projectName, sealAssistantResultApplied]);

  const canGenerate3DModel = useCallback(async () => {
    const capabilityStatus = await getCapabilityStatus();
    return capabilityStatus.model3d.available;
  }, [getCapabilityStatus]);

  const generate3DModel = useCallback(async (prompt: string, artStyle: string = 'lowpoly') => {
    const capabilityStatus = await getCapabilityStatus();

    if (!capabilityStatus.model3d.available) {
      addChatMessage({
        role: 'assistant',
        content: '⚠️ **Generación 3D no disponible**\n\nEsta sesión todavía no tiene habilitada la creación automática de modelos 3D.',
        metadata: { type: 'error' },
      });
      return false;
    }

    const taskId = crypto.randomUUID();
    setActiveTask({
      id: taskId,
      type: 'preview',
      prompt,
      status: 'processing',
      progress: 0,
      stage: toHumanModelStage('queued'),
      deliveryPath: 'accelerated',
    });

    try {
      let assistantJob: AssistantPlannerLinkedJob | null = null;
      const { response, data } = await requestAssistantModel3D({
        prompt,
        artStyle,
        projectName: projectName || 'untitled_project',
        planId: activePlannerPlanId,
      });

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start generation');
      }
      assistantJob =
        data.job && typeof data.job === 'object'
          ? (data.job as AssistantPlannerLinkedJob)
          : null;

      const modelTaskToken =
        typeof data.taskToken === 'string'
          ? data.taskToken
          : typeof data.taskId === 'string'
            ? data.taskId
            : '';
      if (!modelTaskToken) {
        throw new Error('No se recibió una tarea válida de modelo 3D');
      }

      let progress = 0;
      let completed = false;

      for (let attempt = 0; attempt < MODEL_MAX_POLLS; attempt += 1) {
        await sleep(MODEL_POLL_MS);
        const { data: statusData } = await requestAssistantTaskStatus(modelTaskToken);
        assistantJob =
          statusData.job && typeof statusData.job === 'object'
            ? (statusData.job as AssistantPlannerLinkedJob)
            : assistantJob;
        const statusValue = String(statusData.status || '').toLowerCase();
        const modelUrl =
          typeof statusData.asset?.url === 'string'
            ? statusData.asset.url
            : typeof statusData.model_urls?.glb === 'string'
              ? statusData.model_urls.glb
              : '';
        const thumbnailUrl =
          typeof statusData.asset?.thumbnailUrl === 'string'
            ? statusData.asset.thumbnailUrl
            : typeof statusData.preview?.thumbnailUrl === 'string'
              ? statusData.preview.thumbnailUrl
              : typeof statusData.thumbnail_url === 'string'
                ? statusData.thumbnail_url
                : '';

        if (statusValue === 'completed' && modelUrl) {
          setActiveTask((prev) => prev ? {
            ...prev,
            status: 'completed',
            progress: 100,
            stage: toHumanModelStage('completed'),
            deliveryPath: 'accelerated',
            modelUrl,
            thumbnailUrl,
          } : null);

          if (modelUrl) {
            addAsset({
              id: crypto.randomUUID(),
              name: prompt.slice(0, 30),
              type: 'mesh',
              path: modelUrl,
              size: 0,
              createdAt: new Date(),
              metadata: {
                format: 'glb',
                generatedBy: 'assistant-generate',
                prompt,
              },
            });
            await sealAssistantResultApplied({
              job: assistantJob,
              summary: 'El modelo 3D generado por AI quedó agregado a assets del proyecto.',
              asset: {
                url: modelUrl,
                thumbnailUrl: thumbnailUrl || undefined,
              },
            });
          }

          addChatMessage({
            role: 'assistant',
            content: `✅ **Modelo 3D listo**\n\nPrompt: "${prompt}"\nEl modelo quedó preparado para usar dentro del editor.`,
            metadata: {
              type: 'model',
              modelUrl,
              thumbnailUrl,
            },
          });
          completed = true;
          break;
        }

        if (statusValue === 'failed' || statusValue === 'canceled' || statusValue === 'cancelled') {
          throw new Error(statusData.error || 'Generation failed');
        }

        progress =
          typeof statusData.progress === 'number'
            ? Math.min(95, Math.max(progress, statusData.progress))
            : Math.min(95, progress + 2);
        setActiveTask((prev) => prev ? {
          ...prev,
          progress,
          stage: toHumanModelStage(statusValue || 'processing'),
          deliveryPath: 'accelerated',
          thumbnailUrl,
        } : null);
      }

      if (!completed) {
        throw new Error('La creación 3D tardó demasiado en completarse.');
      }

      return true;
    } catch (error) {
      setActiveTask((prev) => prev ? {
        ...prev,
        status: 'failed',
        error: String(error),
      } : null);

      addChatMessage({
        role: 'assistant',
        content:
          `❌ **No pude completar el modelo 3D**\n\n${error}\n\n` +
          'Si quieres, puedo seguir con una versión editable para no frenar el trabajo.',
        metadata: { type: 'error' },
      });
      return false;
    }
  }, [addAsset, addChatMessage, getCapabilityStatus, projectName, sealAssistantResultApplied, setActiveTask]);

  const cancelCharacterGeneration = useCallback(async () => {
    const activeJobId = activeCharacterJobIdRef.current;
    activeCharacterJobIdRef.current = null;

    const activeAbort = activeCharacterAbortRef.current;
    if (activeAbort) {
      activeAbort.abort();
      activeCharacterAbortRef.current = null;
    }

    if (activeJobId) {
      try {
        await requestCharacterJobCancel(activeJobId);
      } catch {
        // Best-effort cancel.
      }
    }

    setActiveTask((prev) => prev ? {
      ...prev,
      status: 'canceled',
      stage: 'cancelado',
      error: undefined,
    } : null);

    addChatMessage({
      role: 'assistant',
      content: '🛑 **Generación cancelada**\n\nSe canceló el job de personaje.',
      metadata: { type: 'warning' },
    });
  }, [addChatMessage, setActiveTask]);

  const generateCharacterAsset = useCallback(async (prompt: string) => {
    const capabilityStatus = await getCapabilityStatus();

    if (!capabilityStatus.character.available) {
      addChatMessage({
        role: 'assistant',
        content:
          '⚠️ **Generación de personaje no disponible**\n\n' +
          'Esta sesión todavía no tiene habilitada la creación completa de personajes.',
        metadata: { type: 'config-warning' },
      });
      return;
    }

    // Optional fast path: try the accelerated 3D path first, then fallback automatically.
    if (capabilityStatus.model3d.available) {
      addChatMessage({
        role: 'assistant',
        content:
          '⚡ **Generación rápida disponible**\n\nVoy a intentar la vía más rápida y, si no responde a tiempo, continuaré automáticamente con una ruta compatible.',
        metadata: { agentType: 'orchestrator' },
      });
      const acceleratedPathSucceeded = await generate3DModel(prompt, 'realistic');
      if (acceleratedPathSucceeded) {
        return;
      }
      addChatMessage({
        role: 'assistant',
        content: '🔁 **Continuando automáticamente**\n\nLa ruta rápida no terminó a tiempo. Sigo con una alternativa compatible para completar el personaje.',
        metadata: { agentType: 'orchestrator' },
      });
    }

    const importViaCharacterRoute = async (remoteJobId?: string) => {
      const controller = new AbortController();
      activeCharacterAbortRef.current = controller;
      try {
        const responsePayload = await requestCharacterFinalize({
          taskToken: remoteJobId,
          prompt,
          planId: activePlannerPlanId,
          style: 'realista',
          signal: controller.signal,
        });
        const { response, data } = responsePayload;

        if (!response.ok || !data?.success) {
          const message = typeof data?.error === 'string' ? data.error : 'No se pudo generar personaje';
          throw new Error(message);
        }

        const asset = toEngineCharacterAsset(data.asset, prompt);
        if (!asset) {
          throw new Error('El backend no devolvió un asset durable del personaje.');
        }
        addAsset({
          ...asset,
          metadata: {
            ...asset.metadata,
            quality: data?.quality || null,
            packageSummary: data?.packageSummary || null,
          },
        });
        await sealAssistantResultApplied({
          job:
            data?.job && typeof data.job === 'object'
              ? (data.job as AssistantPlannerLinkedJob)
              : null,
          summary: 'El paquete de personaje generado por AI quedó agregado al proyecto.',
          asset: {
            path: asset.path,
          },
        });

        setActiveTask((prev) => prev ? {
          ...prev,
          status: 'completed',
          progress: 100,
          stage: toHumanCharacterStage('done'),
          deliveryPath: prev.deliveryPath || 'fallback',
        } : null);

        addChatMessage({
          role: 'assistant',
          content:
            `✅ **Personaje generado**\n\n` +
            `Prompt: "${prompt}"\n` +
            'Se creó un paquete de personaje con malla, rig y animaciones base.',
          metadata: {
            type: 'model',
          },
        });
      } finally {
        if (activeCharacterAbortRef.current === controller) {
          activeCharacterAbortRef.current = null;
        }
      }
    };

    const ensureNotCanceled = (jobId?: string) => {
      if (jobId && activeCharacterJobIdRef.current !== jobId) {
        throw new Error('CANCELLED_BY_USER');
      }
    };

    const taskId = crypto.randomUUID();
    activeCharacterJobIdRef.current = null;
    setActiveTask({
      id: taskId,
      type: 'character',
      prompt,
      status: 'processing',
      progress: 5,
      stage: toHumanCharacterStage('queued'),
      deliveryPath: 'compatible',
    });

    try {
      const startResult = await requestCharacterJobStart({
        prompt,
        planId: activePlannerPlanId,
        style: 'realista',
        targetEngine: 'generic',
        includeAnimations: true,
        includeBlendshapes: true,
      });

      if (!startResult.response.ok || typeof startResult.data?.taskToken !== 'string') {
        // If jobs backend is not available, keep old behavior via full route.
        setActiveTask((prev) => prev ? {
          ...prev,
          progress: 40,
          stage: 'ajustando una versión compatible',
          deliveryPath: 'fallback',
        } : null);
        await importViaCharacterRoute();
        return;
      }

      const jobId = startResult.data.taskToken;
      activeCharacterJobIdRef.current = jobId;
      let status: string = typeof startResult.data.status === 'string' ? startResult.data.status : 'queued';
      let progress = 8;

      for (let attempt = 0; attempt < 150; attempt += 1) {
        ensureNotCanceled(jobId);
        const statusResult = await requestCharacterJobStatus(jobId);
        if (!statusResult.response.ok) {
          const errorMessage =
            typeof statusResult.data?.error === 'string'
              ? statusResult.data.error
              : 'No se pudo consultar estado del personaje';
          throw new Error(errorMessage);
        }

        status = typeof statusResult.data.status === 'string' ? statusResult.data.status : status;
        progress = typeof statusResult.data.progress === 'number'
          ? statusResult.data.progress
          : Math.min(95, progress + 4);
        const stage =
          typeof statusResult.data.stage === 'string' && statusResult.data.stage.trim().length > 0
            ? statusResult.data.stage
            : 'processing';

        setActiveTask((prev) => prev ? {
          ...prev,
          progress,
          stage: toHumanCharacterStage(stage),
          deliveryPath: 'compatible',
        } : null);

        if (status === 'completed' && statusResult.data.readyToFinalize) break;
        if (status === 'canceled') {
          throw new Error('CANCELLED_BY_USER');
        }
        if (status === 'failed') {
          const errorMessage =
            typeof statusResult.data.error === 'string'
              ? statusResult.data.error
              : 'El servicio de personajes no pudo completar la solicitud';
          throw new Error(errorMessage);
        }
        await sleep(1000);
      }

      if (status !== 'completed') {
        throw new Error('La generación del personaje tardó demasiado en completarse');
      }

      ensureNotCanceled(jobId);

      setActiveTask((prev) => prev ? {
        ...prev,
        progress: 96,
        stage: 'importando personaje',
      } : null);

      await importViaCharacterRoute(jobId);
      activeCharacterJobIdRef.current = null;
      activeCharacterAbortRef.current = null;

    } catch (error) {
      if (String(error).includes('CANCELLED_BY_USER') || (error as { name?: string })?.name === 'AbortError') {
        activeCharacterJobIdRef.current = null;
        activeCharacterAbortRef.current = null;
        setActiveTask((prev) => prev ? {
          ...prev,
          status: 'canceled',
          stage: 'cancelado',
          error: undefined,
        } : null);
        return;
      }
      activeCharacterJobIdRef.current = null;
      activeCharacterAbortRef.current = null;
      setActiveTask((prev) => prev ? {
        ...prev,
        status: 'failed',
        error: String(error),
      } : null);

      addChatMessage({
        role: 'assistant',
        content:
          `❌ **No se pudo generar el personaje**\n\n` +
          `${String(error)}\n` +
          'Tip: revisa tu sesión y vuelve a intentarlo.',
        metadata: { type: 'error' },
      });
    }
  }, [activePlannerPlanId, addAsset, addChatMessage, generate3DModel, getCapabilityStatus, sealAssistantResultApplied, setActiveTask]);

  return {
    generateImageAsset,
    generateVideoAsset,
    canGenerate3DModel,
    generate3DModel,
    generateCharacterAsset,
    cancelCharacterGeneration,
  };
}
