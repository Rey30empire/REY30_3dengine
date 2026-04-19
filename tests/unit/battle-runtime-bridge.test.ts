import { afterEach, describe, expect, it } from 'vitest';
import type { Entity, Scene } from '@/types/engine';
import { battleRuntimeBridge } from '@/engine/gameplay/BattleRuntimeBridge';
import { useEngineStore } from '@/store/editorStore';

function makeCombatPlayerEntity(): Entity {
  return {
    id: 'battle-player',
    name: 'Battle Player',
    active: true,
    parentId: null,
    children: [],
    tags: ['player'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-battle-player',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 1, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Health',
        {
          id: 'health-battle-player',
          type: 'Health',
          enabled: true,
          data: {
            maxHealth: 100,
            currentHealth: 100,
            attack: 20,
            defense: 5,
            speed: 1.3,
            team: 'player',
          },
        },
      ],
      [
        'PlayerController',
        {
          id: 'controller-battle-player',
          type: 'PlayerController',
          enabled: true,
          data: {
            attackRequested: true,
            heavyAttackRequested: false,
            lockTargetRequested: false,
            parryRequested: false,
            block: false,
          },
        },
      ],
    ]),
  };
}

function makeCombatWeaponEntity(parentId: string): Entity {
  return {
    id: 'battle-player-weapon',
    name: 'Battle Sword',
    active: true,
    parentId,
    children: [],
    tags: ['weapon'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-battle-weapon',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0.4, y: 1.1, z: 0.1 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Weapon',
        {
          id: 'weapon-battle-player',
          type: 'Weapon',
          enabled: true,
          data: {
            damage: 20,
            attackSpeed: 1,
            range: 2.25,
            heavyDamage: 34,
            heavyAttackSpeed: 0.7,
            heavyRange: 2.6,
            autoAcquireTarget: true,
            targetTeam: 'enemy',
          },
        },
      ],
    ]),
  };
}

function makeCombatEnemyEntity(): Entity {
  return {
    id: 'battle-enemy',
    name: 'Battle Enemy',
    active: true,
    parentId: null,
    children: [],
    tags: ['enemy'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-battle-enemy',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 1, z: 1.2 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Health',
        {
          id: 'health-battle-enemy',
          type: 'Health',
          enabled: true,
          data: {
            maxHealth: 80,
            currentHealth: 80,
            attack: 10,
            defense: 2,
            speed: 1,
            team: 'enemy',
          },
        },
      ],
    ]),
  };
}

function makeScene(...entities: Entity[]): Scene {
  return {
    id: 'scene-battle',
    name: 'Battle Scene',
    entities,
    rootEntities: entities.filter((entity) => entity.parentId === null).map((entity) => entity.id),
    environment: {
      skybox: null,
      ambientLight: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
      fog: null,
      postProcessing: {
        bloom: { enabled: false, intensity: 0, threshold: 0, radius: 0 },
        ssao: { enabled: false, radius: 0, intensity: 0, bias: 0 },
        ssr: { enabled: false, intensity: 0, maxDistance: 0 },
        colorGrading: { enabled: false, exposure: 1, contrast: 1, saturation: 1, gamma: 1 },
        vignette: { enabled: false, intensity: 0, smoothness: 0, roundness: 0 },
      },
    },
    createdAt: new Date('2026-04-03T12:00:00.000Z'),
    updatedAt: new Date('2026-04-03T12:00:00.000Z'),
  };
}

describe('BattleRuntimeBridge', () => {
  afterEach(() => {
    battleRuntimeBridge.reset();
    useEngineStore.setState({
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      playRuntimeState: 'IDLE',
    });
  });

  it('applies damage, respects cooldowns, and restores authored combat state on reset', () => {
    const player = makeCombatPlayerEntity();
    const weapon = makeCombatWeaponEntity(player.id);
    const enemy = makeCombatEnemyEntity();
    useEngineStore.setState({
      scenes: [makeScene(player, weapon, enemy)],
      activeSceneId: 'scene-battle',
      entities: new Map([
        [player.id, player],
        [weapon.id, weapon],
        [enemy.id, enemy],
      ]),
      playRuntimeState: 'PLAYING',
    });

    battleRuntimeBridge.update(1 / 60);

    const damagedEnemy = useEngineStore.getState().entities.get(enemy.id);
    const damagedEnemyHealth = damagedEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const updatedPlayer = useEngineStore.getState().entities.get(player.id);
    const updatedController = updatedPlayer?.components.get('PlayerController')?.data as Record<string, unknown>;
    const updatedWeapon = useEngineStore.getState().entities.get(weapon.id);
    const weaponRuntime =
      ((updatedWeapon?.components.get('Weapon')?.data as Record<string, unknown>).runtime as
        | Record<string, unknown>
        | undefined) ?? {};

    expect((damagedEnemyHealth.currentHealth as number) ?? 0).toBe(62);
    expect(damagedEnemyHealth.lastDamageAmount).toBe(18);
    expect(damagedEnemyHealth.lastDamageSourceEntityId).toBe(player.id);
    expect(damagedEnemyHealth.lastAttackType).toBe('light');
    expect(updatedController.attackRequested).toBe(false);
    expect((weaponRuntime.totalAttacks as number) ?? 0).toBe(1);
    expect((weaponRuntime.totalHits as number) ?? 0).toBe(1);
    expect(weaponRuntime.lastTargetEntityId).toBe(enemy.id);
    expect(((weaponRuntime.cooldownRemaining as number) ?? 0)).toBeGreaterThan(0.9);

    const attackComponents = new Map(updatedPlayer!.components);
    attackComponents.set('PlayerController', {
      ...updatedPlayer!.components.get('PlayerController')!,
      data: {
        ...updatedController,
        attackRequested: true,
      },
    });
    useEngineStore.getState().updateEntityTransient(player.id, { components: attackComponents });
    battleRuntimeBridge.update(0.1);

    const cooledEnemy = useEngineStore.getState().entities.get(enemy.id);
    const cooledHealth = cooledEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const cooledWeapon = useEngineStore.getState().entities.get(weapon.id);
    const cooledRuntime =
      ((cooledWeapon?.components.get('Weapon')?.data as Record<string, unknown>).runtime as
        | Record<string, unknown>
        | undefined) ?? {};

    expect(cooledHealth.currentHealth).toBe(62);
    expect((cooledRuntime.totalAttacks as number) ?? 0).toBe(1);

    const currentPlayer = useEngineStore.getState().entities.get(player.id)!;
    const currentController = currentPlayer.components.get('PlayerController')?.data as Record<string, unknown>;
    const secondAttackComponents = new Map(currentPlayer.components);
    secondAttackComponents.set('PlayerController', {
      ...currentPlayer.components.get('PlayerController')!,
      data: {
        ...currentController,
        attackRequested: true,
      },
    });
    useEngineStore.getState().updateEntityTransient(player.id, { components: secondAttackComponents });
    battleRuntimeBridge.update(1.05);

    const twiceDamagedEnemy = useEngineStore.getState().entities.get(enemy.id);
    const twiceDamagedHealth = twiceDamagedEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const twiceUpdatedWeapon = useEngineStore.getState().entities.get(weapon.id);
    const twiceRuntime =
      ((twiceUpdatedWeapon?.components.get('Weapon')?.data as Record<string, unknown>).runtime as
        | Record<string, unknown>
        | undefined) ?? {};

    expect((twiceDamagedHealth.currentHealth as number) ?? 0).toBe(44);
    expect((twiceRuntime.totalAttacks as number) ?? 0).toBe(2);

    battleRuntimeBridge.reset();

    const restoredEnemy = useEngineStore.getState().entities.get(enemy.id);
    const restoredEnemyHealth = restoredEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const restoredWeapon = useEngineStore.getState().entities.get(weapon.id);
    const restoredWeaponData = restoredWeapon?.components.get('Weapon')?.data as Record<string, unknown>;

    expect(restoredEnemyHealth.currentHealth).toBe(80);
    expect(restoredEnemyHealth.lastDamageAmount).toBeUndefined();
    expect(restoredWeaponData.runtime).toBeUndefined();
  });
});
