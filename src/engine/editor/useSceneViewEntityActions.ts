'use client';

import { useCallback, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useEngineStore } from '@/store/editorStore';
import { STORE_OBJECT_PREFIX } from './sceneView.visuals';
import type { Entity } from '@/types/engine';
import type { TransformTools } from './gizmos';

function resolveEntityIdFromObject(object: THREE.Object3D): string | null {
  let target: THREE.Object3D | null = object;
  while (target && typeof target.userData?.entityId !== 'string') {
    target = target.parent;
  }
  return typeof target?.userData?.entityId === 'string' ? (target.userData.entityId as string) : null;
}

export function useSceneViewEntityActions(params: {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  addEntity: (entity: Entity) => void;
  updateEntity: (entityId: string, patch: Partial<Entity>) => void;
  updateEntityTransient: (entityId: string, patch: Partial<Entity>) => void;
  selectEntity: (entityId: string | null, additive?: boolean) => void;
}) {
  const { sceneRef, transformToolsRef, addEntity, updateEntity, updateEntityTransient, selectEntity } = params;

  const syncObjectTransformToStore = useCallback((object: THREE.Object3D | null, options?: { commit?: boolean }) => {
    if (!object) return;
    const entityId = object.userData?.entityId;
    if (typeof entityId !== 'string') return;

    const entity = useEngineStore.getState().entities.get(entityId);
    if (!entity) return;

    const components = new Map(entity.components);
    const transform = components.get('Transform');
    if (!transform) return;

    transform.data = {
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotation: { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
      scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
    };
    components.set('Transform', transform);
    if (options?.commit) {
      updateEntity(entityId, { components });
      return;
    }
    updateEntityTransient(entityId, { components });
  }, [updateEntity, updateEntityTransient]);

  const createManualEntity = useCallback((kind: 'cube' | 'sphere' | 'light' | 'camera') => {
    const store = useEngineStore.getState();
    if (!store.activeSceneId) {
      store.createScene('Escena Principal');
    }

    const id = crypto.randomUUID();
    const entity: Entity = {
      id,
      name: kind === 'light' ? 'Luz Manual' : kind === 'camera' ? 'Camara Manual' : `${kind.toUpperCase()} Manual`,
      components: new Map(),
      children: [],
      parentId: null,
      active: true,
      tags: [],
    };

    entity.components.set('Transform', {
      id: crypto.randomUUID(),
      type: 'Transform',
      data: {
        position: kind === 'camera' ? { x: 0, y: 3, z: 6 } : { x: 0, y: 0.6, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      enabled: true,
    });

    if (kind === 'light') {
      entity.components.set('Light', {
        id: crypto.randomUUID(),
        type: 'Light',
        data: {
          type: 'point',
          color: { r: 1, g: 1, b: 1 },
          intensity: 1.5,
          shadows: true,
        },
        enabled: true,
      });
    } else if (kind === 'camera') {
      entity.components.set('Camera', {
        id: crypto.randomUUID(),
        type: 'Camera',
        data: {
          fov: 60,
          near: 0.1,
          far: 1000,
          orthographic: false,
          orthoSize: 10,
          clearColor: { r: 0.08, g: 0.08, b: 0.1, a: 1 },
          isMain: false,
        },
        enabled: true,
      });
    } else {
      entity.components.set('MeshRenderer', {
        id: crypto.randomUUID(),
        type: 'MeshRenderer',
        data: {
          meshId: kind,
          materialId: 'default',
          castShadows: true,
          receiveShadows: true,
        },
        enabled: true,
      });
    }

    addEntity(entity);
    selectEntity(entity.id, false);
    return entity.id;
  }, [addEntity, selectEntity]);

  const removeSelectedEntities = useCallback(() => {
    const selectedIds = useEngineStore.getState().editor.selectedEntities;
    selectedIds.forEach((id) => useEngineStore.getState().removeEntity(id));
  }, []);

  const syncBoxSelectionToStore = useCallback((objects: THREE.Object3D[]) => {
    const ids = Array.from(
      new Set(
        objects
          .map(resolveEntityIdFromObject)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (ids.length === 0) {
      selectEntity(null);
      transformToolsRef.current?.gizmo.detach();
      return;
    }

    ids.forEach((id, index) => {
      selectEntity(id, index > 0);
    });

    const firstTarget = sceneRef.current?.getObjectByName(`${STORE_OBJECT_PREFIX}${ids[0]}`);
    if (firstTarget) {
      transformToolsRef.current?.gizmo.attach(firstTarget);
    }
  }, [sceneRef, selectEntity, transformToolsRef]);

  return {
    syncObjectTransformToStore,
    createManualEntity,
    removeSelectedEntities,
    syncBoxSelectionToStore,
  };
}
