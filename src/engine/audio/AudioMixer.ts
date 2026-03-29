// ============================================
// Audio Mixer - Advanced Audio Mixing System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { AudioEngine, AudioEffect } from './AudioEngine';

export interface MixerSnapshot {
  name: string;
  groupVolumes: Record<string, number>;
  effects: Record<string, AudioEffect[]>;
}

export interface MixerTransition {
  fromSnapshot: string;
  toSnapshot: string;
  duration: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

/**
 * Audio Mixer - Advanced mixing with snapshots and effects
 */
export class AudioMixer {
  private engine: AudioEngine;
  private snapshots: Map<string, MixerSnapshot> = new Map();
  private currentSnapshot: string = 'default';
  private transitions: MixerTransition[] = [];
  
  constructor() {
    this.engine = AudioEngine.getInstance();
    this.createDefaultSnapshots();
  }
  
  /**
   * Create default snapshots
   */
  private createDefaultSnapshots(): void {
    // Default snapshot
    this.addSnapshot({
      name: 'default',
      groupVolumes: {
        master: 1.0,
        music: 1.0,
        sfx: 1.0,
        voice: 1.0,
        ambient: 1.0,
      },
      effects: {},
    });
    
    // Paused snapshot
    this.addSnapshot({
      name: 'paused',
      groupVolumes: {
        master: 0.5,
        music: 0.3,
        sfx: 0.0,
        voice: 0.0,
        ambient: 0.2,
      },
      effects: {},
    });
    
    // Menu snapshot
    this.addSnapshot({
      name: 'menu',
      groupVolumes: {
        master: 1.0,
        music: 0.5,
        sfx: 0.3,
        voice: 0.0,
        ambient: 0.0,
      },
      effects: {},
    });
    
    // Combat snapshot
    this.addSnapshot({
      name: 'combat',
      groupVolumes: {
        master: 1.0,
        music: 0.8,
        sfx: 1.0,
        voice: 1.0,
        ambient: 0.3,
      },
      effects: {},
    });
    
    // Cutscene snapshot
    this.addSnapshot({
      name: 'cutscene',
      groupVolumes: {
        master: 1.0,
        music: 0.6,
        sfx: 0.4,
        voice: 1.0,
        ambient: 0.2,
      },
      effects: {},
    });
    
    // Underwater snapshot
    this.addSnapshot({
      name: 'underwater',
      groupVolumes: {
        master: 0.8,
        music: 0.5,
        sfx: 0.6,
        voice: 0.7,
        ambient: 0.8,
      },
      effects: {
        master: [
          { type: 'filter', params: { type: 'lowpass', frequency: 1000 }, enabled: true },
        ],
      },
    });
  }
  
  /**
   * Add a snapshot
   */
  addSnapshot(snapshot: MixerSnapshot): void {
    this.snapshots.set(snapshot.name, snapshot);
  }
  
  /**
   * Get snapshot
   */
  getSnapshot(name: string): MixerSnapshot | undefined {
    return this.snapshots.get(name);
  }
  
  /**
   * Apply snapshot instantly
   */
  applySnapshot(name: string): void {
    const snapshot = this.snapshots.get(name);
    if (!snapshot) {
      console.warn(`[AudioMixer] Snapshot '${name}' not found`);
      return;
    }
    
    // Apply group volumes
    Object.entries(snapshot.groupVolumes).forEach(([group, volume]) => {
      this.engine.setGroupVolume(group, volume);
    });
    
    this.currentSnapshot = name;
  }
  
  /**
   * Transition to snapshot
   */
  async transitionTo(name: string, duration: number = 1.0): Promise<void> {
    const toSnapshot = this.snapshots.get(name);
    const fromSnapshot = this.snapshots.get(this.currentSnapshot);
    
    if (!toSnapshot) {
      console.warn(`[AudioMixer] Snapshot '${name}' not found`);
      return;
    }
    
    const startVolumes: Record<string, number> = {};
    const targetVolumes: Record<string, number> = toSnapshot.groupVolumes;
    
    // Get current volumes
    if (fromSnapshot) {
      Object.keys(targetVolumes).forEach(group => {
        const mixerGroup = this.engine.getMixerGroup(group);
        startVolumes[group] = mixerGroup?.volume ?? 1.0;
      });
    }
    
    // Animate volumes
    await this.animateVolumes(startVolumes, targetVolumes, duration);
    
    this.currentSnapshot = name;
  }
  
  /**
   * Animate volume transitions
   */
  private animateVolumes(
    from: Record<string, number>,
    to: Record<string, number>,
    duration: number
  ): Promise<void> {
    return new Promise(resolve => {
      const startTime = performance.now();
      
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const t = Math.min(elapsed / duration, 1);
        const eased = this.easeInOutCubic(t);
        
        Object.keys(to).forEach(group => {
          const startVol = from[group] ?? 1.0;
          const endVol = to[group];
          const currentVol = startVol + (endVol - startVol) * eased;
          this.engine.setGroupVolume(group, currentVol);
        });
        
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      
      requestAnimationFrame(animate);
    });
  }
  
  /**
   * Ease in-out cubic
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  /**
   * Get current snapshot name
   */
  getCurrentSnapshot(): string {
    return this.currentSnapshot;
  }
  
  /**
   * Create custom snapshot
   */
  createSnapshot(name: string): MixerSnapshot {
    const currentVolumes: Record<string, number> = {};
    
    ['master', 'music', 'sfx', 'voice', 'ambient'].forEach(group => {
      const mixerGroup = this.engine.getMixerGroup(group);
      currentVolumes[group] = mixerGroup?.volume ?? 1.0;
    });
    
    const snapshot: MixerSnapshot = {
      name,
      groupVolumes: currentVolumes,
      effects: {},
    };
    
    this.addSnapshot(snapshot);
    return snapshot;
  }
  
  /**
   * Blend between two snapshots
   */
  blendSnapshots(snapshotA: string, snapshotB: string, blend: number): void {
    const a = this.snapshots.get(snapshotA);
    const b = this.snapshots.get(snapshotB);
    
    if (!a || !b) {
      console.warn('[AudioMixer] Cannot blend - snapshot not found');
      return;
    }
    
    blend = Math.max(0, Math.min(1, blend));
    
    const allGroups = new Set([
      ...Object.keys(a.groupVolumes),
      ...Object.keys(b.groupVolumes),
    ]);
    
    allGroups.forEach(group => {
      const volA = a.groupVolumes[group] ?? 1.0;
      const volB = b.groupVolumes[group] ?? 1.0;
      const blendedVol = volA + (volB - volA) * blend;
      this.engine.setGroupVolume(group, blendedVol);
    });
  }
}

// Sound effect presets
export const SOUND_PRESETS = {
  footstep: {
    variations: ['footstep_1', 'footstep_2', 'footstep_3', 'footstep_4'],
    volumeRange: [0.8, 1.0],
    pitchRange: [0.9, 1.1],
    cooldown: 100,
  },
  jump: {
    variations: ['jump_1', 'jump_2'],
    volumeRange: [0.7, 0.9],
    pitchRange: [1.0, 1.1],
    cooldown: 0,
  },
  land: {
    variations: ['land_1', 'land_2'],
    volumeRange: [0.8, 1.0],
    pitchRange: [0.9, 1.0],
    cooldown: 0,
  },
  hit: {
    variations: ['hit_1', 'hit_2', 'hit_3'],
    volumeRange: [0.9, 1.0],
    pitchRange: [0.8, 1.2],
    cooldown: 50,
  },
  explosion: {
    variations: ['explosion_1', 'explosion_2'],
    volumeRange: [1.0, 1.0],
    pitchRange: [0.9, 1.1],
    cooldown: 0,
  },
  pickup: {
    variations: ['pickup_1'],
    volumeRange: [0.8, 1.0],
    pitchRange: [1.0, 1.2],
    cooldown: 0,
  },
  uiClick: {
    variations: ['ui_click'],
    volumeRange: [0.5, 0.7],
    pitchRange: [1.0, 1.0],
    cooldown: 0,
  },
  uiHover: {
    variations: ['ui_hover'],
    volumeRange: [0.3, 0.5],
    pitchRange: [1.0, 1.0],
    cooldown: 0,
  },
};

/**
 * Sound Manager - Play sound effects with variations
 */
export class SoundManager {
  private engine: AudioEngine;
  private sounds: Map<string, AudioBuffer> = new Map();
  private lastPlayTime: Map<string, number> = new Map();
  
  constructor() {
    this.engine = AudioEngine.getInstance();
  }
  
  /**
   * Load a sound
   */
  async loadSound(name: string, url: string): Promise<void> {
    const buffer = await this.engine.loadAudio(url);
    this.sounds.set(name, buffer);
  }
  
  /**
   * Load multiple sounds
   */
  async loadSounds(sounds: Record<string, string>): Promise<void> {
    await Promise.all(
      Object.entries(sounds).map(([name, url]) => this.loadSound(name, url))
    );
  }
  
  /**
   * Play sound by name
   */
  play(name: string, volume: number = 1.0, pitch: number = 1.0): void {
    const buffer = this.sounds.get(name);
    if (!buffer) {
      console.warn(`[SoundManager] Sound '${name}' not loaded`);
      return;
    }
    
    this.engine.playOneShot(buffer, volume, pitch);
  }
  
  /**
   * Play sound preset with variations
   */
  playPreset(presetName: keyof typeof SOUND_PRESETS): void {
    const preset = SOUND_PRESETS[presetName];
    if (!preset) {
      console.warn(`[SoundManager] Preset '${presetName}' not found`);
      return;
    }
    
    // Check cooldown
    const now = performance.now();
    const lastPlay = this.lastPlayTime.get(presetName) ?? 0;
    if (now - lastPlay < preset.cooldown) return;
    this.lastPlayTime.set(presetName, now);
    
    // Pick random variation
    const variation = preset.variations[Math.floor(Math.random() * preset.variations.length)];
    const buffer = this.sounds.get(variation);
    if (!buffer) return;
    
    // Random volume and pitch
    const volume = preset.volumeRange[0] + Math.random() * (preset.volumeRange[1] - preset.volumeRange[0]);
    const pitch = preset.pitchRange[0] + Math.random() * (preset.pitchRange[1] - preset.pitchRange[0]);
    
    this.engine.playOneShot(buffer, volume, pitch);
  }
  
  /**
   * Check if sound is loaded
   */
  isLoaded(name: string): boolean {
    return this.sounds.has(name);
  }
  
  /**
   * Get all loaded sounds
   */
  getLoadedSounds(): string[] {
    return Array.from(this.sounds.keys());
  }
}

// Export instances
export const audioMixer = new AudioMixer();
