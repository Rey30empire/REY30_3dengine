// ============================================
// Battle Runtime Bridge - Sync BattleEngine with Health/Animator components
// ============================================

import type { Entity, Component } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import { battleEngine, type BattleActor } from './BattleEngine';

let initialized = false;

function updateEntityFromActor(actor: BattleActor) {
  const store = useEngineStore.getState();
  const entity = store.entities.get(actor.entityId);
  if (!entity) return;

  const health = entity.components.get('Health') as Component | undefined;
  const animator = entity.components.get('Animator') as Component | undefined;
  let didUpdate = false;

  if (health) {
    const data = health.data as Record<string, unknown>;
    const current = typeof data.currentHealth === 'number' ? data.currentHealth : actor.health;
    if (current !== actor.health) {
      entity.components.set('Health', {
        ...health,
        data: {
          ...data,
          currentHealth: actor.health,
          maxHealth: typeof data.maxHealth === 'number' ? data.maxHealth : actor.health,
        },
      });
      didUpdate = true;
    }
  }

  if (animator) {
    const data = animator.data as Record<string, unknown>;
    const params = { ...(data.parameters as Record<string, number | boolean> | undefined) };
    const next = {
      ...data,
      parameters: {
        ...params,
        health: actor.health,
        isDead: actor.health <= 0,
      },
    };
    entity.components.set('Animator', { ...animator, data: next });
    didUpdate = true;
  }

  if (didUpdate) {
    store.updateEntity(entity.id, { components: entity.components });
  }
}

export function ensureBattleRuntimeBridge() {
  if (initialized) return;
  initialized = true;

  battleEngine.on('damage', (payload) => {
    if (payload.type !== 'damage') return;
    updateEntityFromActor(payload.actor);
  });

  battleEngine.on('death', (payload) => {
    if (payload.type !== 'death') return;
    updateEntityFromActor(payload.actor);
  });

  battleEngine.on('register', (payload) => {
    if (payload.type !== 'register') return;
    updateEntityFromActor(payload.actor);
  });
}

export function ensureBattleActorsForHealth(entities: Entity[]) {
  entities.forEach((entity) => {
    const health = entity.components.get('Health') as Component | undefined;
    if (!health) return;

    const data = health.data as Record<string, unknown>;
    const team =
      (data.team as BattleActor['team'] | undefined) ||
      (entity.tags.includes('enemy') ? 'enemy' : entity.tags.includes('player') ? 'player' : 'neutral');
    const currentHealth =
      typeof data.currentHealth === 'number'
        ? data.currentHealth
        : typeof data.maxHealth === 'number'
        ? data.maxHealth
        : 100;

    const existing = battleEngine.getActorByEntityId(entity.id);
    if (!existing) {
      battleEngine.register({
        id: `actor_${entity.id}`,
        entityId: entity.id,
        team,
        health: currentHealth,
        attack: typeof data.attack === 'number' ? data.attack : 10,
        defense: typeof data.defense === 'number' ? data.defense : 0,
        speed: typeof data.speed === 'number' ? data.speed : 1,
      });
      return;
    }

    if (Math.abs(existing.health - currentHealth) > 0.01) {
      battleEngine.setActorHealth(existing.id, currentHealth);
    }
  });
}
