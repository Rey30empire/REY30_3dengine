import { describe, expect, it } from 'vitest';
import {
  createWorkspaceDockState,
  createWorkspaceDockStateMap,
  resolveCurrentBottomTab,
  resolveCurrentRightPanel,
  resolveOpenRightPanelTarget,
  resolveWorkspaceSelection,
} from '@/engine/editor/shell/useEditorWorkspaceShellState';
import { getVisibleWorkspaces } from '@/engine/editor/shell/workspaceDefinitions';

describe('editor workspace shell', () => {
  it('resolves workspace selection to a visible workspace and merges overrides', () => {
    const visibleWorkspaces = getVisibleWorkspaces('product');
    const visibleWorkspaceIds = new Set(visibleWorkspaces.map((workspace) => workspace.id));
    const result = resolveWorkspaceSelection({
      nextWorkspace: 'debug',
      visibleWorkspaceIds,
      visibleWorkspaces,
      workspaceDockState: createWorkspaceDockStateMap(),
      overrides: {
        rightPanel: 'character',
        bottomCollapsed: true,
      },
    });

    expect(result.workspaceId).toBe('scene');
    expect(result.dockState).toMatchObject({
      leftTab: 'scene',
      bottomTab: 'console',
      rightPanel: 'character',
      bottomCollapsed: true,
    });
  });

  it('resolves current dock selections with safe fallbacks', () => {
    expect(
      resolveCurrentRightPanel('build', ['inspector', 'world'], 'inspector')
    ).toBe('inspector');

    expect(
      resolveCurrentBottomTab('build', [{ id: 'console', label: 'Console' }])
    ).toBe('console');
  });

  it('routes hidden build/profiler panels and assistant entry safely', () => {
    expect(
      resolveOpenRightPanelTarget({
        panel: 'build',
        showAdvancedSurface: false,
        visibleRightPanels: ['inspector', 'world'],
        workspaceDefaultRightPanel: 'inspector',
      })
    ).toEqual({
      kind: 'panel',
      panel: 'inspector',
    });

    expect(
      resolveOpenRightPanelTarget({
        panel: 'profiler',
        showAdvancedSurface: true,
        visibleRightPanels: ['inspector', 'world'],
        workspaceDefaultRightPanel: 'inspector',
      })
    ).toEqual({
      kind: 'workspace',
      workspaceId: 'debug',
      overrides: {
        rightPanel: 'profiler',
        bottomCollapsed: false,
      },
    });

    expect(
      resolveOpenRightPanelTarget({
        panel: 'ai',
        showAdvancedSurface: false,
        visibleRightPanels: ['inspector', 'world'],
        workspaceDefaultRightPanel: 'inspector',
      })
    ).toEqual({
      kind: 'workspace',
      workspaceId: 'ai',
      overrides: {
        leftTab: 'project',
        rightPanel: 'ai',
        bottomTab: 'assistant',
        bottomCollapsed: false,
      },
    });
  });

  it('creates workspace defaults from workspace definitions', () => {
    const aiState = createWorkspaceDockState('ai');
    expect(aiState).toEqual({
      leftTab: 'project',
      bottomTab: 'assistant',
      rightPanel: 'ai',
      bottomCollapsed: false,
    });

    const state = createWorkspaceDockState('scripting');
    expect(state).toEqual({
      leftTab: 'assets',
      bottomTab: 'assistant',
      rightPanel: 'scrib',
      bottomCollapsed: false,
    });
  });
});
