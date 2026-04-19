import type { Entity, HealthData, WeaponData, WeaponTargetPreference } from '@/types/engine';

export type BattleAttackType = 'light' | 'heavy' | 'ai';
export type BattleResolvedTeam = NonNullable<HealthData['team']>;

export interface ResolvedWeaponAttackSpec {
  damage: number;
  attackSpeed: number;
  range: number;
  targetTeam: WeaponTargetPreference;
}

export interface NormalizedWeaponData extends WeaponData {
  category: NonNullable<WeaponData['category']>;
  damage: number;
  attackSpeed: number;
  range: number;
  heavyDamage: number;
  heavyAttackSpeed: number;
  heavyRange: number;
  targetTeam: WeaponTargetPreference;
  autoAcquireTarget: boolean;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

export function resolveBattleTeam(
  entity: Entity,
  healthData?: Partial<HealthData> | null
): BattleResolvedTeam {
  if (healthData?.team === 'player' || healthData?.team === 'enemy' || healthData?.team === 'neutral') {
    return healthData.team;
  }
  if (entity.tags.includes('enemy')) return 'enemy';
  if (entity.tags.includes('player')) return 'player';
  return 'neutral';
}

export function normalizeWeaponData(value: unknown, fallbackDamage = 10): NormalizedWeaponData {
  const raw = value && typeof value === 'object' ? (value as Partial<WeaponData>) : {};
  const damage = Math.max(1, readNumber(raw.damage, fallbackDamage));
  const attackSpeed = Math.max(0.1, readNumber(raw.attackSpeed, 1));
  const range = Math.max(0.25, readNumber(raw.range, 1.75));

  return {
    category:
      raw.category === 'ranged' || raw.category === 'projectile' || raw.category === 'magic'
        ? raw.category
        : 'melee',
    damage,
    attackSpeed,
    range,
    heavyDamage: Math.max(1, readNumber(raw.heavyDamage, damage * 1.8)),
    heavyAttackSpeed: Math.max(0.1, readNumber(raw.heavyAttackSpeed, Math.max(0.35, attackSpeed * 0.6))),
    heavyRange: Math.max(0.25, readNumber(raw.heavyRange, range * 1.1)),
    targetTeam:
      raw.targetTeam === 'player' || raw.targetTeam === 'enemy' || raw.targetTeam === 'neutral'
        ? raw.targetTeam
        : 'opposing',
    autoAcquireTarget: readBoolean(raw.autoAcquireTarget, false),
    runtime: raw.runtime,
  };
}

export function resolveWeaponAttackSpec(params: {
  entity: Entity;
  attackType: BattleAttackType;
}): ResolvedWeaponAttackSpec {
  const healthData = (params.entity.components.get('Health')?.data as Partial<HealthData> | undefined) ?? undefined;
  const fallbackDamage = Math.max(1, readNumber(healthData?.attack, 10));
  const weapon = normalizeWeaponData(params.entity.components.get('Weapon')?.data, fallbackDamage);

  if (params.attackType === 'heavy') {
    return {
      damage: weapon.heavyDamage,
      attackSpeed: weapon.heavyAttackSpeed,
      range: weapon.heavyRange,
      targetTeam: weapon.targetTeam,
    };
  }

  return {
    damage: weapon.damage,
    attackSpeed: weapon.attackSpeed,
    range: weapon.range,
    targetTeam: weapon.targetTeam,
  };
}

export function isOpposingTeam(source: BattleResolvedTeam, target: BattleResolvedTeam) {
  if (source === 'neutral' || target === 'neutral') return false;
  return source !== target;
}
