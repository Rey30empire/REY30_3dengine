import type { Asset } from '@/types/engine';

interface PersistedAssetPayload {
  success?: boolean;
  asset?: {
    id: string;
    name: string;
    type: Asset['type'];
    path: string;
    size: number;
    createdAt: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

export async function persistCompositorStill(params: {
  name: string;
  sceneName: string;
  dataUrl: string;
  projectName?: string;
}) {
  const response = await fetch('/api/compositor/persist', {
    method: 'POST',
    headers: params.projectName
      ? {
          'Content-Type': 'application/json',
          'x-rey30-project': params.projectName,
        }
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'still',
      name: params.name,
      sceneName: params.sceneName,
      dataUrl: params.dataUrl,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as PersistedAssetPayload;
  if (!response.ok || !payload.asset) {
    throw new Error(payload.error || 'No se pudo persistir el still de compositor');
  }

  return payload.asset;
}

export async function persistCompositorVideoJob(params: {
  name: string;
  sceneName: string;
  documentJson: string;
  projectName?: string;
}) {
  const response = await fetch('/api/compositor/persist', {
    method: 'POST',
    headers: params.projectName
      ? {
          'Content-Type': 'application/json',
          'x-rey30-project': params.projectName,
        }
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'video_job',
      name: params.name,
      sceneName: params.sceneName,
      documentJson: params.documentJson,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as PersistedAssetPayload;
  if (!response.ok || !payload.asset) {
    throw new Error(payload.error || 'No se pudo persistir el job de video');
  }

  return payload.asset;
}

export function toEngineAsset(
  asset: NonNullable<PersistedAssetPayload['asset']>
): Asset {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    path: asset.path,
    size: asset.size,
    createdAt: new Date(asset.createdAt),
    metadata: asset.metadata ?? {},
  };
}
