import type { Entity, Scene } from '@/types/engine';

function pushUniqueId(ids: string[], seen: Set<string>, value: string | null | undefined) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  ids.push(value);
}

export function collectSceneEntityIds(scene: Scene, entities?: Map<string, Entity>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  scene.rootEntities.forEach((id) => pushUniqueId(ids, seen, id));
  scene.entities.forEach((entity) => pushUniqueId(ids, seen, entity.id));

  if (!entities) {
    return ids;
  }

  let changed = true;
  while (changed) {
    changed = false;
    entities.forEach((entity, entityId) => {
      if (!entity.parentId || seen.has(entityId) || !seen.has(entity.parentId)) return;
      seen.add(entityId);
      ids.push(entityId);
      changed = true;
    });
  }

  return ids;
}

export function findSceneIdForEntity(scenes: Scene[], entityId: string): string | null {
  for (const scene of scenes) {
    if (scene.rootEntities.includes(entityId)) {
      return scene.id;
    }

    if (scene.entities.some((entity) => entity.id === entityId)) {
      return scene.id;
    }
  }

  return null;
}

export function collectDescendantIds(entities: Map<string, Entity>, rootId: string): string[] {
  const collected: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || seen.has(currentId) || !entities.has(currentId)) continue;

    seen.add(currentId);
    collected.push(currentId);

    entities.forEach((entity, entityId) => {
      if (entity.parentId === currentId && !seen.has(entityId)) {
        queue.push(entityId);
      }
    });
  }

  return collected;
}

export function materializeScene(
  scene: Scene,
  entities: Map<string, Entity>,
  explicitIds?: Iterable<string>
): { scene: Scene; entities: Map<string, Entity>; entityIds: string[] } {
  const orderedIds = explicitIds
    ? Array.from(new Set(Array.from(explicitIds).filter((id) => entities.has(id))))
    : collectSceneEntityIds(scene, entities).filter((id) => entities.has(id));

  const materializedEntities = new Map<string, Entity>();
  orderedIds.forEach((entityId) => {
    const entity = entities.get(entityId);
    if (!entity) return;
    materializedEntities.set(entityId, {
      ...entity,
      children: [],
    });
  });

  const rootIds: string[] = [];
  orderedIds.forEach((entityId) => {
    const entity = materializedEntities.get(entityId);
    if (!entity) return;

    const parentId = entity.parentId;
    if (parentId && parentId !== entityId && materializedEntities.has(parentId)) {
      const parent = materializedEntities.get(parentId);
      if (parent) {
        parent.children = [...parent.children, entity];
      }
      return;
    }

    if (entity.parentId !== null) {
      materializedEntities.set(entityId, {
        ...entity,
        parentId: null,
      });
    }

    rootIds.push(entityId);
  });

  const nextScene: Scene = {
    ...scene,
    entities: orderedIds
      .map((entityId) => materializedEntities.get(entityId))
      .filter((entity): entity is Entity => Boolean(entity)),
    rootEntities: Array.from(new Set(rootIds)),
    updatedAt: new Date(),
  };

  return {
    scene: nextScene,
    entities: materializedEntities,
    entityIds: orderedIds,
  };
}

export function normalizeScenesAndEntities(params: {
  scenes: Scene[];
  entities: Map<string, Entity>;
  sceneIds?: Iterable<string>;
}): { scenes: Scene[]; entities: Map<string, Entity> } {
  const targetSceneIds = params.sceneIds
    ? new Set(Array.from(params.sceneIds))
    : new Set(params.scenes.map((scene) => scene.id));

  const nextEntities = new Map(params.entities);
  const nextScenes = params.scenes.map((scene) => {
    if (!targetSceneIds.has(scene.id)) {
      return scene;
    }

    const materialized = materializeScene(scene, nextEntities);
    materialized.entities.forEach((entity, entityId) => {
      nextEntities.set(entityId, entity);
    });
    return materialized.scene;
  });

  return {
    scenes: nextScenes,
    entities: nextEntities,
  };
}
