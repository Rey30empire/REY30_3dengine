import path from 'path';
import type { SupportedModelFormat } from './types';

export const SUPPORTED_MODEL_EXTENSIONS = ['.fbx', '.obj', '.glb', '.gltf'] as const;
export const COMPANION_RESOURCE_EXTENSIONS = [
  '.bin',
  '.mtl',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.gif',
  '.tga',
  '.ktx2',
] as const;

export const DEFAULT_MODULAR_PROJECT_NAME = 'Modular Lab';
export const DEFAULT_MODULAR_PROJECT_SLUG = 'modular-lab';
export const DEFAULT_MAX_SOURCE_FILE_MB = 80;
export const DEFAULT_MAX_SOURCE_BUNDLE_MB = 250;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function sanitizeUploadFileName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_');
}

export function slugifyModularName(value: string, fallback = 'modular_character'): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function getModelExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function inferModelFormat(fileName: string): SupportedModelFormat | null {
  const ext = getModelExtension(fileName);
  if (ext === '.fbx' || ext === '.obj' || ext === '.glb' || ext === '.gltf') {
    return ext.slice(1) as SupportedModelFormat;
  }
  return null;
}

export function isSupportedPrimaryModelFile(fileName: string): boolean {
  return inferModelFormat(fileName) !== null;
}

export function isSupportedCompanionFile(fileName: string): boolean {
  return COMPANION_RESOURCE_EXTENSIONS.includes(getModelExtension(fileName) as never);
}

export function getSupportedModelFileLabel() {
  return SUPPORTED_MODEL_EXTENSIONS.join(', ');
}

export function normalizeResourceKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim().toLowerCase();
}

export function buildRelativeStoragePath(...segments: string[]) {
  return segments
    .filter(Boolean)
    .map((segment) => sanitizeUploadFileName(segment).replace(/\\/g, '/'))
    .join('/');
}

export function resolveMaxSourceFileBytes(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.REY30_MODULAR_MAX_SOURCE_FILE_MB || DEFAULT_MAX_SOURCE_FILE_MB);
  const safeValue = Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_SOURCE_FILE_MB;
  return safeValue * 1024 * 1024;
}

export function resolveMaxSourceBundleBytes(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.REY30_MODULAR_MAX_SOURCE_BUNDLE_MB || DEFAULT_MAX_SOURCE_BUNDLE_MB);
  const safeValue = Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_SOURCE_BUNDLE_MB;
  return safeValue * 1024 * 1024;
}

export function isMaybeSupportedMimeType(mimeType: string, format: SupportedModelFormat): boolean {
  const normalizedMime = normalize(mimeType);
  if (!normalizedMime) return true;

  const formatToMime: Record<SupportedModelFormat, string[]> = {
    glb: ['model/gltf-binary', 'application/octet-stream'],
    gltf: ['model/gltf+json', 'application/json', 'text/plain'],
    fbx: ['application/octet-stream', 'model/fbx'],
    obj: ['application/octet-stream', 'text/plain', 'model/obj'],
  };

  return formatToMime[format].includes(normalizedMime);
}
