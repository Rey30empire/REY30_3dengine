import {
  ONE_VECTOR,
  ZERO_VECTOR,
  cloneJson,
  createAgenticId,
  type AgenticAnimationClip,
  type AgenticAsset,
  type AgenticBuildReport,
  type AgenticComponent,
  type AgenticComponentType,
  type AgenticEntity,
  type AgenticEnvironment,
  type AgenticMaterial,
  type AgenticScene,
  type AgenticScript,
  type AgenticTransform,
  type ChangeEvidence,
  type ColorRGBA,
  type JsonObject,
  type Vector3,
  type WorldState,
} from '../schemas';

const DEFAULT_COLOR: ColorRGBA = { r: 1, g: 1, b: 1, a: 1 };

function now(): string {
  return new Date().toISOString();
}

function defaultTransform(transform?: Partial<AgenticTransform>): AgenticTransform {
  return {
    position: { ...ZERO_VECTOR, ...transform?.position },
    rotation: { ...ZERO_VECTOR, ...transform?.rotation },
    scale: { ...ONE_VECTOR, ...transform?.scale },
  };
}

function defaultEnvironment(): AgenticEnvironment {
  return {
    skybox: null,
    mood: 'neutral',
    ambientLight: { ...DEFAULT_COLOR },
    ambientIntensity: 0.8,
    directionalLightIntensity: 1,
    fog: null,
  };
}

function evidence(
  type: ChangeEvidence['type'],
  summary: string,
  targetId?: string,
  before?: unknown,
  after?: unknown
): ChangeEvidence {
  return {
    id: createAgenticId('evidence'),
    type,
    targetId,
    summary,
    before: before === undefined ? undefined : (cloneJson(before as never) as never),
    after: after === undefined ? undefined : (cloneJson(after as never) as never),
    timestamp: now(),
  };
}

export interface CreateEntityInput {
  sceneId?: string;
  name: string;
  type?: AgenticEntity['type'];
  transform?: Partial<AgenticTransform>;
  tags?: string[];
  metadata?: JsonObject;
}

export class WorldStateManager {
  private state: WorldState;

  constructor(initialState?: Partial<WorldState>) {
    const createdAt = now();
    this.state = {
      id: initialState?.id ?? createAgenticId('world'),
      activeSceneId: initialState?.activeSceneId ?? null,
      scenes: initialState?.scenes ?? {},
      entities: initialState?.entities ?? {},
      materials: initialState?.materials ?? {},
      assets: initialState?.assets ?? {},
      scripts: initialState?.scripts ?? {},
      animations: initialState?.animations ?? {},
      buildReports: initialState?.buildReports ?? {},
      updatedAt: initialState?.updatedAt ?? createdAt,
    };
  }

  getSnapshot(): WorldState {
    return cloneJson(this.state as never) as WorldState;
  }

  replace(nextState: WorldState): void {
    this.state = cloneJson(nextState as never) as WorldState;
  }

  ensureScene(name = 'Agentic Scene'): AgenticScene {
    if (this.state.activeSceneId && this.state.scenes[this.state.activeSceneId]) {
      return this.state.scenes[this.state.activeSceneId];
    }

    const scene = this.createScene({ name }).scene;
    return scene;
  }

  createScene(input: { name: string; environment?: Partial<AgenticEnvironment> }): {
    scene: AgenticScene;
    evidence: ChangeEvidence;
  } {
    const timestamp = now();
    const scene: AgenticScene = {
      id: createAgenticId('scene'),
      name: input.name,
      rootEntityIds: [],
      entityIds: [],
      environment: {
        ...defaultEnvironment(),
        ...input.environment,
      },
      layoutGroups: [],
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.state.scenes[scene.id] = scene;
    this.state.activeSceneId = scene.id;
    this.touch();

    return {
      scene,
      evidence: evidence('scene', `Created scene "${scene.name}".`, scene.id, null, scene),
    };
  }

  updateScene(
    sceneId: string,
    patch: Partial<Pick<AgenticScene, 'name' | 'metadata'>>
  ): ChangeEvidence {
    const scene = this.getSceneOrThrow(sceneId);
    const before = cloneJson(scene as never);

    if (patch.name) {
      scene.name = patch.name;
    }
    if (patch.metadata) {
      scene.metadata = { ...scene.metadata, ...patch.metadata };
    }
    scene.updatedAt = now();
    this.touch();

    return evidence('scene', `Updated scene "${scene.name}".`, scene.id, before, scene);
  }

  createEntity(input: CreateEntityInput): { entity: AgenticEntity; evidence: ChangeEvidence } {
    const scene = input.sceneId
      ? this.getSceneOrThrow(input.sceneId)
      : this.ensureScene();
    const entity: AgenticEntity = {
      id: createAgenticId('entity'),
      sceneId: scene.id,
      name: input.name,
      type: input.type ?? 'empty',
      parentId: null,
      childIds: [],
      transform: defaultTransform(input.transform),
      components: {},
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    };

    this.state.entities[entity.id] = entity;
    scene.entityIds.push(entity.id);
    scene.rootEntityIds.push(entity.id);
    scene.updatedAt = now();
    this.touch();

    return {
      entity,
      evidence: evidence('entity', `Created entity "${entity.name}".`, entity.id, null, entity),
    };
  }

  duplicateEntity(entityId: string, name?: string): { entity: AgenticEntity; evidence: ChangeEvidence } {
    const source = this.getEntityOrThrow(entityId);
    const sourceClone = JSON.parse(JSON.stringify(source)) as AgenticEntity;
    const clonedComponents = Object.fromEntries(
      Object.values(source.components).map((component) => {
        const componentId = createAgenticId('component');
        return [
          componentId,
          {
            ...component,
            id: componentId,
            data: JSON.parse(JSON.stringify(component.data)) as JsonObject,
          },
        ];
      })
    );
    const clone: AgenticEntity = {
      ...sourceClone,
      id: createAgenticId('entity'),
      name: name ?? `${source.name} Copy`,
      parentId: null,
      childIds: [],
      components: clonedComponents,
    };
    const scene = this.getSceneOrThrow(source.sceneId);
    this.state.entities[clone.id] = clone;
    scene.entityIds.push(clone.id);
    scene.rootEntityIds.push(clone.id);
    scene.updatedAt = now();
    this.touch();

    return {
      entity: clone,
      evidence: evidence('entity', `Duplicated "${source.name}" as "${clone.name}".`, clone.id, source, clone),
    };
  }

  deleteEntity(entityId: string): ChangeEvidence {
    const entity = this.getEntityOrThrow(entityId);
    const before = cloneJson(entity as never);
    const scene = this.getSceneOrThrow(entity.sceneId);

    if (entity.parentId) {
      const parent = this.state.entities[entity.parentId];
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== entity.id);
      }
    }
    scene.entityIds = scene.entityIds.filter((id) => id !== entity.id);
    scene.rootEntityIds = scene.rootEntityIds.filter((id) => id !== entity.id);
    delete this.state.entities[entity.id];
    scene.updatedAt = now();
    this.touch();

    return evidence('entity', `Deleted entity "${entity.name}".`, entity.id, before, null);
  }

  updateEntityTransform(entityId: string, transform: Partial<AgenticTransform>): ChangeEvidence {
    const entity = this.getEntityOrThrow(entityId);
    const before = cloneJson(entity.transform as never);
    entity.transform = defaultTransform({
      position: { ...entity.transform.position, ...transform.position },
      rotation: { ...entity.transform.rotation, ...transform.rotation },
      scale: { ...entity.transform.scale, ...transform.scale },
    });
    this.touchScene(entity.sceneId);
    this.touch();

    return evidence(
      'entity',
      `Updated transform for "${entity.name}".`,
      entity.id,
      before,
      entity.transform
    );
  }

  setParent(entityId: string, parentId: string | null): ChangeEvidence {
    const entity = this.getEntityOrThrow(entityId);
    const before = cloneJson(entity as never);

    if (entity.parentId) {
      const oldParent = this.state.entities[entity.parentId];
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter((id) => id !== entityId);
      }
    }

    entity.parentId = parentId;
    const scene = this.getSceneOrThrow(entity.sceneId);

    if (parentId) {
      const parent = this.getEntityOrThrow(parentId);
      if (!parent.childIds.includes(entityId)) {
        parent.childIds.push(entityId);
      }
      scene.rootEntityIds = scene.rootEntityIds.filter((id) => id !== entityId);
    } else if (!scene.rootEntityIds.includes(entityId)) {
      scene.rootEntityIds.push(entityId);
    }

    this.touchScene(entity.sceneId);
    this.touch();

    return evidence('entity', `Updated hierarchy for "${entity.name}".`, entity.id, before, entity);
  }

  createGroup(sceneId: string, name: string, entityIds: string[]): {
    group: AgenticEntity;
    evidence: ChangeEvidence[];
  } {
    const group = this.createEntity({
      sceneId,
      name,
      type: 'group',
      tags: ['layout-group'],
    });
    const evidences = [group.evidence];
    const scene = this.getSceneOrThrow(sceneId);
    scene.layoutGroups.push(group.entity.id);

    for (const entityId of entityIds) {
      if (this.state.entities[entityId]) {
        evidences.push(this.setParent(entityId, group.entity.id));
      }
    }

    return {
      group: group.entity,
      evidence: [
        ...evidences,
        evidence('scene', `Grouped ${entityIds.length} entities under "${name}".`, sceneId, null, {
          groupId: group.entity.id,
          entityIds,
        }),
      ],
    };
  }

  addComponent(
    entityId: string,
    type: AgenticComponentType,
    data: JsonObject,
    enabled = true
  ): { component: AgenticComponent; evidence: ChangeEvidence } {
    const entity = this.getEntityOrThrow(entityId);
    const component: AgenticComponent = {
      id: createAgenticId('component'),
      type,
      data,
      enabled,
    };
    const before = cloneJson(entity.components as never);
    entity.components[component.id] = component;
    this.touchScene(entity.sceneId);
    this.touch();

    return {
      component,
      evidence: evidence(
        'component',
        `Assigned ${type} component to "${entity.name}".`,
        entity.id,
        before,
        entity.components
      ),
    };
  }

  updateComponent(entityId: string, componentType: AgenticComponentType, data: JsonObject): ChangeEvidence {
    const entity = this.getEntityOrThrow(entityId);
    const component = Object.values(entity.components).find((item) => item.type === componentType);
    if (!component) {
      return this.addComponent(entityId, componentType, data).evidence;
    }

    const before = cloneJson(component as never);
    component.data = { ...component.data, ...data };
    this.touchScene(entity.sceneId);
    this.touch();

    return evidence('component', `Updated ${componentType} for "${entity.name}".`, entity.id, before, component);
  }

  createMaterial(input: {
    name: string;
    color?: ColorRGBA;
    roughness?: number;
    metallic?: number;
    metadata?: JsonObject;
  }): { material: AgenticMaterial; evidence: ChangeEvidence } {
    const material: AgenticMaterial = {
      id: createAgenticId('material'),
      name: input.name,
      color: input.color ?? { ...DEFAULT_COLOR },
      roughness: input.roughness ?? 0.5,
      metallic: input.metallic ?? 0,
      metadata: input.metadata ?? {},
    };
    this.state.materials[material.id] = material;
    this.touch();

    return {
      material,
      evidence: evidence('material', `Created material "${material.name}".`, material.id, null, material),
    };
  }

  updateMaterial(materialId: string, patch: Partial<AgenticMaterial>): ChangeEvidence {
    const material = this.state.materials[materialId];
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    const before = cloneJson(material as never);
    Object.assign(material, patch, {
      metadata: { ...material.metadata, ...patch.metadata },
    });
    this.touch();

    return evidence('material', `Updated material "${material.name}".`, material.id, before, material);
  }

  updateEnvironment(sceneId: string, patch: Partial<AgenticEnvironment>): ChangeEvidence {
    const scene = this.getSceneOrThrow(sceneId);
    const before = cloneJson(scene.environment as never);
    scene.environment = {
      ...scene.environment,
      ...patch,
      fog: patch.fog === undefined ? scene.environment.fog : patch.fog,
    };
    scene.updatedAt = now();
    this.touch();

    return evidence('environment', `Updated environment for "${scene.name}".`, scene.id, before, scene.environment);
  }

  createScript(input: {
    name: string;
    source: string;
    parameters?: JsonObject;
    metadata?: JsonObject;
  }): { script: AgenticScript; evidence: ChangeEvidence } {
    const script: AgenticScript = {
      id: createAgenticId('script'),
      name: input.name,
      language: 'typescript',
      source: input.source,
      parameters: input.parameters ?? {},
      metadata: input.metadata ?? {},
    };
    this.state.scripts[script.id] = script;
    this.touch();

    return {
      script,
      evidence: evidence('script', `Created script "${script.name}".`, script.id, null, script),
    };
  }

  updateScriptParameters(scriptId: string, parameters: JsonObject): ChangeEvidence {
    const script = this.state.scripts[scriptId];
    if (!script) {
      throw new Error(`Script not found: ${scriptId}`);
    }
    const before = cloneJson(script as never);
    script.parameters = { ...script.parameters, ...parameters };
    this.touch();
    return evidence('script', `Updated script "${script.name}" parameters.`, script.id, before, script);
  }

  createAnimation(input: {
    name: string;
    duration: number;
    targetEntityId?: string;
    tracks?: JsonObject[];
    metadata?: JsonObject;
  }): { animation: AgenticAnimationClip; evidence: ChangeEvidence } {
    const animation: AgenticAnimationClip = {
      id: createAgenticId('animation'),
      name: input.name,
      duration: input.duration,
      targetEntityId: input.targetEntityId,
      tracks: input.tracks ?? [],
      metadata: input.metadata ?? {},
    };
    this.state.animations[animation.id] = animation;
    this.touch();

    return {
      animation,
      evidence: evidence('animation', `Created animation clip "${animation.name}".`, animation.id, null, animation),
    };
  }

  registerAsset(input: Omit<AgenticAsset, 'id'> & { id?: string }): {
    asset: AgenticAsset;
    evidence: ChangeEvidence;
  } {
    const asset: AgenticAsset = {
      ...input,
      id: input.id ?? createAgenticId('asset'),
    };
    this.state.assets[asset.id] = asset;
    this.touch();

    return {
      asset,
      evidence: evidence('asset', `Registered asset "${asset.name}".`, asset.id, null, asset),
    };
  }

  addBuildReport(input: Omit<AgenticBuildReport, 'id' | 'createdAt'> & { id?: string }): {
    report: AgenticBuildReport;
    evidence: ChangeEvidence;
  } {
    const report: AgenticBuildReport = {
      ...input,
      id: input.id ?? createAgenticId('build'),
      createdAt: now(),
    };
    this.state.buildReports[report.id] = report;
    this.touch();

    return {
      report,
      evidence: evidence('build', `Generated build report: ${report.summary}`, report.id, null, report),
    };
  }

  findEntitiesByTag(tag: string): AgenticEntity[] {
    return Object.values(this.state.entities).filter((entity) => entity.tags.includes(tag));
  }

  findEntitiesByType(type: AgenticEntity['type']): AgenticEntity[] {
    return Object.values(this.state.entities).filter((entity) => entity.type === type);
  }

  getActiveScene(): AgenticScene | null {
    if (!this.state.activeSceneId) {
      return null;
    }
    return this.state.scenes[this.state.activeSceneId] ?? null;
  }

  getSceneOrThrow(sceneId: string): AgenticScene {
    const scene = this.state.scenes[sceneId];
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }
    return scene;
  }

  getEntityOrThrow(entityId: string): AgenticEntity {
    const entity = this.state.entities[entityId];
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    return entity;
  }

  private touchScene(sceneId: string): void {
    const scene = this.state.scenes[sceneId];
    if (scene) {
      scene.updatedAt = now();
    }
  }

  private touch(): void {
    this.state.updatedAt = now();
  }
}
