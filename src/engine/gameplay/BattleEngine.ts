// ============================================
// Battle Engine - simple combat registry & simulation
// ============================================

import { eventBus } from '@/engine/core/ECS';
import type { BattleAttackType } from './combatData';

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

type BattleEventName = 'register' | 'unregister' | 'damage' | 'death' | 'attack' | 'tick' | 'reset';

export type BattleEventPayload =
  | { type: 'register'; actor: BattleActor }
  | { type: 'unregister'; actorId: string; entityId?: string }
  | { type: 'damage'; actor: BattleActor; amount: number; previousHealth: number }
  | { type: 'death'; actor: BattleActor }
  | {
      type: 'attack';
      attacker: BattleActor;
      target: BattleActor;
      amount: number;
      previousHealth: number;
      attackType: BattleAttackType;
      blocked: boolean;
      cooldown: number;
    }
  | { type: 'tick'; delta: number; actors: BattleActor[] }
  | { type: 'reset' };

export interface BattleAttackResult {
  ok: boolean;
  blockedByCooldown: boolean;
  blocked: boolean;
  damage: number;
  cooldownRemaining: number;
  targetDied: boolean;
  target: BattleActor | null;
}

class BattleEngine {
  private actors: Map<string, BattleActor> = new Map();
  private lastUpdated = Date.now();
  private runtimeClock = 0;
  private attackLedger: Map<string, number> = new Map();

  get now() {
    return this.runtimeClock;
  }

  private cloneActor(actor: BattleActor): BattleActor {
    return { ...actor };
  }

  register(actor: BattleActor) {
    const normalized: BattleActor = {
      ...actor,
      health: Math.max(0, actor.health),
      aiState: actor.health <= 0 ? 'dead' : actor.aiState,
    };
    this.actors.set(normalized.id, normalized);
    this.emit({ type: 'register', actor: this.cloneActor(normalized) });
  }

  unregister(id: string) {
    const actor = this.actors.get(id);
    this.actors.delete(id);
    this.attackLedger.delete(id);
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
    return Array.from(this.actors.values()).map((actor) => this.cloneActor(actor));
  }

  getActor(id: string): BattleActor | null {
    const actor = this.actors.get(id);
    return actor ? this.cloneActor(actor) : null;
  }

  getActorByEntityId(entityId: string): BattleActor | null {
    return this.list().find((actor) => actor.entityId === entityId) || null;
  }

  updateActor(actorId: string, patch: Partial<BattleActor>) {
    const actor = this.actors.get(actorId);
    if (!actor) return null;
    const next: BattleActor = {
      ...actor,
      ...patch,
      health: Math.max(0, patch.health ?? actor.health),
    };
    if (next.health === 0) {
      next.aiState = 'dead';
    }
    this.actors.set(actorId, next);
    return this.cloneActor(next);
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
    this.emit({ type: 'damage', actor: this.cloneActor(actor), amount, previousHealth });
    if (actor.health === 0) {
      this.emit({ type: 'death', actor: this.cloneActor(actor) });
    }
    return this.cloneActor(actor);
  }

  getCooldownRemaining(actorId: string, cooldown: number) {
    const effectiveCooldown = Math.max(0, cooldown);
    if (effectiveCooldown <= 0) return 0;
    const lastAttackAt = this.attackLedger.get(actorId);
    if (lastAttackAt === undefined) return 0;
    return Math.max(0, effectiveCooldown - (this.runtimeClock - lastAttackAt));
  }

  performAttack(params: {
    attackerId: string;
    targetId: string;
    baseDamage: number;
    cooldown: number;
    attackType: BattleAttackType;
    blocked?: boolean;
    blockedMultiplier?: number;
    minimumDamage?: number;
  }): BattleAttackResult {
    const attacker = this.actors.get(params.attackerId);
    const target = this.actors.get(params.targetId);
    if (!attacker || !target || attacker.health <= 0 || target.health <= 0) {
      return {
        ok: false,
        blockedByCooldown: false,
        blocked: Boolean(params.blocked),
        damage: 0,
        cooldownRemaining: 0,
        targetDied: false,
        target: target ? this.cloneActor(target) : null,
      };
    }
    if (attacker.team !== 'neutral' && target.team !== 'neutral' && attacker.team === target.team) {
      return {
        ok: false,
        blockedByCooldown: false,
        blocked: false,
        damage: 0,
        cooldownRemaining: 0,
        targetDied: false,
        target: this.cloneActor(target),
      };
    }

    const cooldown = Math.max(0, params.cooldown);
    const cooldownRemaining = this.getCooldownRemaining(attacker.id, cooldown);
    if (cooldownRemaining > 1e-4) {
      return {
        ok: false,
        blockedByCooldown: true,
        blocked: false,
        damage: 0,
        cooldownRemaining,
        targetDied: false,
        target: this.cloneActor(target),
      };
    }

    this.attackLedger.set(attacker.id, this.runtimeClock);

    const blocked = Boolean(params.blocked);
    const blockedMultiplier = blocked ? Math.max(0, params.blockedMultiplier ?? 0.4) : 1;
    const baseDamage = Math.max(0, params.baseDamage) * blockedMultiplier;
    const minimumDamage = Math.max(0, params.minimumDamage ?? 1);
    const resolvedDamage = Math.max(
      minimumDamage,
      Math.round(baseDamage - Math.max(0, target.defense))
    );
    const previousHealth = target.health;
    const updatedTarget = this.applyDamage(target.id, resolvedDamage);

    if (updatedTarget) {
      this.emit({
        type: 'attack',
        attacker: this.cloneActor(attacker),
        target: this.cloneActor(updatedTarget),
        amount: resolvedDamage,
        previousHealth,
        attackType: params.attackType,
        blocked,
        cooldown,
      });
    }

    return {
      ok: true,
      blockedByCooldown: false,
      blocked,
      damage: resolvedDamage,
      cooldownRemaining: cooldown,
      targetDied: (updatedTarget?.health ?? target.health) <= 0,
      target: updatedTarget ?? this.cloneActor(target),
    };
  }

  tick(delta: number) {
    this.runtimeClock += Math.max(0, delta);
    this.lastUpdated = Date.now();
    this.emit({ type: 'tick', delta, actors: this.list() });
  }

  summary() {
    const all = this.list();
    return {
      count: all.length,
      players: all.filter((a) => a.team === 'player').length,
      enemies: all.filter((a) => a.team === 'enemy').length,
      lastUpdated: this.lastUpdated,
      runtimeClock: this.runtimeClock,
    };
  }

  reset() {
    this.actors.clear();
    this.attackLedger.clear();
    this.runtimeClock = 0;
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
