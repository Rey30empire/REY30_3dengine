import { afterEach, describe, expect, it } from 'vitest';
import { animationRuntimeBridge } from '@/engine/animation/animationRuntimeBridge';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
} from '@/engine/editor/animationEditorState';
import { useEngineStore } from '@/store/editorStore';
import type { Entity, Scene } from '@/types/engine';

function createAnimatorEntity(): Entity {
  const base = createDefaultAnimatorEditorState('Animated Hero');
  const walkClip = createLibraryClip('Walk Cycle');

  return {
    id: 'entity-animator',
    name: 'Animated Hero',
    active: true,
    parentId: null,
    children: [],
    tags: ['player'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-animator',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Animator',
        {
          id: 'animator-main',
          type: 'Animator',
          enabled: true,
          data: serializeAnimatorEditorState(
            {
              controllerId: null,
              currentAnimation: walkClip.name,
              parameters: { locomotion: 'walk' },
            },
            {
              ...base,
              activeClipId: walkClip.id,
              clips: [base.clips[0], walkClip],
              nlaStrips: [
                {
                  id: 'strip-walk',
                  name: 'Walk Main',
                  clipId: walkClip.id,
                  start: 0,
                  end: walkClip.duration,
                  blendMode: 'replace',
                  muted: false,
                },
              ],
            }
          ),
        },
      ],
    ]),
  };
}

function createScene(entity: Entity): Scene {
  return {
    id: 'scene-anim',
    name: 'Animation Scene',
    entities: [entity],
    rootEntities: [entity.id],
    environment: {
      skybox: null,
      ambientLight: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
      fog: null,
      postProcessing: {
        bloom: { enabled: false, intensity: 0, threshold: 0, radius: 0 },
        ssao: { enabled: false, radius: 0, intensity: 0, bias: 0 },
        ssr: { enabled: false, intensity: 0, maxDistance: 0 },
        colorGrading: { enabled: false, exposure: 1, contrast: 1, saturation: 1, gamma: 1 },
        vignette: { enabled: false, intensity: 0, smoothness: 0, roundness: 0 },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('AnimationRuntimeBridge', () => {
  afterEach(() => {
    animationRuntimeBridge.reset();
    useEngineStore.setState({
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      playRuntimeState: 'IDLE',
    });
  });

  it('plays NLA/root motion into the runtime transform and restores authored state on reset', () => {
    const entity = createAnimatorEntity();
    useEngineStore.setState({
      scenes: [createScene(entity)],
      activeSceneId: 'scene-anim',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    animationRuntimeBridge.update(0.6);

    const animated = useEngineStore.getState().entities.get(entity.id);
    const animatedTransform = animated?.components.get('Transform')?.data as {
      position?: { x?: number; y?: number; z?: number };
    };
    const animatedAnimator = animated?.components.get('Animator')?.data as {
      currentAnimation?: string | null;
      runtime?: { activeStripNames?: string[]; activeClipNames?: string[] };
    };

    expect((animatedTransform.position?.z ?? 0)).toBeGreaterThan(3.4);
    expect(animatedAnimator.currentAnimation).toBe('Walk Cycle');
    expect(animatedAnimator.runtime?.activeStripNames).toEqual(['Walk Main']);
    expect(animatedAnimator.runtime?.activeClipNames).toEqual(['Walk Cycle']);

    animationRuntimeBridge.reset();

    const restored = useEngineStore.getState().entities.get(entity.id);
    const restoredTransform = restored?.components.get('Transform')?.data as {
      position?: { x?: number; y?: number; z?: number };
    };
    const restoredAnimator = restored?.components.get('Animator')?.data as {
      runtime?: unknown;
    };

    expect(restoredTransform.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(restoredAnimator.runtime).toBeUndefined();
  });
});
