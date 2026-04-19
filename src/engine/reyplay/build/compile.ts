import { v4 as uuidv4 } from 'uuid';
import { REYPLAY_BUILD_SCHEMA } from '../types';
import { defaultScribRegistry } from '@/engine/scrib';
import type { ScribInstance } from '@/engine/scrib';
import { collectSceneEntityIds } from '@/store/sceneGraph';
import {
  resolveEditorMaterial,
  summarizeEditorMaterial,
  MATERIAL_TEXTURE_SLOTS,
} from '@/engine/editor/editorMaterials';
import { applyMeshModifierStack, parseMeshModifierStack } from '@/engine/editor/meshModifiers';
import {
  parseEditableMesh,
  sanitizeEditableMesh,
  type EditableMesh,
} from '@/engine/editor/modelerMesh';
import { createGeneratedAnimatorRecord } from '@/engine/animation/animatorAuthoring';
import { normalizeWeaponData, resolveBattleTeam } from '@/engine/gameplay/combatData';
import {
  getTerrainHeightRange,
  normalizeTerrainData,
} from '@/engine/scene/terrainAuthoring';
import type {
  BuildDiagnostic,
  BuildManifest,
  BuildReport,
  BuildManifestScene,
  BuildManifestAsset,
  BuildManifestGeneratedAnimation,
  BuildManifestGeneratedCharacter,
  BuildManifestCombatActor,
  BuildManifestCombatWeapon,
  BuildManifestGeneratedModelerMesh,
  BuildManifestGeneratedTerrain,
  BuildManifestMaterial,
  ScribProfile,
  ValidateProjectInput,
  BuildGenerationInput,
} from '../types';
import type { Asset, Entity, Scene } from '@/types/engine';
import { resolveSceneRenderProfile } from '@/engine/rendering/renderEnvironmentProfile';
import {
  isCharacterPackage,
  summarizeCharacterPackage,
  type CharacterPackageSummary,
} from '@/lib/character-package';

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

function sanitizeBuildFileStem(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'modeler_mesh'
  );
}

function isGeneratedCharacterAsset(asset: Asset) {
  return (
    asset.type === 'prefab' &&
    (asset.metadata?.characterPackage === true ||
      asset.metadata?.source === 'ai_level3_full_character' ||
      asset.metadata?.generatedBy === 'character-full-route')
  );
}

function loadNodeBuildRuntime() {
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const nodeRequire = eval('require') as (specifier: string) => unknown;
    return {
      fs: nodeRequire('node:fs') as {
        existsSync: (targetPath: string) => boolean;
        readFileSync: (targetPath: string, encoding: BufferEncoding) => string;
      },
      path: nodeRequire('node:path') as {
        resolve: (...segments: string[]) => string;
      },
    };
  } catch {
    return null;
  }
}

function resolveBuildAssetAbsolutePath(assetPath: string) {
  const runtime = loadNodeBuildRuntime();
  if (!runtime) {
    return null;
  }

  return runtime.path.resolve(process.cwd(), assetPath);
}

function readGeneratedCharacterPackage(assetPath: string) {
  const runtime = loadNodeBuildRuntime();
  const absolutePath = resolveBuildAssetAbsolutePath(assetPath);
  if (!runtime || !absolutePath || !runtime.fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    const raw = runtime.fs.readFileSync(absolutePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isCharacterPackage(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function coerceCharacterSummary(value: unknown): CharacterPackageSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const requiredNumbers: Array<keyof CharacterPackageSummary> = [
    'vertexCount',
    'triangleCount',
    'rigBoneCount',
    'blendshapeCount',
    'textureCount',
    'materialCount',
    'animationCount',
  ];

  for (const key of requiredNumbers) {
    if (typeof record[key] !== 'number' || !Number.isFinite(record[key] as number)) {
      return null;
    }
  }

  const readStringOrNull = (field: 'prompt' | 'style' | 'targetEngine' | 'generatedAt') => {
    const current = record[field];
    return typeof current === 'string' || current === null ? current : null;
  };

  return {
    vertexCount: record.vertexCount as number,
    triangleCount: record.triangleCount as number,
    rigBoneCount: record.rigBoneCount as number,
    blendshapeCount: record.blendshapeCount as number,
    textureCount: record.textureCount as number,
    materialCount: record.materialCount as number,
    animationCount: record.animationCount as number,
    prompt: readStringOrNull('prompt'),
    style: readStringOrNull('style'),
    targetEngine: readStringOrNull('targetEngine'),
    generatedAt: readStringOrNull('generatedAt'),
  };
}

function buildGeneratedCharacterRecord(asset: Asset): BuildManifestGeneratedCharacter | null {
  if (!isGeneratedCharacterAsset(asset)) {
    return null;
  }

  const parsed = readGeneratedCharacterPackage(asset.path);
  if (!parsed) {
    return null;
  }

  const safeAssetName = sanitizeBuildFileStem(asset.name || asset.id);
  return {
    assetId: asset.id,
    assetPath: asset.path,
    assetName: asset.name,
    path: `generated-character-${safeAssetName}-${asset.id}.json`,
    package: parsed,
    summary: summarizeCharacterPackage(parsed),
  };
}

function collectGeneratedCharacters(assets: Asset[]): BuildManifestGeneratedCharacter[] {
  return assets
    .map((asset) => buildGeneratedCharacterRecord(asset))
    .filter((value): value is BuildManifestGeneratedCharacter => Boolean(value));
}

function findCombatOwnerEntity(entity: Entity, entities: Map<string, Entity>) {
  let parentId = entity.parentId;
  while (parentId) {
    const parent = entities.get(parentId);
    if (!parent) return null;
    if (parent.components.get('Health')?.enabled) {
      return parent;
    }
    parentId = parent.parentId;
  }
  return null;
}

function findOwnedWeaponEntity(owner: Entity, entities: Map<string, Entity>) {
  return Array.from(entities.values()).find((candidate) => {
    if (!candidate.active || candidate.components.get('Weapon')?.enabled !== true) {
      return false;
    }
    let parentId = candidate.parentId;
    while (parentId) {
      if (parentId === owner.id) return true;
      parentId = entities.get(parentId)?.parentId ?? null;
    }
    return false;
  }) ?? null;
}

function collectCombatActors(entities: Map<string, Entity>): BuildManifestCombatActor[] {
  return Array.from(entities.values())
    .filter((entity) => entity.components.get('Health')?.enabled)
    .map((entity) => {
      const healthData = (entity.components.get('Health')?.data as Record<string, unknown> | undefined) ?? {};
      const ownedWeapon = findOwnedWeaponEntity(entity, entities);
      const attackSource = ownedWeapon ?? entity;
      const fallbackAttack =
        typeof healthData.attack === 'number' && Number.isFinite(healthData.attack)
          ? healthData.attack
          : 10;
      const weapon = normalizeWeaponData(attackSource.components.get('Weapon')?.data, fallbackAttack);
      return {
        entityId: entity.id,
        entityName: entity.name,
        team: resolveBattleTeam(entity, healthData),
        maxHealth: Math.max(1, typeof healthData.maxHealth === 'number' ? healthData.maxHealth : 100),
        currentHealth: Math.max(
          0,
          typeof healthData.currentHealth === 'number'
            ? healthData.currentHealth
            : typeof healthData.maxHealth === 'number'
              ? healthData.maxHealth
              : 100
        ),
        attack: weapon.damage,
        defense: Math.max(0, typeof healthData.defense === 'number' ? healthData.defense : 0),
        speed: Math.max(0.1, typeof healthData.speed === 'number' ? healthData.speed : 1),
        hasWeapon: Boolean(ownedWeapon || entity.components.get('Weapon')?.enabled),
        hasPlayerController: entity.components.get('PlayerController')?.enabled === true,
      } satisfies BuildManifestCombatActor;
    });
}

function collectCombatWeapons(entities: Map<string, Entity>): BuildManifestCombatWeapon[] {
  return Array.from(entities.values())
    .filter((entity) => entity.components.get('Weapon')?.enabled)
    .map((entity) => {
      const owner = findCombatOwnerEntity(entity, entities);
      const ownerHealth = (owner?.components.get('Health')?.data as Record<string, unknown> | undefined) ?? {};
      const fallbackAttack =
        typeof ownerHealth.attack === 'number' && Number.isFinite(ownerHealth.attack)
          ? ownerHealth.attack
          : 10;
      const weapon = normalizeWeaponData(entity.components.get('Weapon')?.data, fallbackAttack);
      return {
        entityId: entity.id,
        entityName: entity.name,
        ownerEntityId: owner?.id ?? null,
        ownerEntityName: owner?.name ?? null,
        damage: weapon.damage,
        attackSpeed: weapon.attackSpeed,
        range: weapon.range,
        heavyDamage: weapon.heavyDamage,
        heavyAttackSpeed: weapon.heavyAttackSpeed,
        heavyRange: weapon.heavyRange,
        autoAcquireTarget: weapon.autoAcquireTarget,
        targetTeam: weapon.targetTeam,
      } satisfies BuildManifestCombatWeapon;
    });
}

type ResolvedModelerMesh = {
  baseMesh: EditableMesh;
  effectiveMesh: EditableMesh;
  modifierCount: number;
};

function resolveModelerMesh(meshData: Record<string, unknown>): ResolvedModelerMesh | null {
  const baseMesh = parseEditableMesh(meshData.manualMesh ?? meshData.customMesh);
  if (!baseMesh) {
    return null;
  }

  const modifiers = parseMeshModifierStack(meshData.modifiers);
  const effectiveMesh =
    modifiers.length > 0 ? applyMeshModifierStack(baseMesh, modifiers) : baseMesh;

  return {
    baseMesh: sanitizeEditableMesh(baseMesh),
    effectiveMesh: sanitizeEditableMesh(effectiveMesh),
    modifierCount: modifiers.length,
  };
}

function meshHasInvalidFaceIndices(mesh: EditableMesh) {
  return mesh.faces.some((face) =>
    face.some(
      (vertexIndex) =>
        !Number.isInteger(vertexIndex) ||
        vertexIndex < 0 ||
        vertexIndex >= mesh.vertices.length
    )
  );
}

function buildGeneratedModelerMesh(
  entity: Entity,
  meshData: Record<string, unknown>
): BuildManifestGeneratedModelerMesh | null {
  const resolved = resolveModelerMesh(meshData);
  if (!resolved) {
    return null;
  }

  const safeEntityName = sanitizeBuildFileStem(entity.name || entity.id);
  return {
    assetId: `generated-modeler-${entity.id}`,
    entityId: entity.id,
    entityName: entity.name,
    path: `generated-modeler-${safeEntityName}-${entity.id}.json`,
    modifierCount: resolved.modifierCount,
    mesh: resolved.effectiveMesh,
    summary: {
      baseVertexCount: resolved.baseMesh.vertices.length,
      baseFaceCount: resolved.baseMesh.faces.length,
      vertexCount: resolved.effectiveMesh.vertices.length,
      faceCount: resolved.effectiveMesh.faces.length,
      uvCount: resolved.effectiveMesh.uvs?.length ?? 0,
      colorCount: resolved.effectiveMesh.vertexColors?.length ?? 0,
    },
  };
}

function collectGeneratedModelerMeshes(
  entities: Iterable<Entity>
): BuildManifestGeneratedModelerMesh[] {
  const generated: BuildManifestGeneratedModelerMesh[] = [];

  for (const entity of entities) {
    const meshData = entity.components.get('MeshRenderer')?.data;
    if (!meshData || typeof meshData !== 'object') {
      continue;
    }
    const generatedMesh = buildGeneratedModelerMesh(entity, meshData as Record<string, unknown>);
    if (generatedMesh) {
      generated.push(generatedMesh);
    }
  }

  return generated;
}

function buildGeneratedTerrain(
  entity: Entity,
  terrainData: Record<string, unknown>
): BuildManifestGeneratedTerrain {
  const normalizedTerrain = normalizeTerrainData(terrainData);
  const safeEntityName = sanitizeBuildFileStem(entity.name || entity.id);
  const heightRange = getTerrainHeightRange(normalizedTerrain.heightmap);

  return {
    assetId: `generated-terrain-${entity.id}`,
    entityId: entity.id,
    entityName: entity.name,
    path: `generated-terrain-${safeEntityName}-${entity.id}.json`,
    terrain: normalizedTerrain,
    summary: {
      width: normalizedTerrain.width,
      depth: normalizedTerrain.depth,
      height: normalizedTerrain.height,
      segments: normalizedTerrain.segments ?? 0,
      layerCount: normalizedTerrain.layers.length,
      pointCount: normalizedTerrain.heightmap.length,
      minHeight: heightRange.min,
      maxHeight: heightRange.max,
    },
  };
}

function collectGeneratedTerrains(entities: Iterable<Entity>): BuildManifestGeneratedTerrain[] {
  const generated: BuildManifestGeneratedTerrain[] = [];

  for (const entity of entities) {
    const terrainData = entity.components.get('Terrain')?.data;
    if (!terrainData || typeof terrainData !== 'object') {
      continue;
    }
    generated.push(buildGeneratedTerrain(entity, terrainData as Record<string, unknown>));
  }

  return generated;
}

function collectGeneratedAnimations(entities: Iterable<Entity>): BuildManifestGeneratedAnimation[] {
  const generated: BuildManifestGeneratedAnimation[] = [];

  for (const entity of entities) {
    const generatedAnimation = createGeneratedAnimatorRecord(entity);
    if (generatedAnimation) {
      generated.push(generatedAnimation);
    }
  }

  return generated;
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

  const generatedModelerMeshes = collectGeneratedModelerMeshes(input.entities.values());
  const generatedModelerMeshesByEntityId = new Map(
    generatedModelerMeshes.map((entry) => [entry.entityId, entry])
  );
  const generatedTerrains = collectGeneratedTerrains(input.entities.values());
  const generatedTerrainsByEntityId = new Map(
    generatedTerrains.map((entry) => [entry.entityId, entry])
  );
  const generatedAnimations = collectGeneratedAnimations(input.entities.values());
  const generatedAnimationsByEntityId = new Map(
    generatedAnimations.map((entry) => [entry.entityId, entry])
  );
  const generatedCharacters = collectGeneratedCharacters(input.assets);
  const generatedCharactersByAssetId = new Map(
    generatedCharacters.map((entry) => [entry.assetId, entry])
  );
  const assetsById = new Map<string, Asset>(input.assets.map((asset) => [asset.id, asset]));
  const assetsByPath = new Map<string, Asset>(input.assets.map((asset) => [asset.path, asset]));
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
    const animator = entity.components.get('Animator');
    const health = entity.components.get('Health');
    const weapon = entity.components.get('Weapon');

    if (health?.enabled) {
      const healthData = health.data as Record<string, unknown>;
      const maxHealth = typeof healthData.maxHealth === 'number' ? healthData.maxHealth : NaN;
      const currentHealth = typeof healthData.currentHealth === 'number' ? healthData.currentHealth : NaN;
      if (!Number.isFinite(maxHealth) || maxHealth <= 0) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'runtime',
            code: 'RYP_HEALTH_INVALID_MAX',
            message: `Health "${entity.name}" no tiene maxHealth válido.`,
            hint: 'Define maxHealth > 0 antes de exportar el gameplay de combate.',
            target: entity.id,
          })
        );
      }
      if (!Number.isFinite(currentHealth) || currentHealth < 0 || currentHealth > Math.max(1, maxHealth)) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'runtime',
            code: 'RYP_HEALTH_INVALID_CURRENT',
            message: `Health "${entity.name}" tiene currentHealth fuera de rango.`,
            hint: 'Mantén currentHealth entre 0 y maxHealth para un runtime reproducible.',
            target: entity.id,
          })
        );
      }
    }

    if (weapon?.enabled) {
      const weaponData = weapon.data as Record<string, unknown>;
      const owner = findCombatOwnerEntity(entity, input.entities);
      if (typeof weaponData.damage !== 'number' || weaponData.damage <= 0) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'runtime',
            code: 'RYP_WEAPON_INVALID_DAMAGE',
            message: `Weapon "${entity.name}" no tiene damage válido.`,
            hint: 'Define damage > 0 para que el arma sea exportable en gameplay.',
            target: entity.id,
          })
        );
      }
      if (typeof weaponData.attackSpeed !== 'number' || weaponData.attackSpeed <= 0) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'runtime',
            code: 'RYP_WEAPON_INVALID_ATTACK_SPEED',
            message: `Weapon "${entity.name}" no tiene attackSpeed válido.`,
            hint: 'Define attackSpeed > 0 para cooldown reproducible en combate.',
            target: entity.id,
          })
        );
      }
      if (typeof weaponData.range !== 'number' || weaponData.range <= 0) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'runtime',
            code: 'RYP_WEAPON_INVALID_RANGE',
            message: `Weapon "${entity.name}" no tiene range válido.`,
            hint: 'Define range > 0 para objetivos y colisión verificables.',
            target: entity.id,
          })
        );
      }
      if (!owner) {
        diagnostics.push(
          createDiagnostic({
            level: 'warning',
            stage: 'runtime',
            code: 'RYP_WEAPON_OWNER_MISSING',
            message: `Weapon "${entity.name}" no está parentada a ningún actor con Health.`,
            hint: 'Parenta el arma a un player o enemy para que el build conserve su propietario de combate.',
            target: entity.id,
          })
        );
      }
    }

    const meshData = meshRenderer?.data as Record<string, unknown> | undefined;
    if (meshData && typeof meshData === 'object' && 'meshId' in meshData) {
      const meshId = (meshData as { meshId?: string }).meshId;
      const generatedModelerMesh = generatedModelerMeshesByEntityId.get(entity.id);
      if (meshId === 'custom' && !generatedModelerMesh) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'assets',
            code: 'RYP_MODELER_MESH_MISSING',
            message: `Entidad "${entity.name}" declara un mesh custom pero no tiene geometría editable válida.`,
            hint: 'Vuelve a sincronizar la malla desde Modeler o bakea el stack antes de exportar.',
            target: entity.id,
          })
        );
      } else if (meshId && meshId !== 'custom' && !assetsById.has(meshId) && !generatedModelerMesh) {
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
      if (generatedModelerMesh) {
        if (generatedModelerMesh.summary.vertexCount === 0 || generatedModelerMesh.summary.faceCount === 0) {
          diagnostics.push(
            createDiagnostic({
              level: 'error',
              stage: 'assets',
              code: 'RYP_MODELER_MESH_EMPTY',
              message: `Entidad "${entity.name}" no tiene geometría exportable en su mesh editado.`,
              hint: 'Añade caras válidas o rehace el bake del modelado antes de exportar.',
              target: entity.id,
            })
          );
        }
        if (meshHasInvalidFaceIndices(generatedModelerMesh.mesh)) {
          diagnostics.push(
            createDiagnostic({
              level: 'error',
              stage: 'assets',
              code: 'RYP_MODELER_MESH_INVALID_FACE',
              message: `Entidad "${entity.name}" contiene caras con índices inválidos en la geometría editada.`,
              hint: 'Repara la malla en Modeler o recrea la base editable antes de exportar.',
              target: entity.id,
              path: generatedModelerMesh.path,
            })
          );
        }
        if (
          generatedModelerMesh.mesh.uvs &&
          generatedModelerMesh.mesh.uvs.length !== generatedModelerMesh.mesh.vertices.length
        ) {
          diagnostics.push(
            createDiagnostic({
              level: 'warning',
              stage: 'assets',
              code: 'RYP_MODELER_UV_MISMATCH',
              message: `Entidad "${entity.name}" tiene UVs desalineadas con la geometría editada.`,
              hint: 'Reproyecta o unwrap la malla en Modeler antes del export final.',
              target: entity.id,
              path: generatedModelerMesh.path,
            })
          );
        }
      }
    }

    if (meshData && typeof meshData === 'object') {
      const material = resolveEditorMaterial(meshData);
      MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
        const map = material.textureMaps[slot];
        if (!map.enabled || !map.assetPath) {
          return;
        }

        if (map.assetPath.startsWith('data:') || map.assetPath.startsWith('blob:')) {
          diagnostics.push(
            createDiagnostic({
              level: 'error',
              stage: 'assets',
              code: 'RYP_MATERIAL_TEXTURE_TRANSIENT',
              message: `Entidad "${entity.name}" tiene un mapa ${slot} pintado pero aun temporal.`,
              hint: 'Guarda el mapa desde Texture Paint para convertirlo en un asset persistido antes de exportar.',
              target: entity.id,
              path: map.assetPath.slice(0, 32),
            })
          );
          return;
        }

        const textureAsset = assetsByPath.get(map.assetPath);
        if (!textureAsset) {
          diagnostics.push(
            createDiagnostic({
              level: 'warning',
              stage: 'assets',
              code: 'RYP_MATERIAL_TEXTURE_MISSING',
              message: `Entidad "${entity.name}" referencia una textura inexistente en ${slot}: ${map.assetPath}`,
              hint: 'Importa la textura al Asset Browser o corrige la ruta del material PBR.',
              target: entity.id,
              path: map.assetPath,
            })
          );
          return;
        }

        if (textureAsset.type !== 'texture') {
          diagnostics.push(
            createDiagnostic({
              level: 'warning',
              stage: 'assets',
              code: 'RYP_MATERIAL_TEXTURE_INVALID_TYPE',
              message: `Entidad "${entity.name}" referencia un asset no-textura en ${slot}: ${map.assetPath}`,
              hint: 'Usa un asset de tipo texture en los mapas del material.',
              target: entity.id,
              path: map.assetPath,
            })
          );
        }
      });
    }

    if (animator?.enabled) {
      const generatedAnimation = generatedAnimationsByEntityId.get(entity.id);
      if (!generatedAnimation) {
        diagnostics.push(
          createDiagnostic({
            level: 'error',
            stage: 'runtime',
            code: 'RYP_ANIMATOR_GENERATION_FAILED',
            message: `Animator "${entity.name}" no pudo convertirse en un asset reproducible.`,
            hint: 'Reabre Animation Editor y vuelve a guardar clips, tracks y NLA antes de exportar.',
            target: entity.id,
          })
        );
      } else {
        if (generatedAnimation.summary.clipCount === 0 || generatedAnimation.summary.trackCount === 0) {
          diagnostics.push(
            createDiagnostic({
              level: 'error',
              stage: 'runtime',
              code: 'RYP_ANIMATOR_EMPTY',
              message: `Animator "${entity.name}" no tiene clips o tracks exportables.`,
              hint: 'Agrega al menos un clip con keyframes reales en Animation Editor antes de exportar.',
              target: entity.id,
              path: generatedAnimation.path,
            })
          );
        }

        if (generatedAnimation.source === 'defaulted') {
          diagnostics.push(
            createDiagnostic({
              level: 'warning',
              stage: 'runtime',
              code: 'RYP_ANIMATOR_DEFAULTED',
              message: `Animator "${entity.name}" no tenía authoring persistido y fue normalizado con defaults.`,
              hint: 'Guarda el Animator desde Animation Editor o crea el componente desde las herramientas nuevas para un export totalmente fiel.',
              target: entity.id,
              path: generatedAnimation.path,
            })
          );
        }
      }
    }

    if (terrain) {
      const terrainData = terrain.data as Record<string, unknown> | undefined;
      if (
        !terrainData ||
        typeof terrainData.width !== 'number' ||
        typeof terrainData.height !== 'number' ||
        typeof terrainData.depth !== 'number'
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
      } else {
        const generatedTerrain = generatedTerrainsByEntityId.get(entity.id);
        if (!generatedTerrain) {
          diagnostics.push(
            createDiagnostic({
              level: 'error',
              stage: 'schema',
              code: 'RYP_TERRAIN_GENERATION_FAILED',
              message: `Terrain "${entity.name}" no pudo convertirse en un asset exportable.`,
              hint: 'Revisa los parámetros del terreno y vuelve a generar el heightmap.',
              target: entity.id,
            })
          );
        } else {
          if (generatedTerrain.summary.pointCount !== generatedTerrain.summary.segments ** 2) {
            diagnostics.push(
              createDiagnostic({
                level: 'error',
                stage: 'schema',
                code: 'RYP_TERRAIN_HEIGHTMAP_MISMATCH',
                message: `Terrain "${entity.name}" tiene un heightmap inconsistente con sus segmentos.`,
                hint: 'Regenera el terreno desde el inspector para reparar la malla de altura.',
                target: entity.id,
                path: generatedTerrain.path,
              })
            );
          }

          if (generatedTerrain.summary.layerCount === 0) {
            diagnostics.push(
              createDiagnostic({
                level: 'warning',
                stage: 'assets',
                code: 'RYP_TERRAIN_NO_LAYERS',
                message: `Terrain "${entity.name}" no tiene capas de terreno definidas.`,
                hint: 'Asigna al menos una capa para que el world authoring sea reproducible.',
                target: entity.id,
                path: generatedTerrain.path,
              })
            );
          }

          if (generatedTerrain.summary.maxHeight <= generatedTerrain.summary.minHeight) {
            diagnostics.push(
              createDiagnostic({
                level: 'warning',
                stage: 'schema',
                code: 'RYP_TERRAIN_FLAT',
                message: `Terrain "${entity.name}" quedó prácticamente plano tras la generación.`,
                hint: 'Sube Height o cambia el preset si esperas relieve real en el mundo.',
                target: entity.id,
                path: generatedTerrain.path,
              })
            );
          }
        }
      }
    }
  });

  input.assets.forEach((asset) => {
    if (!isGeneratedCharacterAsset(asset)) {
      return;
    }

    const generatedCharacter = generatedCharactersByAssetId.get(asset.id);
    const characterSummary =
      generatedCharacter?.summary ?? coerceCharacterSummary(asset.metadata?.characterPackageSummary);
    if (!generatedCharacter && !characterSummary) {
      diagnostics.push(
        createDiagnostic({
          level: 'error',
          stage: 'assets',
          code: 'RYP_CHARACTER_PACKAGE_INVALID',
          message: `Character package "${asset.name}" no pudo leerse como artefacto exportable.`,
          hint: 'Regenera el personaje o vuelve a importar el package.json persistido antes de exportar.',
          target: asset.id,
          path: asset.path,
        })
      );
      return;
    }

    if (characterSummary && (characterSummary.vertexCount === 0 || characterSummary.triangleCount === 0)) {
      diagnostics.push(
        createDiagnostic({
          level: 'error',
          stage: 'assets',
          code: 'RYP_CHARACTER_PACKAGE_EMPTY_MESH',
          message: `Character package "${asset.name}" no contiene una malla exportable.`,
          hint: 'Vuelve a generar el personaje y confirma que el package.json incluya mesh, rig y materiales.',
          target: asset.id,
          path: generatedCharacter?.path ?? asset.path,
        })
      );
    }

    if (characterSummary && (characterSummary.materialCount === 0 || characterSummary.textureCount === 0)) {
      diagnostics.push(
        createDiagnostic({
          level: 'warning',
          stage: 'assets',
          code: 'RYP_CHARACTER_PACKAGE_THIN',
          message: `Character package "${asset.name}" quedó con materiales o texturas incompletas.`,
          hint: 'Revisa el resultado del generador para evitar exportar un personaje sin acabado PBR completo.',
          target: asset.id,
          path: generatedCharacter?.path ?? asset.path,
        })
      );
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
    assetCount:
      input.assets.length
      + generatedModelerMeshes.length
      + generatedTerrains.length
      + generatedAnimations.length
      + generatedCharacters.length,
    entityCount: entities.length,
    diagnostics,
    summary: errors.length > 0
      ? `Compilación fallida: ${errors.length} error(es), ${diagnostics.length} aviso(s).`
      : `Compilación válida: ${diagnostics.length} aviso(s) detectados.`,
    generatedAt: new Date().toISOString(),
  };
}

export function buildReyPlayManifest(input: BuildGenerationInput): BuildManifest {
  const generatedModelerMeshes = collectGeneratedModelerMeshes(input.entities.values());
  const generatedTerrains = collectGeneratedTerrains(input.entities.values());
  const generatedAnimations = collectGeneratedAnimations(input.entities.values());
  const generatedCharacters = collectGeneratedCharacters(input.assets);
  const combatActors = collectCombatActors(input.entities);
  const combatWeapons = collectCombatWeapons(input.entities);
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
      renderProfile: resolveSceneRenderProfile(scene.environment),
    };
  });

  const entities = Array.from(input.entities.values()).map((entity) => ({
    id: entity.id,
    name: entity.name,
    tags: entity.tags,
    components: Array.from(entity.components.keys()),
  }));

  const assets = [
    ...input.assets.map<BuildManifestAsset>((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      path: asset.path,
      source: 'project_asset',
      entityId: null,
      entityName: null,
      meshSummary: null,
      terrainSummary: null,
      animationSummary: null,
      characterSummary: null,
    })),
    ...generatedModelerMeshes.map<BuildManifestAsset>((generatedMesh) => ({
      id: generatedMesh.assetId,
      name: `${generatedMesh.entityName}.modeler.json`,
      type: 'mesh',
      path: generatedMesh.path,
      source: 'generated_modeler_mesh',
      entityId: generatedMesh.entityId,
      entityName: generatedMesh.entityName,
      meshSummary: {
        vertexCount: generatedMesh.summary.vertexCount,
        faceCount: generatedMesh.summary.faceCount,
        uvCount: generatedMesh.summary.uvCount,
        colorCount: generatedMesh.summary.colorCount,
        modifierCount: generatedMesh.modifierCount,
      },
      terrainSummary: null,
      animationSummary: null,
      characterSummary: null,
    })),
    ...generatedTerrains.map<BuildManifestAsset>((generatedTerrain) => ({
      id: generatedTerrain.assetId,
      name: `${generatedTerrain.entityName}.terrain.json`,
      type: 'terrain',
      path: generatedTerrain.path,
      source: 'generated_terrain',
      entityId: generatedTerrain.entityId,
      entityName: generatedTerrain.entityName,
      meshSummary: null,
      terrainSummary: {
        width: generatedTerrain.summary.width,
        depth: generatedTerrain.summary.depth,
        height: generatedTerrain.summary.height,
        segments: generatedTerrain.summary.segments,
        layerCount: generatedTerrain.summary.layerCount,
        minHeight: generatedTerrain.summary.minHeight,
        maxHeight: generatedTerrain.summary.maxHeight,
      },
      animationSummary: null,
      characterSummary: null,
    })),
    ...generatedAnimations.map<BuildManifestAsset>((generatedAnimation) => ({
      id: generatedAnimation.assetId,
      name: `${generatedAnimation.entityName}.animation.json`,
      type: 'animation',
      path: generatedAnimation.path,
      source: 'generated_animation',
      entityId: generatedAnimation.entityId,
      entityName: generatedAnimation.entityName,
      meshSummary: null,
      terrainSummary: null,
      animationSummary: {
        clipCount: generatedAnimation.summary.clipCount,
        trackCount: generatedAnimation.summary.trackCount,
        boneCount: generatedAnimation.summary.boneCount,
        nlaStripCount: generatedAnimation.summary.nlaStripCount,
        timelineDuration: generatedAnimation.summary.timelineDuration,
        hasRootMotion: generatedAnimation.summary.hasRootMotion,
      },
      characterSummary: null,
    })),
    ...generatedCharacters.map<BuildManifestAsset>((generatedCharacter) => ({
      id: generatedCharacter.assetId,
      name: generatedCharacter.assetName,
      type: 'prefab',
      path: generatedCharacter.path,
      source: 'generated_character',
      entityId: null,
      entityName: null,
      meshSummary: null,
      terrainSummary: null,
      animationSummary: null,
      characterSummary: generatedCharacter.summary,
    })),
  ];

  const assetsByPath = new Map(input.assets.map((asset) => [asset.path, asset]));
  const materials = Array.from(input.entities.values()).flatMap<BuildManifestMaterial>((entity) => {
    const meshRendererData = entity.components.get('MeshRenderer')?.data;
    if (!meshRendererData || typeof meshRendererData !== 'object') {
      return [];
    }

    const definition = resolveEditorMaterial(meshRendererData as Record<string, unknown>);
    const textureReferences = MATERIAL_TEXTURE_SLOTS.flatMap((slot) => {
      const map = definition.textureMaps[slot];
      if (!map.enabled || !map.assetPath) {
        return [];
      }

      return [
        {
          slot,
          assetPath: map.assetPath,
          assetId: assetsByPath.get(map.assetPath)?.id ?? null,
          texturePaint: Boolean(assetsByPath.get(map.assetPath)?.metadata?.texturePaint),
        },
      ];
    });

    return [
      {
        entityId: entity.id,
        entityName: entity.name,
        materialId: definition.id,
        name: definition.name,
        summary: summarizeEditorMaterial(definition),
        definition,
        textureReferences,
      },
    ];
  });

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
    materials,
    generatedModelerMeshes,
    generatedTerrains,
    generatedAnimations,
    generatedCharacters,
    combatActors,
    combatWeapons,
    scribs,
    scribComponents,
    compileMeta: {
      entityCount: entities.length,
      assetCount: assets.length,
      materialCount: materials.length,
      textureReferenceCount: materials.reduce(
        (count, material) => count + material.textureReferences.length,
        0
      ),
      paintedTextureCount: materials.reduce(
        (count, material) =>
          count + material.textureReferences.filter((reference) => reference.texturePaint).length,
        0
      ),
      generatedModelerMeshCount: generatedModelerMeshes.length,
      generatedTerrainCount: generatedTerrains.length,
      generatedAnimationCount: generatedAnimations.length,
      generatedCharacterCount: generatedCharacters.length,
      combatActorCount: combatActors.length,
      combatWeaponCount: combatWeapons.length,
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
