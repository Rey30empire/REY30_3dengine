// ============================================
// Weapon System - Combat Framework
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import { createParticlePreset, ParticleEmitter } from '../rendering/ParticleSystem';

// Weapon types
export type WeaponType = 
  | 'sword' 
  | 'axe' 
  | 'spear' 
  | 'dagger'
  | 'hammer'
  | 'bow'
  | 'crossbow'
  | 'pistol'
  | 'rifle'
  | 'shotgun'
  | 'staff'
  | 'wand'
  | 'shield';

// Damage types
export type DamageType = 
  | 'physical' 
  | 'fire' 
  | 'ice' 
  | 'lightning' 
  | 'poison' 
  | 'holy' 
  | 'dark'
  | 'explosive';

// Weapon configuration
export interface WeaponConfig {
  name: string;
  type: WeaponType;
  damageType: DamageType;
  
  // Stats
  damage: number;
  attackSpeed: number; // attacks per second
  range: number;
  accuracy: number; // 0-1
  criticalChance: number; // 0-1
  criticalMultiplier: number;
  
  // Ammo (for ranged)
  maxAmmo?: number;
  reloadTime?: number;
  projectileSpeed?: number;
  
  // Effects
  knockback: number;
  stunChance: number;
  bleedChance: number;
  burnChance: number;
  freezeChance: number;
  
  // Visual
  modelPath?: string;
  scale: number;
  attachmentPoint: 'rightHand' | 'leftHand' | 'back' | 'hip' | 'head';
  
  // Effects
  trailEffect?: boolean;
  hitEffect?: string;
  muzzleFlash?: boolean;
  projectileEffect?: string;
}

// Default weapon configurations
export const WEAPON_PRESETS: Record<string, WeaponConfig> = {
  // Melee
  woodenSword: {
    name: 'Wooden Sword',
    type: 'sword',
    damageType: 'physical',
    damage: 10,
    attackSpeed: 1.5,
    range: 2,
    accuracy: 0.9,
    criticalChance: 0.05,
    criticalMultiplier: 2,
    knockback: 5,
    stunChance: 0,
    bleedChance: 0,
    burnChance: 0,
    freezeChance: 0,
    scale: 1,
    attachmentPoint: 'rightHand',
    trailEffect: true,
    hitEffect: 'sparkles',
  },
  
  ironSword: {
    name: 'Iron Sword',
    type: 'sword',
    damageType: 'physical',
    damage: 25,
    attackSpeed: 1.2,
    range: 2.5,
    accuracy: 0.85,
    criticalChance: 0.1,
    criticalMultiplier: 2.5,
    knockback: 10,
    stunChance: 0.05,
    bleedChance: 0.1,
    burnChance: 0,
    freezeChance: 0,
    scale: 1,
    attachmentPoint: 'rightHand',
    trailEffect: true,
    hitEffect: 'sparkles',
  },
  
  fireSword: {
    name: 'Flame Sword',
    type: 'sword',
    damageType: 'fire',
    damage: 35,
    attackSpeed: 1.0,
    range: 2.5,
    accuracy: 0.8,
    criticalChance: 0.15,
    criticalMultiplier: 3,
    knockback: 8,
    stunChance: 0.1,
    bleedChance: 0,
    burnChance: 0.5,
    freezeChance: 0,
    scale: 1,
    attachmentPoint: 'rightHand',
    trailEffect: true,
    hitEffect: 'fire',
  },
  
  battleAxe: {
    name: 'Battle Axe',
    type: 'axe',
    damageType: 'physical',
    damage: 40,
    attackSpeed: 0.7,
    range: 2,
    accuracy: 0.7,
    criticalChance: 0.2,
    criticalMultiplier: 3.5,
    knockback: 25,
    stunChance: 0.2,
    bleedChance: 0.3,
    burnChance: 0,
    freezeChance: 0,
    scale: 1.2,
    attachmentPoint: 'rightHand',
    trailEffect: true,
    hitEffect: 'blood',
  },
  
  warHammer: {
    name: 'War Hammer',
    type: 'hammer',
    damageType: 'physical',
    damage: 50,
    attackSpeed: 0.5,
    range: 2.5,
    accuracy: 0.6,
    criticalChance: 0.25,
    criticalMultiplier: 4,
    knockback: 40,
    stunChance: 0.4,
    bleedChance: 0.1,
    burnChance: 0,
    freezeChance: 0,
    scale: 1.3,
    attachmentPoint: 'rightHand',
    trailEffect: false,
    hitEffect: 'sparkles',
  },
  
  iceStaff: {
    name: 'Ice Staff',
    type: 'staff',
    damageType: 'ice',
    damage: 30,
    attackSpeed: 1.0,
    range: 10,
    accuracy: 0.9,
    criticalChance: 0.15,
    criticalMultiplier: 2.5,
    knockback: 15,
    stunChance: 0.1,
    bleedChance: 0,
    burnChance: 0,
    freezeChance: 0.4,
    scale: 1,
    attachmentPoint: 'rightHand',
    trailEffect: true,
    hitEffect: 'sparkles',
    projectileEffect: 'magic',
  },
  
  // Ranged
  huntingBow: {
    name: 'Hunting Bow',
    type: 'bow',
    damageType: 'physical',
    damage: 20,
    attackSpeed: 1.0,
    range: 50,
    accuracy: 0.85,
    criticalChance: 0.15,
    criticalMultiplier: 2.5,
    knockback: 5,
    stunChance: 0,
    bleedChance: 0.2,
    burnChance: 0,
    freezeChance: 0,
    maxAmmo: 30,
    reloadTime: 2,
    projectileSpeed: 50,
    scale: 1,
    attachmentPoint: 'leftHand',
    trailEffect: true,
    hitEffect: 'blood',
  },
  
  assaultRifle: {
    name: 'Assault Rifle',
    type: 'rifle',
    damageType: 'physical',
    damage: 20,
    attackSpeed: 8.0,
    range: 80,
    accuracy: 0.8,
    criticalChance: 0.08,
    criticalMultiplier: 2,
    knockback: 8,
    stunChance: 0.02,
    bleedChance: 0.1,
    burnChance: 0,
    freezeChance: 0,
    maxAmmo: 30,
    reloadTime: 2.5,
    projectileSpeed: 300,
    scale: 0.8,
    attachmentPoint: 'rightHand',
    muzzleFlash: true,
    hitEffect: 'sparkles',
  },
  
  shotgun: {
    name: 'Shotgun',
    type: 'shotgun',
    damageType: 'physical',
    damage: 80,
    attackSpeed: 0.8,
    range: 15,
    accuracy: 0.5,
    criticalChance: 0.05,
    criticalMultiplier: 1.5,
    knockback: 30,
    stunChance: 0.2,
    bleedChance: 0.3,
    burnChance: 0,
    freezeChance: 0,
    maxAmmo: 8,
    reloadTime: 4,
    projectileSpeed: 150,
    scale: 0.9,
    attachmentPoint: 'rightHand',
    muzzleFlash: true,
    hitEffect: 'explosion',
  },
};

// Active weapon instance
export interface ActiveWeapon {
  config: WeaponConfig;
  mesh: THREE.Object3D;
  currentAmmo: number;
  isReloading: boolean;
  lastAttackTime: number;
  hitParticles?: ParticleEmitter;
  trailParticles?: ParticleEmitter;
}

// Weapon Manager
export class WeaponManager {
  private weapons: Map<string, ActiveWeapon> = new Map();
  private activeWeaponId: string | null = null;
  private scene: THREE.Scene;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }
  
  createWeapon(id: string, config: WeaponConfig): ActiveWeapon {
    // Create mesh (placeholder if no model)
    const mesh = this.createPlaceholderMesh(config.type);
    mesh.scale.multiplyScalar(config.scale);
    mesh.userData = { weaponId: id, config };
    
    const weapon: ActiveWeapon = {
      config,
      mesh,
      currentAmmo: config.maxAmmo || Infinity,
      isReloading: false,
      lastAttackTime: 0,
    };
    
    // Create hit particles
    if (config.hitEffect) {
      weapon.hitParticles = createParticlePreset(config.hitEffect as 'fire' | 'sparkles' | 'explosion');
      weapon.hitParticles.stop();
    }
    
    this.weapons.set(id, weapon);
    return weapon;
  }
  
  private createPlaceholderMesh(type: WeaponType): THREE.Group {
    const group = new THREE.Group();
    
    let geometry: THREE.BufferGeometry;
    const material = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.8,
      roughness: 0.2,
    });
    
    switch (type) {
      case 'sword':
      case 'dagger':
        geometry = new THREE.BoxGeometry(0.05, 1, 0.02);
        const blade = new THREE.Mesh(geometry, material);
        blade.position.y = 0.5;
        group.add(blade);
        const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.position.y = -0.1;
        group.add(handle);
        break;
        
      case 'axe':
        geometry = new THREE.CylinderGeometry(0.03, 0.03, 1);
        const axeHandle = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x4a3728 }));
        axeHandle.position.y = 0.5;
        group.add(axeHandle);
        const headGeo = new THREE.BoxGeometry(0.2, 0.15, 0.05);
        const head = new THREE.Mesh(headGeo, material);
        head.position.set(0.1, 0.9, 0);
        group.add(head);
        break;
        
      case 'hammer':
        geometry = new THREE.CylinderGeometry(0.03, 0.03, 1.2);
        const hammerHandle = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x4a3728 }));
        hammerHandle.position.y = 0.6;
        group.add(hammerHandle);
        const hammerHeadGeo = new THREE.BoxGeometry(0.15, 0.25, 0.15);
        const hammerHead = new THREE.Mesh(hammerHeadGeo, material);
        hammerHead.position.y = 1.2;
        group.add(hammerHead);
        break;
        
      case 'staff':
      case 'wand':
        geometry = new THREE.CylinderGeometry(0.03, 0.04, 1.8);
        const staffMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x5a4a3a }));
        staffMesh.position.y = 0.9;
        group.add(staffMesh);
        const crystalGeo = new THREE.OctahedronGeometry(0.1);
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x6666ff,
          emissive: 0x3333aa,
          emissiveIntensity: 0.5,
        });
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        crystal.position.y = 1.85;
        group.add(crystal);
        break;
        
      case 'bow':
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-0.5, -0.7, 0),
          new THREE.Vector3(0, -0.5, 0.3),
          new THREE.Vector3(0.5, -0.7, 0)
        );
        const bowGeo = new THREE.TubeGeometry(curve, 20, 0.02, 8);
        const bowMesh = new THREE.Mesh(bowGeo, new THREE.MeshStandardMaterial({ color: 0x5a4a3a }));
        group.add(bowMesh);
        break;
        
      case 'pistol':
      case 'rifle':
      case 'shotgun':
        geometry = new THREE.BoxGeometry(0.05, 0.1, 0.3);
        const gunBody = new THREE.Mesh(geometry, material);
        group.add(gunBody);
        const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2);
        const barrel = new THREE.Mesh(barrelGeo, material);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.25;
        group.add(barrel);
        break;
        
      default:
        geometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
        group.add(new THREE.Mesh(geometry, material));
    }
    
    return group;
  }
  
  attack(
    weaponId: string, 
    origin: THREE.Vector3, 
    direction: THREE.Vector3
  ): {
    damage: number;
    isCritical: boolean;
    effects: string[];
  } {
    const weapon = this.weapons.get(weaponId);
    if (!weapon) {
      return { damage: 0, isCritical: false, effects: [] };
    }
    
    const { config } = weapon;
    const now = performance.now() / 1000;
    const cooldown = 1 / config.attackSpeed;
    
    if (now - weapon.lastAttackTime < cooldown) {
      return { damage: 0, isCritical: false, effects: [] };
    }
    
    if (config.maxAmmo && weapon.currentAmmo <= 0) {
      this.reload(weaponId);
      return { damage: 0, isCritical: false, effects: ['reload'] };
    }
    
    weapon.lastAttackTime = now;
    if (config.maxAmmo) {
      weapon.currentAmmo--;
    }
    
    const isCritical = Math.random() < config.criticalChance;
    let damage = config.damage;
    if (isCritical) {
      damage *= config.criticalMultiplier;
    }
    
    const effects: string[] = [];
    if (isCritical) effects.push('critical');
    if (Math.random() < config.stunChance) effects.push('stun');
    if (Math.random() < config.bleedChance) effects.push('bleed');
    if (Math.random() < config.burnChance) effects.push('burn');
    if (Math.random() < config.freezeChance) effects.push('freeze');
    
    if (weapon.hitParticles) {
      weapon.hitParticles.object3D.position.copy(origin).add(direction.clone().multiplyScalar(config.range));
      weapon.hitParticles.emit(20);
    }
    
    return { damage, isCritical, effects };
  }
  
  reload(weaponId: string): boolean {
    const weapon = this.weapons.get(weaponId);
    if (!weapon || !weapon.config.maxAmmo || weapon.isReloading) {
      return false;
    }
    
    weapon.isReloading = true;
    
    setTimeout(() => {
      if (weapon) {
        weapon.currentAmmo = weapon.config.maxAmmo || 0;
        weapon.isReloading = false;
      }
    }, (weapon.config.reloadTime || 2) * 1000);
    
    return true;
  }
  
  getWeapon(id: string): ActiveWeapon | undefined {
    return this.weapons.get(id);
  }
  
  getActiveWeapon(): ActiveWeapon | null {
    if (!this.activeWeaponId) return null;
    return this.weapons.get(this.activeWeaponId) || null;
  }
  
  setActiveWeapon(id: string): void {
    this.activeWeaponId = id;
  }
  
  attachToCharacter(
    weaponId: string, 
    character: THREE.Object3D
  ): void {
    const weapon = this.weapons.get(weaponId);
    if (!weapon) return;
    character.add(weapon.mesh);
  }
  
  update(deltaTime: number): void {
    this.weapons.forEach(weapon => {
      if (weapon.hitParticles) {
        weapon.hitParticles.update(deltaTime);
      }
      if (weapon.trailParticles) {
        weapon.trailParticles.update(deltaTime);
      }
    });
  }
  
  dispose(): void {
    this.weapons.forEach(weapon => {
      weapon.mesh.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.dispose();
          const { material } = mesh;
          if (Array.isArray(material)) {
            material.forEach(m => m.dispose());
          } else {
            material.dispose();
          }
        }
      });
      weapon.hitParticles?.dispose();
      weapon.trailParticles?.dispose();
    });
    this.weapons.clear();
  }
}
