import path from 'path';
import {
  DEFAULT_MAX_SOURCE_BUNDLE_MB,
  DEFAULT_MAX_SOURCE_FILE_MB,
  buildRelativeStoragePath,
  getSupportedModelFileLabel,
  isSupportedPrimaryModelFile,
  resolveMaxSourceBundleBytes,
  resolveMaxSourceFileBytes,
  sanitizeUploadFileName,
} from '@/engine/modular-character';

const DEFAULT_MODULAR_ROOT = path.join(
  process.env.LOCALAPPDATA || process.cwd(),
  'REY30_modular_character_store'
);
const DEFAULT_MODULAR_BLOB_STORE = 'rey30-modular-characters';

export type ModularCharacterStorageBackend = 'filesystem' | 'netlify-blobs';
export type ModularCharacterStorageScope = 'filesystem' | 'deploy' | 'global';

export class InvalidModularPathError extends Error {
  constructor(message = 'Invalid modular character path') {
    super(message);
    this.name = 'InvalidModularPathError';
  }
}

function trim(value: string | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getModularCharactersRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.REY30_MODULAR_CHARACTER_ROOT || DEFAULT_MODULAR_ROOT);
}

export function isNetlifyRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return trim(env.NETLIFY) === 'true' || Boolean(trim(env.CONTEXT)) || Boolean(trim(env.DEPLOY_ID));
}

export function resolveModularCharacterStorageBackend(
  env: NodeJS.ProcessEnv = process.env
): ModularCharacterStorageBackend {
  const explicit = trim(env.REY30_MODULAR_CHARACTER_STORAGE_BACKEND).toLowerCase();
  if (explicit === 'filesystem' || explicit === 'netlify-blobs') {
    return explicit as ModularCharacterStorageBackend;
  }
  return isNetlifyRuntime(env) ? 'netlify-blobs' : 'filesystem';
}

export function resolveModularCharacterBlobStoreName(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.REY30_MODULAR_CHARACTER_BLOB_STORE) || DEFAULT_MODULAR_BLOB_STORE;
}

export function resolveModularCharacterStorageScope(
  env: NodeJS.ProcessEnv = process.env
): ModularCharacterStorageScope {
  if (resolveModularCharacterStorageBackend(env) === 'filesystem') {
    return 'filesystem';
  }

  return trim(env.CONTEXT).toLowerCase() === 'production' ? 'global' : 'deploy';
}

export function normalizeModularRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function assertValidModularRelativePath(relativePath: string): string {
  const normalized = normalizeModularRelativePath(relativePath);
  if (!normalized) {
    throw new InvalidModularPathError();
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new InvalidModularPathError();
  }

  return normalized;
}

export function resolveModularRelativePath(...segments: string[]) {
  return assertValidModularRelativePath(
    buildRelativeStoragePath(...segments.map((segment) => sanitizeUploadFileName(segment)))
  );
}

export function validateIncomingSourceFiles(files: File[]) {
  if (files.length === 0) {
    return {
      ok: false,
      message: 'No se recibieron archivos fuente.',
    };
  }

  const invalidPrimary = files.find((file) => isSupportedPrimaryModelFile(file.name) === false);
  const sourceFormats = files.filter((file) => isSupportedPrimaryModelFile(file.name));

  if (sourceFormats.length === 0) {
    return {
      ok: false,
      message: `Debes incluir un archivo principal compatible (${getSupportedModelFileLabel()}).`,
    };
  }

  const maxFileBytes = resolveMaxSourceFileBytes();
  const tooLarge = files.find((file) => file.size > maxFileBytes);
  if (tooLarge) {
    return {
      ok: false,
      message: `El archivo ${tooLarge.name} supera el maximo permitido de ${DEFAULT_MAX_SOURCE_FILE_MB} MB.`,
    };
  }

  const bundleBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bundleBytes > resolveMaxSourceBundleBytes()) {
    return {
      ok: false,
      message: `El paquete supera el maximo permitido de ${DEFAULT_MAX_SOURCE_BUNDLE_MB} MB.`,
    };
  }

  if (invalidPrimary && sourceFormats.length === 0) {
    return {
      ok: false,
      message: `Formato no soportado: ${invalidPrimary.name}.`,
    };
  }

  return {
    ok: true,
    message: 'OK',
  };
}

export function getModularMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.json':
      return 'application/json';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.fbx':
      return 'application/octet-stream';
    case '.obj':
      return 'text/plain';
    case '.zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}
