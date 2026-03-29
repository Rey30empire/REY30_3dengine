// ============================================
// Rendering Module Exports
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as ModelLoaderModule from './ModelLoader';

// ============================================
// Core Render Engine
// ============================================
export { RenderEngine, PrimitiveGenerator, MaterialPresets as LegacyMaterialPresets } from './RenderEngine';
export type { RenderConfig } from './RenderEngine';

// ============================================
// Model Loading
// ============================================
export const ModelLoader = ModelLoaderModule;
export {
  loadGLTF,
  loadFBX,
  loadOBJ,
  loadModel,
  loadModelFromFile,
  optimizeModel,
  createModelThumbnail,
  clearModelCache,
  getCachedModels,
} from './ModelLoader';
export type { LoadedModel } from './ModelLoader';

// ============================================
// Material System (PBR)
// ============================================
export {
  MaterialSystem,
  materialSystem,
  MaterialType,
  MATERIAL_PRESETS,
  DEFAULT_PBR_CONFIG,
} from './MaterialSystem';
export type {
  PBRMaterialConfig,
  TextureLoadOptions,
  MaterialPreset,
  MaterialInstance,
  CustomShaderConfig,
  MaterialSide,
  TextureEncoding,
} from './MaterialSystem';

// ============================================
// Lighting System
// ============================================
export {
  LightingSystem,
  ShadowSystem,
  IBLSystem,
  LightProbeSystem,
  VolumetricLightSystem,
  LightType,
  ShadowQuality,
  LightPresets,
  createLightingSystem,
  createLightFromPreset,
} from './LightingSystem';
export type {
  LightConfig,
  ShadowConfig,
  LightProbeConfig,
  VolumetricLightConfig,
} from './LightingSystem';

// ============================================
// Post-Processing
// ============================================
export {
  PostProcessingManager,
  BloomPass,
  SSAOPassEffect,
  SSRPassEffect,
  DOFPassEffect,
  MotionBlurPassEffect,
  ChromaticAberrationPassEffect,
  VignettePassEffect,
  ColorGradingPassEffect,
  FXAAPassEffect,
  SMAAPassEffect,
  TAAPassEffect,
  SSAAPassEffect,
  SharpenPassEffect,
  FilmGrainPassEffect,
  LensFlarePassEffect,
  PostProcessPresets,
  PostProcessPresets as POST_PROCESS_PRESETS,
  SSAOPassEffect as SSAOPass,
  SSRPassEffect as SSRPass,
  DOFPassEffect as DOFPass,
  MotionBlurPassEffect as MotionBlurPass,
  ChromaticAberrationPassEffect as ChromaticAberrationPass,
  VignettePassEffect as VignettePass,
  ColorGradingPassEffect as ColorGradingPass,
  FXAAPassEffect as FXAAPass,
  SMAAPassEffect as SMAAPass,
  TAAPassEffect as TAAPass,
  SharpenPassEffect as SharpenPass,
  FilmGrainPassEffect as FilmGrainPass,
  LensFlarePassEffect as LensFlarePass,
} from './PostProcessing';
export type {
  PostProcessEffect,
  PostProcessPresetName,
  PostProcessPresetConfig,
  PostProcessPresetConfig as PostProcessPreset,
  BloomConfig,
  SSAOConfig,
  SSRConfig,
  DOFConfig,
  MotionBlurConfig,
  ChromaticAberrationConfig,
  VignetteConfig,
  ColorGradingConfig,
  AAConfig,
  SharpenConfig,
  FilmGrainConfig,
  LensFlareConfig,
  RenderFeatureSettings,
  PostProcessingManagerConfig,
} from './PostProcessing';

// ============================================
// LOD System
// ============================================
export {
  LODManager,
  LODGenerator,
  ImpostorSystem,
  StreamingLOD,
  LODGroup,
  LODPresets,
  createLODFromPreset,
  quickLOD,
} from './LODSystem';
export type {
  LODLevel,
  LODConfig,
  LODStats,
  StreamingLODItem,
  ImpostorData,
  LODGroupConfig,
} from './LODSystem';

// ============================================
// Render Pipeline
// ============================================
export {
  RenderPipeline,
  ForwardRenderer,
  DeferredRenderer,
  GBuffer,
  LightCulling,
  CullingSystem,
  BatchingSystem,
  SSRFeature,
  SSAOFeature,
  ShadowFeature,
  VolumetricLightingFeature,
  GlobalIlluminationFeature,
  RenderPath,
  defaultPipelineConfig,
  defaultPipelineConfig as RENDER_PRESETS,
} from './RenderPipeline';
export type {
  PipelineConfig,
  RenderStats,
  RenderFeature,
  LightData,
  RenderableData,
} from './RenderPipeline';

// ============================================
// Shader Library
// ============================================
export {
  ShaderLibrary,
  shaderLibrary,
  ShaderType,
  UniformManager,
  uniformManager,
  ShaderUtils,
  ShaderHotReload,
  shaderHotReload,
  ShaderChunks,
  BUILTIN_SHADERS,
} from './ShaderLibrary';
export type {
  ShaderDefinition,
  UniformInfo,
  ShaderPack,
} from './ShaderLibrary';

// ============================================
// Camera System
// ============================================
export {
  CameraManager,
  CameraManager as CameraSystem,
  OrbitCamera,
  FollowCamera,
  FirstPersonCamera,
  ThirdPersonCamera,
  CinematicCamera,
  FreeCamera,
  CameraShake,
  CameraKick,
  FOVKick,
  CameraStack,
  CameraRig,
  FrustumCulling,
  CameraType,
  SmoothingType,
  BlendMode,
  CameraPresets,
  CameraPresets as CAMERA_PRESETS,
  defaultDOFSettings,
  defaultMotionBlurSettings,
} from './CameraSystem';
export type {
  CameraConfig,
  DOFSettings,
  MotionBlurSettings,
  CameraShakeConfig,
  CameraKickConfig,
  FOVKickConfig,
  DollyTrackPoint,
  CinematicKeyframe,
} from './CameraSystem';

// ============================================
// Particle System (CPU)
// ============================================
export {
  ParticleEmitter,
  ParticleEmitter as ParticleSystem,
  PARTICLE_PRESETS,
  createParticlePreset,
} from './ParticleSystem';
export type {
  ParticleEmitterConfig,
} from './ParticleSystem';

// ============================================
// GPU Particle System
// ============================================
export {
  GPUParticleSystem,
  GPUEmitter,
  ParticleCollisionSystem,
  ParticleLODSystem,
  GPUParticlePresets,
  GPUParticlePresets as GPU_PARTICLE_PRESETS,
  createGPUParticlePreset,
  createGradientTexture,
  createSpriteSheetTexture,
} from './GPUParticleSystem';
export type {
  GPUParticleConfig,
  ParticleStats,
  GPUEmitterState,
} from './GPUParticleSystem';
