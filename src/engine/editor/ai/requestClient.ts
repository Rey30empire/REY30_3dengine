import type { APIConfig } from '@/lib/api-config';
import type { EngineWorkflowMode } from '@/types/engine';

type JsonRecord = Record<string, any>;

export async function requestAIChat(params: {
  command: string;
  engineMode: EngineWorkflowMode;
  projectName: string;
}): Promise<{ response: Response; data: JsonRecord; text: string }> {
  const response = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rey30-engine-mode': params.engineMode,
      'x-rey30-project': params.projectName || 'untitled_project',
    },
    body: JSON.stringify({
      prompt: params.command,
      messages: [
        {
          role: 'user',
          content: params.command,
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  const text = data.text || data.output_text || data.choices?.[0]?.message?.content || '';

  return { response, data, text };
}

export async function requestOpenAIImage(params: {
  config: APIConfig;
  prompt: string;
  projectName: string;
}): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rey30-project': params.projectName || 'untitled_project',
    },
    body: JSON.stringify({
      action: 'image',
      baseUrl: params.config.openai.baseUrl,
      organization: params.config.openai.organization,
      project: params.config.openai.project,
      model: params.config.openai.imageModel,
      prompt: params.prompt,
      size: params.config.openai.imageSize,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestOpenAIVideo(params: {
  config: APIConfig;
  prompt: string;
  projectName: string;
}): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rey30-project': params.projectName || 'untitled_project',
    },
    body: JSON.stringify({
      action: 'video',
      baseUrl: params.config.openai.baseUrl,
      organization: params.config.openai.organization,
      project: params.config.openai.project,
      model: params.config.openai.videoModel,
      prompt: params.prompt,
      size: params.config.openai.videoSize,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestRunwayTextToVideo(params: {
  config: APIConfig;
  prompt: string;
  projectName: string;
}): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch('/api/runway', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rey30-project': params.projectName || 'untitled_project',
    },
    body: JSON.stringify({
      action: 'textToVideo',
      baseUrl: params.config.runway.baseUrl,
      apiVersion: params.config.runway.apiVersion,
      model: params.config.runway.textToVideoModel,
      promptText: params.prompt,
      duration: params.config.runway.duration,
      ratio: params.config.runway.ratio,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestRunwayTaskStatus(taskId: string): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch(`/api/runway?taskId=${encodeURIComponent(taskId)}`, {
    headers: {},
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestMeshyPreviewStart(params: {
  config: APIConfig;
  prompt: string;
  artStyle: string;
  projectName: string;
}): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch('/api/meshy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rey30-project': params.projectName || 'untitled_project',
    },
    body: JSON.stringify({
      mode: 'preview',
      prompt: `${params.prompt}, game ready, optimized mesh, PBR textures`,
      art_style: params.artStyle || params.config.meshy.defaultArtStyle,
      negative_prompt: 'blurry, low quality, distorted, deformed',
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestMeshyTaskStatus(taskId: string): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch(`/api/meshy?taskId=${encodeURIComponent(taskId)}`, {
    headers: {},
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestCharacterJobStart(params: {
  prompt: string;
  style?: string;
  targetEngine?: 'unity' | 'unreal' | 'generic';
  includeAnimations?: boolean;
  includeBlendshapes?: boolean;
  references?: string[];
}): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch('/api/character/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      style: params.style || 'realista',
      targetEngine: params.targetEngine || 'generic',
      includeAnimations: params.includeAnimations !== false,
      includeBlendshapes: params.includeBlendshapes !== false,
      references: Array.isArray(params.references) ? params.references.slice(0, 6) : [],
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestCharacterJobStatus(jobId: string): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch(`/api/character/jobs?jobId=${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: {},
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestCharacterJobCancel(jobId: string): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch(`/api/character/jobs?jobId=${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    headers: {},
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
