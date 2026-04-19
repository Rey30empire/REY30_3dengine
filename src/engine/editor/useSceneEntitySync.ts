'use client';

import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { Entity, SceneCollection } from '@/types/engine';
import { getParticlePresetRegistryEntry } from '@/engine/rendering/particlePresetRegistry';
import type { TransformTools } from './gizmos';
import {
  createParticlePreviewHandle,
  type ParticlePreviewBackendPreference,
  type ParticlePreviewRuntimeContext,
} from './particlePreviewRuntime';
import {
  STORE_OBJECT_PREFIX,
  asRecord,
  createEntityVisual,
  getEntityVisualKind,
  getEntityVisualSignature,
  readQuaternion,
  readVector3,
} from './sceneView.visuals';

export function useSceneEntitySync(params: {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  entities: Entity[];
  selectedEntities: string[];
  paintMode?:
    | 'vertex'
    | 'texture'
    | 'weight'
    | 'sculpt_draw'
    | 'sculpt_clay'
    | 'sculpt_grab'
    | 'sculpt_smooth'
    | 'sculpt_crease';
  paintWeightBone?: string;
  showColliders: boolean;
  showLights: boolean;
  collections?: SceneCollection[];
}) {
  const {
    sceneRef,
    transformToolsRef,
    entities,
    selectedEntities,
    paintMode = 'vertex',
    paintWeightBone = 'Spine',
    showColliders,
    showLights,
    collections = [],
  } = params;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const particlePreviewRuntime =
      ((scene.userData?.particlePreviewRuntime ?? null) as ParticlePreviewRuntimeContext | null) ??
      { gpuSystem: null };

    const disposeObject3D = (object: THREE.Object3D) => {
      object.userData?.dispose?.();
      object.traverse((child) => {
        const renderable = child as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        const particlePreview = child.userData?.particlePreview as
          | { emitter?: { dispose?: () => void } }
          | undefined;
        particlePreview?.emitter?.dispose?.();
        renderable.geometry?.dispose?.();
        const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        materials.forEach((material) => material?.dispose?.());
      });
    };

    const readColliderConfig = (entity: Entity) => {
      const collider = entity.components.get('Collider');
      if (!collider?.enabled) return null;
      const colliderData = asRecord(collider.data);
      if (!colliderData) return null;

      const center = readVector3(colliderData.center, new THREE.Vector3(0, 0, 0));
      const size = readVector3(colliderData.size, new THREE.Vector3(1, 1, 1));
      const radius = typeof colliderData.radius === 'number' ? colliderData.radius : 0.5;
      const height = typeof colliderData.height === 'number' ? colliderData.height : 1;
      const type = typeof colliderData.type === 'string' ? colliderData.type : 'box';

      return {
        type,
        center,
        size,
        radius,
        height,
      };
    };

    const buildColliderSignature = (entity: Entity) => {
      const config = readColliderConfig(entity);
      if (!config) return null;
      return [
        config.type,
        config.center.x,
        config.center.y,
        config.center.z,
        config.size.x,
        config.size.y,
        config.size.z,
        config.radius,
        config.height,
      ].join(':');
    };

    const createColliderHelper = (entity: Entity) => {
      const config = readColliderConfig(entity);
      if (!config) return null;

      let geometry: THREE.BufferGeometry;
      switch (config.type) {
        case 'sphere':
          geometry = new THREE.WireframeGeometry(
            new THREE.SphereGeometry(config.radius, 16, 12)
          );
          break;
        case 'capsule':
          geometry = new THREE.WireframeGeometry(
            new THREE.CapsuleGeometry(config.radius, Math.max(0.1, config.height), 6, 12)
          );
          break;
        case 'mesh':
          geometry = new THREE.EdgesGeometry(
            new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z)
          );
          break;
        case 'box':
        default:
          geometry = new THREE.EdgesGeometry(
            new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z)
          );
          break;
      }

      const helper = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0x3ee36b,
          transparent: true,
          opacity: 0.85,
        })
      );
      helper.name = '__collider_helper';
      helper.position.copy(config.center);
      helper.renderOrder = 2;
      helper.userData.colliderSignature = buildColliderSignature(entity);
      return helper;
    };

    const readParticleColor = (value: unknown, fallback: THREE.Color) => {
      const record = asRecord(value);
      return new THREE.Color(
        typeof record?.r === 'number' ? record.r : fallback.r,
        typeof record?.g === 'number' ? record.g : fallback.g,
        typeof record?.b === 'number' ? record.b : fallback.b
      );
    };

    const readParticleNumber = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback;

    const readParticleConfig = (entity: Entity) => {
      const particleSystem = entity.components.get('ParticleSystem');
      if (!particleSystem?.enabled) return null;
      const particleData = asRecord(particleSystem.data);
      if (!particleData) return null;

      const presetEntry =
        typeof particleData.presetId === 'string'
          ? getParticlePresetRegistryEntry(particleData.presetId)
          : null;
      const preset = presetEntry?.params ?? null;

      const shape: 'point' | 'sphere' | 'cone' | 'box' | 'circle' =
        particleData.shape === 'point' ||
        particleData.shape === 'cone' ||
        particleData.shape === 'box' ||
        particleData.shape === 'circle'
          ? particleData.shape
          : preset?.shape === 'point' ||
              preset?.shape === 'cone' ||
              preset?.shape === 'box' ||
              preset?.shape === 'circle'
            ? preset.shape
          : 'sphere';
      const blendMode: 'additive' | 'alpha' | 'multiply' | 'screen' =
        particleData.blendMode === 'alpha' ||
        particleData.blendMode === 'multiply' ||
        particleData.blendMode === 'screen'
          ? particleData.blendMode
          : preset?.blendMode === 'alpha' ||
              preset?.blendMode === 'multiply' ||
              preset?.blendMode === 'screen'
            ? preset.blendMode
          : 'additive';
      const direction: 'up' | 'down' | 'outward' | 'random' | 'forward' =
        particleData.direction === 'down' ||
        particleData.direction === 'outward' ||
        particleData.direction === 'random' ||
        particleData.direction === 'forward'
          ? particleData.direction
          : preset?.direction === 'down' ||
              preset?.direction === 'outward' ||
              preset?.direction === 'random' ||
              preset?.direction === 'forward'
            ? preset.direction
            : 'up';
      const speedMin = Math.max(
        0,
        readParticleNumber(particleData.speedMin, readParticleNumber(preset?.speedMin, 0.6))
      );
      const speedMax = Math.max(
        speedMin,
        readParticleNumber(particleData.speedMax, readParticleNumber(preset?.speedMax, 1.8))
      );
      const lifetimeMin = Math.max(
        0.05,
        readParticleNumber(
          particleData.lifetimeMin,
          readParticleNumber(
            preset?.lifetimeMin,
            Math.max(0.2, readParticleNumber(particleData.duration, 3) * 0.35)
          )
        )
      );
      const lifetimeMax = Math.max(
        lifetimeMin,
        readParticleNumber(
          particleData.lifetimeMax,
          readParticleNumber(
            preset?.lifetimeMax,
            Math.max(lifetimeMin, readParticleNumber(particleData.duration, 3))
          )
        )
      );

      return {
        presetId: presetEntry?.id ?? null,
        simulationBackend:
          particleData.simulationBackend === 'cpu' || particleData.simulationBackend === 'gpu'
            ? (particleData.simulationBackend as ParticlePreviewBackendPreference)
            : 'auto',
        rate: Math.max(0, readParticleNumber(particleData.rate, readParticleNumber(preset?.rate, 24))),
        maxParticles: Math.max(
          8,
          Math.min(
            4000,
            Math.round(
              readParticleNumber(
                particleData.maxParticles,
                readParticleNumber(preset?.maxParticles, 800)
              )
            )
          )
        ),
        burstCount: Math.max(
          0,
          Math.round(readParticleNumber(particleData.burstCount, readParticleNumber(preset?.burstCount, 0)))
        ),
        duration: Math.max(
          0.1,
          readParticleNumber(
            particleData.duration,
            Math.max(lifetimeMax, readParticleNumber(preset?.lifetimeMax, 3))
          )
        ),
        looping:
          typeof particleData.looping === 'boolean'
            ? particleData.looping
            : preset
              ? readParticleNumber(preset.rate, 0) > 0
              : true,
        shape,
        radius: Math.max(0, readParticleNumber(particleData.radius, readParticleNumber(preset?.radius, 0.35))),
        speedMin,
        speedMax,
        direction,
        lifetimeMin,
        lifetimeMax,
        startSizeMin: Math.max(
          0.01,
          readParticleNumber(particleData.startSizeMin, readParticleNumber(preset?.startSizeMin, 0.12))
        ),
        startSizeMax: Math.max(
          0.01,
          readParticleNumber(particleData.startSizeMax, readParticleNumber(preset?.startSizeMax, 0.24))
        ),
        endSizeMin: Math.max(
          0,
          readParticleNumber(particleData.endSizeMin, readParticleNumber(preset?.endSizeMin, 0))
        ),
        endSizeMax: Math.max(
          0,
          readParticleNumber(particleData.endSizeMax, readParticleNumber(preset?.endSizeMax, 0.08))
        ),
        gravity: readParticleNumber(particleData.gravity, readParticleNumber(preset?.gravity, -0.6)),
        drag: Math.max(0, readParticleNumber(particleData.drag, readParticleNumber(preset?.drag, 0))),
        blendMode,
        startColor: readParticleColor(
          particleData.startColor,
          preset?.startColor ?? new THREE.Color(1, 0.78, 0.22)
        ),
        endColor: readParticleColor(
          particleData.endColor,
          preset?.endColor ?? new THREE.Color(1, 0.24, 0.08)
        ),
        startAlpha: Math.max(
          0,
          Math.min(1, readParticleNumber(particleData.startAlpha, readParticleNumber(preset?.startAlpha, 1)))
        ),
        endAlpha: Math.max(
          0,
          Math.min(1, readParticleNumber(particleData.endAlpha, readParticleNumber(preset?.endAlpha, 0)))
        ),
        noiseStrength: Math.max(
          0,
          readParticleNumber(particleData.noiseStrength, readParticleNumber(preset?.noiseStrength, 0))
        ),
        noiseFrequency: Math.max(
          0.01,
          readParticleNumber(particleData.noiseFrequency, readParticleNumber(preset?.noiseFrequency, 1))
        ),
      };
    };

    const buildParticleSignature = (entity: Entity) => {
      const config = readParticleConfig(entity);
      if (!config) return null;
      return [
        config.presetId ?? 'custom',
        config.simulationBackend,
        config.rate,
        config.maxParticles,
        config.burstCount,
        config.duration,
        config.looping ? 1 : 0,
        config.shape,
        config.radius,
        config.speedMin,
        config.speedMax,
        config.direction,
        config.lifetimeMin,
        config.lifetimeMax,
        config.startSizeMin,
        config.startSizeMax,
        config.endSizeMin,
        config.endSizeMax,
        config.gravity,
        config.drag,
        config.blendMode,
        config.startColor.getHexString(),
        config.endColor.getHexString(),
        config.startAlpha,
        config.endAlpha,
        config.noiseStrength,
        config.noiseFrequency,
      ].join(':');
    };

    const createParticleHelper = (entity: Entity) => {
      const config = readParticleConfig(entity);
      if (!config) return null;
      const previewHandle = createParticlePreviewHandle(config, particlePreviewRuntime);
      const helper = previewHandle.object3D;
      helper.name = '__particle_helper';
      helper.frustumCulled = false;
      helper.renderOrder = 3;
      helper.userData.particleSignature = buildParticleSignature(entity);
      helper.userData.particlePreview = {
        emitter: previewHandle,
        elapsed: 0,
        duration: config.duration,
        looping: config.looping,
        backend: previewHandle.backend,
      };
      return helper;
    };

    const activeIds = new Set<string>();
    const objectByEntityId = new Map<string, THREE.Object3D>();
    const collectionMembership = new Map<string, SceneCollection[]>();

    collections.forEach((collection) => {
      collection.entityIds.forEach((entityId) => {
        const memberships = collectionMembership.get(entityId) ?? [];
        memberships.push(collection);
        collectionMembership.set(entityId, memberships);
      });
    });

    entities.forEach((entity) => {
      const entityId = entity.id;
      const objectName = `${STORE_OBJECT_PREFIX}${entityId}`;
      const visualKind = getEntityVisualKind(entity);
      const weightPreviewBone =
        paintMode === 'weight' && selectedEntities.includes(entityId)
          ? paintWeightBone
          : null;
      const visualSignature = getEntityVisualSignature(entity, {
        weightPreviewBone,
      });
      let object = scene.getObjectByName(objectName);

      if (
        object &&
        (object.userData?.visualKind !== visualKind ||
          object.userData?.visualSignature !== visualSignature)
      ) {
        object.parent?.remove(object);
        disposeObject3D(object);
        object = undefined;
      }

      if (!object) {
        object = createEntityVisual(entity, {
          weightPreviewBone,
        });
        object.name = objectName;
        scene.add(object);
      }

      const transform = asRecord(entity.components.get('Transform')?.data);
      const position = readVector3(transform?.position, new THREE.Vector3(0, 0.5, 0));
      const rotation = readQuaternion(transform?.rotation, new THREE.Quaternion(0, 0, 0, 1));
      const scale = readVector3(transform?.scale, new THREE.Vector3(1, 1, 1));

      object.position.copy(position);
      object.quaternion.copy(rotation);
      object.scale.copy(scale);
      const memberships = collectionMembership.get(entityId) ?? [];
      const isCollectionVisible =
        memberships.length === 0 || memberships.some((collection) => collection.visible !== false);
      object.visible = entity.active && isCollectionVisible && (visualKind !== 'light' || showLights);
      object.userData.entityId = entityId;
      object.userData.entityName = entity.name;
      object.userData.managedByStore = true;
      object.userData.visualKind = visualKind;
      object.userData.visualSignature = visualSignature;

      const colliderSignature = buildColliderSignature(entity);
      const colliderHelper = object.getObjectByName('__collider_helper');
      if (!showColliders || !colliderSignature) {
        if (colliderHelper) {
          object.remove(colliderHelper);
          disposeObject3D(colliderHelper);
        }
      } else if (
        !colliderHelper ||
        colliderHelper.userData?.colliderSignature !== colliderSignature
      ) {
        if (colliderHelper) {
          object.remove(colliderHelper);
          disposeObject3D(colliderHelper);
        }
        const nextColliderHelper = createColliderHelper(entity);
        if (nextColliderHelper) {
          object.add(nextColliderHelper);
        }
      } else {
        colliderHelper.visible = true;
      }

      const particleSignature = buildParticleSignature(entity);
      const particleHelper = object.getObjectByName('__particle_helper');
      if (!particleSignature) {
        if (particleHelper) {
          object.remove(particleHelper);
          disposeObject3D(particleHelper);
        }
      } else if (
        !particleHelper ||
        particleHelper.userData?.particleSignature !== particleSignature
      ) {
        if (particleHelper) {
          object.remove(particleHelper);
          disposeObject3D(particleHelper);
        }
        const nextParticleHelper = createParticleHelper(entity);
        if (nextParticleHelper) {
          object.add(nextParticleHelper);
        }
      } else {
        particleHelper.visible = true;
      }

      activeIds.add(entityId);
      objectByEntityId.set(entityId, object);
    });

    entities.forEach((entity) => {
      const object = objectByEntityId.get(entity.id);
      if (!object) return;

      const desiredParent = entity.parentId
        ? objectByEntityId.get(entity.parentId) ?? scene
        : scene;
      if (object.parent !== desiredParent) {
        desiredParent.add(object);
      }
    });

    const objectsToRemove: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (!object.userData?.managedByStore) return;
      const entityId = object.userData.entityId;
      if (typeof entityId !== 'string' || activeIds.has(entityId)) return;
      objectsToRemove.push(object);
    });

    objectsToRemove.forEach((object) => {
      object.parent?.remove(object);
      disposeObject3D(object);
    });
  }, [collections, entities, paintMode, paintWeightBone, sceneRef, selectedEntities, showColliders, showLights]);

  useEffect(() => {
    const scene = sceneRef.current;
    const gizmo = transformToolsRef.current?.gizmo;
    if (!scene || !gizmo) return;

    const selectedId = selectedEntities[0];
    if (!selectedId) {
      gizmo.detach();
      return;
    }

    const target = scene.getObjectByName(`${STORE_OBJECT_PREFIX}${selectedId}`);
    if (target && target.visible) {
      gizmo.attach(target);
    } else {
      gizmo.detach();
    }
  }, [sceneRef, selectedEntities, transformToolsRef]);
}
