import { v4 as uuidv4 } from 'uuid';
import { REYPLAY_BUILD_SCHEMA } from '../types';
import { defaultScribRegistry } from '@/engine/scrib';
import type { ScribInstance } from '@/engine/scrib';
import { collectSceneEntityIds } from '@/store/sceneGraph';
import type {
  BuildDiagnostic,
  BuildManifest,
  BuildReport,
  BuildManifestScene,
  BuildManifestAsset,
  ScribProfile,
  ValidateProjectInput,
  BuildGenerationInput,
} from '../types';
import type { Asset, Entity, Scene } from '@/types/engine';

function createDiagnostic(
  params: {
    level: BuildDiagnostic['level'];
    stage: BuildDiagnostic['stage'];
    code: string;
    message: string;
    hint?: string;
    target?: string;
    path?: string;
  }
): BuildDiagnostic {
  return {
    id: uuidv4(),
    level: params.level,
    stage: params.stage,
    code: params.code,
    message: params.message,
    hint: params.hint,
    target: params.target,
    path: params.path,
  };
}

export function validateReyPlayProject(input: ValidateProjectInput): BuildReport {
  const diagnostics: BuildDiagnostic[] = [];

  if (input.scenes.length === 0) {
    diagnostics.push(
      createDiagnostic({
        level: 'error',
        stage: 'schema',
        code: 'RYP_NO_SCENES',
        message: 'No hay ninguna escena creada.',
        hint: 'Usa una plantilla o crea una escena nueva para continuar.',
      })
    );
  }

  if (!input.activeSceneId) {
    diagnostics.push(
      createDiagnostic({
        level: 'warning',
        stage: 'schema',
        code: 'RYP_NO_ACTIVE_SCENE',
        message: 'No hay una escena activa seleccionada.',
        hint: 'Selecciona la escena donde se ejecutará el juego.',
      })
    );
  }

  const assetsById = new Map<string, Asset>(input.assets.map((asset) => [asset.id, asset]));
  const entities = Array.from(input.entities.values());

  if (entities.length === 0) {
    diagnostics.push(
      createDiagnostic({
        level: 'warning',
        stage: 'runtime',
        code: 'RYP_NO_ENTITIES',
        message: 'La escena no tiene entidades en runtime.',
        hint: 'Agrega un Player, enemigos o elementos de nivel.',
      })
    );
  }

  entities.forEach((entity) => {
    const meshRenderer = entity.components.get('MeshRenderer');
    const terrain = entity.components.get('Terrain');

    const meshData = meshRenderer?.data as Record<string, unknown> | undefined;
    if (meshData && typeof meshData === 'object' && 'meshId' in meshData) {
      const meshId = (meshData as { meshId?: string }).meshId;
      if (meshId && !assetsById.has(meshId)) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'assets',
            code: 'RYP_MESH_MISSING',
            message: `Entidad "${entity.name}" referencia un mesh inexistente: ${meshId}`,
            hint: 'Importa el archivo del mesh o elimina la referencia en MeshRenderer.',
            target: entity.id,
          })
        );
      }
    }

    if (meshData && typeof meshData === 'object' && 'materialId' in meshData) {
      const materialId = (meshData as { materialId?: string }).materialId;
      if (materialId && !assetsById.has(materialId)) {
        diagnostics.push(
          createDiagnostic({
            level: 'warning',
            stage: 'assets',
            code: 'RYP_MATERIAL_MISSING',
            message: `Entidad "${entity.name}" referencia un material inexistente: ${materialId}`,
            hint: 'Asigna un material válido desde la librería de materiales.',
            target: entity.id,
          })
        );
      }
    }

    if (terrain) {
      const terrainData = terrain.data as Record<string, unknown> | undefined;
      if (
        !terrainData ||
        typeof terrainData.width !== 'number' ||
        typeof terrainData.height !== 'number'
      ) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'schema',
            code: 'RYP_TERRAIN_BAD_DATA',
            message: `Terrain "${entity.name}" no tiene datos de terreno válidos.`,
            hint: 'Reconfigura el Terreno en el panel de inspector.',
            target: entity.id,
          })
        );
      }
    }
  });

  input.scribProfiles.forEach((scrib) => {
    const exists = input.entities.has(scrib.entityId);
    if (!exists) {
      diagnostics.push(
        createDiagnostic({
          level: 'warning',
          stage: 'runtime',
          code: 'RYP_SCRIB_STALE',
          message: `Scrib asociado a entidad inexistente (${scrib.entityId})`,
          hint: 'Reasocia el Scrib al objeto actual o elimina ese registro.',
        })
      );
    }
  });

  const sceneIds = new Set(input.scenes.map((scene) => scene.id));
  input.scribInstances.forEach((instance) => {
    if (instance.target.scope === 'entity' && !input.entities.has(instance.target.id)) {
      diagnostics.push(
        createDiagnostic({
          level: 'error',
          stage: 'runtime',
          code: 'SCRIB_TARGET_ENTITY_MISSING',
          message: `Scrib ${instance.type} apunta a entidad inexistente: ${instance.target.id}`,
          hint: 'Reasigna el scrib a una entidad válida.',
          target: instance.id,
        })
      );
    }

    if (instance.target.scope === 'scene' && !sceneIds.has(instance.target.id)) {
      diagnostics.push(
        createDiagnostic({
          level: 'error',
          stage: 'runtime',
          code: 'SCRIB_TARGET_SCENE_MISSING',
          message: `Scrib ${instance.type} apunta a escena inexistente: ${instance.target.id}`,
          hint: 'Reasigna el scrib a una escena válida.',
          target: instance.id,
        })
      );
    }

    const validation = defaultScribRegistry.validate(instance.type);
    validation.issues.forEach((issue) => {
      diagnostics.push(
        createDiagnostic({
          level: issue.level === 'error' ? 'error' : 'warning',
          stage: 'schema',
          code: issue.code,
          message: issue.message,
          target: instance.id,
        })
      );
    });
  });

  const groupedByTarget = new Map<string, ScribInstance[]>();
  input.scribInstances.forEach((instance) => {
    const key = `${instance.target.scope}:${instance.target.id}`;
    const current = groupedByTarget.get(key) || [];
    current.push(instance);
    groupedByTarget.set(key, current);
  });

  groupedByTarget.forEach((instances, key) => {
    const provided = new Set<string>();
    const types = new Set<string>();
    instances.forEach((item) => {
      if (!item.enabled) return;
      item.provides.forEach((cap) => provided.add(cap));
      if (types.has(item.type)) {
        diagnostics.push(
          createDiagnostic({
            level: 'warning',
            stage: 'runtime',
            code: 'SCRIB_DUPLICATE_TYPE',
            message: `Scrib duplicado (${item.type}) en target ${key}.`,
            hint: 'Mantén un único scrib por tipo en el mismo target.',
            target: item.id,
          })
        );
      }
      types.add(item.type);
    });

    instances.forEach((item) => {
      if (!item.enabled) return;
      item.requires.forEach((req) => {
        if (!provided.has(req)) {
          diagnostics.push(
            createDiagnostic({
              level: 'error',
              stage: 'runtime',
              code: 'SCRIB_REQUIREMENT_MISSING',
              message: `Scrib ${item.type} requiere "${req}" en ${key} y no está disponible.`,
              hint: `Asigna el scrib atomic "${req}" o una recipe que lo provea.`,
              target: item.id,
            })
          );
        }
      });
    });
  });

  const hasPlayable = entities.some((entity) =>
    entity.tags?.some((tag) => tag.toLowerCase() === 'player')
  );
  if (!hasPlayable) {
    diagnostics.push(
      createDiagnostic({
        level: 'warning',
        stage: 'runtime',
        code: 'RYP_NO_PLAYER',
        message: 'No hay entidad marcada como jugador.',
        hint: 'Crea un objeto de tipo jugador con tag "player" para pruebas de juego.',
      })
    );
  }

  const hasCamera = entities.some(
    (entity) => entity.components.get('Camera') !== undefined
  );
  if (!hasCamera) {
    diagnostics.push(
      createDiagnostic({
        level: 'warning',
        stage: 'runtime',
        code: 'RYP_NO_CAMERA',
        message: 'No hay una cámara en escena.',
        hint: 'Añade una entidad Camera para habilitar la vista de juego.',
      })
    );
  }

  const errors = diagnostics.filter((item) => item.level === 'error');
  return {
    ok: errors.length === 0,
    sceneCount: input.scenes.length,
    assetCount: input.assets.length,
    entityCount: entities.length,
    diagnostics,
    summary: errors.length > 0
      ? `Compilación fallida: ${errors.length} error(es), ${diagnostics.length} aviso(s).`
      : `Compilación válida: ${diagnostics.length} aviso(s) detectados.`,
    generatedAt: new Date().toISOString(),
  };
}

export function buildReyPlayManifest(input: BuildGenerationInput): BuildManifest {
  const sceneEntries: BuildManifestScene[] = input.scenes.map((scene) => {
    const sceneEntityIds = collectSceneEntityIds(scene, input.entities);

    return {
      sceneId: scene.id,
      name: scene.name,
      rootEntityIds: Array.from(new Set(scene.rootEntities)).filter((entityId) =>
        input.entities.has(entityId)
      ),
      entityCount: sceneEntityIds.length,
      tags: ['compiled'],
    };
  });

  const entities = Array.from(input.entities.values()).map((entity) => ({
    id: entity.id,
    name: entity.name,
    tags: entity.tags,
    components: Array.from(entity.components.keys()),
  }));

  const assets = input.assets.map<BuildManifestAsset>((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    path: asset.path,
  }));

  const scribs = Array.from(input.scribProfiles.values()).map((scrib) => ({
    entityId: scrib.entityId,
    targetType: scrib.targetType,
    mode: scrib.mode,
    prompt: scrib.prompt,
    status: scrib.status,
    manifestPath: scrib.manifestPath,
    lastError: scrib.lastError,
  }));

  const scribComponents = Array.from(input.scribInstances.values()).map((instance) => ({
    id: instance.id,
    type: instance.type,
    kind: instance.kind,
    targetScope: instance.target.scope,
    targetId: instance.target.id,
    enabled: instance.enabled,
  }));

  return {
    schema: REYPLAY_BUILD_SCHEMA,
    buildId: uuidv4(),
    projectName: input.projectName,
    createdAt: new Date().toISOString(),
    activeSceneId: input.activeSceneId,
    scenes: sceneEntries,
    entities,
    assets,
    scribs,
    scribComponents,
    compileMeta: {
      entityCount: entities.length,
      assetCount: assets.length,
      diagnosticCount: 0,
    },
  };
}

export function createDiagnosticHintFromReport(report: BuildReport): string {
  if (report.ok) return 'Listo para exportar. Revisar advertencias para estabilidad.';

  const errors = report.diagnostics.filter((item) => item.level === 'error');
  return errors
    .map((item, index) => `${index + 1}. [${item.code}] ${item.message}`)
    .join('\n');
}

export function getDefaultScribProfile(entityId: string): ScribProfile {
  const now = new Date().toISOString();
  return {
    entityId,
    targetType: 'custom',
    mode: 'manual',
    prompt: '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
