// ============================================
// Terrain Generator - Procedural Terrain System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import type { TerrainData, TerrainLayer } from '@/types/engine';
import { v4 as uuidv4 } from 'uuid';

// Noise functions for terrain generation
export class NoiseGenerator {
  private permutation: number[];

  constructor(seed: number = 0) {
    this.permutation = this.generatePermutation(seed);
  }

  private generatePermutation(seed: number): number[] {
    const perm: number[] = [];
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }

    // Shuffle using seed
    let random = this.seededRandom(seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    return [...perm, ...perm];
  }

  private seededRandom(seed: number): () => number {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // 2D Perlin noise
  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const A = this.permutation[X] + Y;
    const B = this.permutation[X + 1] + Y;

    return this.lerp(
      this.lerp(
        this.grad(this.permutation[A], x, y),
        this.grad(this.permutation[B], x - 1, y),
        u
      ),
      this.lerp(
        this.grad(this.permutation[A + 1], x, y - 1),
        this.grad(this.permutation[B + 1], x - 1, y - 1),
        u
      ),
      v
    );
  }

  // Fractal Brownian Motion (fBm)
  fbm(x: number, y: number, octaves: number = 6, lacunarity: number = 2, persistence: number = 0.5): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }

  // Ridged noise for mountains
  ridgedNoise(x: number, y: number, octaves: number = 6): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let weight = 1;

    for (let i = 0; i < octaves; i++) {
      let signal = this.noise2D(x * frequency, y * frequency);
      signal = 1.0 - Math.abs(signal);
      signal *= signal * weight;
      weight = Math.min(1, Math.max(0, signal * 2));
      value += signal * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value;
  }
}

// Terrain Generator Class
export class TerrainGenerator {
  private noise: NoiseGenerator;

  constructor(seed: number = 0) {
    this.noise = new NoiseGenerator(seed);
  }

  // Generate heightmap
  generateHeightmap(
    width: number,
    height: number,
    scale: number = 0.01,
    octaves: number = 6,
    heightMultiplier: number = 100
  ): number[] {
    const heightmap: number[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x * scale;
        const ny = y * scale;

        // Combine different noise types for interesting terrain
        let elevation = this.noise.fbm(nx, ny, octaves);

        // Add ridged noise for mountains
        elevation += this.noise.ridgedNoise(nx * 0.5, ny * 0.5, 4) * 0.3;

        // Normalize and multiply
        elevation = (elevation + 1) * 0.5 * heightMultiplier;

        heightmap.push(elevation);
      }
    }

    return heightmap;
  }

  // Apply erosion simulation (simplified hydraulic erosion)
  applyErosion(heightmap: number[], width: number, height: number, iterations: number = 100): number[] {
    const result = [...heightmap];
    const erosionStrength = 0.01;

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const current = result[idx];

          // Find lowest neighbor
          const neighbors = [
            result[idx - 1], // left
            result[idx + 1], // right
            result[idx - width], // top
            result[idx + width], // bottom
          ];

          const lowest = Math.min(...neighbors);

          // Erode towards lowest neighbor
          if (current > lowest) {
            const diff = current - lowest;
            result[idx] -= diff * erosionStrength;
          }
        }
      }
    }

    return result;
  }

  // Create Three.js terrain mesh
  createTerrainMesh(
    width: number,
    depth: number,
    segments: number,
    heightmap: number[],
    heightMultiplier: number = 1
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, depth, segments - 1, segments - 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position.array;

    // Apply heightmap to vertices
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const vertexIndex = (i * segments + j) * 3;
        const heightIndex = i * segments + j;

        if (heightIndex < heightmap.length) {
          positions[vertexIndex + 1] = heightmap[heightIndex] * heightMultiplier;
        }
      }
    }

    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;

    // Create material with vertex colors based on height
    const colors = new Float32Array(positions.length);
    for (let i = 0; i < positions.length / 3; i++) {
      const height = positions[i * 3 + 1];
      const normalizedHeight = Math.max(0, Math.min(1, height / 100));

      // Color gradient based on height
      if (normalizedHeight < 0.3) {
        // Water/low ground - blue to green
        colors[i * 3] = 0.2;
        colors[i * 3 + 1] = 0.5 + normalizedHeight;
        colors[i * 3 + 2] = 0.3;
      } else if (normalizedHeight < 0.6) {
        // Grass/forest - green
        colors[i * 3] = 0.2;
        colors[i * 3 + 1] = 0.6;
        colors[i * 3 + 2] = 0.2;
      } else if (normalizedHeight < 0.8) {
        // Rock - gray
        colors[i * 3] = 0.5;
        colors[i * 3 + 1] = 0.5;
        colors[i * 3 + 2] = 0.4;
      } else {
        // Snow - white
        colors[i * 3] = 0.9;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 0.95;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.0,
      roughness: 0.8,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'Terrain';

    return mesh;
  }

  // Generate complete terrain data
  generateTerrain(config: TerrainConfig): TerrainData {
    const { width, depth, segments, scale, octaves, heightMultiplier, erosionIterations, seed } = config;

    const noise = new NoiseGenerator(seed);
    let heightmap = this.generateHeightmap(segments, segments, scale, octaves, heightMultiplier);

    if (erosionIterations > 0) {
      heightmap = this.applyErosion(heightmap, segments, segments, erosionIterations);
    }

    return {
      width,
      height: heightMultiplier,
      depth,
      heightmap,
      layers: this.generateDefaultLayers(),
    };
  }

  private generateDefaultLayers(): TerrainLayer[] {
    return [
      {
        id: uuidv4(),
        name: 'Grass',
        textureId: 'grass',
        minHeight: 0,
        maxHeight: 30,
      },
      {
        id: uuidv4(),
        name: 'Rock',
        textureId: 'rock',
        minHeight: 30,
        maxHeight: 60,
      },
      {
        id: uuidv4(),
        name: 'Snow',
        textureId: 'snow',
        minHeight: 60,
        maxHeight: 100,
      },
    ];
  }
}

// Terrain Configuration
export interface TerrainConfig {
  width: number;
  depth: number;
  segments: number;
  scale: number;
  octaves: number;
  heightMultiplier: number;
  erosionIterations: number;
  seed: number;
}

// Default terrain configurations
export const TerrainPresets = {
  mountains: (): TerrainConfig => ({
    width: 200,
    depth: 200,
    segments: 128,
    scale: 0.02,
    octaves: 8,
    heightMultiplier: 150,
    erosionIterations: 200,
    seed: Math.random() * 10000,
  }),

  hills: (): TerrainConfig => ({
    width: 200,
    depth: 200,
    segments: 128,
    scale: 0.01,
    octaves: 6,
    heightMultiplier: 50,
    erosionIterations: 100,
    seed: Math.random() * 10000,
  }),

  plains: (): TerrainConfig => ({
    width: 200,
    depth: 200,
    segments: 128,
    scale: 0.005,
    octaves: 4,
    heightMultiplier: 20,
    erosionIterations: 50,
    seed: Math.random() * 10000,
  }),

  island: (): TerrainConfig => ({
    width: 200,
    depth: 200,
    segments: 128,
    scale: 0.015,
    octaves: 6,
    heightMultiplier: 80,
    erosionIterations: 150,
    seed: Math.random() * 10000,
  }),
};

// Biome System
export enum BiomeType {
  Desert = 'desert',
  Forest = 'forest',
  Tundra = 'tundra',
  Jungle = 'jungle',
  Ocean = 'ocean',
  Plains = 'plains',
  Mountains = 'mountains',
}

export interface BiomeConfig {
  type: BiomeType;
  temperature: number; // 0-1
  moisture: number; // 0-1
  height: number; // 0-1
  vegetationDensity: number;
  rockDensity: number;
  waterLevel: number;
}

export const BiomePresets: Record<BiomeType, BiomeConfig> = {
  [BiomeType.Desert]: {
    type: BiomeType.Desert,
    temperature: 0.9,
    moisture: 0.1,
    height: 0.3,
    vegetationDensity: 0.05,
    rockDensity: 0.3,
    waterLevel: 0,
  },
  [BiomeType.Forest]: {
    type: BiomeType.Forest,
    temperature: 0.5,
    moisture: 0.7,
    height: 0.4,
    vegetationDensity: 0.8,
    rockDensity: 0.1,
    waterLevel: 0.2,
  },
  [BiomeType.Tundra]: {
    type: BiomeType.Tundra,
    temperature: 0.1,
    moisture: 0.3,
    height: 0.5,
    vegetationDensity: 0.2,
    rockDensity: 0.4,
    waterLevel: 0.1,
  },
  [BiomeType.Jungle]: {
    type: BiomeType.Jungle,
    temperature: 0.8,
    moisture: 0.9,
    height: 0.3,
    vegetationDensity: 1.0,
    rockDensity: 0.05,
    waterLevel: 0.3,
  },
  [BiomeType.Ocean]: {
    type: BiomeType.Ocean,
    temperature: 0.5,
    moisture: 1.0,
    height: 0.0,
    vegetationDensity: 0,
    rockDensity: 0,
    waterLevel: 1.0,
  },
  [BiomeType.Plains]: {
    type: BiomeType.Plains,
    temperature: 0.5,
    moisture: 0.4,
    height: 0.2,
    vegetationDensity: 0.5,
    rockDensity: 0.05,
    waterLevel: 0.1,
  },
  [BiomeType.Mountains]: {
    type: BiomeType.Mountains,
    temperature: 0.3,
    moisture: 0.4,
    height: 0.8,
    vegetationDensity: 0.3,
    rockDensity: 0.6,
    waterLevel: 0.05,
  },
};

// Vegetation Scatter System
export class VegetationScatter {
  // Generate points for vegetation placement
  static generateScatterPoints(
    terrainWidth: number,
    terrainDepth: number,
    heightmap: number[],
    segments: number,
    density: number,
    minDistance: number
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const cellSize = Math.sqrt((terrainWidth * terrainDepth) / (segments * segments));

    // Poisson disk sampling approximation
    const gridSize = Math.ceil(Math.max(terrainWidth, terrainDepth) / minDistance);
    const grid: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));

    const numPoints = Math.floor(terrainWidth * terrainDepth * density);

    for (let i = 0; i < numPoints; i++) {
      let attempts = 0;
      while (attempts < 30) {
        const x = Math.random() * terrainWidth - terrainWidth / 2;
        const z = Math.random() * terrainDepth - terrainDepth / 2;

        const gridX = Math.floor((x + terrainWidth / 2) / minDistance);
        const gridZ = Math.floor((z + terrainDepth / 2) / minDistance);

        if (gridX >= 0 && gridX < gridSize && gridZ >= 0 && gridZ < gridSize) {
          if (!grid[gridX][gridZ]) {
            // Get height at this position
            const heightX = Math.floor((x + terrainWidth / 2) / terrainWidth * segments);
            const heightZ = Math.floor((z + terrainDepth / 2) / terrainDepth * segments);
            const heightIndex = heightZ * segments + heightX;
            const y = heightmap[heightIndex] || 0;

            points.push(new THREE.Vector3(x, y, z));
            grid[gridX][gridZ] = true;
            break;
          }
        }
        attempts++;
      }
    }

    return points;
  }
}
