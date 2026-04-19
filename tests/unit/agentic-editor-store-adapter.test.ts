import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ExecutionTracer,
  MasterOrchestrator,
  WorldStateManager,
  createToolCall,
  createEditorBackedToolRegistry,
  createZustandSceneStoreAdapter,
} from '@/engine/agentic';
import { createNodeEditorBuildExporter } from '@/engine/agentic/tools/adapters/nodeEditorBuildExporter';
import { useEngineStore } from '@/store/editorStore';

function resetEditorStore() {
  useEngineStore.setState({
    projectName: 'Agentic Adapter Test',
    projectPath: '',
    isDirty: false,
    scenes: [],
    activeSceneId: null,
    entities: new Map(),
    assets: [],
    historyPast: [],
    historyFuture: [],
  });
}

describe('agentic editor store adapter', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('runs the fog/lighting/layout pipeline against the real editor store', async () => {
    const adapter = createZustandSceneStoreAdapter();
    const world = new WorldStateManager(adapter.snapshotWorldState());
    const orchestrator = new MasterOrchestrator({
      world,
      tools: createEditorBackedToolRegistry(adapter),
      maxIterations: 2,
    });

    const result = await orchestrator.run('añade niebla, mejora la iluminación y reorganiza esta escena');
    const store = useEngineStore.getState();
    const scene = store.activeSceneId
      ? store.scenes.find((item) => item.id === store.activeSceneId)
      : null;
    const layoutGroup = Array.from(store.entities.values()).find((entity) =>
      entity.tags.includes('layout-group')
    );

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(scene?.environment.fog?.enabled).toBe(true);
    expect(scene?.environment.directionalLightIntensity).toBeGreaterThan(0);
    expect(layoutGroup).toBeTruthy();
    expect(result.worldState.activeSceneId).toBe(store.activeSceneId);
  });

  it('creates editor entities/components and mirrors them into agentic WorldState', () => {
    const adapter = createZustandSceneStoreAdapter();
    const world = new WorldStateManager(adapter.snapshotWorldState());
    const scene = adapter.createScene(world, 'Adapter Scene');

    const entity = adapter.createEntity(world, {
      sceneId: scene.sceneId,
      name: 'Live NPC',
      type: 'npc',
      tags: ['npc', 'patrol-target'],
    });
    adapter.assignComponent(world, entity.entityId, 'Collider', {
      type: 'capsule',
      isTrigger: false,
      center: { x: 0, y: 0.9, z: 0 },
      size: { x: 0.8, y: 1.8, z: 0.8 },
    });

    const storeEntity = useEngineStore.getState().entities.get(entity.entityId);
    const worldEntity = world.getSnapshot().entities[entity.entityId];

    expect(storeEntity?.components.has('MeshRenderer')).toBe(true);
    expect(storeEntity?.components.has('Collider')).toBe(true);
    expect(worldEntity?.type).toBe('npc');
    expect(Object.values(worldEntity?.components ?? {}).some((component) => component.type === 'Collider')).toBe(true);
  });

  it('runs the NPC patrol pipeline against editor store components and script assets', async () => {
    const adapter = createZustandSceneStoreAdapter();
    const world = new WorldStateManager(adapter.snapshotWorldState());
    const orchestrator = new MasterOrchestrator({
      world,
      tools: createEditorBackedToolRegistry(adapter),
      maxIterations: 2,
    });

    const result = await orchestrator.run('crea un NPC con patrulla simple y colisiones correctas');
    const store = useEngineStore.getState();
    const npc = Array.from(store.entities.values()).find((entity) => entity.tags.includes('npc'));
    const scriptAsset = store.assets.find((asset) => asset.type === 'script');

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(npc?.components.has('Script')).toBe(true);
    expect(npc?.components.has('Collider')).toBe(true);
    expect(npc?.components.has('Rigidbody')).toBe(true);
    expect(scriptAsset?.metadata.agenticScript).toBe(true);
  });

  it('executes editor-backed material tools against material assets and MeshRenderer data', async () => {
    const adapter = createZustandSceneStoreAdapter();
    const world = new WorldStateManager(adapter.snapshotWorldState());
    const registry = createEditorBackedToolRegistry(adapter);
    const trace = new ExecutionTracer();
    const scene = adapter.createScene(world, 'Material Scene');
    const entity = adapter.createEntity(world, {
      sceneId: scene.sceneId,
      name: 'Material Target',
      type: 'mesh',
    });

    const result = await registry.execute(
      createToolCall('material.create', 'modeling', 'step-material', {
        name: 'Agentic Neon',
        entityId: entity.entityId,
        color: { r: 0.1, g: 0.9, b: 1, a: 1 },
        metallic: 0.7,
        roughness: 0.22,
      }),
      {
        pipelineId: 'pipeline-material',
        iteration: 1,
        stepId: 'step-material',
        agentRole: 'modeling',
        world,
        trace,
      }
    );
    const materialId = result.output!.materialId as string;
    const store = useEngineStore.getState();
    const storeEntity = store.entities.get(entity.entityId);
    const meshRendererData = storeEntity?.components.get('MeshRenderer')?.data as
      | Record<string, unknown>
      | undefined;

    expect(result.success).toBe(true);
    expect(store.assets.some((asset) => asset.id === materialId && asset.type === 'material')).toBe(true);
    expect(meshRendererData?.materialId).toBe(materialId);
    expect(world.getSnapshot().materials[materialId]?.metallic).toBeCloseTo(0.7);
  });

  it('executes editor-backed animation tools against Animator components and animation assets', async () => {
    const adapter = createZustandSceneStoreAdapter();
    const world = new WorldStateManager(adapter.snapshotWorldState());
    const registry = createEditorBackedToolRegistry(adapter);
    const trace = new ExecutionTracer();
    const scene = adapter.createScene(world, 'Animation Scene');
    const entity = adapter.createEntity(world, {
      sceneId: scene.sceneId,
      name: 'Animated NPC',
      type: 'npc',
      tags: ['npc'],
    });

    const clipResult = await registry.execute(
      createToolCall('animation.createClip', 'animation', 'step-animation', {
        entityId: entity.entityId,
        name: 'Entrance Animation',
        duration: 1.6,
      }),
      {
        pipelineId: 'pipeline-animation',
        iteration: 1,
        stepId: 'step-animation',
        agentRole: 'animation',
        world,
        trace,
      }
    );
    const animationId = clipResult.output!.animationId as string;
    const attachResult = await registry.execute(
      createToolCall('animation.attachClip', 'animation', 'step-animation', {
        entityId: entity.entityId,
        animationId,
        state: 'entrance',
      }),
      {
        pipelineId: 'pipeline-animation',
        iteration: 1,
        stepId: 'step-animation',
        agentRole: 'animation',
        world,
        trace,
      }
    );
    const storeEntity = useEngineStore.getState().entities.get(entity.entityId);
    const animatorData = storeEntity?.components.get('Animator')?.data as
      | { currentAnimation?: string; editor?: { activeClipId?: string } }
      | undefined;

    expect(clipResult.success).toBe(true);
    expect(attachResult.success).toBe(true);
    expect(useEngineStore.getState().assets.some((asset) => asset.id === animationId && asset.type === 'animation')).toBe(true);
    expect(animatorData?.editor?.activeClipId).toBe(animationId);
    expect(animatorData?.currentAnimation).toBe('Entrance Animation');
    expect(world.getSnapshot().animations[animationId]?.targetEntityId).toBe(entity.entityId);
  });

  it('executes editor-backed asset and build tools against the real ReyPlay compile state', async () => {
    const adapter = createZustandSceneStoreAdapter();
    const world = new WorldStateManager(adapter.snapshotWorldState());
    const registry = createEditorBackedToolRegistry(adapter);
    const trace = new ExecutionTracer();
    const scene = adapter.createScene(world, 'Build Scene');
    adapter.createEntity(world, {
      sceneId: scene.sceneId,
      name: 'Build Mesh',
      type: 'mesh',
    });

    const assetResult = await registry.execute(
      createToolCall('asset.register', 'technical_integration', 'step-build', {
        name: 'Agentic Texture',
        type: 'texture',
        path: 'agentic://textures/agentic-texture.png',
      }),
      {
        pipelineId: 'pipeline-build',
        iteration: 1,
        stepId: 'step-build',
        agentRole: 'technical_integration',
        world,
        trace,
      }
    );
    const buildResult = await registry.execute(
      createToolCall('build.validateScene', 'technical_integration', 'step-build', {
        target: 'web',
      }),
      {
        pipelineId: 'pipeline-build',
        iteration: 1,
        stepId: 'step-build',
        agentRole: 'technical_integration',
        world,
        trace,
      }
    );

    expect(assetResult.success).toBe(true);
    expect(buildResult.success).toBe(true);
    expect(useEngineStore.getState().assets.some((asset) => asset.name === 'Agentic Texture')).toBe(true);
    expect(useEngineStore.getState().lastBuildReport).toBeTruthy();
    expect(Object.keys(world.getSnapshot().buildReports).length).toBeGreaterThan(0);
  });

  it('executes editor-backed build.export through the physical ReyPlay packaging pipeline', async () => {
    const buildRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-agentic-export-'));
    const previousBuildRoot = process.env.REY30_BUILD_ROOT;
    process.env.REY30_BUILD_ROOT = buildRoot;

    try {
      const adapter = createZustandSceneStoreAdapter({
        buildExporter: createNodeEditorBuildExporter(),
      });
      const world = new WorldStateManager(adapter.snapshotWorldState());
      const registry = createEditorBackedToolRegistry(adapter);
      const trace = new ExecutionTracer();
      const scene = adapter.createScene(world, 'Physical Export Scene');
      adapter.createEntity(world, {
        sceneId: scene.sceneId,
        name: 'Exported Mesh',
        type: 'mesh',
      });

      const result = await registry.execute(
        createToolCall('build.export', 'technical_integration', 'step-export', {
          target: 'web',
        }),
        {
          pipelineId: 'pipeline-export',
          iteration: 1,
          stepId: 'step-export',
          agentRole: 'technical_integration',
          world,
          trace,
        }
      );
      const artifactPath = result.output?.artifactPath as string;
      const artifacts = result.output?.artifacts as Array<Record<string, unknown>>;
      const runtimeScaffold = result.output?.runtimeScaffold as
        | { createdCamera?: boolean; createdPlayer?: boolean; entityIds?: string[]; summaries?: string[] }
        | undefined;
      const exportedEntities = Array.from(useEngineStore.getState().entities.values());
      const exportCamera = exportedEntities.find((entity) => entity.name === 'Agentic Export Camera');
      const exportPlayer = exportedEntities.find((entity) => entity.name === 'Agentic Export Player');
      const buildReportIssues = Object.values(world.getSnapshot().buildReports).flatMap(
        (report) => report.issues
      );

      expect(result.success).toBe(true);
      expect(result.output?.source).toBe('local_node_build_pipeline');
      expect(artifactPath).toMatch(/\.zip$/);
      expect(artifacts.some((artifact) => artifact.kind === 'manifest')).toBe(true);
      expect(artifacts.some((artifact) => artifact.kind === 'bundle')).toBe(true);
      expect(runtimeScaffold?.createdCamera).toBe(true);
      expect(runtimeScaffold?.createdPlayer).toBe(true);
      expect(runtimeScaffold?.entityIds?.length).toBe(2);
      expect(runtimeScaffold?.summaries?.join(' ')).toContain('runtime export player');
      expect(exportCamera?.components.has('Camera')).toBe(true);
      expect(exportPlayer?.tags).toContain('player');
      expect(exportPlayer?.components.has('PlayerController')).toBe(true);
      expect(exportPlayer?.components.has('Collider')).toBe(true);
      expect(buildReportIssues.some((issue) => issue.includes('RYP_NO_PLAYER'))).toBe(false);
      expect(buildReportIssues.some((issue) => issue.includes('RYP_NO_CAMERA'))).toBe(false);
      expect((await readFile(path.resolve(process.cwd(), artifactPath))).byteLength).toBeGreaterThan(0);
      expect(
        Object.values(world.getSnapshot().buildReports).some(
          (report) => report.status === 'exported' && report.artifactPath === artifactPath
        )
      ).toBe(true);
    } finally {
      if (previousBuildRoot === undefined) {
        delete process.env.REY30_BUILD_ROOT;
      } else {
        process.env.REY30_BUILD_ROOT = previousBuildRoot;
      }
      await rm(buildRoot, { recursive: true, force: true });
    }
  });
});
