// ============================================
// Battle Engine - simple combat registry & simulation
// ============================================

import { eventBus } from '@/engine/core/ECS';

export type BattleTeam = 'player' | 'enemy' | 'neutral';

export interface BattleActor {
  id: string;
  entityId: string;
  team: BattleTeam;
  health: number;
  attack: number;
  defense: number;
  speed: number;
  aiState?: string;
}

type BattleEventName = 'register' | 'unregister' | 'damage' | 'death' | 'tick' | 'reset';

export type BattleEventPayload =
  | { type: 'register'; actor: BattleActor }
  | { type: 'unregister'; actorId: string; entityId?: string }
  | { type: 'damage'; actor: BattleActor; amount: number; previousHealth: number }
  | { type: 'death'; actor: BattleActor }
  | { type: 'tick'; delta: number; actors: BattleActor[] }
  | { type: 'reset' };

class BattleEngine {
  private actors: Map<string, BattleActor> = new Map();
  private lastUpdated = Date.now();

  register(actor: BattleActor) {
    this.actors.set(actor.id, actor);
    this.emit({ type: 'register', actor });
  }

  unregister(id: string) {
    const actor = this.actors.get(id);
    this.actors.delete(id);
    this.emit({ type: 'unregister', actorId: id, entityId: actor?.entityId });
  }

  unregisterByEntityId(entityId: string) {
    Array.from(this.actors.values())
      .filter((actor) => actor.entityId === entityId)
      .forEach((actor) => this.unregister(actor.id));
  }

  syncEntities(entityIds: Set<string>) {
    Array.from(this.actors.values()).forEach((actor) => {
      if (!entityIds.has(actor.entityId)) {
        this.unregister(actor.id);
      }
    });
  }

  list(): BattleActor[] {
    return Array.from(this.actors.values());
  }

  getActorByEntityId(entityId: string): BattleActor | null {
    return this.list().find((actor) => actor.entityId === entityId) || null;
  }

  setActorHealth(actorId: string, health: number) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.health = Math.max(0, health);
    if (actor.health === 0) actor.aiState = 'dead';
    this.actors.set(actorId, actor);
  }

  applyDamage(targetId: string, amount: number): BattleActor | null {
    const actor = this.actors.get(targetId);
    if (!actor) return null;
    const previousHealth = actor.health;
    actor.health = Math.max(0, actor.health - amount);
    if (actor.health === 0) actor.aiState = 'dead';
    this.actors.set(targetId, actor);
    this.emit({ type: 'damage', actor, amount, previousHealth });
    if (actor.health === 0) {
      this.emit({ type: 'death', actor });
    }
    return actor;
  }

  tick(delta: number) {
    this.lastUpdated = Date.now();
    // Placeholder: future AI/aggro logic
    this.emit({ type: 'tick', delta, actors: this.list() });
  }

  summary() {
    const all = this.list();
    return {
      count: all.length,
      players: all.filter((a) => a.team === 'player').length,
      enemies: all.filter((a) => a.team === 'enemy').length,
      lastUpdated: this.lastUpdated,
    };
  }

  reset() {
    this.actors.clear();
    this.emit({ type: 'reset' });
  }

  on(event: BattleEventName, handler: (payload: BattleEventPayload) => void) {
    return eventBus.on(`battle:${event}`, handler as (data: unknown) => void);
  }

  private emit(payload: BattleEventPayload) {
    eventBus.emit(`battle:${payload.type}`, payload);
  }
}

export const battleEngine = new BattleEngine();
