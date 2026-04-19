import * as THREE from 'three';
import { ParticleEmitter } from '@/engine/rendering/ParticleSystem';
import {
  GPUParticleSystem,
  type GPUParticleConfig,
  type GPUEmitter,
} from '@/engine/rendering/GPUParticleSystem';
import { getParticlePresetRegistryEntry } from '@/engine/rendering/particlePresetRegistry';

export type ParticlePreviewBackend = 'cpu' | 'gpu';
export type ParticlePreviewBackendPreference = 'auto' | ParticlePreviewBackend;

export interface ParticlePreviewConfig {
  presetId: string | null;
  simulationBackend: ParticlePreviewBackendPreference;
  rate: number;
  maxParticles: number;
  burstCount: number;
  duration: number;
  looping: boolean;
  shape: 'point' | 'sphere' | 'cone' | 'box' | 'circle';
  radius: number;
  speedMin: number;
  speedMax: number;
  direction: 'up' | 'down' | 'outward' | 'random' | 'forward';
  lifetimeMin: number;
  lifetimeMax: number;
  startSizeMin: number;
  startSizeMax: number;
  endSizeMin: number;
  endSizeMax: number;
  gravity: number;
  drag: number;
  blendMode: 'additive' | 'alpha' | 'multiply' | 'screen';
  startColor: THREE.Color;
  endColor: THREE.Color;
  startAlpha: number;
  endAlpha: number;
  noiseStrength: number;
  noiseFrequency: number;
}

export interface ParticlePreviewHandle {
  backend: ParticlePreviewBackend;
  object3D: THREE.Object3D;
  update(deltaSeconds: number): void;
  play(): void;
  stop(): void;
  clear(): void;
  dispose(): void;
}

export interface ParticlePreviewRuntimeContext {
  gpuSystem: GPUParticleSystem | null;
}

export function resolveParticlePreviewBackend(
  config: ParticlePreviewConfig,
  context: ParticlePreviewRuntimeContext
): ParticlePreviewBackend {
  const presetEntry = getParticlePresetRegistryEntry(config.presetId);
  const preference = config.simulationBackend;

  if (preference === 'cpu') {
    return 'cpu';
  }
  if (preference === 'gpu') {
    return context.gpuSystem ? 'gpu' : 'cpu';
  }
  if (!context.gpuSystem) {
    return 'cpu';
  }
  if (presetEntry?.previewBackend === 'gpu') {
    return 'gpu';
  }
  if (
    config.maxParticles >= 900 ||
    config.rate >= 100 ||
    config.burstCount >= 60 ||
    config.noiseStrength >= 0.45
  ) {
    return 'gpu';
  }
  return 'cpu';
}

function createCpuParticlePreviewHandle(config: ParticlePreviewConfig): ParticlePreviewHandle {
  const emitter = new ParticleEmitter({
    rate: config.rate,
    maxParticles: config.maxParticles,
    burstCount: config.burstCount > 0 ? config.burstCount : undefined,
    lifetimeMin: config.lifetimeMin,
    lifetimeMax: config.lifetimeMax,
    shape: config.shape,
    radius: config.radius,
    speedMin: config.speedMin,
    speedMax: config.speedMax,
    direction: config.direction,
    startSizeMin: config.startSizeMin,
    startSizeMax: config.startSizeMax,
    endSizeMin: config.endSizeMin,
    endSizeMax: config.endSizeMax,
    startColor: config.startColor,
    endColor: config.endColor,
    startAlpha: config.startAlpha,
    endAlpha: config.endAlpha,
    gravity: config.gravity,
    drag: config.drag,
    blendMode: config.blendMode,
    noiseStrength: config.noiseStrength,
    noiseFrequency: config.noiseFrequency,
    emitOnWake: true,
  });

  return {
    backend: 'cpu',
    object3D: emitter.object3D,
    update(deltaSeconds) {
      emitter.update(deltaSeconds);
    },
    play() {
      emitter.play();
    },
    stop() {
      emitter.stop();
    },
    clear() {
      emitter.clear();
    },
    dispose() {
      emitter.dispose();
    },
  };
}

function buildGpuParticleConfig(config: ParticlePreviewConfig): Partial<GPUParticleConfig> {
  return {
    maxParticles: config.maxParticles,
    rate: config.rate,
    burstCount: config.burstCount > 0 ? config.burstCount : undefined,
    lifetimeMin: config.lifetimeMin,
    lifetimeMax: config.lifetimeMax,
    shape: config.shape,
    radius: config.radius,
    speedMin: config.speedMin,
    speedMax: config.speedMax,
    direction:
      config.direction === 'down' ? 'up' : config.direction,
    inheritVelocity: 0,
    sizeCurve: [1, 0.65, 0],
    startSizeMin: config.startSizeMin,
    startSizeMax: config.startSizeMax,
    colorGradient: [config.startColor, config.endColor],
    alphaCurve: [
      config.startAlpha,
      Math.max(config.endAlpha, config.startAlpha * 0.55),
      config.endAlpha,
    ],
    rotationMin: 0,
    rotationMax: Math.PI * 2,
    angularVelocityMin: -2,
    angularVelocityMax: 2,
    gravity: new THREE.Vector3(0, config.gravity, 0),
    drag: config.drag,
    wind: new THREE.Vector3(0, 0, 0),
    turbulence: config.noiseStrength,
    turbulenceFrequency: config.noiseFrequency,
    collisionEnabled: false,
    collisionRadius: 0.1,
    bounce: 0,
    blendMode: config.blendMode,
    renderMode:
      config.direction === 'forward' || config.direction === 'down'
        ? 'stretched'
        : 'billboard',
    stretchFactor:
      config.direction === 'forward' || config.direction === 'down' ? 2.5 : 1,
    sortMode: 'none',
    trailsEnabled: false,
    trailLength: 8,
    trailWidth: 0.06,
    trailFade: true,
  };
}

function createGpuParticlePreviewHandle(
  config: ParticlePreviewConfig,
  gpuSystem: GPUParticleSystem
): ParticlePreviewHandle {
  const helper = new THREE.Group();
  const emitter = gpuSystem.createEmitter(buildGpuParticleConfig(config));
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  const syncEmitterTransform = () => {
    helper.updateWorldMatrix(true, false);
    helper.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    emitter.setPosition(worldPosition);
    emitter.setRotation(worldQuaternion);
  };

  return {
    backend: 'gpu',
    object3D: helper,
    update() {
      syncEmitterTransform();
    },
    play() {
      emitter.play();
    },
    stop() {
      emitter.stop();
    },
    clear() {
      emitter.stop();
      emitter.play();
    },
    dispose() {
      gpuSystem.destroyEmitter(emitter);
    },
  };
}

export function createParticlePreviewHandle(
  config: ParticlePreviewConfig,
  context: ParticlePreviewRuntimeContext
): ParticlePreviewHandle {
  const backend = resolveParticlePreviewBackend(config, context);
  if (backend === 'gpu' && context.gpuSystem) {
    return createGpuParticlePreviewHandle(config, context.gpuSystem);
  }
  return createCpuParticlePreviewHandle(config);
}
