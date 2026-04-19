import { describe, expect, it } from 'vitest';
import { createSceneViewTransformToolConfig } from '@/engine/editor/useSceneViewEditorBindings';

describe('scene view editor bindings', () => {
  it('builds transform tool config with advanced snap flags and cloned axes', () => {
    const axes = { x: true, y: false, z: true };
    const config = createSceneViewTransformToolConfig({
      mode: 'translate',
      space: 'local',
      activeAxes: axes,
      snapEnabled: true,
      gridVisible: false,
      gridSize: 2,
      translateSnap: 0.5,
      rotateSnap: 30,
      scaleSnap: 0.25,
      snapTarget: 'vertex',
    });

    expect(config.mode).toBe('translate');
    expect(config.space).toBe('local');
    expect(config.enabledAxes).toEqual(axes);
    expect(config.enabledAxes).not.toBe(axes);
    expect(config.snapSettings).toMatchObject({
      enabled: true,
      gridVisible: false,
      gridSize: 2,
      translateSnap: 0.5,
      rotateSnap: 30,
      scaleSnap: 0.25,
      snapTarget: 'vertex',
      vertexSnap: true,
      surfaceSnap: false,
    });
    expect(config.snapSettings.translateAxes).toEqual(axes);
    expect(config.snapSettings.translateAxes).not.toBe(axes);
  });

  it('disables advanced snap flags for grid snapping', () => {
    const config = createSceneViewTransformToolConfig({
      mode: 'scale',
      space: 'world',
      activeAxes: { x: true, y: true, z: true },
      snapEnabled: false,
      gridVisible: true,
      gridSize: 1,
      translateSnap: 1,
      rotateSnap: 15,
      scaleSnap: 0.1,
      snapTarget: 'grid',
    });

    expect(config.snapSettings.vertexSnap).toBe(false);
    expect(config.snapSettings.surfaceSnap).toBe(false);
  });
});
