import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { db } from '@/lib/db';
import type { LocalAIConfig } from '@/lib/local-ai-config';
import type { APIConfig } from '@/lib/api-config';
import type { AppUserRole } from './user-roles';
import { isAppUserRole } from './user-roles';

export const SHARED_ACCESS_TOKEN_HEADER_NAME = 'x-rey30-access-token';

type SharedAccessUser = {
  id: string;
  email: string;
  name: string | null;
  role: AppUserRole;
  isActive: boolean;
};

type SharedAccessEnvConfig = {
  enabled: boolean;
  token: string;
  email: string;
  name: string;
  role: AppUserRole;
};

type SharedAccessOverrides = {
  apiConfig: {
    routing?: Partial<APIConfig['routing']>;
    openai?: Partial<APIConfig['openai']>;
    meshy?: Partial<APIConfig['meshy']>;
    runway?: Partial<APIConfig['runway']>;
  };
  localConfig: {
    routing?: Partial<LocalAIConfig['routing']>;
  };
  hasSecrets: Partial<Record<'openai' | 'meshy', boolean>>;
};

function trimEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function safeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getSharedAccessEnvConfig(): SharedAccessEnvConfig {
  const token = trimEnv('REY30_SHARED_ACCESS_TOKEN');
  const email = normalizeEmail(trimEnv('REY30_SHARED_ACCESS_EMAIL') || 'shared-access@rey30.local');
  const configuredRole = trimEnv('REY30_SHARED_ACCESS_ROLE').toUpperCase();
  const role = isAppUserRole(configuredRole) ? configuredRole : 'OWNER';

  return {
    enabled: token.length > 0,
    token,
    email,
    name: trimEnv('REY30_SHARED_ACCESS_NAME') || 'REY30 Shared Access',
    role,
  };
}

export function isSharedAccessUserEmail(email: string): boolean {
  const config = getSharedAccessEnvConfig();
  if (!config.enabled) return false;
  return normalizeEmail(email) === config.email;
}

export function extractSharedAccessToken(request: NextRequest): string {
  const direct = (request.headers.get(SHARED_ACCESS_TOKEN_HEADER_NAME) || '').trim();
  if (direct) return direct;

  const authorization = (request.headers.get('authorization') || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return '';
}

export function isValidSharedAccessToken(token: string): boolean {
  const config = getSharedAccessEnvConfig();
  if (!config.enabled) return false;
  const candidate = token.trim();
  if (!candidate) return false;
  return safeCompare(candidate, config.token);
}

export async function ensureSharedAccessUser(options?: {
  touchLastLogin?: boolean;
}): Promise<SharedAccessUser | null> {
  const config = getSharedAccessEnvConfig();
  if (!config.enabled) return null;

  const existing = await db.user.findUnique({
    where: { email: config.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });

  if (!existing) {
    return db.user.create({
      data: {
        email: config.email,
        name: config.name,
        role: config.role,
        isActive: true,
        lastLoginAt: options?.touchLastLogin ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });
  }

  const needsUpdate =
    existing.name !== config.name ||
    existing.role !== config.role ||
    !existing.isActive ||
    !!options?.touchLastLogin;

  if (!needsUpdate) {
    return existing;
  }

  return db.user.update({
    where: { id: existing.id },
    data: {
      name: config.name,
      role: config.role,
      isActive: true,
      ...(options?.touchLastLogin ? { lastLoginAt: new Date() } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });
}

export async function resolveSharedAccessUserFromRequest(
  request: NextRequest
): Promise<SharedAccessUser | null> {
  const token = extractSharedAccessToken(request);
  if (!isValidSharedAccessToken(token)) {
    return null;
  }
  return ensureSharedAccessUser();
}

export async function getSharedAccessOverridesForUserId(
  userId: string
): Promise<SharedAccessOverrides | null> {
  const sharedUser = await ensureSharedAccessUser();
  if (!sharedUser || sharedUser.id !== userId) {
    return null;
  }

  const openaiKey = trimEnv('OPENAI_API_KEY');
  const meshyKey = trimEnv('MESHY_API_KEY');

  return {
    apiConfig: {
      routing: {
        chat: openaiKey ? 'openai' : DEFAULT_API_CONFIG.routing.chat,
        multimodal: 'openai',
        image: 'openai',
        video: DEFAULT_API_CONFIG.routing.video,
        threeD: meshyKey ? 'meshy' : DEFAULT_API_CONFIG.routing.threeD,
      },
      openai: {
        enabled: openaiKey.length > 0,
        apiKey: openaiKey,
        baseUrl: trimEnv('OPENAI_BASE_URL') || DEFAULT_API_CONFIG.openai.baseUrl,
        organization: trimEnv('OPENAI_ORGANIZATION'),
        project: trimEnv('OPENAI_PROJECT'),
        textModel: trimEnv('OPENAI_TEXT_MODEL') || DEFAULT_API_CONFIG.openai.textModel,
        multimodalModel:
          trimEnv('OPENAI_MULTIMODAL_MODEL') || DEFAULT_API_CONFIG.openai.multimodalModel,
        imageModel: trimEnv('OPENAI_IMAGE_MODEL') || DEFAULT_API_CONFIG.openai.imageModel,
        videoModel: trimEnv('OPENAI_VIDEO_MODEL') || DEFAULT_API_CONFIG.openai.videoModel,
      },
      meshy: {
        enabled: meshyKey.length > 0,
        apiKey: meshyKey,
        baseUrl: DEFAULT_API_CONFIG.meshy.baseUrl,
      },
    },
    localConfig: {},
    hasSecrets: {
      openai: openaiKey.length > 0,
      meshy: meshyKey.length > 0,
    },
  };
}
