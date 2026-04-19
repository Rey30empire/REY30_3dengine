import { describe, expect, it } from 'vitest';
import {
  resolveEditorAccessFromSessionPayload,
  resolveEditorShellMode,
} from '@/engine/editor/shell/editorShellAccess';

describe('editor shell access', () => {
  it('allows advanced shell for elevated user sessions', () => {
    expect(
      resolveEditorShellMode({
        sessionRole: 'OWNER',
        sessionAccessMode: 'user_session',
      })
    ).toBe('advanced');

    expect(
      resolveEditorShellMode({
        sessionRole: 'EDITOR',
        sessionAccessMode: 'user_session',
      })
    ).toBe('advanced');
  });

  it('keeps product shell for viewer, anonymous, and shared-token access', () => {
    expect(
      resolveEditorShellMode({
        sessionRole: 'VIEWER',
        sessionAccessMode: 'user_session',
      })
    ).toBe('product');
    expect(
      resolveEditorShellMode({
        sessionRole: null,
        sessionAccessMode: 'shared_token',
      })
    ).toBe('product');

    expect(
      resolveEditorShellMode({
        sessionRole: null,
        sessionAccessMode: null,
      })
    ).toBe('product');
  });

  it('only trusts backend editorAccess data when interpreting a session payload', () => {
    expect(
      resolveEditorAccessFromSessionPayload({
        authenticated: true,
        accessMode: 'user_session',
        user: { role: 'OWNER' },
      })
    ).toEqual({
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
    });

    expect(
      resolveEditorAccessFromSessionPayload({
        authenticated: true,
        editorAccess: {
          shellMode: 'advanced',
          permissions: {
            advancedShell: true,
            admin: true,
            compile: true,
            advancedWorkspaces: true,
            debugTools: true,
            editorSessionBridge: true,
            terminalActions: true,
          },
        },
      })
    ).toEqual({
      shellMode: 'advanced',
      permissions: {
        advancedShell: true,
        admin: true,
        compile: true,
        advancedWorkspaces: true,
        debugTools: true,
        editorSessionBridge: true,
        terminalActions: true,
      },
    });
  });
});
