'use client';

import * as THREE from 'three';
import type { Asset, AudioSourceData, Entity, Vector3 } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import { buildAssetFileUrl } from '@/engine/editor/assetUrls';
import { audioEngine } from './AudioEngine';
import { normalizeAudioSourceData, resolveAudioSourceClip } from './audioSourceData';

type AudioBufferLike = unknown;

export interface RuntimeAudioSourceHandle {
  play(): void;
  stop(): void;
  isPlaying(): boolean;
  setVolume(volume: number): void;
  setPitch(pitch: number): void;
  setLoop(loop: boolean): void;
  setGroup(group: string): void;
  set3D(
    enabled: boolean,
    options?: {
      minDistance?: number;
      maxDistance?: number;
      rolloffFactor?: number;
    }
  ): void;
  setPosition(position: THREE.Vector3): void;
}

export interface RuntimeAudioEngine {
  initialize(): Promise<void> | void;
  resume(): Promise<void> | void;
  loadAudio(url: string): Promise<AudioBufferLike>;
  createSource(id: string, buffer: AudioBufferLike): RuntimeAudioSourceHandle;
  removeSource(id: string): void;
  update(deltaTime: number, camera: THREE.Camera): void;
}

interface RuntimeAudioEntry {
  entityId: string;
  sourceId: string;
  clipKey: string;
  clipUrl: string;
  source: RuntimeAudioSourceHandle | null;
  loadToken: number;
  playStarted: boolean;
  loading: boolean;
}

type StoreState = ReturnType<typeof useEngineStore.getState>;

const DEFAULT_POSITION: Vector3 = { x: 0, y: 0, z: 0 };

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readVector3(value: unknown, fallback: Vector3): Vector3 {
  if (!value || typeof value !== 'object') return { ...fallback };
  const candidate = value as Partial<Vector3>;
  return {
    x: readNumber(candidate.x, fallback.x),
    y: readNumber(candidate.y, fallback.y),
    z: readNumber(candidate.z, fallback.z),
  };
}

function getActiveSceneEntities(state: StoreState): Entity[] {
  if (!state.activeSceneId) return [];
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  if (!activeScene) return [];

  const seen = new Set<string>();
  return activeScene.entities
    .map((entity) => state.entities.get(entity.id) ?? entity)
    .filter((entity) => {
      if (!entity.active || seen.has(entity.id)) return false;
      seen.add(entity.id);
      return true;
    });
}

function getAudioSourceData(entity: Entity): AudioSourceData | null {
  const component = entity.components.get('AudioSource');
  if (!component?.enabled) return null;
  return normalizeAudioSourceData(component.data);
}

function getEntityPosition(entity: Entity): THREE.Vector3 {
  const transform = entity.components.get('Transform')?.data as
    | { position?: Vector3 }
    | undefined;
  const position = readVector3(transform?.position, DEFAULT_POSITION);
  return new THREE.Vector3(position.x, position.y, position.z);
}

function toRuntimeClipUrl(path: string): string {
  const raw = path.trim();
  if (!raw) return '';
  if (
    raw.startsWith('data:') ||
    raw.startsWith('blob:') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('/api/assets/file?')
  ) {
    return raw;
  }
  return buildAssetFileUrl(raw);
}

export class AudioRuntimeBridge {
  private readonly engine: RuntimeAudioEngine;
  private readonly bufferCache = new Map<string, Promise<AudioBufferLike>>();
  private readonly entries = new Map<string, RuntimeAudioEntry>();
  private listenerCamera: THREE.Camera | null = null;
  private ready = false;
  private readyPromise: Promise<void> | null = null;

  constructor(engine: RuntimeAudioEngine = audioEngine) {
    this.engine = engine;
  }

  get isActive(): boolean {
    return this.entries.size > 0;
  }

  getActiveSourceCount(): number {
    return this.entries.size;
  }

  reset(): void {
    this.entries.forEach((entry) => {
      try {
        entry.source?.stop();
      } catch {
        // Ignore stop errors while tearing down runtime audio.
      }
      this.engine.removeSource(entry.sourceId);
    });
    this.entries.clear();
    this.bufferCache.clear();
    this.listenerCamera = null;
  }

  syncListener(camera: THREE.Camera | null, deltaTime = 0): void {
    this.listenerCamera = camera;
    if (camera && this.ready && this.entries.size > 0) {
      this.engine.update(deltaTime, camera);
    }
  }

  update(deltaTime: number): void {
    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      return;
    }

    const entities = getActiveSceneEntities(state);
    const activeCandidates = entities
      .map((entity) => {
        const audioData = getAudioSourceData(entity);
        if (!audioData) return null;
        const resolvedClip = resolveAudioSourceClip(audioData, state.assets);
        if (!resolvedClip) return null;
        const clipUrl = toRuntimeClipUrl(resolvedClip.path);
        if (!clipUrl) return null;
        return {
          entity,
          audioData,
          clipUrl,
          clipKey: resolvedClip.key,
        };
      })
      .flatMap((candidate) => (candidate ? [candidate] : []));

    if (activeCandidates.length === 0) {
      Array.from(this.entries.keys()).forEach((entityId) => this.removeEntry(entityId));
      return;
    }

    this.ensureEngineReady();
    const activeEntityIds = new Set<string>();

    activeCandidates.forEach(({ entity, audioData, clipUrl, clipKey }) => {
      activeEntityIds.add(entity.id);
      this.syncEntitySource(entity, audioData, clipUrl, clipKey, state.assets);
    });

    Array.from(this.entries.keys())
      .filter((entityId) => !activeEntityIds.has(entityId))
      .forEach((entityId) => this.removeEntry(entityId));

    if (this.listenerCamera && this.ready && this.entries.size > 0) {
      this.engine.update(deltaTime, this.listenerCamera);
    }
  }

  private syncEntitySource(
    entity: Entity,
    audioData: AudioSourceData,
    clipUrl: string,
    clipKey: string,
    assets: Asset[]
  ): void {
    const existing = this.entries.get(entity.id);
    if (existing && (existing.clipKey !== clipKey || existing.clipUrl !== clipUrl)) {
      this.removeEntry(entity.id);
    }

    const entry =
      this.entries.get(entity.id) ??
      {
        entityId: entity.id,
        sourceId: `audio_entity_${entity.id}`,
        clipKey,
        clipUrl,
        source: null,
        loadToken: 0,
        playStarted: false,
        loading: false,
      };

    entry.clipKey = clipKey;
    entry.clipUrl = clipUrl;
    this.entries.set(entity.id, entry);

    const position = getEntityPosition(entity);

    if (!entry.source) {
      if (this.ready && !entry.loading) {
        this.loadEntitySource(entry, audioData, position, assets);
      }
      return;
    }

    this.applySourceConfig(entry.source, audioData, position);

    if (audioData.playOnStart && !entry.playStarted) {
      entry.source.play();
      entry.playStarted = true;
      return;
    }

    if (!audioData.playOnStart && entry.playStarted && entry.source.isPlaying()) {
      entry.source.stop();
      entry.playStarted = false;
    }
  }

  private loadEntitySource(
    entry: RuntimeAudioEntry,
    audioData: AudioSourceData,
    position: THREE.Vector3,
    assets: Asset[]
  ): void {
    entry.loading = true;
    const token = entry.loadToken + 1;
    entry.loadToken = token;

    void this.resumeEngine();
    void this.getBuffer(entry.clipUrl)
      .then((buffer) => {
        const current = this.entries.get(entry.entityId);
        if (!current || current.loadToken !== token || current.clipUrl !== entry.clipUrl) {
          return;
        }

        const source = this.engine.createSource(current.sourceId, buffer);
        current.source = source;
        current.loading = false;
        this.applySourceConfig(source, audioData, position);

        if (audioData.playOnStart) {
          source.play();
          current.playStarted = true;
        } else {
          current.playStarted = false;
        }

        const latestEntity = getActiveSceneEntities(useEngineStore.getState()).find(
          (entity) => entity.id === current.entityId
        );
        const latestAudioData = latestEntity ? getAudioSourceData(latestEntity) : null;
        if (latestEntity && latestAudioData) {
          this.syncEntitySource(latestEntity, latestAudioData, current.clipUrl, current.clipKey, assets);
        }
      })
      .catch((error) => {
        const current = this.entries.get(entry.entityId);
        if (current && current.loadToken === token) {
          current.loading = false;
        }
        console.warn(`[AudioRuntimeBridge] Failed to load clip for ${entry.entityId}:`, error);
      });
  }

  private applySourceConfig(
    source: RuntimeAudioSourceHandle,
    data: AudioSourceData,
    position: THREE.Vector3
  ): void {
    source.setVolume(data.volume);
    source.setPitch(data.pitch);
    source.setLoop(data.loop);
    source.setGroup(data.mixerGroup);
    source.set3D(data.spatialBlend > 0.05, {
      minDistance: data.minDistance,
      maxDistance: data.maxDistance,
      rolloffFactor: data.rolloffFactor,
    });
    source.setPosition(position);
  }

  private removeEntry(entityId: string): void {
    const entry = this.entries.get(entityId);
    if (!entry) return;

    try {
      entry.source?.stop();
    } catch {
      // Ignore stop errors while removing runtime audio entries.
    }
    this.engine.removeSource(entry.sourceId);
    this.entries.delete(entityId);
  }

  private ensureEngineReady(): void {
    if (this.ready || this.readyPromise) {
      return;
    }

    this.readyPromise = Promise.resolve(this.engine.initialize())
      .then(() => this.resumeEngine())
      .then(() => {
        this.ready = true;
      })
      .catch((error) => {
        this.ready = false;
        console.warn('[AudioRuntimeBridge] Failed to initialize audio engine:', error);
      })
      .finally(() => {
        this.readyPromise = null;
      });
  }

  private resumeEngine(): Promise<void> {
    return Promise.resolve(this.engine.resume()).catch((error) => {
      console.warn('[AudioRuntimeBridge] Failed to resume audio engine:', error);
    });
  }

  private getBuffer(url: string): Promise<AudioBufferLike> {
    const cached = this.bufferCache.get(url);
    if (cached) {
      return cached;
    }

    const next = Promise.resolve(this.engine.loadAudio(url)).catch((error) => {
      this.bufferCache.delete(url);
      throw error;
    });

    this.bufferCache.set(url, next);
    return next;
  }
}

export const audioRuntimeBridge = new AudioRuntimeBridge();
