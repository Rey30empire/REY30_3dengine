'use client';

import type { Component, Entity, TransformData } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import {
  applyAnimatorPoseToTransform,
  compileAnimatorAuthoring,
  evaluateCompiledAnimatorTimeline,
  normalizeRuntimeTransform,
  type CompiledAnimatorAuthoring,
} from './animatorAuthoring';

type StoreState = ReturnType<typeof useEngineStore.getState>;

interface EntitySnapshot {
  components: Map<string, Component | null>;
}

interface AnimationBinding {
  entityId: string;
  authoredTransform: TransformData;
  compiled: CompiledAnimatorAuthoring;
  time: number;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneComponent(component: Component | null): Component | null {
  if (!component) return null;
  return {
    ...component,
    data: deepClone(component.data),
  };
}

function getActiveSceneEntities(state: StoreState): Entity[] {
  if (!state.activeSceneId) return [];
  const scene = state.scenes.find((entry) => entry.id === state.activeSceneId);
  if (!scene) return [];

  const seen = new Set<string>();
  return scene.entities
    .map((entity) => state.entities.get(entity.id) ?? entity)
    .filter((entity) => {
      if (!entity.active || seen.has(entity.id)) return false;
      seen.add(entity.id);
      return true;
    });
}

function isAnimationEntity(entity: Entity) {
  return entity.components.get('Animator')?.enabled === true;
}

function sanitizeAnimatorSignatureData(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const { runtime: _runtime, currentAnimation: _currentAnimation, ...rest } = data;
  return rest;
}

export class AnimationRuntimeBridge {
  private bindings = new Map<string, AnimationBinding>();
  private authoredSnapshots = new Map<string, EntitySnapshot>();
  private structureSignature = '';

  get isActive(): boolean {
    return this.bindings.size > 0 || this.authoredSnapshots.size > 0;
  }

  reset(): void {
    this.disposeRuntime(true);
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0) return;

    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      return;
    }

    this.ensureRuntime(state);
    if (this.bindings.size === 0) {
      return;
    }

    for (const binding of this.bindings.values()) {
      binding.time += deltaTime;
    }

    this.syncAnimationToStore();
  }

  private ensureRuntime(state: StoreState) {
    const entities = getActiveSceneEntities(state).filter(isAnimationEntity);
    const signature = this.buildStructureSignature(state.activeSceneId, entities);

    if (signature === this.structureSignature) {
      return;
    }

    this.disposeRuntime(false);
    this.structureSignature = signature;

    for (const entity of entities) {
      const animator = entity.components.get('Animator');
      if (!animator?.enabled) continue;

      this.authoredSnapshots.set(entity.id, {
        components: new Map([
          ['Transform', cloneComponent(entity.components.get('Transform') ?? null)],
          ['Animator', cloneComponent(animator)],
        ]),
      });

      this.bindings.set(entity.id, {
        entityId: entity.id,
        authoredTransform: normalizeRuntimeTransform(entity.components.get('Transform')?.data),
        compiled: compileAnimatorAuthoring(animator.data, entity.name),
        time: 0,
      });
    }
  }

  private buildStructureSignature(activeSceneId: string | null, entities: Entity[]) {
    const parts = entities
      .map((entity) => {
        const animator = entity.components.get('Animator');
        return JSON.stringify({
          entityId: entity.id,
          animatorEnabled: animator?.enabled === true,
          animatorData: sanitizeAnimatorSignatureData(animator?.data ?? null),
        });
      })
      .sort();

    return `${activeSceneId ?? 'no-scene'}::${parts.join(';')}`;
  }

  private syncAnimationToStore() {
    const store = useEngineStore.getState();

    for (const binding of this.bindings.values()) {
      const entity = store.entities.get(binding.entityId);
      if (!entity) continue;

      const animatorComponent = entity.components.get('Animator');
      if (!animatorComponent?.enabled) continue;

      const evaluation = evaluateCompiledAnimatorTimeline(binding.compiled, binding.time);
      const nextComponents = new Map(entity.components);
      let changed = false;

      const rootBoneId = binding.compiled.rootBoneId;
      const rootRestTransform = rootBoneId
        ? binding.compiled.restPose.transforms[rootBoneId]
        : undefined;
      const rootPoseTransform = rootBoneId
        ? evaluation.pose.transforms[rootBoneId]
        : undefined;

      const transformComponent = nextComponents.get('Transform');
      if (transformComponent) {
        const nextTransform = applyAnimatorPoseToTransform(
          binding.authoredTransform,
          rootRestTransform,
          rootPoseTransform
        );
        const currentTransform = normalizeRuntimeTransform(transformComponent.data);
        const hasTransformChanged = JSON.stringify(currentTransform) !== JSON.stringify(nextTransform);

        if (hasTransformChanged) {
          nextComponents.set('Transform', {
            ...transformComponent,
            data: nextTransform as unknown as Record<string, unknown>,
          });
          changed = true;
        }
      }

      const currentAnimatorData =
        animatorComponent.data && typeof animatorComponent.data === 'object'
          ? (animatorComponent.data as Record<string, unknown>)
          : {};
      const nextAnimatorData = {
        ...currentAnimatorData,
        currentAnimation: evaluation.primaryClipName,
        runtime: {
          time: evaluation.time,
          duration: evaluation.duration,
          activeClipId: evaluation.primaryClipId,
          activeClipIds: evaluation.activeClipIds,
          activeClipNames: evaluation.activeClipNames,
          activeStripIds: evaluation.activeStripIds,
          activeStripNames: evaluation.activeStripNames,
          poseBoneCount: Object.keys(evaluation.pose.transforms).length,
        },
      };

      if (JSON.stringify(currentAnimatorData) !== JSON.stringify(nextAnimatorData)) {
        nextComponents.set('Animator', {
          ...animatorComponent,
          data: nextAnimatorData,
        });
        changed = true;
      }

      if (changed) {
        store.updateEntityTransient(binding.entityId, { components: nextComponents });
      }
    }
  }

  private disposeRuntime(restoreAuthoredState: boolean) {
    if (restoreAuthoredState) {
      this.restoreAuthoredState();
    }

    this.bindings.clear();
    this.authoredSnapshots.clear();
    this.structureSignature = '';
  }

  private restoreAuthoredState() {
    if (this.authoredSnapshots.size === 0) return;

    const store = useEngineStore.getState();
    for (const [entityId, snapshot] of this.authoredSnapshots.entries()) {
      const entity = store.entities.get(entityId);
      if (!entity) continue;

      const nextComponents = new Map(entity.components);
      snapshot.components.forEach((component, key) => {
        if (component) {
          nextComponents.set(key, cloneComponent(component)!);
        } else {
          nextComponents.delete(key);
        }
      });

      store.updateEntityTransient(entityId, { components: nextComponents });
    }
  }
}

export const animationRuntimeBridge = new AnimationRuntimeBridge();
