// ============================================
// Audio Engine - Complete 3D Audio System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  ambientVolume: number;
}

export interface AudioMixerGroup {
  name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  effects: AudioEffect[];
}

export interface AudioEffect {
  type: 'reverb' | 'delay' | 'filter' | 'compressor' | 'distortion' | 'eq';
  params: Record<string, number | boolean | string>;
  enabled: boolean;
}

export interface ReverbZone {
  id: string;
  position: THREE.Vector3;
  radius: number;
  decay: number;
  preDelay: number;
  diffusion: number;
  active: boolean;
}

/**
 * Audio Engine - Main audio system manager
 */
export class AudioEngine {
  private static instance: AudioEngine;
  
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private mixerGroups: Map<string, AudioMixerGroup> = new Map();
  private sources: Map<string, AudioSource> = new Map();
  private listeners: AudioListener[] = [];
  private reverbZones: Map<string, ReverbZone> = new Map();
  
  private settings: AudioSettings = {
    masterVolume: 1.0,
    musicVolume: 1.0,
    sfxVolume: 1.0,
    voiceVolume: 1.0,
    ambientVolume: 1.0,
  };
  
  private currentMusic: AudioSource | null = null;
  private musicFadeTime: number = 1.0;
  
  private constructor() {}
  
  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }
  
  /**
   * Initialize the audio engine
   */
  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      
      // Create default mixer groups
      this.createMixerGroup('master', 1.0);
      this.createMixerGroup('music', 1.0);
      this.createMixerGroup('sfx', 1.0);
      this.createMixerGroup('voice', 1.0);
      this.createMixerGroup('ambient', 1.0);
      
      console.log('[AudioEngine] Initialized successfully');
    } catch (error) {
      console.error('[AudioEngine] Failed to initialize:', error);
    }
  }
  
  /**
   * Get the AudioContext
   */
  getContext(): AudioContext | null {
    return this.audioContext;
  }
  
  /**
   * Resume audio context (required for user interaction)
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  /**
   * Create a mixer group
   */
  createMixerGroup(name: string, volume: number = 1.0): AudioMixerGroup {
    const group: AudioMixerGroup = {
      name,
      volume,
      muted: false,
      solo: false,
      effects: [],
    };
    this.mixerGroups.set(name, group);
    return group;
  }
  
  /**
   * Get mixer group
   */
  getMixerGroup(name: string): AudioMixerGroup | undefined {
    return this.mixerGroups.get(name);
  }
  
  /**
   * Set group volume
   */
  setGroupVolume(groupName: string, volume: number): void {
    const group = this.mixerGroups.get(groupName);
    if (group) {
      group.volume = Math.max(0, Math.min(1, volume));
      this.updateSourcesInGroup(groupName);
    }
  }
  
  /**
   * Mute/unmute group
   */
  setGroupMuted(groupName: string, muted: boolean): void {
    const group = this.mixerGroups.get(groupName);
    if (group) {
      group.muted = muted;
      this.updateSourcesInGroup(groupName);
    }
  }
  
  /**
   * Update sources in a group
   */
  private updateSourcesInGroup(groupName: string): void {
    this.sources.forEach(source => {
      if (source.getGroup() === groupName) {
        source.updateVolume();
      }
    });
  }
  
  /**
   * Load audio file
   */
  async loadAudio(url: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }
    
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }
  
  /**
   * Create an audio source
   */
  createSource(id: string, buffer: AudioBuffer): AudioSource {
    const source = new AudioSource(id, buffer, this);
    this.sources.set(id, source);
    return source;
  }
  
  /**
   * Get audio source
   */
  getSource(id: string): AudioSource | undefined {
    return this.sources.get(id);
  }
  
  /**
   * Remove audio source
   */
  removeSource(id: string): void {
    const source = this.sources.get(id);
    if (source) {
      source.stop();
      this.sources.delete(id);
    }
  }
  
  /**
   * Play one-shot sound effect
   */
  playOneShot(buffer: AudioBuffer, volume: number = 1.0, pitch: number = 1.0): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const source = this.audioContext.createBufferSource();
    const gain = this.audioContext.createGain();
    
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    gain.gain.value = volume * this.settings.sfxVolume * this.settings.masterVolume;
    
    source.connect(gain);
    gain.connect(this.masterGain);
    
    source.start(0);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }
  
  /**
   * Play music with crossfade
   */
  async playMusic(buffer: AudioBuffer, fadeTime: number = 1.0): Promise<void> {
    this.musicFadeTime = fadeTime;
    
    // Fade out current music
    if (this.currentMusic && this.currentMusic.isPlaying()) {
      await this.fadeOut(this.currentMusic, fadeTime / 2);
      this.currentMusic.stop();
    }
    
    // Create new music source
    const musicSource = this.createSource('music_current', buffer);
    musicSource.setGroup('music');
    musicSource.setLoop(true);
    musicSource.setVolume(this.settings.musicVolume);
    
    // Fade in
    await this.fadeIn(musicSource, fadeTime / 2);
    this.currentMusic = musicSource;
  }
  
  /**
   * Fade in audio source
   */
  async fadeIn(source: AudioSource, duration: number): Promise<void> {
    source.setVolume(0);
    source.play();
    await this.tweenVolume(source, 0, source.getTargetVolume(), duration);
  }
  
  /**
   * Fade out audio source
   */
  async fadeOut(source: AudioSource, duration: number): Promise<void> {
    const startVolume = source.getVolume();
    await this.tweenVolume(source, startVolume, 0, duration);
  }
  
  /**
   * Tween volume
   */
  private tweenVolume(source: AudioSource, from: number, to: number, duration: number): Promise<void> {
    return new Promise(resolve => {
      const startTime = performance.now();
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // Ease out cubic
        
        source.setVolume(from + (to - from) * eased);
        
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
   * Add reverb zone
   */
  addReverbZone(zone: ReverbZone): void {
    this.reverbZones.set(zone.id, zone);
  }
  
  /**
   * Remove reverb zone
   */
  removeReverbZone(id: string): void {
    this.reverbZones.delete(id);
  }
  
  /**
   * Get active reverb zone at position
   */
  getActiveReverbZone(position: THREE.Vector3): ReverbZone | null {
    let closestZone: ReverbZone | null = null;
    let closestDistance = Infinity;
    
    this.reverbZones.forEach(zone => {
      if (!zone.active) return;
      
      const distance = position.distanceTo(zone.position);
      if (distance <= zone.radius && distance < closestDistance) {
        closestDistance = distance;
        closestZone = zone;
      }
    });
    
    return closestZone;
  }
  
  /**
   * Register audio listener
   */
  registerListener(listener: AudioListener): void {
    this.listeners.push(listener);
  }
  
  /**
   * Unregister audio listener
   */
  unregisterListener(listener: AudioListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  /**
   * Update audio system
   */
  update(deltaTime: number, camera: THREE.Camera): void {
    // Update 3D audio positions based on camera
    this.sources.forEach(source => {
      if (source.is3D()) {
        source.update3DPosition(camera);
      }
    });
  }
  
  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.settings.masterVolume;
    }
  }
  
  /**
   * Get settings
   */
  getSettings(): AudioSettings {
    return { ...this.settings };
  }
  
  /**
   * Update settings
   */
  updateSettings(settings: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...settings };
    
    // Update group volumes
    if (settings.musicVolume !== undefined) {
      this.setGroupVolume('music', settings.musicVolume);
    }
    if (settings.sfxVolume !== undefined) {
      this.setGroupVolume('sfx', settings.sfxVolume);
    }
    if (settings.voiceVolume !== undefined) {
      this.setGroupVolume('voice', settings.voiceVolume);
    }
    if (settings.ambientVolume !== undefined) {
      this.setGroupVolume('ambient', settings.ambientVolume);
    }
  }
  
  /**
   * Cleanup
   */
  dispose(): void {
    this.sources.forEach(source => source.stop());
    this.sources.clear();
    
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

/**
 * Audio Source - Individual sound source
 */
export class AudioSource {
  private id: string;
  private buffer: AudioBuffer;
  private engine: AudioEngine;
  
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private pannerNode: PannerNode | null = null;
  
  private volume: number = 1.0;
  private targetVolume: number = 1.0;
  private pitch: number = 1.0;
  private loop: boolean = false;
  private group: string = 'sfx';
  private is3DAudio: boolean = false;
  private position: THREE.Vector3 = new THREE.Vector3();
  private minDistance: number = 1.0;
  private maxDistance: number = 100.0;
  private rolloffFactor: number = 1.0;
  private playing: boolean = false;
  
  constructor(id: string, buffer: AudioBuffer, engine: AudioEngine) {
    this.id = id;
    this.buffer = buffer;
    this.engine = engine;
  }
  
  /**
   * Play the audio
   */
  play(): void {
    const context = this.engine.getContext();
    if (!context) return;
    
    this.stop();
    
    this.sourceNode = context.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.playbackRate.value = this.pitch;
    this.sourceNode.loop = this.loop;
    
    this.gainNode = context.createGain();
    this.updateVolume();
    
    if (this.is3DAudio) {
      this.pannerNode = context.createPanner();
      this.pannerNode.panningModel = 'HRTF';
      this.pannerNode.distanceModel = 'inverse';
      this.pannerNode.refDistance = this.minDistance;
      this.pannerNode.maxDistance = this.maxDistance;
      this.pannerNode.rolloffFactor = this.rolloffFactor;
      this.pannerNode.setPosition(this.position.x, this.position.y, this.position.z);
      
      this.sourceNode.connect(this.pannerNode);
      this.pannerNode.connect(this.gainNode);
    } else {
      this.sourceNode.connect(this.gainNode);
    }
    
    this.gainNode.connect(context.destination);
    this.sourceNode.start(0);
    this.playing = true;
    
    this.sourceNode.onended = () => {
      this.playing = false;
    };
  }
  
  /**
   * Stop the audio
   */
  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    if (this.pannerNode) {
      this.pannerNode.disconnect();
      this.pannerNode = null;
    }
    
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    
    this.playing = false;
  }
  
  /**
   * Pause the audio
   */
  pause(): void {
    // Web Audio API doesn't have native pause
    // We'd need to track position and recreate source
    console.warn('[AudioSource] Pause not implemented for Web Audio');
  }
  
  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.playing;
  }
  
  /**
   * Set volume
   */
  setVolume(volume: number): void {
    this.volume = volume;
    this.updateVolume();
  }
  
  /**
   * Get volume
   */
  getVolume(): number {
    return this.volume;
  }
  
  /**
   * Get target volume
   */
  getTargetVolume(): number {
    return this.targetVolume;
  }
  
  /**
   * Set target volume (for fades)
   */
  setTargetVolume(volume: number): void {
    this.targetVolume = volume;
  }
  
  /**
   * Update volume based on group and settings
   */
  updateVolume(): void {
    if (!this.gainNode) return;
    
    const settings = this.engine.getSettings();
    const group = this.engine.getMixerGroup(this.group);
    
    let finalVolume = this.volume;
    
    if (group) {
      if (group.muted) {
        finalVolume = 0;
      } else {
        finalVolume *= group.volume;
      }
    }
    
    // Apply master volume
    finalVolume *= settings.masterVolume;
    
    this.gainNode.gain.value = finalVolume;
  }
  
  /**
   * Set pitch
   */
  setPitch(pitch: number): void {
    this.pitch = pitch;
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = pitch;
    }
  }
  
  /**
   * Set loop
   */
  setLoop(loop: boolean): void {
    this.loop = loop;
    if (this.sourceNode) {
      this.sourceNode.loop = loop;
    }
  }
  
  /**
   * Set mixer group
   */
  setGroup(group: string): void {
    this.group = group;
    this.updateVolume();
  }
  
  /**
   * Get mixer group
   */
  getGroup(): string {
    return this.group;
  }
  
  /**
   * Configure as 3D audio source
   */
  set3D(enabled: boolean, options?: {
    minDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
  }): void {
    this.is3DAudio = enabled;
    if (options) {
      this.minDistance = options.minDistance ?? this.minDistance;
      this.maxDistance = options.maxDistance ?? this.maxDistance;
      this.rolloffFactor = options.rolloffFactor ?? this.rolloffFactor;
    }
  }
  
  /**
   * Check if 3D audio
   */
  is3D(): boolean {
    return this.is3DAudio;
  }
  
  /**
   * Set position for 3D audio
   */
  setPosition(position: THREE.Vector3): void {
    this.position.copy(position);
    if (this.pannerNode) {
      this.pannerNode.setPosition(position.x, position.y, position.z);
    }
  }
  
  /**
   * Update 3D position relative to camera
   */
  update3DPosition(camera: THREE.Camera): void {
    const context = this.engine.getContext();
    if (!context || !this.is3DAudio) return;
    
    // Update listener position from camera
    const listener = context.listener;
    listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
    
    // Update listener orientation
    const forward = new THREE.Vector3(0, 0, -1);
    const up = new THREE.Vector3(0, 1, 0);
    forward.applyQuaternion(camera.quaternion);
    up.applyQuaternion(camera.quaternion);
    
    if (listener.forwardX) {
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    }
  }
}

/**
 * Audio Listener Component
 */
export class AudioListener {
  private camera: THREE.Camera;
  private enabled: boolean = true;
  
  constructor(camera: THREE.Camera) {
    this.camera = camera;
    AudioEngine.getInstance().registerListener(this);
  }
  
  /**
   * Get camera
   */
  getCamera(): THREE.Camera {
    return this.camera;
  }
  
  /**
   * Set enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Cleanup
   */
  dispose(): void {
    AudioEngine.getInstance().unregisterListener(this);
  }
}

// Export singleton
export const audioEngine = AudioEngine.getInstance();
