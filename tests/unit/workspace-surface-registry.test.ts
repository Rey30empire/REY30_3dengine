import { describe, expect, it } from 'vitest';
import {
  resolveBottomDockPanelRenderer,
  resolveLeftDockPanelRenderer,
  resolveRightPanelRenderer,
  resolveViewportSurfaceComponent,
} from '@/engine/editor/shell/panelRegistry';
import { SceneView } from '@/engine/editor/SceneView';

describe('workspace surface registry', () => {
  it('falls back to the default left dock surface', () => {
    expect(resolveLeftDockPanelRenderer('scene')).toBeTypeOf('function');
    expect(resolveLeftDockPanelRenderer('missing' as never)).toBe(
      resolveLeftDockPanelRenderer('project')
    );
  });

  it('falls back to the default right panel surface', () => {
    expect(resolveRightPanelRenderer('model')).toBeTypeOf('function');
    expect(resolveRightPanelRenderer('missing' as never)).toBe(
      resolveRightPanelRenderer('inspector')
    );
  });

  it('falls back to the default bottom dock surface', () => {
    expect(resolveBottomDockPanelRenderer('timeline')).toBeTypeOf('function');
    expect(resolveBottomDockPanelRenderer('missing' as never)).toBe(
      resolveBottomDockPanelRenderer('console')
    );
  });

  it('resolves the default viewport surface', () => {
    expect(resolveViewportSurfaceComponent('scene')).toBe(SceneView);
    expect(resolveViewportSurfaceComponent('missing' as never)).toBe(SceneView);
  });
});
