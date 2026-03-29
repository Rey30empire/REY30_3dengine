'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getAPIConfig } from '@/lib/api-config';
import { useActiveScene, useEngineStore } from '@/store/editorStore';
import { buildAssetFileUrl } from './assetUrls';
import { persistCompositorStill, persistCompositorVideoJob, toEngineAsset } from './compositorAssets';
import {
  applyCompositorLookPreset,
  buildCompositorVideoPrompt,
  COMPOSITOR_LOOK_PRESETS,
  createDefaultCompositorShot,
  serializeCompositorVideoJobDocument,
  summarizeCompositorLook,
  type CompositorCameraMove,
  type CompositorLookPresetId,
} from './compositorVideoPipeline';
import {
  fetchBackendProviderStatus,
  resolveCapabilityStatus,
} from './ai/providerStatus';
import {
  requestOpenAIVideo,
  requestRunwayTaskStatus,
  requestRunwayTextToVideo,
} from './ai/requestClient';

function readNumericInput(rawValue: string, fallback: number) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeAssetName(value: string, fallback: string) {
  const trimmed = value.trim().replace(/[^a-zA-Z0-9_\- ]/g, ' ');
  const collapsed = trimmed.replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
  return collapsed || fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyTextToClipboard(content: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard API unavailable');
  }
  await navigator.clipboard.writeText(content);
}

export function CompositorVideoPanel() {
  const activeScene = useActiveScene();
  const { projectName, updateScene, addAsset } = useEngineStore();
  const [selectedLookPreset, setSelectedLookPreset] =
    useState<CompositorLookPresetId>('trailer_punch');
  const [captureName, setCaptureName] = useState('hero_frame');
  const [jobName, setJobName] = useState('hero_trailer_job');
  const [status, setStatus] = useState('Listo para capturar still y preparar job de video.');
  const [busy, setBusy] = useState<'idle' | 'capture' | 'job' | 'video'>('idle');
  const [lastStillPath, setLastStillPath] = useState('');
  const [lastJobPath, setLastJobPath] = useState('');
  const [shotTitle, setShotTitle] = useState('Hero Shot');
  const [shotSubject, setShotSubject] = useState('hero object');
  const [shotDuration, setShotDuration] = useState(4);
  const [shotAspectRatio, setShotAspectRatio] = useState<'16:9' | '1:1' | '9:16'>('16:9');
  const [shotCameraMove, setShotCameraMove] = useState<CompositorCameraMove>('orbit');
  const [shotNotes, setShotNotes] = useState('');

  useEffect(() => {
    if (!activeScene) return;
    const safeSceneName = sanitizeAssetName(activeScene.name, 'scene');
    setCaptureName(`${safeSceneName}_still`);
    setJobName(`${safeSceneName}_video_job`);
  }, [activeScene?.id, activeScene?.name]);

  const lookSummary = useMemo(
    () => (activeScene ? summarizeCompositorLook(activeScene.environment) : 'Sin escena activa'),
    [activeScene]
  );

  const shotDraft = useMemo(
    () => ({
      ...createDefaultCompositorShot(),
      title: shotTitle.trim() || 'Hero Shot',
      subject: shotSubject.trim() || 'hero object',
      durationSeconds: Math.max(1, Math.min(30, shotDuration)),
      aspectRatio: shotAspectRatio,
      cameraMove: shotCameraMove,
      notes: shotNotes.trim(),
    }),
    [shotAspectRatio, shotCameraMove, shotDuration, shotNotes, shotSubject, shotTitle]
  );

  const videoPrompt = useMemo(
    () =>
      buildCompositorVideoPrompt({
        sceneName: activeScene?.name || 'Untitled Scene',
        lookSummary,
        shot: shotDraft,
        posterFrameAssetPath: lastStillPath || null,
      }),
    [activeScene?.name, lastStillPath, lookSummary, shotDraft]
  );

  const jobJson = useMemo(
    () =>
      serializeCompositorVideoJobDocument({
        projectName,
        sceneName: activeScene?.name || 'Untitled Scene',
        lookPresetId: selectedLookPreset,
        lookSummary,
        posterFrameAssetPath: lastStillPath || null,
        shot: shotDraft,
        prompt: videoPrompt,
      }),
    [activeScene?.name, lastStillPath, lookSummary, projectName, selectedLookPreset, shotDraft, videoPrompt]
  );

  const applyLookPreset = (presetId: CompositorLookPresetId) => {
    if (!activeScene) {
      setStatus('No hay escena activa para aplicar el preset.');
      return;
    }
    setSelectedLookPreset(presetId);
    updateScene(activeScene.id, {
      environment: applyCompositorLookPreset(activeScene.environment, presetId),
    });
    const preset = COMPOSITOR_LOOK_PRESETS.find((entry) => entry.id === presetId);
    setStatus(`Preset de compositor aplicado: ${preset?.label || presetId}`);
  };

  const captureStill = async () => {
    if (!activeScene) {
      setStatus('No hay escena activa para capturar.');
      return;
    }

    const dataUrl = window.__REY30_VIEWPORT_TEST__?.captureViewportDataUrl?.({
      mimeType: 'image/png',
      quality: 0.92,
    });
    if (!dataUrl) {
      setStatus('No se pudo capturar el viewport actual.');
      return;
    }

    setBusy('capture');
    try {
      const persisted = await persistCompositorStill({
        name: sanitizeAssetName(captureName, 'compositor_still'),
        sceneName: activeScene.name,
        dataUrl,
        projectName,
      });
      addAsset(toEngineAsset(persisted));
      setLastStillPath(persisted.path);
      setStatus(`Still guardado en Assets: ${persisted.path}`);
    } catch (error) {
      setStatus(`Error capturando still: ${String(error)}`);
    } finally {
      setBusy('idle');
    }
  };

  const queueVideoJob = async () => {
    if (!activeScene) {
      setStatus('No hay escena activa para guardar el job.');
      return;
    }

    setBusy('job');
    try {
      const persisted = await persistCompositorVideoJob({
        name: sanitizeAssetName(jobName, 'video_job'),
        sceneName: activeScene.name,
        documentJson: jobJson,
        projectName,
      });
      addAsset(toEngineAsset(persisted));
      setLastJobPath(persisted.path);
      setStatus(`Job de video persistido: ${persisted.path}`);
      return persisted.path;
    } catch (error) {
      setStatus(`Error guardando job de video: ${String(error)}`);
      return null;
    } finally {
      setBusy('idle');
    }
  };

  const generateCloudVideo = async () => {
    if (!activeScene) {
      setStatus('No hay escena activa para generar video.');
      return;
    }

    setBusy('video');
    try {
      const config = getAPIConfig();
      const backendStatus = await fetchBackendProviderStatus();
      const capabilityStatus = resolveCapabilityStatus(config, backendStatus);
      const provider = config.routing.video;
      const jobAssetPath = lastJobPath || (await queueVideoJob()) || '';

      let videoUrl = '';
      let taskId = '';

      if (provider === 'runway') {
        if (!capabilityStatus.runwayVideoReady) {
          setStatus('Runway video no esta listo en Config APIs.');
          return;
        }

        const { response, data } = await requestRunwayTextToVideo({
          config,
          prompt: videoPrompt,
          projectName: projectName || 'untitled_project',
        });
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo iniciar el render de video en Runway');
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
          const normalizedStatus = String(statusData.status || '').toLowerCase();
          if (videoUrl || normalizedStatus.includes('complete') || normalizedStatus.includes('succeed')) {
            break;
          }
          if (normalizedStatus.includes('fail')) {
            throw new Error(statusData.error || 'Runway devolvio un error al renderizar el video');
          }
        }
      } else {
        if (!capabilityStatus.openAIVideoReady) {
          setStatus('OpenAI video no esta listo en Config APIs.');
          return;
        }

        const { response, data } = await requestOpenAIVideo({
          config,
          prompt: videoPrompt,
          projectName: projectName || 'untitled_project',
        });
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo iniciar el render de video en OpenAI');
        }
        taskId = data.id || data.videoId || '';
        videoUrl = data.url || '';
      }

      if (videoUrl) {
        addAsset({
          id: crypto.randomUUID(),
          name: `${sanitizeAssetName(jobName, 'video_job')}.mp4`,
          type: 'video',
          path: videoUrl,
          size: 0,
          createdAt: new Date(),
          metadata: {
            compositorGenerated: true,
            provider,
            prompt: videoPrompt,
            jobAssetPath,
            posterFrameAssetPath: lastStillPath || null,
            sceneName: activeScene.name,
          },
        });
        setStatus(`Video generado y agregado a Assets (${provider}).`);
        return;
      }

      setStatus(
        `Video en cola (${provider}). Task: ${taskId || 'sin id'} · job: ${jobAssetPath || 'sin path'}`
      );
    } catch (error) {
      setStatus(`Error generando video: ${String(error)}`);
    } finally {
      setBusy('idle');
    }
  };

  if (!activeScene) {
    return (
      <div className="h-full p-4 text-sm text-slate-500">
        Selecciona o crea una escena para usar el pipeline de compositor y video.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <Card className="border-slate-800 bg-slate-950 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-slate-200">Compositor & Video</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              Captura stills reales del viewport, empaqueta jobs de video persistentes y prepara
              handoff a OpenAI/Runway cuando el provider este listo.
            </p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
            <div>Proyecto: {projectName || 'untitled_project'}</div>
            <div>Escena: {activeScene.name}</div>
            <div>Look: {lookSummary}</div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
            Look Presets
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {COMPOSITOR_LOOK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`rounded-md border p-3 text-left transition-colors ${
                  selectedLookPreset === preset.id
                    ? 'border-cyan-500/60 bg-cyan-500/10'
                    : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                }`}
                onClick={() => applyLookPreset(preset.id)}
              >
                <div className="text-xs text-slate-200">{preset.label}</div>
                <div className="mt-1 text-[10px] text-slate-500">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr),minmax(0,1.05fr)]">
          <div className="space-y-4">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                Frame Capture
              </div>
              <label className="block space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Still name
                </span>
                <Input
                  aria-label="Still name"
                  value={captureName}
                  onChange={(event) => setCaptureName(event.target.value)}
                  className="h-8 border-slate-700 bg-slate-950 text-xs"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void captureStill()}
                  disabled={busy !== 'idle'}
                >
                  Save still to Assets
                </Button>
              </div>
              {lastStillPath && (
                <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/80 p-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                    Last still
                  </div>
                  <img
                    src={buildAssetFileUrl(lastStillPath)}
                    alt="Compositor still preview"
                    className="h-32 w-full rounded object-cover"
                  />
                  <div className="mt-2 break-all text-[10px] text-slate-500">{lastStillPath}</div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                Shot Setup
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                    Shot title
                  </span>
                  <Input
                    aria-label="Shot title"
                    value={shotTitle}
                    onChange={(event) => setShotTitle(event.target.value)}
                    className="h-8 border-slate-700 bg-slate-950 text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                    Subject
                  </span>
                  <Input
                    aria-label="Shot subject"
                    value={shotSubject}
                    onChange={(event) => setShotSubject(event.target.value)}
                    className="h-8 border-slate-700 bg-slate-950 text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                    Duration (sec)
                  </span>
                  <Input
                    aria-label="Shot duration"
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    value={shotDuration}
                    onChange={(event) =>
                      setShotDuration(readNumericInput(event.target.value, shotDuration))
                    }
                    className="h-8 border-slate-700 bg-slate-950 text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                    Aspect ratio
                  </span>
                  <select
                    aria-label="Shot aspect ratio"
                    value={shotAspectRatio}
                    onChange={(event) =>
                      setShotAspectRatio(event.target.value as '16:9' | '1:1' | '9:16')
                    }
                    className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                  >
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                    <option value="9:16">9:16</option>
                  </select>
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                    Camera move
                  </span>
                  <select
                    aria-label="Shot camera move"
                    value={shotCameraMove}
                    onChange={(event) =>
                      setShotCameraMove(event.target.value as CompositorCameraMove)
                    }
                    className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                  >
                    <option value="static">Static</option>
                    <option value="orbit">Orbit</option>
                    <option value="dolly_in">Dolly in</option>
                    <option value="dolly_out">Dolly out</option>
                    <option value="flythrough">Flythrough</option>
                  </select>
                </label>
              </div>
              <label className="mt-2 block space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Extra direction
                </span>
                <Textarea
                  aria-label="Shot notes"
                  value={shotNotes}
                  onChange={(event) => setShotNotes(event.target.value)}
                  className="min-h-[92px] border-slate-700 bg-slate-950 text-xs"
                  placeholder="Mood, pacing, lens feel, no cuts, smoke, glints, hero reveal..."
                />
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                Video Prompt
              </div>
              <Textarea
                aria-label="Video prompt preview"
                value={videoPrompt}
                readOnly
                className="min-h-[120px] border-slate-700 bg-slate-950 text-xs"
              />
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                Video Job Package
              </div>
              <label className="block space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Job name
                </span>
                <Input
                  aria-label="Video job name"
                  value={jobName}
                  onChange={(event) => setJobName(event.target.value)}
                  className="h-8 border-slate-700 bg-slate-950 text-xs"
                />
              </label>
              <Textarea
                aria-label="Video job JSON"
                value={jobJson}
                readOnly
                className="mt-2 min-h-[220px] border-slate-700 bg-slate-950 text-xs font-mono"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void queueVideoJob()}
                  disabled={busy !== 'idle'}
                >
                  Queue video job
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copyTextToClipboard(jobJson)
                      .then(() => setStatus('JSON del job copiado al portapapeles.'))
                      .catch(() =>
                        setStatus('No se pudo copiar el JSON del job al portapapeles.')
                      )
                  }
                >
                  Copy job JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void generateCloudVideo()}
                  disabled={busy !== 'idle'}
                >
                  Generate cloud video
                </Button>
              </div>
              {lastJobPath && (
                <div className="mt-2 break-all text-[10px] text-slate-500">{lastJobPath}</div>
              )}
            </div>
          </div>
        </div>

        <div
          aria-label="Compositor status"
          className="mt-4 rounded-md border border-cyan-900/40 bg-slate-950/80 px-3 py-2 text-xs text-slate-300"
        >
          {status}
        </div>
      </Card>
    </div>
  );
}
