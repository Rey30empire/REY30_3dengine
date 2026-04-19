// ============================================
// Battle Runtime Bridge - durable combat loop over editor entities
// ============================================

'use client';

import type { Component, Entity, HealthData, Vector3 } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import { battleEngine, type BattleActor, type BattleEventPayload } from './BattleEngine';
import {
  isOpposingTeam,
  normalizeWeaponData,
  resolveBattleTeam,
  resolveWeaponAttackSpec,
  type BattleAttackType,
} from './combatData';

type StoreState = ReturnType<typeof useEngineStore.getState>;

interface EntitySnapshot {
  components: Map<string, Component | null>;
}

interface BattleTarget {
  actor: BattleActor;
  entity: Entity;
  distance: number;
}

const DEFAULT_POSITION: Vector3 = { x: 0, y: 0, z: 0 };
const EPSILON = 1e-4;

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

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readVector3(value: unknown, fallback: Vector3): Vector3 {
  if (!value || typeof value !== 'object') return { ...fallback };
  const candidate = value as Partial<Vector3>;
  return {
    x: readNumber(candidate.x, fallback.x),
    y: readNumber(candidate.y, fallback.y),
    z: readNumber(candidate.z, fallback.z),
  };
}

function vectorApproximatelyEqual(left: Vector3, right: Vector3) {
  return (
    Math.abs(left.x - right.x) <= EPSILON &&
    Math.abs(left.y - right.y) <= EPSILON &&
    Math.abs(left.z - right.z) <= EPSILON
  );
}

function getActiveSceneEntities(state: StoreState): Entity[] {
  if (!state.activeSceneId) return [];
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  if (!activeScene) return [];

  const seen = new Set<string>();
  return activeScene.entities
    .map((entity) => state.entities.get(entity.id) ?? entity)
    .filter((entity) => {
      if (!entity.active || seen.has(entity.id)) return false;
      seen.add(entity.id);
      return true;
    });
}

function getHealthData(entity: Entity): Partial<HealthData> | null {
  const component = entity.components.get('Health');
  if (!component?.enabled) return null;
  return component.data as Partial<HealthData>;
}

function getPlayerControllerData(entity: Entity): Record<string, unknown> | null {
  const component = entity.components.get('PlayerController');
  if (!component?.enabled) return null;
  return component.data as Record<string, unknown>;
}

function getWeaponData(entity: Entity): Record<string, unknown> | null {
  const component = entity.components.get('Weapon');
  if (!component?.enabled) return null;
  return component.data as Record<string, unknown>;
}

function getTransformPosition(entity: Entity): Vector3 {
  const transform = entity.components.get('Transform')?.data as
    | { position?: Partial<Vector3> }
    | undefined;
  return readVector3(transform?.position, DEFAULT_POSITION);
}

function isHealthEntity(entity: Entity) {
  return entity.components.get('Health')?.enabled === true;
}

function isWeaponEntity(entity: Entity) {
  return entity.components.get('Weapon')?.enabled === true;
}

function distanceBetween(left: Entity, right: Entity) {
  const a = getTransformPosition(left);
  const b = getTransformPosition(right);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class BattleRuntimeBridge {
  private initialized = false;
  private authoredSnapshots = new Map<string, EntitySnapshot>();

  get isActive() {
    return this.authoredSnapshots.size > 0 || battleEngine.summary().count > 0;
  }

  reset(): void {
    this.restoreAuthoredState();
    this.authoredSnapshots.clear();
    battleEngine.reset();
  }

  update(deltaTime: number): void {
    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      return;
    }

    this.ensureInitialized();

    const entities = getActiveSceneEntities(state);
    this.syncActors(entities);
    battleEngine.tick(deltaTime);
    this.processCombat(entities);
    this.syncWeaponRuntime(entities);
  }

  private ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;

    battleEngine.on('register', (payload) => {
      if (payload.type !== 'register') return;
      this.syncEntityFromActor(payload.actor);
    });

    battleEngine.on('damage', (payload) => {
      if (payload.type !== 'damage') return;
      this.syncEntityFromActor(payload.actor);
    });

    battleEngine.on('death', (payload) => {
      if (payload.type !== 'death') return;
      this.syncEntityFromActor(payload.actor);
    });

    battleEngine.on('attack', (payload) => {
      if (payload.type !== 'attack') return;
      this.recordAttackTelemetry(payload);
    });
  }

  private captureSnapshot(entity: Entity): EntitySnapshot {
    return {
      components: new Map([
        ['Health', cloneComponent(entity.components.get('Health') ?? null)],
        ['Weapon', cloneComponent(entity.components.get('Weapon') ?? null)],
        ['Animator', cloneComponent(entity.components.get('Animator') ?? null)],
        ['PlayerController', cloneComponent(entity.components.get('PlayerController') ?? null)],
      ]),
    };
  }

  private ensureSnapshot(entity: Entity) {
    if (this.authoredSnapshots.has(entity.id)) return;
    this.authoredSnapshots.set(entity.id, this.captureSnapshot(entity));
  }

  private syncActors(entities: Entity[]) {
    const combatants = entities.filter(isHealthEntity);
    battleEngine.syncEntities(new Set(combatants.map((entity) => entity.id)));

    combatants.forEach((entity) => {
      this.ensureSnapshot(entity);

      const healthData = getHealthData(entity) ?? {};
      const currentHealth = Math.max(
        0,
        readNumber(healthData.currentHealth, readNumber(healthData.maxHealth, 100))
      );
      const attackSource = this.resolveAttackSourceEntity(entity, entities) ?? entity;
      const attackSpec = resolveWeaponAttackSpec({
        entity: attackSource,
        attackType: 'light',
      });
      const actorId = `actor_${entity.id}`;
      const patch: BattleActor = {
        id: actorId,
        entityId: entity.id,
        team: resolveBattleTeam(entity, healthData),
        health: currentHealth,
        attack: attackSpec.damage,
        defense: Math.max(0, readNumber(healthData.defense, 0)),
        speed: Math.max(0.1, readNumber(healthData.speed, 1)),
        aiState: currentHealth <= 0 ? 'dead' : undefined,
      };

      const existing = battleEngine.getActor(actorId);
      if (!existing) {
        battleEngine.register(patch);
      } else {
        battleEngine.updateActor(actorId, patch);
      }
    });
  }

  private processCombat(entities: Entity[]) {
    const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
    const actors = battleEngine.list().filter((actor) => actor.health > 0);

    actors.forEach((actor) => {
      const entity = entitiesById.get(actor.entityId);
      if (!entity) return;

      const controllerData = getPlayerControllerData(entity);
      const requestedLight = readBoolean(controllerData?.attackRequested, false);
      const requestedHeavy = readBoolean(controllerData?.heavyAttackRequested, false);
      const lockRequested = readBoolean(controllerData?.lockTargetRequested, false);
      const shouldAutoAttack = !controllerData && actor.team === 'enemy';
      const attackType: BattleAttackType | null = requestedHeavy
        ? 'heavy'
        : requestedLight
          ? 'light'
          : shouldAutoAttack
            ? 'ai'
            : null;

      const attackSource = this.resolveAttackSourceEntity(entity, entities) ?? entity;
      if (attackSource !== entity) {
        this.ensureSnapshot(attackSource);
      }

      const target = this.resolveTarget({
        attackerActor: actor,
        attackerEntity: entity,
        attackSource,
        lockedTargetId:
          typeof controllerData?.combatTargetEntityId === 'string'
            ? controllerData.combatTargetEntityId
            : null,
        actors,
        entitiesById,
        attackType: attackType ?? 'light',
      });

      if (controllerData && (requestedLight || requestedHeavy || lockRequested)) {
        this.patchPlayerController(entity, {
          combatTargetEntityId: target?.entity.id ?? null,
          attackRequested: false,
          heavyAttackRequested: false,
          parryRequested: false,
          lockTargetRequested: false,
        });
      }

      if (!attackType || !target) {
        return;
      }

      const spec = resolveWeaponAttackSpec({
        entity: attackSource,
        attackType: attackType === 'ai' ? 'light' : attackType,
      });
      if (target.distance > spec.range + EPSILON) {
        this.patchWeaponRuntime(attackSource, actor.id, {
          lastTargetEntityId: target.entity.id,
        });
        return;
      }

      const targetController = getPlayerControllerData(target.entity);
      const result = battleEngine.performAttack({
        attackerId: actor.id,
        targetId: target.actor.id,
        baseDamage: spec.damage,
        cooldown: 1 / spec.attackSpeed,
        attackType,
        blocked: readBoolean(targetController?.block, false),
        blockedMultiplier: 0.4,
      });

      if (!result.ok && !result.blockedByCooldown) {
        return;
      }

      this.patchWeaponRuntime(attackSource, actor.id, {
        lastAttackAt: result.ok ? battleEngine.now : undefined,
        lastAttackType: result.ok ? attackType : undefined,
        lastTargetEntityId: target.entity.id,
        totalAttacksDelta: result.ok ? 1 : 0,
        totalHitsDelta: result.ok && result.damage > 0 ? 1 : 0,
        lastDamage: result.ok ? result.damage : undefined,
      });
    });
  }

  private resolveTarget(params: {
    attackerActor: BattleActor;
    attackerEntity: Entity;
    attackSource: Entity;
    lockedTargetId: string | null;
    actors: BattleActor[];
    entitiesById: Map<string, Entity>;
    attackType: BattleAttackType;
  }): BattleTarget | null {
    const spec = resolveWeaponAttackSpec({
      entity: params.attackSource,
      attackType: params.attackType === 'ai' ? 'light' : params.attackType,
    });

    const candidates = params.actors
      .filter((actor) => actor.entityId !== params.attackerActor.entityId && actor.health > 0)
      .map((actor) => {
        const entity = params.entitiesById.get(actor.entityId);
        if (!entity) return null;

        const matchesTargetTeam =
          spec.targetTeam === 'opposing'
            ? isOpposingTeam(params.attackerActor.team, actor.team)
            : actor.team === spec.targetTeam;
        if (!matchesTargetTeam) return null;

        return {
          actor,
          entity,
          distance: distanceBetween(params.attackerEntity, entity),
        } satisfies BattleTarget;
      })
      .filter((value): value is BattleTarget => Boolean(value))
      .sort((left, right) => left.distance - right.distance);

    if (params.lockedTargetId) {
      const locked = candidates.find((candidate) => candidate.entity.id === params.lockedTargetId);
      if (locked) return locked;
    }

    return candidates[0] ?? null;
  }

  private resolveAttackSourceEntity(entity: Entity, entities: Entity[]): Entity | null {
    if (isWeaponEntity(entity)) {
      return entity;
    }

    const directWeapon = entities.find(
      (candidate) => candidate.parentId === entity.id && candidate.active && isWeaponEntity(candidate)
    );
    if (directWeapon) {
      return directWeapon;
    }

    return entities.find((candidate) => {
      if (!candidate.active || !isWeaponEntity(candidate)) return false;
      let parentId = candidate.parentId;
      while (parentId) {
        if (parentId === entity.id) return true;
        parentId = entities.find((item) => item.id === parentId)?.parentId ?? null;
      }
      return false;
    }) ?? null;
  }

  private patchPlayerController(entity: Entity, patch: Record<string, unknown>) {
    const component = entity.components.get('PlayerController');
    if (!component?.enabled) return;

    const currentData = component.data as Record<string, unknown>;
    const nextData = {
      ...currentData,
      ...patch,
    };
    const changed = Object.keys(patch).some((key) => currentData[key] !== nextData[key]);
    if (!changed) return;

    const nextComponents = new Map(entity.components);
    nextComponents.set('PlayerController', {
      ...component,
      data: nextData,
    });
    useEngineStore.getState().updateEntityTransient(entity.id, { components: nextComponents });
  }

  private patchWeaponRuntime(
    entity: Entity,
    actorId: string,
    patch: {
      lastAttackAt?: number;
      lastAttackType?: BattleAttackType;
      lastTargetEntityId?: string | null;
      lastDamage?: number;
      totalAttacksDelta?: number;
      totalHitsDelta?: number;
    }
  ) {
    const component = entity.components.get('Weapon');
    if (!component?.enabled) return;

    const currentData = component.data as Record<string, unknown>;
    const weapon = normalizeWeaponData(currentData);
    const cooldownRemaining = battleEngine.getCooldownRemaining(actorId, 1 / weapon.attackSpeed);
    const currentRuntime = (currentData.runtime as Record<string, unknown> | undefined) ?? {};
    const nextRuntime = {
      cooldownRemaining,
      lastAttackAt:
        patch.lastAttackAt !== undefined
          ? patch.lastAttackAt
          : (currentRuntime.lastAttackAt as number | null | undefined) ?? null,
      lastAttackType:
        patch.lastAttackType !== undefined
          ? patch.lastAttackType
          : (currentRuntime.lastAttackType as BattleAttackType | null | undefined) ?? null,
      lastTargetEntityId:
        patch.lastTargetEntityId !== undefined
          ? patch.lastTargetEntityId
          : (currentRuntime.lastTargetEntityId as string | null | undefined) ?? null,
      totalAttacks:
        readNumber(currentRuntime.totalAttacks, 0) + (patch.totalAttacksDelta ?? 0),
      totalHits:
        readNumber(currentRuntime.totalHits, 0) + (patch.totalHitsDelta ?? 0),
      lastDamage:
        patch.lastDamage !== undefined
          ? patch.lastDamage
          : readNumber(currentRuntime.lastDamage, 0),
    };

    const changed =
      readNumber(currentRuntime.cooldownRemaining, 0) !== nextRuntime.cooldownRemaining ||
      currentRuntime.lastAttackAt !== nextRuntime.lastAttackAt ||
      currentRuntime.lastAttackType !== nextRuntime.lastAttackType ||
      currentRuntime.lastTargetEntityId !== nextRuntime.lastTargetEntityId ||
      readNumber(currentRuntime.totalAttacks, 0) !== nextRuntime.totalAttacks ||
      readNumber(currentRuntime.totalHits, 0) !== nextRuntime.totalHits ||
      readNumber(currentRuntime.lastDamage, 0) !== nextRuntime.lastDamage;

    if (!changed) return;

    this.ensureSnapshot(entity);
    const nextComponents = new Map(entity.components);
    nextComponents.set('Weapon', {
      ...component,
      data: {
        ...currentData,
        runtime: nextRuntime,
      },
    });
    useEngineStore.getState().updateEntityTransient(entity.id, { components: nextComponents });
  }

  private syncWeaponRuntime(entities: Entity[]) {
    const store = useEngineStore.getState();
    const latestEntities = new Map(
      entities.map((entity) => [entity.id, store.entities.get(entity.id) ?? entity])
    );

    Array.from(latestEntities.values())
      .filter(isWeaponEntity)
      .forEach((entity) => {
        const owner = entity.parentId ? latestEntities.get(entity.parentId) ?? null : null;
        const actorEntity = owner && isHealthEntity(owner) ? owner : isHealthEntity(entity) ? entity : null;
        if (!actorEntity) return;
        const actor = battleEngine.getActorByEntityId(actorEntity.id);
        if (!actor) return;
        this.patchWeaponRuntime(entity, actor.id, {});
      });
  }

  private syncEntityFromActor(actor: BattleActor) {
    const store = useEngineStore.getState();
    const entity = store.entities.get(actor.entityId);
    if (!entity) return;

    const nextComponents = new Map(entity.components);
    let changed = false;

    const health = entity.components.get('Health');
    if (health?.enabled) {
      const currentData = health.data as Record<string, unknown>;
      const nextHealth = {
        ...currentData,
        currentHealth: actor.health,
        maxHealth: readNumber(currentData.maxHealth, actor.health),
      };
      if (readNumber(currentData.currentHealth, actor.health) !== actor.health) {
        nextComponents.set('Health', {
          ...health,
          data: nextHealth,
        });
        changed = true;
      }
    }

    const animator = entity.components.get('Animator');
    if (animator?.enabled) {
      const currentData = animator.data as Record<string, unknown>;
      const parameters = {
        ...((currentData.parameters as Record<string, unknown> | undefined) ?? {}),
        health: actor.health,
        isDead: actor.health <= 0,
      };
      if (
        (currentData.parameters as Record<string, unknown> | undefined)?.health !== parameters.health ||
        (currentData.parameters as Record<string, unknown> | undefined)?.isDead !== parameters.isDead
      ) {
        nextComponents.set('Animator', {
          ...animator,
          data: {
            ...currentData,
            parameters,
          },
        });
        changed = true;
      }
    }

    if (changed) {
      store.updateEntityTransient(entity.id, { components: nextComponents });
    }
  }

  private recordAttackTelemetry(payload: Extract<BattleEventPayload, { type: 'attack' }>) {
    const store = useEngineStore.getState();
    const entity = store.entities.get(payload.target.entityId);
    if (!entity) return;

    const health = entity.components.get('Health');
    if (!health?.enabled) return;

    const currentData = health.data as Record<string, unknown>;
    const nextComponents = new Map(entity.components);
    nextComponents.set('Health', {
      ...health,
      data: {
        ...currentData,
        currentHealth: payload.target.health,
        lastDamageAmount: payload.amount,
        lastDamageAt: battleEngine.now,
        lastDamageSourceEntityId: payload.attacker.entityId,
        lastAttackType: payload.attackType,
        blockedLastHit: payload.blocked,
      },
    });
    store.updateEntityTransient(entity.id, { components: nextComponents });
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

export const battleRuntimeBridge = new BattleRuntimeBridge();
