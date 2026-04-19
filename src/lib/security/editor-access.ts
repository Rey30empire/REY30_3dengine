import type { AppUserRole } from './user-roles';

export type EditorShellMode = 'product' | 'advanced';
export type EditorSessionRole = AppUserRole | null;
export type EditorSessionAccessMode = 'user_session' | 'shared_token' | null;

export interface EditorAccessPermissions {
  advancedShell: boolean;
  admin: boolean;
  compile: boolean;
  advancedWorkspaces: boolean;
  debugTools: boolean;
  editorSessionBridge: boolean;
  terminalActions: boolean;
}

export interface EditorAccessMatrix {
  shellMode: EditorShellMode;
  permissions: EditorAccessPermissions;
}

export interface BuildEditorAccessMatrixInput {
  sessionRole: EditorSessionRole;
  sessionAccessMode: EditorSessionAccessMode;
}

const PRODUCT_EDITOR_ACCESS: EditorAccessMatrix = {
  shellMode: 'product',
  permissions: {
    advancedShell: false,
    admin: false,
    compile: false,
    advancedWorkspaces: false,
    debugTools: false,
    editorSessionBridge: false,
    terminalActions: false,
  },
};

const ADVANCED_EDITOR_ACCESS: EditorAccessMatrix = {
  shellMode: 'advanced',
  permissions: {
    advancedShell: true,
    admin: true,
    compile: true,
    advancedWorkspaces: true,
    debugTools: true,
    editorSessionBridge: true,
    terminalActions: false,
  },
};

export function getDefaultEditorAccessMatrix(): EditorAccessMatrix {
  return {
    shellMode: PRODUCT_EDITOR_ACCESS.shellMode,
    permissions: { ...PRODUCT_EDITOR_ACCESS.permissions },
  };
}

export function buildEditorAccessMatrix({
  sessionRole,
  sessionAccessMode,
}: BuildEditorAccessMatrixInput): EditorAccessMatrix {
  const elevatedUserSession =
    sessionAccessMode === 'user_session' &&
    (sessionRole === 'OWNER' || sessionRole === 'EDITOR');
  const ownerUserSession = sessionAccessMode === 'user_session' && sessionRole === 'OWNER';

  if (!elevatedUserSession) {
    return getDefaultEditorAccessMatrix();
  }

  return {
    shellMode: ADVANCED_EDITOR_ACCESS.shellMode,
    permissions: {
      ...ADVANCED_EDITOR_ACCESS.permissions,
      terminalActions: ownerUserSession,
    },
  };
}

export function normalizeEditorAccessMatrix(
  value?: Partial<EditorAccessMatrix> | null
): EditorAccessMatrix {
  const fallback = getDefaultEditorAccessMatrix();
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const permissions: Partial<EditorAccessPermissions> =
    value.permissions && typeof value.permissions === 'object'
      ? (value.permissions as Partial<EditorAccessPermissions>)
      : {};

  return {
    shellMode: value.shellMode === 'advanced' ? 'advanced' : 'product',
    permissions: {
      advancedShell: Boolean(permissions.advancedShell),
      admin: Boolean(permissions.admin),
      compile: Boolean(permissions.compile),
      advancedWorkspaces: Boolean(permissions.advancedWorkspaces),
      debugTools: Boolean(permissions.debugTools),
      editorSessionBridge: Boolean(permissions.editorSessionBridge),
      terminalActions: Boolean(permissions.terminalActions),
    },
  };
}
