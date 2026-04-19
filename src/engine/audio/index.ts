// ============================================
// Audio System - Index
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

export { 
  AudioEngine, 
  AudioSource, 
  AudioListener,
  audioEngine 
} from './AudioEngine';

export {
  AudioRuntimeBridge,
  audioRuntimeBridge,
} from './audioRuntimeBridge';

export {
  AUDIO_MIXER_GROUPS,
  DEFAULT_AUDIO_SOURCE_DATA,
  createDefaultAudioSourceData,
  normalizeAudioSourceData,
  resolveAudioSourceClip,
} from './audioSourceData';

export type {
  AudioSettings,
  AudioMixerGroup,
  AudioEffect,
  ReverbZone,
} from './AudioEngine';

export type { RuntimeAudioEngine, RuntimeAudioSourceHandle } from './audioRuntimeBridge';

export { 
  AudioMixer, 
  SoundManager,
  SOUND_PRESETS,
  audioMixer 
} from './AudioMixer';

export type {
  MixerSnapshot,
  MixerTransition,
} from './AudioMixer';
