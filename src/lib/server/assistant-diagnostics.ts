import type {
  AssistantSurfaceDiagnostics,
  AssistantSurfaceStatus,
} from '@/lib/security/assistant-surface';
import { getScriptStorageStatus } from './script-storage';
import { getCharacterServiceHealth } from './character-service';

function deriveAssistantDiagnostic(
  surface: AssistantSurfaceStatus
): AssistantSurfaceDiagnostics['assistant'] {
  if (!surface.authenticated) {
    return {
      available: false,
      level: 'warn',
      requiresSignIn: true,
      message: 'Inicia sesión para habilitar el asistente.',
    };
  }

  if (surface.assistant.available) {
    return {
      available: true,
      level: 'ok',
      requiresSignIn: false,
      message: surface.access.advancedTools
        ? 'Asistente listo para crear y revisar.'
        : 'Asistente listo para crear en modo producto.',
    };
  }

  return {
    available: false,
    level: 'warn',
    requiresSignIn: false,
    message: surface.access.advancedTools
      ? 'La sesión está activa, pero faltan capacidades habilitadas.'
      : 'Tu sesión aún no tiene capacidades activas del asistente.',
  };
}

export async function buildAssistantSurfaceDiagnostics(
  surface: AssistantSurfaceStatus
): Promise<AssistantSurfaceDiagnostics> {
  const assistant = deriveAssistantDiagnostic(surface);

  if (!surface.authenticated) {
    return {
      checkedAt: new Date().toISOString(),
      assistant,
      automation: {
        available: false,
        restricted: true,
        level: 'warn',
        message: 'Inicia sesión para habilitar la edición automática.',
      },
      characters: {
        available: false,
        configured: false,
        restricted: true,
        level: 'warn',
        message: 'Inicia sesión para habilitar la creación de personajes.',
      },
    };
  }

  const scriptStatus = await getScriptStorageStatus();
  const automation: AssistantSurfaceDiagnostics['automation'] = scriptStatus.available
    ? {
        available: true,
        restricted: false,
        level: 'ok',
        message: 'Edición automática disponible.',
      }
    : {
        available: false,
        restricted: false,
        level: 'warn',
        message: 'Edición automática con disponibilidad limitada.',
      };

  let characters: AssistantSurfaceDiagnostics['characters'];
  if (!surface.assistant.capabilities.character) {
    characters = {
      available: false,
      configured: false,
      restricted: true,
      level: 'warn',
      message: 'La creación de personajes requiere una sesión elevada.',
    };
  } else {
    const characterHealth = await getCharacterServiceHealth();
    if (!characterHealth.configured) {
      characters = {
        available: false,
        configured: false,
        restricted: false,
        level: 'warn',
        message: 'La creación de personajes no está habilitada en esta sesión.',
      };
    } else if (characterHealth.available) {
      characters = {
        available: true,
        configured: true,
        restricted: false,
        level: 'ok',
        message: 'Creación de personajes disponible.',
      };
    } else {
      characters = {
        available: false,
        configured: true,
        restricted: false,
        level: 'warn',
        message: 'Creación de personajes temporalmente no disponible.',
      };
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    assistant,
    automation,
    characters,
  };
}
