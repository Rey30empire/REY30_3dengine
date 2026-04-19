import { describe, expect, it } from 'vitest';
import { deriveWorkspaceHostLayoutModel } from '@/engine/editor/shell/workspaceManifests';

describe('workspace manifests', () => {
  it('derives host layout metadata from the manifest and runtime visibility', () => {
    const layoutModel = deriveWorkspaceHostLayoutModel({
      workspaceId: 'modeling',
      activeLeftTab: 'assets',
      currentRightPanel: 'model',
      visibleRightPanels: ['model', 'paint', 'materials', 'inspector'],
      visibleBottomDockTabs: [
        { id: 'console', label: 'Console' },
        { id: 'assistant', label: 'Assistant' },
      ],
      bottomDockCollapsed: false,
    });

    expect(layoutModel.autoSaveIds).toEqual({
      vertical: 'rey30.editor.layout.vertical.modeling',
      horizontal: 'rey30.editor.layout.horizontal.modeling',
    });
    expect(layoutModel.leftDock.activeTitle).toEqual({
      title: 'Asset Browser',
      subtitle: 'Biblioteca, imports y preview',
    });
    expect(layoutModel.viewport).toMatchObject({
      surfaceId: 'scene',
      title: 'Viewport',
    });
    expect(layoutModel.rightDock.tabs).toEqual([
      { id: 'model', label: 'Model' },
      { id: 'paint', label: 'Paint' },
      { id: 'materials', label: 'Materials' },
      { id: 'inspector', label: 'Inspector' },
    ]);
    expect(layoutModel.bottomDock.tabs).toEqual([
      { id: 'console', label: 'Console' },
      { id: 'assistant', label: 'Assistant' },
    ]);
    expect(layoutModel.topPanel.defaultSize).toBe(72);
  });

  it('uses the collapsed top size when the bottom dock is hidden', () => {
    const layoutModel = deriveWorkspaceHostLayoutModel({
      workspaceId: 'scene',
      activeLeftTab: 'scene',
      currentRightPanel: 'inspector',
      visibleRightPanels: ['inspector', 'world'],
      visibleBottomDockTabs: [{ id: 'console', label: 'Console' }],
      bottomDockCollapsed: true,
    });

    expect(layoutModel.topPanel.defaultSize).toBe(100);
    expect(layoutModel.rightDock.activeTitle).toBe('Inspector');
    expect(layoutModel.rightDock.subtitle).toBe('Scene');
  });
});
