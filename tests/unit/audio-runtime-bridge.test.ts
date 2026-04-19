import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Asset, Component, Entity, Scene } from '@/types/engine';
import {
  AudioRuntimeBridge,
  type RuntimeAudioEngine,
  type RuntimeAudioSourceHandle,
} from '@/engine/audio/audioRuntimeBridge';
import { useEngineStore } from '@/store/editorStore';

class FakeAudioSource implements RuntimeAudioSourceHandle {
  playCount = 0;
  stopCount = 0;
  playing = false;
  volume = 1;
  pitch = 1;
  loop = false;
  group = 'sfx';
  spatial = false;
  spatialOptions: { minDistance?: number; maxDistance?: number; rolloffFactor?: number } = {};
  position = new THREE.Vector3();

  play(): void {
    this.playCount += 1;
    this.playing = true;
  }

  stop(): void {
    this.stopCount += 1;
    this.playing = false;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  setPitch(pitch: number): void {
    this.pitch = pitch;
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  setGroup(group: string): void {
    this.group = group;
  }

  set3D(
    enabled: boolean,
    options?: { minDistance?: number; maxDistance?: number; rolloffFactor?: number }
  ): void {
    this.spatial = enabled;
    this.spatialOptions = options ?? {};
  }

  setPosition(position: THREE.Vector3): void {
    this.position.copy(position);
  }
}

class FakeAudioEngine implements RuntimeAudioEngine {
  initialized = 0;
  resumed = 0;
  loadedUrls: string[] = [];
  removedSourceIds: string[] = [];
  lastCamera: THREE.Camera | null = null;
  readonly sources = new Map<string, FakeAudioSource>();

  async initialize(): Promise<void> {
    this.initialized += 1;
  }

  async resume(): Promise<void> {
    this.resumed += 1;
  }

  async loadAudio(url: string): Promise<unknown> {
    this.loadedUrls.push(url);
    return { url };
  }

  createSource(id: string): FakeAudioSource {
    const source = new FakeAudioSource();
    this.sources.set(id, source);
    return source;
  }

  removeSource(id: string): void {
    this.removedSourceIds.push(id);
    this.sources.delete(id);
  }

  update(_deltaTime: number, camera: THREE.Camera): void {
    this.lastCamera = camera;
  }
}

function makeTransformComponent(position: { x: number; y: number; z: number }): Component {
  return {
    id: `transform-${position.x}-${position.y}-${position.z}`,
    type: 'Transform',
    enabled: true,
    data: {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

function makeAudioEntity(): Entity {
  return {
    id: 'entity-audio',
    name: 'Audio Beacon',
    active: true,
    parentId: null,
    children: [],
    tags: ['audio'],
    components: new Map([
      ['Transform', makeTransformComponent({ x: 3, y: 2, z: -1 })],
      [
        'AudioSource',
        {
          id: 'audio-source-component',
          type: 'AudioSource',
          enabled: true,
          data: {
            clipId: 'asset-audio-1',
            clip: 'download/assets/audio/theme.ogg',
            volume: 0.75,
            pitch: 1.1,
            loop: true,
            playOnStart: true,
            spatialBlend: 1,
            mixerGroup: 'ambient',
            minDistance: 2,
            maxDistance: 24,
            rolloffFactor: 0.6,
          },
        },
      ],
    ]),
  };
}

function makeScene(...entities: Entity[]): Scene {
  return {
    id: 'scene-audio',
    name: 'Audio Scene',
    entities,
    rootEntities: entities.map((entity) => entity.id),
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

function makeAudioAsset(): Asset {
  return {
    id: 'asset-audio-1',
    name: 'theme.ogg',
    type: 'audio',
    path: 'download/assets/audio/theme.ogg',
    size: 4096,
    createdAt: new Date('2026-04-03T11:00:00.000Z'),
    metadata: {},
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

async function pumpBridge(bridge: AudioRuntimeBridge, iterations = 4) {
  for (let index = 0; index < iterations; index += 1) {
    bridge.update(1 / 60);
    await flushAsyncWork();
  }
}

describe('AudioRuntimeBridge', () => {
  afterEach(() => {
    useEngineStore.setState({
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      assets: [],
      playRuntimeState: 'IDLE',
    });
  });

  it('loads and plays AudioSource components from persisted project assets', async () => {
    const engine = new FakeAudioEngine();
    const bridge = new AudioRuntimeBridge(engine);
    const entity = makeAudioEntity();

    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-audio',
      entities: new Map([[entity.id, entity]]),
      assets: [makeAudioAsset()],
      playRuntimeState: 'PLAYING',
    });

    await pumpBridge(bridge);

    expect(engine.initialized).toBe(1);
    expect(engine.loadedUrls).toEqual([
      '/api/assets/file?path=download%2Fassets%2Faudio%2Ftheme.ogg',
    ]);

    const source = engine.sources.get('audio_entity_entity-audio');
    expect(source).toBeDefined();
    expect(source?.playCount).toBe(1);
    expect(source?.volume).toBe(0.75);
    expect(source?.pitch).toBe(1.1);
    expect(source?.loop).toBe(true);
    expect(source?.group).toBe('ambient');
    expect(source?.spatial).toBe(true);
    expect(source?.spatialOptions).toEqual({
      minDistance: 2,
      maxDistance: 24,
      rolloffFactor: 0.6,
    });
    expect(source?.position.toArray()).toEqual([3, 2, -1]);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(10, 6, 4);
    bridge.syncListener(camera, 1 / 60);
    expect(engine.lastCamera).toBe(camera);
  });

  it('stops and removes runtime sources when the bridge resets', async () => {
    const engine = new FakeAudioEngine();
    const bridge = new AudioRuntimeBridge(engine);
    const entity = makeAudioEntity();

    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-audio',
      entities: new Map([[entity.id, entity]]),
      assets: [makeAudioAsset()],
      playRuntimeState: 'PLAYING',
    });

    await pumpBridge(bridge);

    const source = engine.sources.get('audio_entity_entity-audio');
    expect(source).toBeDefined();

    bridge.reset();

    expect(source?.stopCount).toBeGreaterThan(0);
    expect(engine.removedSourceIds).toContain('audio_entity_entity-audio');
    expect(engine.sources.size).toBe(0);
    expect(bridge.isActive).toBe(false);
  });
});
