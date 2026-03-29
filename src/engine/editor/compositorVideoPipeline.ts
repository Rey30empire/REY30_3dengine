import type { EnvironmentSettings } from '@/types/engine';

export type CompositorLookPresetId = 'product_clean' | 'trailer_punch' | 'neon_noir';

export type CompositorCameraMove =
  | 'static'
  | 'orbit'
  | 'dolly_in'
  | 'dolly_out'
  | 'flythrough';

export interface CompositorShotDraft {
  title: string;
  subject: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '1:1' | '9:16';
  cameraMove: CompositorCameraMove;
  notes: string;
}

export interface CompositorVideoJobDocument {
  version: 1;
  createdAt: string;
  projectName?: string;
  sceneName: string;
  lookPresetId?: CompositorLookPresetId;
  lookSummary: string;
  posterFrameAssetPath?: string;
  shot: CompositorShotDraft;
  prompt: string;
}

export interface CompositorLookPreset {
  id: CompositorLookPresetId;
  label: string;
  description: string;
  apply: (environment: EnvironmentSettings) => EnvironmentSettings;
}

const DEFAULT_SHOT: CompositorShotDraft = {
  title: 'Hero Shot',
  subject: 'hero object',
  durationSeconds: 4,
  aspectRatio: '16:9',
  cameraMove: 'orbit',
  notes: '',
};

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readShotDraft(value: unknown): CompositorShotDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    title:
      typeof record.title === 'string' && record.title.trim().length > 0
        ? record.title.trim()
        : DEFAULT_SHOT.title,
    subject:
      typeof record.subject === 'string' && record.subject.trim().length > 0
        ? record.subject.trim()
        : DEFAULT_SHOT.subject,
    durationSeconds: clamp(Number(record.durationSeconds), 1, 30, DEFAULT_SHOT.durationSeconds),
    aspectRatio:
      record.aspectRatio === '1:1' || record.aspectRatio === '9:16' ? record.aspectRatio : '16:9',
    cameraMove:
      record.cameraMove === 'static' ||
      record.cameraMove === 'orbit' ||
      record.cameraMove === 'dolly_in' ||
      record.cameraMove === 'dolly_out' ||
      record.cameraMove === 'flythrough'
        ? record.cameraMove
        : DEFAULT_SHOT.cameraMove,
    notes: typeof record.notes === 'string' ? record.notes.trim() : '',
  };
}

function cloneEnvironment(environment: EnvironmentSettings): EnvironmentSettings {
  return structuredClone(environment);
}

export const COMPOSITOR_LOOK_PRESETS: CompositorLookPreset[] = [
  {
    id: 'product_clean',
    label: 'Product Clean',
    description: 'Lectura limpia para turntables, producto y validacion de material.',
    apply: (environment) => {
      const next = cloneEnvironment(environment);
      next.postProcessing.bloom = {
        ...next.postProcessing.bloom,
        enabled: false,
        intensity: 0.35,
        threshold: 0.88,
        radius: 0.35,
      };
      next.postProcessing.ssao = {
        ...next.postProcessing.ssao,
        enabled: true,
        radius: 0.38,
        intensity: 0.72,
        bias: 0.022,
      };
      next.postProcessing.ssr = {
        ...next.postProcessing.ssr,
        enabled: false,
        intensity: 0.35,
        maxDistance: 80,
      };
      next.postProcessing.colorGrading = {
        ...next.postProcessing.colorGrading,
        enabled: true,
        exposure: 1,
        contrast: 1.04,
        saturation: 1,
        gamma: 2.2,
        toneMapping: 'aces',
        rendererExposure: 1.04,
      };
      next.postProcessing.vignette = {
        ...next.postProcessing.vignette,
        enabled: false,
        intensity: 0.18,
        smoothness: 0.68,
        roundness: 1,
      };
      return next;
    },
  },
  {
    id: 'trailer_punch',
    label: 'Trailer Punch',
    description: 'Contraste, bloom y viñeta para shots hero y beats de trailer.',
    apply: (environment) => {
      const next = cloneEnvironment(environment);
      next.postProcessing.bloom = {
        ...next.postProcessing.bloom,
        enabled: true,
        intensity: 0.95,
        threshold: 0.74,
        radius: 0.62,
      };
      next.postProcessing.ssao = {
        ...next.postProcessing.ssao,
        enabled: true,
        radius: 0.56,
        intensity: 0.96,
        bias: 0.03,
      };
      next.postProcessing.ssr = {
        ...next.postProcessing.ssr,
        enabled: true,
        intensity: 0.62,
        maxDistance: 120,
      };
      next.postProcessing.colorGrading = {
        ...next.postProcessing.colorGrading,
        enabled: true,
        exposure: 1.02,
        contrast: 1.14,
        saturation: 0.96,
        gamma: 2.18,
        toneMapping: 'aces',
        rendererExposure: 1.08,
      };
      next.postProcessing.vignette = {
        ...next.postProcessing.vignette,
        enabled: true,
        intensity: 0.48,
        smoothness: 0.74,
        roundness: 0.92,
      };
      return next;
    },
  },
  {
    id: 'neon_noir',
    label: 'Neon Noir',
    description: 'Glow, reflexiones y viñeta cerrada para night shots y sci-fi.',
    apply: (environment) => {
      const next = cloneEnvironment(environment);
      next.postProcessing.bloom = {
        ...next.postProcessing.bloom,
        enabled: true,
        intensity: 1.15,
        threshold: 0.66,
        radius: 0.72,
      };
      next.postProcessing.ssao = {
        ...next.postProcessing.ssao,
        enabled: true,
        radius: 0.62,
        intensity: 1,
        bias: 0.032,
      };
      next.postProcessing.ssr = {
        ...next.postProcessing.ssr,
        enabled: true,
        intensity: 0.82,
        maxDistance: 140,
      };
      next.postProcessing.colorGrading = {
        ...next.postProcessing.colorGrading,
        enabled: true,
        exposure: 0.94,
        contrast: 1.16,
        saturation: 1.08,
        gamma: 2.16,
        toneMapping: 'aces',
        rendererExposure: 0.96,
      };
      next.postProcessing.vignette = {
        ...next.postProcessing.vignette,
        enabled: true,
        intensity: 0.62,
        smoothness: 0.82,
        roundness: 0.84,
      };
      return next;
    },
  },
];

export function applyCompositorLookPreset(
  environment: EnvironmentSettings,
  presetId: CompositorLookPresetId
) {
  const preset =
    COMPOSITOR_LOOK_PRESETS.find((entry) => entry.id === presetId) ??
    COMPOSITOR_LOOK_PRESETS[0];
  return preset.apply(environment);
}

export function summarizeCompositorLook(environment: EnvironmentSettings) {
  const { bloom, ssao, ssr, colorGrading, vignette } = environment.postProcessing;
  const parts = [
    `bloom ${bloom.enabled ? bloom.intensity.toFixed(2) : 'off'}`,
    `ssao ${ssao.enabled ? ssao.intensity.toFixed(2) : 'off'}`,
    `ssr ${ssr.enabled ? ssr.intensity.toFixed(2) : 'off'}`,
    `tone ${colorGrading.toneMapping ?? 'aces'}`,
    `render exp ${(colorGrading.rendererExposure ?? 1).toFixed(2)}`,
    `grade exp ${colorGrading.exposure.toFixed(2)}`,
    `vignette ${vignette.enabled ? vignette.intensity.toFixed(2) : 'off'}`,
  ];
  return parts.join(' · ');
}

function humanizeCameraMove(cameraMove: CompositorCameraMove) {
  switch (cameraMove) {
    case 'static':
      return 'locked camera';
    case 'orbit':
      return 'slow orbit around the subject';
    case 'dolly_in':
      return 'slow dolly in';
    case 'dolly_out':
      return 'slow dolly out';
    case 'flythrough':
      return 'gentle flythrough';
    default:
      return 'cinematic camera move';
  }
}

export function buildCompositorVideoPrompt(params: {
  sceneName: string;
  lookSummary: string;
  shot: CompositorShotDraft;
  posterFrameAssetPath?: string | null;
}) {
  const notes = params.shot.notes.trim();
  const posterReference = params.posterFrameAssetPath?.trim()
    ? `Reference frame: ${params.posterFrameAssetPath.trim()}.`
    : '';

  return [
    `Create a polished cinematic video shot for scene "${params.sceneName}".`,
    `Shot title: ${params.shot.title}.`,
    `Primary subject: ${params.shot.subject}.`,
    `Duration: ${params.shot.durationSeconds} seconds.`,
    `Aspect ratio: ${params.shot.aspectRatio}.`,
    `Camera move: ${humanizeCameraMove(params.shot.cameraMove)}.`,
    `Compositing look: ${params.lookSummary}.`,
    posterReference,
    notes ? `Extra direction: ${notes}.` : '',
    'Keep materials coherent with the reference frame, preserve scene readability, and avoid abrupt cuts.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function createDefaultCompositorShot(): CompositorShotDraft {
  return { ...DEFAULT_SHOT };
}

export function serializeCompositorVideoJobDocument(input: {
  projectName?: string;
  sceneName: string;
  lookPresetId?: CompositorLookPresetId;
  lookSummary: string;
  posterFrameAssetPath?: string | null;
  shot: CompositorShotDraft;
  prompt: string;
}) {
  const document: CompositorVideoJobDocument = {
    version: 1,
    createdAt: new Date().toISOString(),
    sceneName: input.sceneName.trim() || 'Untitled Scene',
    lookSummary: input.lookSummary.trim() || 'No look summary',
    shot: {
      ...input.shot,
      title: input.shot.title.trim() || DEFAULT_SHOT.title,
      subject: input.shot.subject.trim() || DEFAULT_SHOT.subject,
      notes: input.shot.notes.trim(),
    },
    prompt: input.prompt.trim(),
  };

  if (input.projectName?.trim()) {
    document.projectName = input.projectName.trim();
  }
  if (input.lookPresetId) {
    document.lookPresetId = input.lookPresetId;
  }
  if (input.posterFrameAssetPath?.trim()) {
    document.posterFrameAssetPath = input.posterFrameAssetPath.trim();
  }

  return JSON.stringify(document, null, 2);
}

export function parseCompositorVideoJobDocument(value: unknown): CompositorVideoJobDocument | null {
  const record = asRecord(value);
  if (!record) return null;

  const shot = readShotDraft(record.shot);
  if (!shot) return null;

  const prompt =
    typeof record.prompt === 'string' && record.prompt.trim().length > 0
      ? record.prompt.trim()
      : '';
  const sceneName =
    typeof record.sceneName === 'string' && record.sceneName.trim().length > 0
      ? record.sceneName.trim()
      : '';
  const lookSummary =
    typeof record.lookSummary === 'string' && record.lookSummary.trim().length > 0
      ? record.lookSummary.trim()
      : '';

  if (!prompt || !sceneName || !lookSummary) {
    return null;
  }

  return {
    version: 1,
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt.trim().length > 0
        ? record.createdAt.trim()
        : new Date(0).toISOString(),
    projectName:
      typeof record.projectName === 'string' && record.projectName.trim().length > 0
        ? record.projectName.trim()
        : undefined,
    sceneName,
    lookPresetId:
      record.lookPresetId === 'product_clean' ||
      record.lookPresetId === 'trailer_punch' ||
      record.lookPresetId === 'neon_noir'
        ? record.lookPresetId
        : undefined,
    lookSummary,
    posterFrameAssetPath:
      typeof record.posterFrameAssetPath === 'string' &&
      record.posterFrameAssetPath.trim().length > 0
        ? record.posterFrameAssetPath.trim()
        : undefined,
    shot,
    prompt,
  };
}
