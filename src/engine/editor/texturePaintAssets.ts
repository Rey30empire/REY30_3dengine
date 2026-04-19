'use client';

import type { Asset } from '@/types/engine';

type PersistTexturePaintParams = {
  textureUrl: string;
  assetName: string;
  entityName: string;
  entityId?: string;
  slot: string;
  resolution?: number;
  projectName?: string;
};

type PersistTexturePaintResponse = {
  success?: boolean;
  projectKey?: string;
  slot?: string;
  asset?: {
    id: string;
    name: string;
    path: string;
    size: number;
    version?: number;
    createdAt: string;
    source?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
};

function sanitizeFileStem(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return normalized.length > 0 ? normalized : fallback;
}

export async function persistTexturePaintAsset(params: PersistTexturePaintParams) {
  const response = await fetch(params.textureUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`No se pudo leer el mapa pintado (${response.status}).`);
  }

  const blob = await response.blob();
  const formData = new FormData();
  const assetName = sanitizeFileStem(params.assetName, 'paint_texture');
  formData.append(
    'file',
    new File([blob], `${assetName}.png`, { type: blob.type || 'image/png' })
  );
  formData.append('name', assetName);
  formData.append('entityName', params.entityName);
  if (params.entityId) {
    formData.append('entityId', params.entityId);
  }
  formData.append('slot', params.slot);
  if (typeof params.resolution === 'number' && Number.isFinite(params.resolution)) {
    formData.append('resolution', String(Math.round(params.resolution)));
  }

  const saveResponse = await fetch('/api/texture-paint/persist', {
    method: 'POST',
    headers: params.projectName
      ? { 'x-rey30-project': params.projectName }
      : undefined,
    body: formData,
  });

  const payload = (await saveResponse.json().catch(() => ({}))) as PersistTexturePaintResponse;
  if (!saveResponse.ok || !payload.asset) {
    throw new Error(payload.error || 'No se pudo guardar la textura pintada.');
  }

  return payload.asset;
}

export async function downloadTexturePaint(params: {
  textureUrl: string;
  fileName: string;
}) {
  const response = await fetch(params.textureUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`No se pudo exportar el mapa (${response.status}).`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${sanitizeFileStem(params.fileName, 'paint_texture')}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function toEngineTextureAsset(
  asset: NonNullable<PersistTexturePaintResponse['asset']>
): Asset {
  return {
    id: asset.id,
    name: asset.name,
    type: 'texture',
    path: asset.path,
    size: asset.size,
    createdAt: new Date(asset.createdAt),
    metadata: {
      ...(asset.metadata ?? {}),
      version: asset.version,
      source: asset.source,
      fileUrl: `/api/assets/file?path=${encodeURIComponent(asset.path)}`,
    },
  };
}
