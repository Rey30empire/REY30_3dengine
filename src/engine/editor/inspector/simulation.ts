'use client';

export type AddableSimulationComponent = 'Collider' | 'Rigidbody' | 'ParticleSystem';

export const SIMULATION_COMPONENT_DEFAULTS: Record<
  AddableSimulationComponent,
  Record<string, unknown>
> = {
  Collider: {
    type: 'box',
    isTrigger: false,
    center: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1, z: 1 },
    radius: 0.5,
    height: 1,
  },
  Rigidbody: {
    mass: 1,
    drag: 0,
    angularDrag: 0.05,
    useGravity: true,
    isKinematic: false,
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
  },
  ParticleSystem: {
    presetId: null,
    simulationBackend: 'auto',
    rate: 24,
    maxParticles: 800,
    duration: 3,
    looping: true,
    shape: 'sphere',
    radius: 0.35,
    speedMin: 0.6,
    speedMax: 1.8,
    startSizeMin: 0.12,
    startSizeMax: 0.24,
    endSizeMin: 0,
    endSizeMax: 0.08,
    gravity: -0.6,
    blendMode: 'additive',
    startColor: { r: 1, g: 0.78, b: 0.22 },
    endColor: { r: 1, g: 0.24, b: 0.08 },
  },
};
