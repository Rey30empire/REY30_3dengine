'use client';

import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getAPIConfig } from '@/lib/api-config';
import type { Asset, ChatMessage } from '@/types/engine';
import type { CapabilityStatus } from './providerStatus';
import type { GenerationTask } from './generationTask';
import {
  requestCharacterJobStart,
  requestCharacterJobStatus,
  requestCharacterJobCancel,
  requestMeshyPreviewStart,
  requestMeshyTaskStatus,
  requestOpenAIImage,
  requestOpenAIVideo,
  requestRunwayTaskStatus,
  requestRunwayTextToVideo,
} from './requestClient';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toHumanCharacterStage(stage: string): string {
  const value = stage.trim().toLowerCase();
  if (!value) return 'processing';
  if (value === 'queued') return 'en cola';
  if (value === 'parse_prompt') return 'analizando prompt';
  if (value === 'build_mesh') return 'construyendo malla';
  if (value === 'rig_and_package') return 'aplicando rig y empaquetando';
  if (value === 'done') return 'completado';
  if (value === 'failed') return 'falló';
  if (value === 'canceled') return 'cancelado';
  return value.replace(/_/g, ' ');
}

function toHumanMeshyStage(status: string): string {
  const value = status.trim().toLowerCase();
  if (!value) return 'procesando';
  if (value === 'queued' || value === 'pending') return 'en cola';
  if (value === 'processing' || value === 'in_progress' || value === 'running') return 'generando malla';
  if (value === 'texturing' || value === 'refining') return 'aplicando texturas';
  if (value === 'completed') return 'completado';
  if (value === 'failed') return 'falló';
  return value.replace(/_/g, ' ');
}

const MESHY_POLL_MS = 2_000;
const MESHY_MAX_POLLS = 45;

export function useAIAssetActions(params: {
  projectName: string;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addAsset: (asset: Asset) => void;
  getCapabilityStatus: (config: ReturnType<typeof getAPIConfig>) => Promise<CapabilityStatus>;
  setActiveTask: Dispatch<SetStateAction<GenerationTask | null>>;
}) {
  const {
    projectName,
    addChatMessage,
    addAsset,
    getCapabilityStatus,
    setActiveTask,
  } = params;
  const activeCharacterJobIdRef = useRef<string | null>(null);
  const activeCharacterAbortRef = useRef<AbortController | null>(null);

  const generateImageAsset = useCallback(async (prompt: string) => {
    const config = getAPIConfig();
    const capabilityStatus = await getCapabilityStatus(config);

    if (!capabilityStatus.imageReady) {
      addChatMessage({
        role: 'assistant',
        content: '⚠️ **Generación de imagen no disponible**\n\nActiva OpenAI y la capacidad de imagen en Configuración.',
        metadata: { type: 'config-warning' },
      });
      return;
    }

    const { response, data } = await requestOpenAIImage({
      config,
      prompt,
      projectName: projectName || 'untitled_project',
    });
    if (!response.ok || !data.imageUrl) {
      throw new Error(data.error || 'No se pudo generar la imagen');
    }

    addAsset({
      id: crypto.randomUUID(),
      name: `${prompt.slice(0, 24) || 'texture'}_ai.png`,
      type: 'texture',
      path: data.imageUrl,
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
        thumbnailUrl: data.imageUrl,
      },
    });
  }, [addAsset, addChatMessage, getCapabilityStatus, projectName]);

  const generateVideoAsset = useCallback(async (prompt: string) => {
    const config = getAPIConfig();
    const capabilityStatus = await getCapabilityStatus(config);
    const provider = config.routing.video;
    let taskId = '';
    let videoUrl = '';

    if (provider === 'runway') {
      if (!capabilityStatus.runwayVideoReady) {
        addChatMessage({
          role: 'assistant',
          content: '⚠️ **Runway no está listo**\n\nActiva Runway y la capacidad de video en Configuración.',
          metadata: { type: 'config-warning' },
        });
        return;
      }

      const { response, data } = await requestRunwayTextToVideo({
        config,
        prompt,
        projectName: projectName || 'untitled_project',
      });

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo iniciar la generación de video en Runway');
      }

      taskId = data.id || data.taskId || '';
      for (let attempt = 0; attempt < 12 && taskId; attempt += 1) {
        await sleep(2500);
        const { data: statusData } = await requestRunwayTaskStatus(taskId);
        const outputs = statusData.output || statusData.outputs || [];
        videoUrl =
          outputs?.[0]?.url ||
          outputs?.[0] ||
          statusData.url ||
          '';
        const statusValue = String(statusData.status || '').toLowerCase();
        if (videoUrl || statusValue.includes('succeed') || statusValue.includes('complete')) {
          break;
        }
        if (statusValue.includes('fail')) {
          throw new Error(statusData.error || 'Runway devolvió un error al renderizar el video');
        }
      }
    } else {
      if (!capabilityStatus.openAIVideoReady) {
        addChatMessage({
          role: 'assistant',
          content: '⚠️ **OpenAI Video no está listo**\n\nActiva OpenAI y la capacidad de video en Configuración.',
          metadata: { type: 'config-warning' },
        });
        return;
      }

      const { response, data } = await requestOpenAIVideo({
        config,
        prompt,
        projectName: projectName || 'untitled_project',
      });
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo iniciar la generación de video en OpenAI');
      }

      taskId = data.id || data.videoId || '';
      videoUrl = data.url || '';
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
    }

    addChatMessage({
      role: 'assistant',
      content: videoUrl
        ? `✅ **Video generado**\n\nPrompt: "${prompt}"\nEl clip ya quedó agregado a assets.`
        : `⏳ **Video en cola**\n\nPrompt: "${prompt}"\nTask: ${taskId || 'sin id devuelto'}\nRevisa más tarde el estado del render.`,
      metadata: {
        type: 'video',
        modelUrl: videoUrl,
      },
    });
  }, [addAsset, addChatMessage, getCapabilityStatus, projectName]);

  const canGenerate3DModel = useCallback(async () => {
    const config = getAPIConfig();
    const capabilityStatus = await getCapabilityStatus(config);
    return capabilityStatus.meshyReady;
  }, [getCapabilityStatus]);

  const generate3DModel = useCallback(async (prompt: string, artStyle: string = 'lowpoly') => {
    const config = getAPIConfig();
    const capabilityStatus = await getCapabilityStatus(config);

    if (!capabilityStatus.meshyReady) {
      addChatMessage({
        role: 'assistant',
        content: '⚠️ **Meshy no está listo**\n\nActiva Meshy, añade tu API key y deja habilitada la capacidad 3D en Configuración.',
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
      stage: toHumanMeshyStage('queued'),
      provider: 'meshy',
    });

    try {
      const { response, data } = await requestMeshyPreviewStart({
        config,
        prompt,
        artStyle,
        projectName: projectName || 'untitled_project',
      });

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start generation');
      }

      const meshyTaskId =
        typeof data.result === 'string'
          ? data.result
          : typeof data.id === 'string'
            ? data.id
            : '';
      if (!meshyTaskId) {
        throw new Error('Meshy no devolvió taskId válido');
      }

      let progress = 0;
      let completed = false;

      for (let attempt = 0; attempt < MESHY_MAX_POLLS; attempt += 1) {
        await sleep(MESHY_POLL_MS);
        const { data: statusData } = await requestMeshyTaskStatus(meshyTaskId);
        const statusValue = String(statusData.status || statusData.state || '').toLowerCase();

        if (statusValue === 'completed') {
          setActiveTask((prev) => prev ? {
            ...prev,
            status: 'completed',
            progress: 100,
            stage: toHumanMeshyStage('completed'),
            provider: 'meshy',
            modelUrl: statusData.model_urls?.glb,
            thumbnailUrl: statusData.thumbnail_url,
          } : null);

          if (statusData.model_urls?.glb) {
            addAsset({
              id: crypto.randomUUID(),
              name: prompt.slice(0, 30),
              type: 'mesh',
              path: statusData.model_urls.glb,
              size: 0,
              createdAt: new Date(),
              metadata: {
                format: 'glb',
                generatedBy: 'meshy',
                prompt,
              },
            });
          }

          addChatMessage({
            role: 'assistant',
            content: `✅ **Modelo 3D generado exitosamente!**\n\n🎨 Prompt: "${prompt}"\n📦 Formato: GLB con PBR textures\n\nEl modelo está listo para importar al editor.`,
            metadata: {
              type: 'model',
              modelUrl: statusData.model_urls?.glb,
              thumbnailUrl: statusData.thumbnail_url,
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
          stage: toHumanMeshyStage(statusValue || 'processing'),
          provider: 'meshy',
          thumbnailUrl: statusData.thumbnail_url,
        } : null);
      }

      if (!completed) {
        throw new Error('Meshy tardó demasiado en completar (timeout de espera).');
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
          `❌ **Error al generar modelo con Meshy**\n\n${error}\n\n` +
          'Si Meshy está lento, puedo continuar con el pipeline interno de personaje.',
        metadata: { type: 'error' },
      });
      return false;
    }
  }, [addAsset, addChatMessage, getCapabilityStatus, projectName, setActiveTask]);

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
    const config = getAPIConfig();
    const capabilityStatus = await getCapabilityStatus(config);

    // Optional fast path: try Meshy first when enabled, then fallback automatically.
    if (capabilityStatus.meshyReady) {
      addChatMessage({
        role: 'assistant',
        content:
          '⚡ **Meshy activo**\n\nIntento generación rápida en Meshy. Si tarda o falla, cambio automáticamente al pipeline interno (Profile A/local fallback).',
        metadata: { agentType: 'orchestrator' },
      });
      const meshySucceeded = await generate3DModel(prompt, 'realistic');
      if (meshySucceeded) {
        return;
      }
      addChatMessage({
        role: 'assistant',
        content: '🔁 **Fallback automático**\n\nMeshy no terminó a tiempo. Continúo con el pipeline interno de personaje.',
        metadata: { agentType: 'orchestrator' },
      });
    }

    const importViaCharacterRoute = async (remoteJobId?: string) => {
      const controller = new AbortController();
      activeCharacterAbortRef.current = controller;
      try {
        const response = await fetch('/api/character/full', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            prompt,
            style: 'realista',
            targetEngine: 'generic',
            includeAnimations: true,
            includeBlendshapes: true,
            remoteJobId: remoteJobId || undefined,
          }),
        });
        const data = await response.json().catch(() => ({} as Record<string, unknown>));

        if (!response.ok || !data?.success) {
          const message = typeof data?.error === 'string' ? data.error : 'No se pudo generar personaje';
          throw new Error(message);
        }

        const packagePath =
          typeof data.packagePath === 'string' && data.packagePath.trim().length > 0
            ? data.packagePath
            : '';
        const safePath = packagePath ? `/${packagePath.replace(/^\/+/, '')}` : '/download/assets/characters';
        const backendSource =
          typeof data.backendSource === 'string' && data.backendSource.trim().length > 0
            ? data.backendSource
            : 'local-fallback';

        addAsset({
          id: crypto.randomUUID(),
          name: `${prompt.slice(0, 28) || 'character'}_package`,
          type: 'prefab',
          path: safePath,
          size: 0,
          createdAt: new Date(),
          metadata: {
            generatedBy: 'character-full-route',
            prompt,
            quality: data?.quality || null,
            backendSource,
          },
        });

        setActiveTask((prev) => prev ? {
          ...prev,
          status: 'completed',
          progress: 100,
          stage: toHumanCharacterStage('done'),
          provider: backendSource === 'profile-a-backend' ? 'profile_a' : 'local_fallback',
        } : null);

        addChatMessage({
          role: 'assistant',
          content:
            `✅ **Personaje generado**\n\n` +
            `Prompt: "${prompt}"\n` +
            `Se creó un paquete de personaje con malla + rig + animaciones base.\n` +
            `Fuente: ${backendSource}`,
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
      provider: 'profile_a',
    });

    try {
      const startResult = await requestCharacterJobStart({
        prompt,
        style: 'realista',
        targetEngine: 'generic',
        includeAnimations: true,
        includeBlendshapes: true,
      });

      if (!startResult.response.ok || typeof startResult.data?.jobId !== 'string') {
        // If jobs backend is not available, keep old behavior via full route.
        setActiveTask((prev) => prev ? {
          ...prev,
          progress: 40,
          stage: 'fallback local',
          provider: 'local_fallback',
        } : null);
        await importViaCharacterRoute();
        return;
      }

      const jobId = startResult.data.jobId;
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
          provider: 'profile_a',
        } : null);

        if (status === 'completed') break;
        if (status === 'canceled') {
          throw new Error('CANCELLED_BY_USER');
        }
        if (status === 'failed') {
          const errorMessage =
            typeof statusResult.data.error === 'string'
              ? statusResult.data.error
              : 'Backend de personajes reportó fallo';
          throw new Error(errorMessage);
        }
        await sleep(1000);
      }

      if (status !== 'completed') {
        throw new Error('Timeout esperando el backend de personajes');
      }

      ensureNotCanceled(jobId);

      setActiveTask((prev) => prev ? {
        ...prev,
        progress: 96,
        stage: 'importando paquete',
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
          `Tip: revisa backend Profile A y sesión activa.`,
        metadata: { type: 'error' },
      });
    }
  }, [addAsset, addChatMessage, generate3DModel, getCapabilityStatus, setActiveTask]);

  return {
    generateImageAsset,
    generateVideoAsset,
    canGenerate3DModel,
    generate3DModel,
    generateCharacterAsset,
    cancelCharacterGeneration,
  };
}
