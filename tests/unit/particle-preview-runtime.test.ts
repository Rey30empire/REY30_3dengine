import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveParticlePreviewBackend } from '@/engine/editor/particlePreviewRuntime';

const baseConfig = {
  presetId: null,
  simulationBackend: 'auto' as const,
  rate: 24,
  maxParticles: 300,
  burstCount: 0,
  duration: 3,
  looping: true,
  shape: 'sphere' as const,
  radius: 0.35,
  speedMin: 0.6,
  speedMax: 1.8,
  direction: 'up' as const,
  lifetimeMin: 0.8,
  lifetimeMax: 3,
  startSizeMin: 0.12,
  startSizeMax: 0.24,
  endSizeMin: 0,
  endSizeMax: 0.08,
  gravity: -0.6,
  drag: 0,
  blendMode: 'additive' as const,
  startColor: new THREE.Color(1, 0.8, 0.2),
  endColor: new THREE.Color(1, 0.2, 0.08),
  startAlpha: 1,
  endAlpha: 0,
  noiseStrength: 0,
  noiseFrequency: 1,
};

describe('particlePreviewRuntime', () => {
  it('falls back to CPU when GPU is unavailable', () => {
    expect(
      resolveParticlePreviewBackend(
        { ...baseConfig, presetId: 'rain' },
        { gpuSystem: null }
      )
    ).toBe('cpu');
  });

  it('respects explicit CPU preference even when GPU exists', () => {
    expect(
      resolveParticlePreviewBackend(
        { ...baseConfig, simulationBackend: 'cpu' },
        { gpuSystem: {} as never }
      )
    ).toBe('cpu');
  });

  it('uses GPU for presets marked as GPU-backed when available', () => {
    expect(
      resolveParticlePreviewBackend(
        { ...baseConfig, presetId: 'rain' },
        { gpuSystem: {} as never }
      )
    ).toBe('gpu');
  });

  it('uses GPU heuristics for heavy custom particle configurations', () => {
    expect(
      resolveParticlePreviewBackend(
        { ...baseConfig, presetId: null, maxParticles: 1600, rate: 180 },
        { gpuSystem: {} as never }
      )
    ).toBe('gpu');
  });
});
