import { describe, expect, it } from 'vitest';
import { deriveSceneViewBaseModel } from '@/engine/editor/useSceneViewViewModel';
import type { Component, EditorState, Entity, Scene } from '@/types/engine';

function createComponent(
  type: Component['type'],
  data: Record<string, unknown>
): Component {
  return {
    id: `${type}_component`,
    type,
    data,
    enabled: true,
  };
}

function createEntity(
  id: string,
  meshRendererData?: Record<string, unknown>
): Entity {
  const components = new Map<string, Component>();
  components.set(
    'Transform',
    createComponent('Transform', {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    })
  );
  if (meshRendererData) {
    components.set('MeshRenderer', createComponent('MeshRenderer', meshRendererData));
  }
  return {
    id,
    name: id,
    components,
    children: [],
    parentId: null,
    active: true,
    tags: [],
  };
}

function createScene(entities: Entity[]): Scene {
  return {
    id: 'scene_1',
    name: 'Scene',
    entities,
    rootEntities: entities.map((entity) => entity.id),
    environment: {
      ambientLight: { r: 1, g: 1, b: 1, a: 1 },
      ambientIntensity: 1,
      skybox: null,
      environmentIntensity: 1,
      environmentRotation: 0,
      directionalLightIntensity: 1,
      directionalLightAzimuth: 0,
      directionalLightElevation: 45,
      advancedLighting: {
        shadowQuality: 'medium',
        globalIllumination: { enabled: false, intensity: 1, bounceCount: 1 },
        bakedLightmaps: { enabled: false },
      },
      fog: null,
      postProcessing: {
        bloom: {
          enabled: false,
          intensity: 0,
          threshold: 1,
          radius: 0,
        },
        ssao: {
          enabled: false,
          radius: 0,
          intensity: 0,
          bias: 0,
        },
        ssr: {
          enabled: false,
          intensity: 0,
          maxDistance: 0,
        },
        colorGrading: {
          enabled: false,
          exposure: 1,
          contrast: 1,
          saturation: 1,
          gamma: 2.2,
          toneMapping: 'aces',
          rendererExposure: 1,
        },
        vignette: {
          enabled: false,
          intensity: 0,
          smoothness: 0,
          roundness: 1,
        },
      },
    },
    createdAt: new Date('2026-04-09T00:00:00Z'),
    updatedAt: new Date('2026-04-09T00:00:00Z'),
  };
}

function createEditorState(overrides?: Partial<EditorState>): EditorState {
  return {
    selectedEntities: [],
    selectedAsset: null,
    tool: 'select',
    mode: 'scene',
    gridVisible: true,
    snapEnabled: true,
    snapValue: 1,
    snapTarget: 'grid',
    gizmoMode: 'translate',
    cameraSpeed: 1,
    navigationMode: 'orbit',
    viewportCameraMode: 'perspective',
    viewportCameraEntityId: null,
    viewportFov: 60,
    showColliders: false,
    showLights: true,
    paintEnabled: false,
    paintMode: 'vertex',
    paintColor: '#ffffff',
    paintSize: 1,
    paintStrength: 1,
    paintTextureSlot: 'albedo',
    paintTextureResolution: 1024,
    paintWeightBone: 'Spine',
    paintWeightMirror: true,
    paintWeightSmooth: true,
    paintWeightNormalize: true,
    paintWeightErase: false,
    sculptSymmetryX: true,
    sculptDyntopo: false,
    sculptRemeshIterations: 1,
    sculptMultiresLevels: 1,
    sculptVoxelSize: 0.1,
    modelerMode: 'face',
    modelerSelectedElements: [0],
    topologyViewportEnabled: false,
    topologyViewportMode: 'intent_driven',
    topologyViewportTemplateType: 'chair',
    ...overrides,
  };
}

describe('scene view view model', () => {
  it('derives camera/modeler state and resolves manual mesh from selected entity', () => {
    const manualMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      faces: [[0, 1, 2] as [number, number, number]],
    };
    const meshEntity = createEntity('mesh_1', {
      meshId: 'custom',
      manualMesh,
    });
    const cameraEntity = createEntity('cam_1');
    cameraEntity.components.set(
      'Camera',
      createComponent('Camera', {
        fov: 60,
        near: 0.1,
        far: 1000,
        orthographic: false,
        clearColor: { r: 0, g: 0, b: 0, a: 1 },
        isMain: false,
      })
    );
    const scene = createScene([meshEntity, cameraEntity]);
    const editor = createEditorState({
      selectedEntities: ['mesh_1'],
      viewportCameraEntityId: 'cam_1',
      viewportCameraMode: 'side',
      snapTarget: 'surface',
      topologyViewportEnabled: true,
      topologyViewportMode: 'template',
      topologyViewportTemplateType: 'vehicle',
      modelerMode: 'vertex',
    });

    const result = deriveSceneViewBaseModel({ activeScene: scene, editor });

    expect(result.cameraMode).toBe('side');
    expect(result.snapTarget).toBe('surface');
    expect(result.virtualCameraEntity?.id).toBe('cam_1');
    expect(result.selectedModelerEntityId).toBe('mesh_1');
    expect(result.selectedModelerMesh?.vertices).toHaveLength(3);
    expect(result.selectedOriginMesh?.vertices).toHaveLength(3);
    expect(result.canAdjustOrigin).toBe(true);
    expect(result.topologyViewportEnabled).toBe(true);
    expect(result.topologyViewportMode).toBe('template');
    expect(result.topologyViewportTemplateType).toBe('vehicle');
    expect(result.modelerMode).toBe('vertex');
  });

  it('falls back to defaults when no selection exists', () => {
    const scene = createScene([createEntity('mesh_2', { meshId: 'cube' })]);
    const editor = createEditorState({
      selectedEntities: ['mesh_2', 'mesh_3'],
      viewportCameraMode: undefined,
      snapTarget: undefined,
      topologyViewportTemplateType: undefined,
      modelerMode: undefined,
    });

    const result = deriveSceneViewBaseModel({ activeScene: scene, editor });

    expect(result.cameraMode).toBe('perspective');
    expect(result.snapTarget).toBe('grid');
    expect(result.selectedModelerEntityId).toBeNull();
    expect(result.selectedModelerEntity).toBeNull();
    expect(result.selectedOriginMesh).toBeNull();
    expect(result.selectedModelerMesh).toBeNull();
    expect(result.canAdjustOrigin).toBe(false);
    expect(result.topologyViewportTemplateType).toBe('chair');
    expect(result.modelerMode).toBe('face');
  });
});
