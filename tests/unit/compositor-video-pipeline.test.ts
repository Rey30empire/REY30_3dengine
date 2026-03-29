import { describe, expect, it } from 'vitest';
import {
  applyCompositorLookPreset,
  buildCompositorVideoPrompt,
  createDefaultCompositorShot,
  parseCompositorVideoJobDocument,
  serializeCompositorVideoJobDocument,
  summarizeCompositorLook,
} from '@/engine/editor/compositorVideoPipeline';

const baseEnvironment = {
  skybox: 'studio',
  ambientLight: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
  ambientIntensity: 1,
  environmentIntensity: 1,
  environmentRotation: 0,
  directionalLightIntensity: 1.2,
  directionalLightAzimuth: 45,
  directionalLightElevation: 55,
  fog: null,
  postProcessing: {
    bloom: { enabled: false, intensity: 0.5, threshold: 0.8, radius: 0.5 },
    ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025 },
    ssr: { enabled: false, intensity: 0.5, maxDistance: 100 },
    colorGrading: {
      enabled: false,
      exposure: 1,
      contrast: 1,
      saturation: 1,
      gamma: 2.2,
      toneMapping: 'aces' as const,
      rendererExposure: 1,
    },
    vignette: { enabled: false, intensity: 0.5, smoothness: 0.5, roundness: 1 },
  },
};

describe('compositorVideoPipeline', () => {
  it('applies compositor look presets while preserving scene structure', () => {
    const next = applyCompositorLookPreset(baseEnvironment, 'trailer_punch');

    expect(next.skybox).toBe('studio');
    expect(next.postProcessing.bloom.enabled).toBe(true);
    expect(next.postProcessing.vignette.enabled).toBe(true);
    expect(next.postProcessing.colorGrading.toneMapping).toBe('aces');
    expect(summarizeCompositorLook(next)).toContain('bloom');
    expect(summarizeCompositorLook(next)).toContain('tone aces');
  });

  it('builds a stable video prompt from shot data and poster frame', () => {
    const shot = {
      ...createDefaultCompositorShot(),
      title: 'Reveal',
      subject: 'mech hero',
      durationSeconds: 6,
      cameraMove: 'flythrough' as const,
      notes: 'Keep sparks and rim light.',
    };

    const prompt = buildCompositorVideoPrompt({
      sceneName: 'Arena',
      lookSummary: 'bloom 0.95 · tone aces',
      shot,
      posterFrameAssetPath: 'download/assets/texture/compositor/arena/reveal.png',
    });

    expect(prompt).toContain('scene "Arena"');
    expect(prompt).toContain('mech hero');
    expect(prompt).toContain('6 seconds');
    expect(prompt).toContain('Reference frame');
    expect(prompt).toContain('Keep sparks and rim light.');
  });

  it('serializes and parses compositor job documents', () => {
    const payload = serializeCompositorVideoJobDocument({
      projectName: 'Star Forge',
      sceneName: 'Arena',
      lookPresetId: 'neon_noir',
      lookSummary: 'bloom 1.15 · tone aces',
      posterFrameAssetPath: 'download/assets/texture/compositor/arena/reveal.png',
      shot: {
        ...createDefaultCompositorShot(),
        title: 'Reveal',
        subject: 'mech hero',
      },
      prompt: 'Create a polished cinematic video shot.',
    });

    const parsed = parseCompositorVideoJobDocument(JSON.parse(payload));

    expect(parsed?.version).toBe(1);
    expect(parsed?.projectName).toBe('Star Forge');
    expect(parsed?.lookPresetId).toBe('neon_noir');
    expect(parsed?.posterFrameAssetPath).toContain('reveal.png');
    expect(parsed?.shot.title).toBe('Reveal');
  });
});
