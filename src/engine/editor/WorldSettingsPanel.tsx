'use client';

import { useActiveScene, useEngineStore } from '@/store/editorStore';
import { resolveAdvancedLightingSettings } from '@/types/engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  applyWorldLookPreset,
  getWorldSkyAssetPath,
  isHdrEnvironmentAsset,
  isWorldSkyAsset,
  makeWorldSkyAssetValue,
  resolveWorldSkyPreset,
  WORLD_LOOK_PRESETS,
} from './worldPipeline';

function rgbColorToHex(color: { r: number; g: number; b: number }) {
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * 255)))
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function hexToRgbColor(hex: string) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return { r: 0.5, g: 0.5, b: 0.5 };
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255,
  };
}

export function WorldSettingsPanel() {
  const activeScene = useActiveScene();
  const {
    scenes,
    createScene,
    updateScene,
    editor,
    assets,
    setNavigationMode,
    setViewportCameraMode,
    setViewportCameraEntity,
    setViewportFov,
    setCameraSpeed,
    requestLightingBake,
  } = useEngineStore();

  if (!activeScene) {
    return (
      <div className="flex h-full flex-col bg-slate-800/50">
        <div className="border-b border-slate-700 px-3 py-2">
          <h3 className="text-sm font-medium text-slate-200">World</h3>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
          <p>No hay escena activa para configurar.</p>
          <Button size="sm" onClick={() => createScene(`Scene ${scenes.length + 1}`)}>
            Crear escena
          </Button>
        </div>
      </div>
    );
  }

  const updateEnvironment = (patch: Partial<typeof activeScene.environment>) => {
    updateScene(activeScene.id, {
      environment: {
        ...activeScene.environment,
        ...patch,
      },
    });
  };

  const updateFog = (enabled: boolean) => {
    if (!enabled) {
      updateEnvironment({ fog: null });
      return;
    }

    updateEnvironment({
      fog: activeScene.environment.fog ?? {
        enabled: true,
        type: 'linear',
        color: { r: 0.6, g: 0.68, b: 0.78 },
        near: 12,
        far: 90,
        density: 0.015,
      },
    });
  };

  const updatePostProcessing = (
    key: keyof typeof activeScene.environment.postProcessing,
    patch: Record<string, unknown>
  ) => {
    updateEnvironment({
      postProcessing: {
        ...activeScene.environment.postProcessing,
        [key]: {
          ...activeScene.environment.postProcessing[key],
          ...patch,
        },
      },
    });
  };

  const advancedLighting = resolveAdvancedLightingSettings(
    activeScene.environment.advancedLighting
  );

  const updateAdvancedLighting = (
    patch: Omit<Partial<typeof advancedLighting>, 'globalIllumination' | 'bakedLightmaps'> & {
      globalIllumination?: Partial<typeof advancedLighting.globalIllumination>;
      bakedLightmaps?: Partial<typeof advancedLighting.bakedLightmaps>;
    }
  ) => {
    updateEnvironment({
      advancedLighting: {
        ...advancedLighting,
        ...patch,
        globalIllumination: patch.globalIllumination
          ? {
              ...advancedLighting.globalIllumination,
              ...patch.globalIllumination,
            }
          : advancedLighting.globalIllumination,
        bakedLightmaps: patch.bakedLightmaps
          ? {
              ...advancedLighting.bakedLightmaps,
              ...patch.bakedLightmaps,
            }
          : advancedLighting.bakedLightmaps,
      },
    });
  };

  const fog = activeScene.environment.fog;
  const bloom = activeScene.environment.postProcessing.bloom;
  const ssao = activeScene.environment.postProcessing.ssao;
  const ssr = activeScene.environment.postProcessing.ssr;
  const colorGrading = activeScene.environment.postProcessing.colorGrading;
  const vignette = activeScene.environment.postProcessing.vignette;
  const cameraEntities = activeScene.entities.filter((entity) => entity.components.has('Camera'));
  const textureAssets = assets.filter((asset) => asset.type === 'texture');
  const selectedTextureAsset =
    editor.selectedAsset
      ? assets.find(
          (asset) => asset.id === editor.selectedAsset && asset.type === 'texture'
        ) ?? null
      : null;
  const currentSkyboxAssetPath = getWorldSkyAssetPath(activeScene.environment.skybox);
  const skyboxMode = isWorldSkyAsset(activeScene.environment.skybox)
    ? '__asset__'
    : resolveWorldSkyPreset(activeScene.environment.skybox);
  const selectedEntity = activeScene.entities.find(
    (entity) => entity.id === editor.selectedEntities[0]
  ) ?? null;
  const selectedCameraEntity =
    selectedEntity && selectedEntity.components.has('Camera') ? selectedEntity : null;

  const applyViewportCamera = (entityId: string | null) => {
    if (!entityId) {
      setViewportCameraEntity(null);
      return;
    }

    const entity = cameraEntities.find((candidate) => candidate.id === entityId);
    if (!entity) {
      setViewportCameraEntity(null);
      return;
    }

    const cameraComponent = entity.components.get('Camera');
    const cameraData =
      cameraComponent && typeof cameraComponent.data === 'object'
        ? (cameraComponent.data as {
            fov?: number;
            orthographic?: boolean;
          })
        : null;

    setViewportCameraEntity(entity.id);
    setViewportCameraMode(cameraData?.orthographic ? 'orthographic' : 'perspective');
    if (typeof cameraData?.fov === 'number') {
      setViewportFov(cameraData.fov);
    }
  };

  const applyLookPreset = (presetName: keyof typeof WORLD_LOOK_PRESETS) => {
    updateEnvironment(applyWorldLookPreset(activeScene.environment, presetName));
  };

  return (
    <div className="flex h-full flex-col bg-slate-800/50">
      <div className="border-b border-slate-700 px-3 py-2">
        <h3 className="text-sm font-medium text-slate-200">World</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-3">
          <section className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Scene</p>
              <p className="mt-1 text-sm text-slate-200">{activeScene.name}</p>
            </div>

            <div className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Visual Presets</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Aplican un look completo de mundo + render sin perder tu HDRI cargado.
                  </p>
                </div>
                <span className="text-[11px] text-slate-500">Look dev</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(WORLD_LOOK_PRESETS).map(([presetName, preset]) => (
                  <Button
                    key={presetName}
                    variant="outline"
                    className="h-auto min-h-20 flex-col items-start gap-1 border-slate-700 bg-slate-950/50 px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
                    onClick={() =>
                      applyLookPreset(presetName as keyof typeof WORLD_LOOK_PRESETS)
                    }
                  >
                    <span className="text-xs font-medium">{preset.label}</span>
                    <span className="text-[11px] leading-snug text-slate-400">
                      {preset.description}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Sky / HDRI Source</Label>
              <Select
                value={skyboxMode}
                onValueChange={(value) => {
                  if (value === '__asset__') {
                    const nextAssetPath =
                      currentSkyboxAssetPath ?? selectedTextureAsset?.path ?? textureAssets[0]?.path;
                    updateEnvironment({
                      skybox: nextAssetPath ? makeWorldSkyAssetValue(nextAssetPath) : 'studio',
                    });
                    return;
                  }
                  updateEnvironment({ skybox: value });
                }}
              >
                <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="studio">Studio</SelectItem>
                  <SelectItem value="sunset">Sunset</SelectItem>
                  <SelectItem value="forest">Forest</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                  <SelectItem value="__asset__">Texture Asset / HDRI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isWorldSkyAsset(activeScene.environment.skybox) && (
              <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-900/45 p-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Environment Asset</Label>
                  <Select
                    value={currentSkyboxAssetPath ?? '__none__'}
                    onValueChange={(value) =>
                      updateEnvironment({
                        skybox:
                          value === '__none__' ? 'studio' : makeWorldSkyAssetValue(value),
                      })
                    }
                  >
                    <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                      <SelectValue placeholder="Selecciona una textura" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="__none__">Volver a preset</SelectItem>
                      {textureAssets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.path}>
                          {asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTextureAsset && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full border-slate-700 bg-slate-900 text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() =>
                      updateEnvironment({
                        skybox: makeWorldSkyAssetValue(selectedTextureAsset.path),
                      })
                    }
                  >
                    Usar textura seleccionada
                  </Button>
                )}
                <p className="text-[11px] text-slate-500">
                  {currentSkyboxAssetPath
                    ? isHdrEnvironmentAsset(currentSkyboxAssetPath)
                      ? 'Usando HDRI/EXR protegido desde la libreria de assets.'
                      : 'Usando textura equirectangular protegida desde la libreria de assets.'
                    : 'Selecciona una textura desde Assets para usarla como entorno.'}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">HDRI Intensity</Label>
                <span className="text-[11px] text-slate-500">
                  {(activeScene.environment.environmentIntensity ?? 1).toFixed(2)}
                </span>
              </div>
              <Slider
                value={[activeScene.environment.environmentIntensity ?? 1]}
                onValueChange={([value]) => updateEnvironment({ environmentIntensity: value })}
                min={0}
                max={3}
                step={0.05}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">Environment Rotation</Label>
                <span className="text-[11px] text-slate-500">
                  {Math.round(activeScene.environment.environmentRotation ?? 0)}°
                </span>
              </div>
              <Slider
                value={[activeScene.environment.environmentRotation ?? 0]}
                onValueChange={([value]) => updateEnvironment({ environmentRotation: value })}
                min={0}
                max={360}
                step={1}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Ambient Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={rgbColorToHex(activeScene.environment.ambientLight)}
                  onChange={(event) =>
                    updateEnvironment({ ambientLight: { ...hexToRgbColor(event.target.value), a: 1 } })
                  }
                  className="h-8 w-12 bg-transparent border-0 p-0"
                />
                <Input
                  value={rgbColorToHex(activeScene.environment.ambientLight)}
                  onChange={(event) =>
                    updateEnvironment({ ambientLight: { ...hexToRgbColor(event.target.value), a: 1 } })
                  }
                  className="h-8 bg-slate-900 border-slate-700 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">Ambient Intensity</Label>
                <span className="text-[11px] text-slate-500">
                  {(activeScene.environment.ambientIntensity ?? 1).toFixed(2)}
                </span>
              </div>
              <Slider
                value={[activeScene.environment.ambientIntensity ?? 1]}
                onValueChange={([value]) => updateEnvironment({ ambientIntensity: value })}
                min={0}
                max={3}
                step={0.05}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-400">Primary Light</p>
              <span className="text-[11px] text-slate-500">Sun rig</span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">Light Intensity</Label>
                <span className="text-[11px] text-slate-500">
                  {(activeScene.environment.directionalLightIntensity ?? 1.2).toFixed(2)}
                </span>
              </div>
              <Slider
                value={[activeScene.environment.directionalLightIntensity ?? 1.2]}
                onValueChange={([value]) => updateEnvironment({ directionalLightIntensity: value })}
                min={0}
                max={4}
                step={0.05}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">Azimuth</Label>
                <span className="text-[11px] text-slate-500">
                  {Math.round(activeScene.environment.directionalLightAzimuth ?? 45)}°
                </span>
              </div>
              <Slider
                value={[activeScene.environment.directionalLightAzimuth ?? 45]}
                onValueChange={([value]) => updateEnvironment({ directionalLightAzimuth: value })}
                min={0}
                max={360}
                step={1}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">Elevation</Label>
                <span className="text-[11px] text-slate-500">
                  {Math.round(activeScene.environment.directionalLightElevation ?? 55)}°
                </span>
              </div>
              <Slider
                value={[activeScene.environment.directionalLightElevation ?? 55]}
                onValueChange={([value]) => updateEnvironment({ directionalLightElevation: value })}
                min={5}
                max={85}
                step={1}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Lighting Quality
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Controla sombras, rebote global y horneado aproximado del viewport.
                </p>
              </div>
              <span className="text-[11px] text-slate-500">Viewport pro</span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Shadow Quality</Label>
              <Select
                value={advancedLighting.shadowQuality}
                onValueChange={(value: 'low' | 'medium' | 'high' | 'ultra') =>
                  updateAdvancedLighting({ shadowQuality: value })
                }
              >
                <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="low">Low / Preview</SelectItem>
                  <SelectItem value="medium">Medium / Balanced</SelectItem>
                  <SelectItem value="high">High / Studio</SelectItem>
                  <SelectItem value="ultra">Ultra / Hero</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Global Illumination
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Rebote de luz aproximado para dar más cuerpo a materiales y escena.
                  </p>
                </div>
                <Switch
                  checked={advancedLighting.globalIllumination.enabled}
                  onCheckedChange={(checked) =>
                    updateAdvancedLighting({
                      globalIllumination: { enabled: checked },
                    })
                  }
                />
              </div>

              {advancedLighting.globalIllumination.enabled && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">GI Intensity</Label>
                      <span className="text-[11px] text-slate-500">
                        {advancedLighting.globalIllumination.intensity.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[advancedLighting.globalIllumination.intensity]}
                      onValueChange={([value]) =>
                        updateAdvancedLighting({
                          globalIllumination: { intensity: value },
                        })
                      }
                      min={0.25}
                      max={1.75}
                      step={0.05}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">Bounce Count</Label>
                      <span className="text-[11px] text-slate-500">
                        {advancedLighting.globalIllumination.bounceCount}
                      </span>
                    </div>
                    <Slider
                      value={[advancedLighting.globalIllumination.bounceCount]}
                      onValueChange={([value]) =>
                        updateAdvancedLighting({
                          globalIllumination: {
                            bounceCount: Math.max(1, Math.min(3, Math.round(value))),
                          },
                        })
                      }
                      min={1}
                      max={3}
                      step={1}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Baked Lightmaps
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Hornea luz aproximada en texturas para bloquear el look del escenario.
                  </p>
                </div>
                <Switch
                  checked={advancedLighting.bakedLightmaps.enabled}
                  onCheckedChange={(checked) =>
                    updateAdvancedLighting({
                      bakedLightmaps: { enabled: checked },
                    })
                  }
                />
              </div>

              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full border-slate-700 bg-slate-900 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!advancedLighting.bakedLightmaps.enabled}
                onClick={() => requestLightingBake(activeScene.id)}
              >
                Hornear ahora
              </Button>
              <p className="mt-2 text-[11px] text-slate-500">
                Repite el horneado cuando cambien luces, materiales base o geometría principal.
              </p>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-400">Fog</p>
              <Switch checked={Boolean(fog?.enabled)} onCheckedChange={updateFog} />
            </div>

            {fog?.enabled && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Fog Type</Label>
                  <Select
                    value={fog.type}
                    onValueChange={(value: 'linear' | 'exponential') =>
                      updateEnvironment({ fog: { ...fog, type: value } })
                    }
                  >
                    <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="linear">Linear</SelectItem>
                      <SelectItem value="exponential">Exponential</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Fog Color</Label>
                  <Input
                    type="color"
                    value={rgbColorToHex(fog.color)}
                    onChange={(event) =>
                      updateEnvironment({ fog: { ...fog, color: { ...hexToRgbColor(event.target.value), a: 1 } } })
                    }
                    className="h-8 w-12 bg-transparent border-0 p-0"
                  />
                </div>

                {fog.type === 'linear' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Near</Label>
                      <Input
                        type="number"
                        value={fog.near ?? 12}
                        onChange={(event) =>
                          updateEnvironment({
                            fog: { ...fog, near: parseFloat(event.target.value) || 0, enabled: true },
                          })
                        }
                        className="h-8 bg-slate-900 border-slate-700 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Far</Label>
                      <Input
                        type="number"
                        value={fog.far ?? 90}
                        onChange={(event) =>
                          updateEnvironment({
                            fog: { ...fog, far: parseFloat(event.target.value) || 0, enabled: true },
                          })
                        }
                        className="h-8 bg-slate-900 border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">Density</Label>
                      <span className="text-[11px] text-slate-500">{(fog.density ?? 0.015).toFixed(3)}</span>
                    </div>
                    <Slider
                      value={[fog.density ?? 0.015]}
                      onValueChange={([value]) =>
                        updateEnvironment({ fog: { ...fog, density: value, enabled: true } })
                      }
                      min={0.001}
                      max={0.08}
                      step={0.001}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-400">Camera + Navigation</p>
              <span className="text-[11px] text-slate-500">Viewport</span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Viewport Camera</Label>
              <Select
                value={editor.viewportCameraEntityId ?? '__editor_camera__'}
                onValueChange={(value) =>
                  applyViewportCamera(value === '__editor_camera__' ? null : value)
                }
              >
                <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="__editor_camera__">Editor Camera</SelectItem>
                  {cameraEntities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCameraEntity && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-slate-700 bg-slate-900 text-xs text-slate-200 hover:bg-slate-800"
                  onClick={() => applyViewportCamera(selectedCameraEntity.id)}
                >
                  Usar camara seleccionada
                </Button>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Navigation Mode</Label>
              <Select
                value={editor.navigationMode ?? 'orbit'}
                onValueChange={(value: 'orbit' | 'fly' | 'walk') => setNavigationMode(value)}
              >
                <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="orbit">Orbit</SelectItem>
                  <SelectItem value="fly">Fly</SelectItem>
                  <SelectItem value="walk">Walk</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Camera View</Label>
              <Select
                value={editor.viewportCameraMode ?? 'perspective'}
                onValueChange={(value: 'perspective' | 'orthographic' | 'top' | 'front' | 'side') => {
                  setViewportCameraEntity(null);
                  setViewportCameraMode(value);
                }}
              >
                <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="perspective">Perspective</SelectItem>
                  <SelectItem value="orthographic">Orthographic</SelectItem>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="front">Front</SelectItem>
                  <SelectItem value="side">Side</SelectItem>
                </SelectContent>
              </Select>
              {editor.viewportCameraEntityId && (
                <p className="text-[11px] text-slate-500">
                  La camara virtual bloquea la navegacion orbital hasta volver a Editor Camera.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">Field of View</Label>
                <span className="text-[11px] text-slate-500">{Math.round(editor.viewportFov ?? 60)}°</span>
              </div>
              <Slider
                value={[editor.viewportFov ?? 60]}
                onValueChange={([value]) => setViewportFov(value)}
                min={15}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">Move Speed</Label>
                <span className="text-[11px] text-slate-500">{(editor.cameraSpeed ?? 1).toFixed(1)}x</span>
              </div>
              <Slider
                value={[editor.cameraSpeed ?? 1]}
                onValueChange={([value]) => setCameraSpeed(value)}
                min={0.5}
                max={4}
                step={0.1}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Post FX</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Nucleo visual del viewport, incluyendo tonemapping, AO y reflejos.
                </p>
              </div>
              <span className="text-[11px] text-slate-500">Realtime</span>
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Render Core</p>
                <span className="text-[11px] text-slate-500">Always on</span>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Tone Mapping</Label>
                  <Select
                    value={colorGrading.toneMapping ?? 'aces'}
                    onValueChange={(
                      value: 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces'
                    ) =>
                      updatePostProcessing('colorGrading', {
                        toneMapping: value,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 bg-slate-900 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="aces">ACES</SelectItem>
                      <SelectItem value="cineon">Cineon</SelectItem>
                      <SelectItem value="reinhard">Reinhard</SelectItem>
                      <SelectItem value="linear">Linear</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-400">Renderer Exposure</Label>
                    <span className="text-[11px] text-slate-500">
                      {(colorGrading.rendererExposure ?? 1).toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[colorGrading.rendererExposure ?? 1]}
                    onValueChange={([value]) =>
                      updatePostProcessing('colorGrading', { rendererExposure: value })
                    }
                    min={0.35}
                    max={2.5}
                    step={0.05}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Bloom</p>
                <Switch
                  checked={bloom.enabled}
                  onCheckedChange={(checked) => updatePostProcessing('bloom', { enabled: checked })}
                />
              </div>
              {bloom.enabled && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">Bloom Intensity</Label>
                      <span className="text-[11px] text-slate-500">
                        {bloom.intensity.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[bloom.intensity]}
                      onValueChange={([value]) =>
                        updatePostProcessing('bloom', { intensity: value })
                      }
                      min={0}
                      max={3}
                      step={0.05}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Threshold</Label>
                      <Input
                        type="number"
                        value={bloom.threshold}
                        onChange={(event) =>
                          updatePostProcessing('bloom', {
                            threshold: parseFloat(event.target.value) || 0,
                          })
                        }
                        className="h-8 bg-slate-900 border-slate-700 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Radius</Label>
                      <Input
                        type="number"
                        value={bloom.radius}
                        onChange={(event) =>
                          updatePostProcessing('bloom', {
                            radius: parseFloat(event.target.value) || 0,
                          })
                        }
                        className="h-8 bg-slate-900 border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">SSAO</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Refuerza contacto entre piezas y lectura de volumen.
                  </p>
                </div>
                <Switch
                  checked={ssao.enabled}
                  onCheckedChange={(checked) => updatePostProcessing('ssao', { enabled: checked })}
                />
              </div>
              {ssao.enabled && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">Radius</Label>
                      <span className="text-[11px] text-slate-500">{ssao.radius.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[ssao.radius]}
                      onValueChange={([value]) => updatePostProcessing('ssao', { radius: value })}
                      min={0.2}
                      max={2}
                      step={0.05}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Intensity</Label>
                      <Input
                        type="number"
                        value={ssao.intensity}
                        onChange={(event) =>
                          updatePostProcessing('ssao', {
                            intensity: parseFloat(event.target.value) || 0,
                          })
                        }
                        className="h-8 bg-slate-900 border-slate-700 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Bias</Label>
                      <Input
                        type="number"
                        value={ssao.bias}
                        onChange={(event) =>
                          updatePostProcessing('ssao', {
                            bias: parseFloat(event.target.value) || 0,
                          })
                        }
                        className="h-8 bg-slate-900 border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">SSR</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Reflejos en pantalla para metal, vidrio y suelos pulidos.
                  </p>
                </div>
                <Switch
                  checked={ssr.enabled}
                  onCheckedChange={(checked) => updatePostProcessing('ssr', { enabled: checked })}
                />
              </div>
              {ssr.enabled && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">Reflection Intensity</Label>
                      <span className="text-[11px] text-slate-500">
                        {ssr.intensity.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[ssr.intensity]}
                      onValueChange={([value]) =>
                        updatePostProcessing('ssr', { intensity: value })
                      }
                      min={0.05}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Max Distance</Label>
                    <Input
                      type="number"
                      value={ssr.maxDistance}
                      onChange={(event) =>
                        updatePostProcessing('ssr', {
                          maxDistance: parseFloat(event.target.value) || 0,
                        })
                      }
                      className="h-8 bg-slate-900 border-slate-700 text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    En vista ortográfica el viewport lo desactiva temporalmente para mantener estabilidad.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Color Grading
                </p>
                <Switch
                  checked={colorGrading.enabled}
                  onCheckedChange={(checked) =>
                    updatePostProcessing('colorGrading', { enabled: checked })
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-400">Exposure</Label>
                  <span className="text-[11px] text-slate-500">
                    {colorGrading.exposure.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[colorGrading.exposure]}
                  onValueChange={([value]) =>
                    updatePostProcessing('colorGrading', { exposure: value })
                  }
                  min={0.35}
                  max={2.5}
                  step={0.05}
                />
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Contrast</Label>
                    <Input
                      type="number"
                      value={colorGrading.contrast}
                      onChange={(event) =>
                        updatePostProcessing('colorGrading', {
                          contrast: parseFloat(event.target.value) || 1,
                        })
                      }
                      className="h-8 bg-slate-900 border-slate-700 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Saturation</Label>
                    <Input
                      type="number"
                      value={colorGrading.saturation}
                      onChange={(event) =>
                        updatePostProcessing('colorGrading', {
                          saturation: parseFloat(event.target.value) || 1,
                        })
                      }
                      className="h-8 bg-slate-900 border-slate-700 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Gamma</Label>
                    <Input
                      type="number"
                      value={colorGrading.gamma}
                      onChange={(event) =>
                        updatePostProcessing('colorGrading', {
                          gamma: parseFloat(event.target.value) || 2.2,
                        })
                      }
                      className="h-8 bg-slate-900 border-slate-700 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Vignette</p>
                <Switch
                  checked={vignette.enabled}
                  onCheckedChange={(checked) =>
                    updatePostProcessing('vignette', { enabled: checked })
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Intensity</Label>
                  <Input
                    type="number"
                    value={vignette.intensity}
                    onChange={(event) =>
                      updatePostProcessing('vignette', {
                        intensity: parseFloat(event.target.value) || 0,
                      })
                    }
                    className="h-8 bg-slate-900 border-slate-700 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Smoothness</Label>
                  <Input
                    type="number"
                    value={vignette.smoothness}
                    onChange={(event) =>
                      updatePostProcessing('vignette', {
                        smoothness: parseFloat(event.target.value) || 0.5,
                      })
                    }
                    className="h-8 bg-slate-900 border-slate-700 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Roundness</Label>
                  <Input
                    type="number"
                    value={vignette.roundness}
                    onChange={(event) =>
                      updatePostProcessing('vignette', {
                        roundness: parseFloat(event.target.value) || 1,
                      })
                    }
                    className="h-8 bg-slate-900 border-slate-700 text-xs"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
