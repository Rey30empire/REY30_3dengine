// ============================================
// Particle System - Visual Effects Engine
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import {
  PARTICLE_PRESET_REGISTRY,
  type ParticlePresetId,
} from './particlePresetRegistry';

export interface ParticleEmitterConfig {
  // Emission
  rate: number; // particles per second
  maxParticles: number;
  burstCount?: number; // emit all at once
  
  // Lifetime
  lifetimeMin: number;
  lifetimeMax: number;
  
  // Shape
  shape: 'point' | 'sphere' | 'cone' | 'box' | 'circle';
  radius: number;
  angle?: number; // for cone
  
  // Velocity
  speedMin: number;
  speedMax: number;
  direction: 'up' | 'down' | 'outward' | 'random' | 'forward';
  inheritVelocity: number; // 0-1
  
  // Size
  startSizeMin: number;
  startSizeMax: number;
  endSizeMin: number;
  endSizeMax: number;
  sizeCurve?: 'linear' | 'easeIn' | 'easeOut' | 'bounce';
  
  // Color
  startColor: THREE.Color;
  endColor: THREE.Color;
  colorCurve?: 'linear' | 'easeIn' | 'easeOut';
  
  // Alpha
  startAlpha: number;
  endAlpha: number;
  
  // Rotation
  rotationMin: number;
  rotationMax: number;
  angularVelocityMin: number;
  angularVelocityMax: number;
  
  // Physics
  gravity: number;
  drag: number;
  bounce: number;
  
  // Rendering
  blendMode: 'additive' | 'alpha' | 'multiply' | 'screen';
  texture?: string;
  renderMode: 'billboard' | 'stretched' | 'horizontal' | 'vertical' | 'mesh';
  sortOrder: 'oldestFirst' | 'youngestFirst' | 'distance';
  
  // Noise
  noiseStrength: number;
  noiseFrequency: number;
  
  // Triggers
  emitOnWake: boolean;
  autoDestroy: boolean;
  destroyWhenEmpty: boolean;
}

const DEFAULT_CONFIG: ParticleEmitterConfig = {
  rate: 10,
  maxParticles: 1000,
  lifetimeMin: 1,
  lifetimeMax: 3,
  shape: 'point',
  radius: 0.1,
  speedMin: 1,
  speedMax: 3,
  direction: 'up',
  inheritVelocity: 0,
  startSizeMin: 0.1,
  startSizeMax: 0.3,
  endSizeMin: 0,
  endSizeMax: 0.1,
  startColor: new THREE.Color(1, 1, 1),
  endColor: new THREE.Color(0.5, 0.5, 0.5),
  startAlpha: 1,
  endAlpha: 0,
  rotationMin: 0,
  rotationMax: 0,
  angularVelocityMin: 0,
  angularVelocityMax: 0,
  gravity: -9.8,
  drag: 0,
  bounce: 0,
  blendMode: 'additive',
  renderMode: 'billboard',
  sortOrder: 'youngestFirst',
  noiseStrength: 0,
  noiseFrequency: 1,
  emitOnWake: true,
  autoDestroy: false,
  destroyWhenEmpty: false,
};

// Particle data structure
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  size: number;
  startSize: number;
  endSize: number;
  rotation: number;
  angularVelocity: number;
  color: THREE.Color;
  startColor: THREE.Color;
  endColor: THREE.Color;
  alpha: number;
  startAlpha: number;
  endAlpha: number;
  alive: boolean;
}

// Main Particle Emitter Class
export class ParticleEmitter {
  private config: ParticleEmitterConfig;
  private particles: Particle[];
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private emitAccumulator: number = 0;
  private time: number = 0;
  
  public readonly object3D: THREE.Points;
  public isPlaying: boolean = true;
  
  constructor(config: Partial<ParticleEmitterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.particles = [];
    
    // Create geometry
    this.geometry = new THREE.BufferGeometry();
    
    // Initialize buffers
    const positions = new Float32Array(this.config.maxParticles * 3);
    const colors = new Float32Array(this.config.maxParticles * 3);
    const sizes = new Float32Array(this.config.maxParticles);
    const alphas = new Float32Array(this.config.maxParticles);
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    
    // Create material
    this.material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: this.getBlendMode(),
      depthWrite: false,
    });
    
    // Create points
    this.points = new THREE.Points(this.geometry, this.material);
    this.object3D = this.points;
    
    // Emit initial burst
    if (this.config.emitOnWake && this.config.burstCount) {
      this.emit(this.config.burstCount);
    }
  }
  
  private getBlendMode(): THREE.Blending {
    switch (this.config.blendMode) {
      case 'additive': return THREE.AdditiveBlending;
      case 'multiply': return THREE.MultiplyBlending;
      case 'screen': return THREE.NormalBlending;
      default: return THREE.NormalBlending;
    }
  }
  
  emit(count: number = 1): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.config.maxParticles) break;
      
      const particle = this.createParticle();
      this.particles.push(particle);
    }
  }
  
  private createParticle(): Particle {
    const { config } = this;
    
    // Random values
    const lifetime = config.lifetimeMin + Math.random() * (config.lifetimeMax - config.lifetimeMin);
    const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
    const startSize = config.startSizeMin + Math.random() * (config.startSizeMax - config.startSizeMin);
    const endSize = config.endSizeMin + Math.random() * (config.endSizeMax - config.endSizeMin);
    const rotation = config.rotationMin + Math.random() * (config.rotationMax - config.rotationMin);
    const angularVelocity = config.angularVelocityMin + Math.random() * (config.angularVelocityMax - config.angularVelocityMin);
    
    // Position based on shape
    const position = new THREE.Vector3();
    switch (config.shape) {
      case 'sphere':
        position.setFromSphericalCoords(
          config.radius,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI
        );
        break;
      case 'cone':
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * config.radius;
        position.set(
          Math.cos(angle) * dist,
          0,
          Math.sin(angle) * dist
        );
        break;
      case 'box':
        position.set(
          (Math.random() - 0.5) * config.radius * 2,
          (Math.random() - 0.5) * config.radius * 2,
          (Math.random() - 0.5) * config.radius * 2
        );
        break;
      case 'circle':
        const circleAngle = Math.random() * Math.PI * 2;
        position.set(
          Math.cos(circleAngle) * config.radius,
          0,
          Math.sin(circleAngle) * config.radius
        );
        break;
      default:
        position.set(0, 0, 0);
    }
    
    // Velocity
    const velocity = new THREE.Vector3();
    switch (config.direction) {
      case 'up':
        velocity.set(0, speed, 0);
        break;
      case 'down':
        velocity.set(0, -speed, 0);
        break;
      case 'outward':
        velocity.copy(position).normalize().multiplyScalar(speed);
        break;
      case 'forward':
        velocity.set(0, 0, speed);
        break;
      case 'random':
        velocity.set(
          (Math.random() - 0.5) * 2 * speed,
          (Math.random() - 0.5) * 2 * speed,
          (Math.random() - 0.5) * 2 * speed
        );
        break;
    }
    
    // Add emitter transform
    position.add(this.object3D.position);
    
    return {
      position,
      velocity,
      acceleration: new THREE.Vector3(0, config.gravity, 0),
      lifetime,
      maxLifetime: lifetime,
      size: startSize,
      startSize,
      endSize,
      rotation,
      angularVelocity,
      color: config.startColor.clone(),
      startColor: config.startColor.clone(),
      endColor: config.endColor.clone(),
      alpha: config.startAlpha,
      startAlpha: config.startAlpha,
      endAlpha: config.endAlpha,
      alive: true,
    };
  }
  
  update(deltaTime: number): void {
    const { config } = this;
    this.time += deltaTime;
    
    // Emit new particles
    if (this.isPlaying) {
      this.emitAccumulator += deltaTime * config.rate;
      while (this.emitAccumulator >= 1) {
        this.emit(1);
        this.emitAccumulator -= 1;
      }
    }
    
    // Update particles
    const positions = this.geometry.attributes.position.array as Float32Array;
    const colors = this.geometry.attributes.color.array as Float32Array;
    const sizes = this.geometry.attributes.size.array as Float32Array;
    
    let aliveCount = 0;
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      
      if (!particle.alive) {
        this.particles.splice(i, 1);
        continue;
      }
      
      // Update lifetime
      particle.lifetime -= deltaTime;
      if (particle.lifetime <= 0) {
        particle.alive = false;
        continue;
      }
      
      // Update physics
      particle.velocity.add(particle.acceleration.clone().multiplyScalar(deltaTime));
      particle.velocity.multiplyScalar(1 - config.drag * deltaTime);
      particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
      
      // Update rotation
      particle.rotation += particle.angularVelocity * deltaTime;
      
      // Calculate life progress (0 = start, 1 = end)
      const lifeProgress = 1 - (particle.lifetime / particle.maxLifetime);
      
      // Update size
      particle.size = THREE.MathUtils.lerp(particle.startSize, particle.endSize, lifeProgress);
      
      // Update color
      particle.color.lerpColors(particle.startColor, particle.endColor, lifeProgress);
      
      // Update alpha
      particle.alpha = THREE.MathUtils.lerp(particle.startAlpha, particle.endAlpha, lifeProgress);
      
      // Write to buffers
      const idx = aliveCount * 3;
      positions[idx] = particle.position.x - this.object3D.position.x;
      positions[idx + 1] = particle.position.y - this.object3D.position.y;
      positions[idx + 2] = particle.position.z - this.object3D.position.z;
      
      colors[idx] = particle.color.r;
      colors[idx + 1] = particle.color.g;
      colors[idx + 2] = particle.color.b;
      
      sizes[aliveCount] = particle.size;
      
      aliveCount++;
    }
    
    // Update geometry
    this.geometry.setDrawRange(0, aliveCount);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }
  
  play(): void {
    this.isPlaying = true;
  }
  
  stop(): void {
    this.isPlaying = false;
  }
  
  clear(): void {
    this.particles = [];
  }
  
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export const PARTICLE_PRESETS: Record<ParticlePresetId, Partial<ParticleEmitterConfig>> =
  Object.fromEntries(
    PARTICLE_PRESET_REGISTRY.map((entry) => [entry.id, entry.params])
  ) as Record<ParticlePresetId, Partial<ParticleEmitterConfig>>;

// Helper to create preset emitter
export function createParticlePreset(
  preset: ParticlePresetId,
  position?: THREE.Vector3
): ParticleEmitter {
  const emitter = new ParticleEmitter(PARTICLE_PRESETS[preset]);
  if (position) {
    emitter.object3D.position.copy(position);
  }
  return emitter;
}
