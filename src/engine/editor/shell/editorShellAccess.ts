import {
  buildEditorAccessMatrix,
  getDefaultEditorAccessMatrix,
  normalizeEditorAccessMatrix,
  type EditorAccessMatrix,
  type EditorSessionAccessMode,
  type EditorSessionRole,
  type EditorShellMode,
} from '@/lib/security/editor-access';

export type {
  EditorAccessMatrix,
  EditorSessionAccessMode,
  EditorSessionRole,
  EditorShellMode,
} from '@/lib/security/editor-access';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface ResolveEditorShellModeInput {
  sessionRole: EditorSessionRole;
  sessionAccessMode: EditorSessionAccessMode;
  hostname?: string | null;
}

export interface EditorSessionPayload {
  authenticated?: boolean;
  accessMode?: EditorSessionAccessMode;
  user?: {
    role?: EditorSessionRole | string | null;
  };
  editorAccess?: Partial<EditorAccessMatrix> | null;
}

export function isLocalEditorHost(hostname?: string | null): boolean {
  const normalizedHostname = hostname?.trim().toLowerCase();
  if (!normalizedHostname) return false;
  if (LOCAL_HOSTS.has(normalizedHostname)) return true;
  return normalizedHostname.endsWith('.local');
}

export function resolveEditorShellMode({
  sessionRole,
  sessionAccessMode,
}: ResolveEditorShellModeInput): EditorShellMode {
  return buildEditorAccessMatrix({ sessionRole, sessionAccessMode }).shellMode;
}

export function resolveEditorAccessFromSessionPayload(
  payload?: EditorSessionPayload | null
): EditorAccessMatrix {
  if (payload?.authenticated !== true) {
    return getDefaultEditorAccessMatrix();
  }

  return normalizeEditorAccessMatrix(payload.editorAccess);
}
