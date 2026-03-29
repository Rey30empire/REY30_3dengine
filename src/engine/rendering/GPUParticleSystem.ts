// ============================================
// GPU Particle System - Advanced Visual Effects Engine
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// GPU-accelerated particle simulation using THREE.GPUComputationRenderer
// ============================================

import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

// ============================================
// INTERFACES
// ============================================

export interface GPUParticleConfig {
  maxParticles: number;
  
  // Emission
  rate: number;
  burstCount?: number;
  burstInterval?: number;
  
  // Lifetime
  lifetimeMin: number;
  lifetimeMax: number;
  
  // Shape
  shape: 'point' | 'sphere' | 'cone' | 'box' | 'circle' | 'mesh';
  radius: number;
  mesh?: THREE.Mesh;
  
  // Velocity
  speedMin: number;
  speedMax: number;
  direction: 'up' | 'outward' | 'random' | 'forward' | 'normal';
  inheritVelocity: number;
  
  // Size over lifetime
  sizeCurve: number[];
  startSizeMin: number;
  startSizeMax: number;
  
  // Color over lifetime
  colorGradient: THREE.Color[];
  alphaCurve: number[];
  
  // Rotation
  rotationMin: number;
  rotationMax: number;
  angularVelocityMin: number;
  angularVelocityMax: number;
  
  // Physics (GPU computed)
  gravity: THREE.Vector3;
  drag: number;
  wind: THREE.Vector3;
  turbulence: number;
  turbulenceFrequency: number;
  
  // Collisions
  collisionEnabled: boolean;
  collisionRadius: number;
  bounce: number;
  
  // Rendering
  blendMode: 'additive' | 'alpha' | 'multiply' | 'screen';
  renderMode: 'billboard' | 'stretched' | 'mesh' | 'ribbon';
  stretchFactor: number;
  texture?: THREE.Texture;
  atlas?: { columns: number; rows: number };
  animationSpeed?: number;
  
  // Sorting
  sortMode: 'none' | 'distance' | 'oldest';
  
  // Trails
  trailsEnabled: boolean;
  trailLength: number;
  trailWidth: number;
  trailFade: boolean;
}

export interface ParticleStats {
  activeParticles: number;
  totalEmitters: number;
  memoryUsage: number;
  gpuTime: number;
  drawCalls: number;
}

export interface GPUEmitterState {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  velocity: THREE.Vector3;
  isPlaying: boolean;
  emitAccumulator: number;
  burstTimer: number;
}

// ============================================
// COMPUTE SHADERS
// ============================================

const positionComputeShader = /* glsl */`
uniform float uDeltaTime;
uniform float uTime;
uniform vec3 uGravity;
uniform vec3 uWind;
uniform float uDrag;
uniform float uTurbulence;
uniform float uTurbulenceFrequency;

// Texture references
uniform sampler2D uVelocityTexture;

// Simplex noise functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 turbulenceForce(vec3 pos, float time) {
  float scale = uTurbulenceFrequency;
  vec3 noisePos = pos * scale + time * 0.5;
  return vec3(
    snoise(noisePos),
    snoise(noisePos + vec3(31.341, 0.0, 0.0)),
    snoise(noisePos + vec3(0.0, 17.123, 0.0))
  ) * uTurbulence;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  // Read current position and life (w component)
  vec4 posLife = texture2D(texturePosition, uv);
  vec3 position = posLife.xyz;
  float life = posLife.w;
  
  // Read velocity and random seed (w component)
  vec4 velSeed = texture2D(uVelocityTexture, uv);
  vec3 velocity = velSeed.xyz;
  float seed = velSeed.w;
  
  // Skip dead particles
  if (life <= 0.0) {
    gl_FragColor = posLife;
    return;
  }
  
  // Update life
  life -= uDeltaTime;
  
  if (life > 0.0) {
    // Apply gravity
    velocity += uGravity * uDeltaTime;
    
    // Apply wind
    velocity += uWind * uDeltaTime;
    
    // Apply turbulence
    velocity += turbulenceForce(position, uTime) * uDeltaTime;
    
    // Apply drag
    velocity *= 1.0 - uDrag * uDeltaTime;
    
    // Update position
    position += velocity * uDeltaTime;
  }
  
  gl_FragColor = vec4(position, life);
}
`;

const velocityComputeShader = /* glsl */`
uniform float uDeltaTime;
uniform vec3 uEmitterPosition;
uniform vec3 uEmitterVelocity;
uniform vec4 uEmitterRotation;
uniform float uEmitRate;
uniform float uTime;
uniform float uLifetimeMin;
uniform float uLifetimeMax;
uniform float uSpeedMin;
uniform float uSpeedMax;
uniform float uRadius;
uniform int uShape;
uniform int uDirection;
uniform float uInheritVelocity;
uniform float uAngularVelMin;
uniform float uAngularVelMax;

uniform sampler2D uPositionTexture;

// Hash function for randomness
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 randomInSphere(float seed) {
  float u = hash(seed * 1.1);
  float v = hash(seed * 2.2);
  float theta = 2.0 * 3.14159265 * u;
  float phi = acos(2.0 * v - 1.0);
  float r = pow(hash(seed * 3.3), 1.0/3.0);
  return r * vec3(sin(phi) * cos(theta), sin(phi) * sin(theta), cos(phi));
}

vec3 randomInCircle(float seed) {
  float angle = hash(seed * 1.1) * 6.28318;
  float r = sqrt(hash(seed * 2.2)) * uRadius;
  return vec3(cos(angle) * r, 0.0, sin(angle) * r);
}

vec3 randomInBox(float seed) {
  return vec3(
    (hash(seed * 1.1) - 0.5) * 2.0 * uRadius,
    (hash(seed * 2.2) - 0.5) * 2.0 * uRadius,
    (hash(seed * 3.3) - 0.5) * 2.0 * uRadius
  );
}

vec3 randomOnCone(float seed, float angle) {
  float r = hash(seed * 1.1);
  float theta = hash(seed * 2.2) * 6.28318;
  float spreadAngle = angle * sqrt(r);
  return vec3(
    sin(spreadAngle) * cos(theta),
    cos(spreadAngle),
    sin(spreadAngle) * sin(theta)
  );
}

// Rotate vector by quaternion
vec3 rotateByQuaternion(vec3 v, vec4 q) {
  vec3 qv = vec3(q.x, q.y, q.z);
  vec3 uv = cross(qv, v);
  vec3 uuv = cross(qv, uv);
  return v + 2.0 * (q.w * uv + uuv);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  // Read current state
  vec4 posLife = texture2D(uPositionTexture, uv);
  vec4 velSeed = texture2D(textureVelocity, uv);
  
  vec3 position = posLife.xyz;
  float life = posLife.w;
  vec3 velocity = velSeed.xyz;
  float seed = velSeed.w;
  
  // Particle is dead, check if we should emit
  if (life <= 0.0 && uEmitRate > 0.0) {
    float emitProbability = uEmitRate * uDeltaTime;
    float particleHash = hash2(uv * 1000.0 + uTime);
    
    if (particleHash < emitProbability) {
      // Emit new particle
      life = mix(uLifetimeMin, uLifetimeMax, hash(seed * 4.4));
      seed = hash(uTime + uv.x * 1000.0 + uv.y * 2000.0);
      
      // Calculate spawn position based on shape
      vec3 offset = vec3(0.0);
      
      if (uShape == 0) { // point
        offset = vec3(0.0);
      } else if (uShape == 1) { // sphere
        offset = randomInSphere(seed * 10.0) * uRadius;
      } else if (uShape == 2) { // cone
        offset = randomInCircle(seed * 10.0) * 0.1;
      } else if (uShape == 3) { // box
        offset = randomInBox(seed * 10.0);
      } else if (uShape == 4) { // circle
        offset = randomInCircle(seed * 10.0);
      }
      
      // Apply emitter rotation
      offset = rotateByQuaternion(offset, uEmitterRotation);
      position = uEmitterPosition + offset;
      
      // Calculate velocity based on direction
      float speed = mix(uSpeedMin, uSpeedMax, hash(seed * 5.5));
      
      if (uDirection == 0) { // up
        velocity = vec3(0.0, 1.0, 0.0) * speed;
      } else if (uDirection == 1) { // outward
        velocity = normalize(offset) * speed;
      } else if (uDirection == 2) { // random
        velocity = randomInSphere(seed * 6.6) * speed;
      } else if (uDirection == 3) { // forward
        velocity = rotateByQuaternion(vec3(0.0, 0.0, 1.0), uEmitterRotation) * speed;
      } else if (uDirection == 4) { // normal (for mesh surface)
        velocity = vec3(0.0, 1.0, 0.0) * speed;
      }
      
      // Apply emitter rotation to velocity
      velocity = rotateByQuaternion(velocity, uEmitterRotation);
      
      // Inherit emitter velocity
      velocity += uEmitterVelocity * uInheritVelocity;
    }
  }
  
  gl_FragColor = vec4(velocity, seed);
}
`;

const particleVertexShader = /* glsl */`
uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform vec3 uCameraPosition;
uniform float uSizeMin;
uniform float uSizeMax;
uniform float uLifetimeMin;
uniform float uLifetimeMax;
uniform int uAtlasColumns;
uniform int uAtlasRows;
uniform float uAnimationSpeed;
uniform int uSortMode;

attribute vec2 aReference;
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aRotation;
attribute float aFrameIndex;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vRotation;
varying float vLife;

void main() {
  vUv = uv;
  vColor = aColor;
  vAlpha = aAlpha;
  vRotation = aRotation;
  
  // Read particle data from textures
  vec4 posLife = texture2D(uPositionTexture, aReference);
  vec4 velSeed = texture2D(uVelocityTexture, aReference);
  
  vec3 particlePos = posLife.xyz;
  float life = posLife.w;
  vLife = life;
  
  // Calculate life progress (0 = just born, 1 = about to die)
  float maxLife = mix(uLifetimeMin, uLifetimeMax, 0.5);
  float lifeProgress = 1.0 - clamp(life / maxLife, 0.0, 1.0);
  
  // Size based on life curve (simplified)
  float size = mix(uSizeMin, uSizeMax, aSize * (1.0 - lifeProgress * 0.5));
  
  // Billboard orientation
  vec3 viewDir = normalize(uCameraPosition - particlePos);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), viewDir));
  vec3 up = cross(viewDir, right);
  
  // Apply rotation
  float c = cos(aRotation);
  float s = sin(aRotation);
  
  vec3 offset = position.x * right * c - position.y * up * s +
                position.x * up * s + position.y * right * c;
  
  vec3 worldPos = particlePos + offset * size;
  
  // Sprite sheet UV calculation
  if (uAtlasColumns > 1 || uAtlasRows > 1) {
    float frameCount = float(uAtlasColumns * uAtlasRows);
    float frame = mod(aFrameIndex + floor(lifeProgress * frameCount * uAnimationSpeed), frameCount);
    float col = mod(frame, float(uAtlasColumns));
    float row = floor(frame / float(uAtlasColumns));
    vUv = vec2(
      (uv.x + col) / float(uAtlasColumns),
      (uv.y + row) / float(uAtlasRows)
    );
  }
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  
  // Distance-based size attenuation
  gl_PointSize = size * 300.0 / length(worldPos - uCameraPosition);
}
`;

const particleFragmentShader = /* glsl */`
uniform sampler2D uTexture;
uniform int uBlendMode;
uniform float uSoftParticleDistance;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vRotation;
varying float vLife;

void main() {
  // Discard dead particles
  if (vLife <= 0.0) discard;
  
  vec2 uv = vUv;
  
  // Apply rotation to UV
  float c = cos(vRotation);
  float s = sin(vRotation);
  uv = vec2(
    c * (uv.x - 0.5) + s * (uv.y - 0.5) + 0.5,
    -s * (uv.x - 0.5) + c * (uv.y - 0.5) + 0.5
  );
  
  vec4 texColor = texture2D(uTexture, uv);
  
  vec3 color = vColor * texColor.rgb;
  float alpha = vAlpha * texColor.a;
  
  // Soft edges
  float dist = length(vUv - 0.5) * 2.0;
  alpha *= smoothstep(1.0, 0.8, dist);
  
  // Apply blend mode
  if (uBlendMode == 0) { // additive
    gl_FragColor = vec4(color * alpha, alpha);
  } else if (uBlendMode == 1) { // alpha
    gl_FragColor = vec4(color, alpha);
  } else if (uBlendMode == 2) { // multiply
    gl_FragColor = vec4(color * alpha, alpha);
  } else if (uBlendMode == 3) { // screen
    gl_FragColor = vec4(color * alpha, alpha);
  }
  
  if (gl_FragColor.a < 0.01) discard;
}
`;

// Trail shaders
const trailVertexShader = /* glsl */`
attribute vec3 aPosition;
attribute vec3 aColor;
attribute float aAlpha;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aPosition, 1.0);
}
`;

const trailFragmentShader = /* glsl */`
varying vec3 vColor;
varying float vAlpha;

void main() {
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

// ============================================
// GPU EMITTER CLASS
// ============================================

export class GPUEmitter {
  public id: string;
  public config: GPUParticleConfig;
  public state: GPUEmitterState;
  
  private system: GPUParticleSystem;
  private particleIndex: number;
  private particleCount: number;
  private trailPositions: THREE.Vector3[];
  private trailGeometry?: THREE.BufferGeometry;
  private trailMesh?: THREE.LineSegments;
  
  constructor(
    id: string,
    config: GPUParticleConfig,
    system: GPUParticleSystem,
    particleIndex: number
  ) {
    this.id = id;
    this.config = config;
    this.system = system;
    this.particleIndex = particleIndex;
    this.particleCount = Math.min(config.maxParticles, 10000);
    
    this.state = {
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      velocity: new THREE.Vector3(),
      isPlaying: true,
      emitAccumulator: 0,
      burstTimer: 0,
    };
    
    this.trailPositions = [];
    
    if (config.trailsEnabled) {
      this.initTrails();
    }
  }
  
  private initTrails(): void {
    this.trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.config.trailLength * 6);
    const colors = new Float32Array(this.config.trailLength * 6);
    const alphas = new Float32Array(this.config.trailLength * 2);
    
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    
    const material = new THREE.ShaderMaterial({
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      transparent: true,
      blending: this.getBlendMode(),
      depthWrite: false,
    });
    
    this.trailMesh = new THREE.LineSegments(this.trailGeometry, material);
    this.system.getScene()?.add(this.trailMesh);
  }
  
  private getBlendMode(): THREE.Blending {
    switch (this.config.blendMode) {
      case 'additive': return THREE.AdditiveBlending;
      case 'multiply': return THREE.MultiplyBlending;
      case 'screen': return THREE.NormalBlending;
      default: return THREE.NormalBlending;
    }
  }
  
  play(): void {
    this.state.isPlaying = true;
  }
  
  pause(): void {
    this.state.isPlaying = false;
  }
  
  stop(): void {
    this.state.isPlaying = false;
    this.state.emitAccumulator = 0;
    this.state.burstTimer = 0;
  }
  
  emit(count: number): void {
    // Trigger burst emission
    this.system.triggerEmission(this, count);
  }
  
  setPosition(position: THREE.Vector3): void {
    this.state.position.copy(position);
  }
  
  setRotation(rotation: THREE.Quaternion): void {
    this.state.rotation.copy(rotation);
  }
  
  setVelocity(velocity: THREE.Vector3): void {
    this.state.velocity.copy(velocity);
  }
  
  getActiveCount(): number {
    return this.system.getActiveParticleCount(this);
  }
  
  getParticleIndex(): number {
    return this.particleIndex;
  }
  
  getParticleCount(): number {
    return this.particleCount;
  }
  
  updateTrails(positions: Float32Array, colors: Float32Array): void {
    if (!this.config.trailsEnabled || !this.trailGeometry) return;
    
    const trailPos = this.trailGeometry.attributes.position.array as Float32Array;
    const trailColors = this.trailGeometry.attributes.color.array as Float32Array;
    const trailAlphas = this.trailGeometry.attributes.alpha.array as Float32Array;
    
    // Shift trail history
    for (let i = this.config.trailLength - 1; i > 0; i--) {
      const srcIdx = (i - 1) * 6;
      const dstIdx = i * 6;
      for (let j = 0; j < 6; j++) {
        trailPos[dstIdx + j] = trailPos[srcIdx + j];
        trailColors[dstIdx + j] = trailColors[srcIdx + j];
      }
      trailAlphas[i * 2] = trailAlphas[(i - 1) * 2];
      trailAlphas[i * 2 + 1] = trailAlphas[(i - 1) * 2 + 1];
    }
    
    // Add new trail segment
    for (let i = 0; i < 3; i++) {
      trailPos[i] = positions[i];
      trailPos[i + 3] = positions[i];
      trailColors[i] = colors[i];
      trailColors[i + 3] = colors[i];
    }
    trailAlphas[0] = 1.0;
    trailAlphas[1] = 1.0;
    
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.color.needsUpdate = true;
    this.trailGeometry.attributes.alpha.needsUpdate = true;
  }
  
  dispose(): void {
    if (this.trailGeometry) {
      this.trailGeometry.dispose();
    }
    if (this.trailMesh) {
      (this.trailMesh.material as THREE.Material).dispose();
      this.system.getScene()?.remove(this.trailMesh);
    }
  }
}

// ============================================
// GPU PARTICLE SYSTEM CLASS
// ============================================

export class GPUParticleSystem {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  
  private gpuCompute: typeof GPUComputationRenderer.prototype | null = null;
  private positionVariable: ReturnType<typeof GPUComputationRenderer.prototype.addVariable> | null = null;
  private velocityVariable: ReturnType<typeof GPUComputationRenderer.prototype.addVariable> | null = null;
  
  private emitters: Map<string, GPUEmitter> = new Map();
  private particleGeometry: THREE.InstancedBufferGeometry | null = null;
  private particleMaterial: THREE.ShaderMaterial | null = null;
  private particleMesh: THREE.InstancedMesh | null = null;
  
  private time: number = 0;
  private globalWind: THREE.Vector3;
  private globalGravity: THREE.Vector3;
  
  private stats: ParticleStats = {
    activeParticles: 0,
    totalEmitters: 0,
    memoryUsage: 0,
    gpuTime: 0,
    drawCalls: 0,
  };
  
  private maxTotalParticles: number = 100000;
  private textureWidth: number = 256; // 256 * 256 = 65536 particles
  
  constructor() {
    this.globalWind = new THREE.Vector3(0, 0, 0);
    this.globalGravity = new THREE.Vector3(0, -9.8, 0);
  }
  
  initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    
    // Initialize GPU Computation
    this.gpuCompute = new GPUComputationRenderer(this.textureWidth, this.textureWidth, renderer);
    
    if (!renderer.capabilities.isWebGL2) {
      renderer.getContext().getExtension('OES_texture_float');
      renderer.getContext().getExtension('OES_texture_float_linear');
    }
    
    // Create initial textures
    const positionTexture = this.gpuCompute.createTexture();
    const velocityTexture = this.gpuCompute.createTexture();
    
    // Initialize textures with dead particles
    const posData = positionTexture.image.data as Float32Array;
    const velData = velocityTexture.image.data as Float32Array;
    
    for (let i = 0; i < posData.length; i += 4) {
      posData[i] = 0;     // x
      posData[i + 1] = 0; // y
      posData[i + 2] = 0; // z
      posData[i + 3] = -1; // life (dead)
      
      velData[i] = 0;     // vx
      velData[i + 1] = 0; // vy
      velData[i + 2] = 0; // vz
      velData[i + 3] = Math.random(); // random seed
    }
    
    // Add compute variables
    this.positionVariable = this.gpuCompute.addVariable(
      'texturePosition',
      positionComputeShader,
      positionTexture
    );
    
    this.velocityVariable = this.gpuCompute.addVariable(
      'textureVelocity',
      velocityComputeShader,
      velocityTexture
    );
    
    // Set dependencies
    this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
    this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);
    
    // Set uniforms for position shader
    this.positionVariable.material.uniforms.uDeltaTime = { value: 0 };
    this.positionVariable.material.uniforms.uTime = { value: 0 };
    this.positionVariable.material.uniforms.uGravity = { value: this.globalGravity };
    this.positionVariable.material.uniforms.uWind = { value: this.globalWind };
    this.positionVariable.material.uniforms.uDrag = { value: 0 };
    this.positionVariable.material.uniforms.uTurbulence = { value: 0 };
    this.positionVariable.material.uniforms.uTurbulenceFrequency = { value: 1 };
    this.positionVariable.material.uniforms.uVelocityTexture = { value: null };
    
    // Set uniforms for velocity shader
    this.velocityVariable.material.uniforms.uDeltaTime = { value: 0 };
    this.velocityVariable.material.uniforms.uEmitterPosition = { value: new THREE.Vector3() };
    this.velocityVariable.material.uniforms.uEmitterVelocity = { value: new THREE.Vector3() };
    this.velocityVariable.material.uniforms.uEmitterRotation = { value: new THREE.Vector4(0, 0, 0, 1) };
    this.velocityVariable.material.uniforms.uEmitRate = { value: 0 };
    this.velocityVariable.material.uniforms.uTime = { value: 0 };
    this.velocityVariable.material.uniforms.uLifetimeMin = { value: 1 };
    this.velocityVariable.material.uniforms.uLifetimeMax = { value: 3 };
    this.velocityVariable.material.uniforms.uSpeedMin = { value: 1 };
    this.velocityVariable.material.uniforms.uSpeedMax = { value: 3 };
    this.velocityVariable.material.uniforms.uRadius = { value: 0.1 };
    this.velocityVariable.material.uniforms.uShape = { value: 0 };
    this.velocityVariable.material.uniforms.uDirection = { value: 0 };
    this.velocityVariable.material.uniforms.uInheritVelocity = { value: 0 };
    this.velocityVariable.material.uniforms.uAngularVelMin = { value: 0 };
    this.velocityVariable.material.uniforms.uAngularVelMax = { value: 0 };
    this.velocityVariable.material.uniforms.uPositionTexture = { value: null };
    
    // Initialize GPU compute
    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error('GPU Particle System initialization error:', error);
      return;
    }
    
    // Create particle rendering mesh
    this.createParticleMesh();
    
    this.stats.memoryUsage = this.textureWidth * this.textureWidth * 4 * 4 * 2; // 2 textures, 4 floats, 4 bytes
  }
  
  private createParticleMesh(): void {
    if (!this.renderer) return;
    
    // Create instanced geometry
    this.particleGeometry = new THREE.InstancedBufferGeometry();
    
    // Base geometry (quad)
    const quadGeometry = new THREE.PlaneGeometry(1, 1);
    this.particleGeometry.index = quadGeometry.index;
    this.particleGeometry.attributes.position = quadGeometry.attributes.position;
    this.particleGeometry.attributes.uv = quadGeometry.attributes.uv;
    
    // Instance attributes
    const particleCount = this.textureWidth * this.textureWidth;
    const references = new Float32Array(particleCount * 2);
    const sizes = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);
    const alphas = new Float32Array(particleCount);
    const rotations = new Float32Array(particleCount);
    const frameIndices = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      const x = (i % this.textureWidth) / this.textureWidth;
      const y = Math.floor(i / this.textureWidth) / this.textureWidth;
      references[i * 2] = x;
      references[i * 2 + 1] = y;
      
      sizes[i] = 0.1;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
      alphas[i] = 1;
      rotations[i] = 0;
      frameIndices[i] = 0;
    }
    
    this.particleGeometry.setAttribute('aReference', new THREE.InstancedBufferAttribute(references, 2));
    this.particleGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    this.particleGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    this.particleGeometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphas, 1));
    this.particleGeometry.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotations, 1));
    this.particleGeometry.setAttribute('aFrameIndex', new THREE.InstancedBufferAttribute(frameIndices, 1));
    
    // Create shader material
    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uPositionTexture: { value: null },
        uVelocityTexture: { value: null },
        uCameraPosition: { value: new THREE.Vector3() },
        uSizeMin: { value: 0.1 },
        uSizeMax: { value: 0.5 },
        uLifetimeMin: { value: 1 },
        uLifetimeMax: { value: 3 },
        uTexture: { value: this.createDefaultTexture() },
        uAtlasColumns: { value: 1 },
        uAtlasRows: { value: 1 },
        uAnimationSpeed: { value: 1 },
        uBlendMode: { value: 0 },
        uSortMode: { value: 0 },
        uSoftParticleDistance: { value: 1 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    
    // Create instanced mesh
    const dummyGeom = new THREE.BoxGeometry(1, 1, 1);
    this.particleMesh = new THREE.InstancedMesh(
      dummyGeom,
      this.particleMaterial,
      particleCount
    );
    this.particleMesh.frustumCulled = false;
    this.particleMesh.geometry = this.particleGeometry;
    
    dummyGeom.dispose();
  }
  
  private createDefaultTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    // Create radial gradient
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  
  setScene(scene: THREE.Scene): void {
    this.scene = scene;
    if (this.particleMesh) {
      scene.add(this.particleMesh);
    }
  }
  
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }
  
  getScene(): THREE.Scene | null {
    return this.scene;
  }
  
  createEmitter(config: Partial<GPUParticleConfig>): GPUEmitter {
    const fullConfig: GPUParticleConfig = {
      maxParticles: config.maxParticles || 1000,
      rate: config.rate || 10,
      burstCount: config.burstCount,
      burstInterval: config.burstInterval,
      lifetimeMin: config.lifetimeMin || 1,
      lifetimeMax: config.lifetimeMax || 3,
      shape: config.shape || 'point',
      radius: config.radius || 0.1,
      mesh: config.mesh,
      speedMin: config.speedMin || 1,
      speedMax: config.speedMax || 3,
      direction: config.direction || 'up',
      inheritVelocity: config.inheritVelocity || 0,
      sizeCurve: config.sizeCurve || [1, 0.5, 0],
      startSizeMin: config.startSizeMin || 0.1,
      startSizeMax: config.startSizeMax || 0.3,
      colorGradient: config.colorGradient || [new THREE.Color(1, 1, 1), new THREE.Color(0.5, 0.5, 0.5)],
      alphaCurve: config.alphaCurve || [1, 0.5, 0],
      rotationMin: config.rotationMin || 0,
      rotationMax: config.rotationMax || 0,
      angularVelocityMin: config.angularVelocityMin || 0,
      angularVelocityMax: config.angularVelocityMax || 0,
      gravity: config.gravity || new THREE.Vector3(0, -9.8, 0),
      drag: config.drag || 0,
      wind: config.wind || new THREE.Vector3(0, 0, 0),
      turbulence: config.turbulence || 0,
      turbulenceFrequency: config.turbulenceFrequency || 1,
      collisionEnabled: config.collisionEnabled || false,
      collisionRadius: config.collisionRadius || 0.1,
      bounce: config.bounce || 0.5,
      blendMode: config.blendMode || 'additive',
      renderMode: config.renderMode || 'billboard',
      stretchFactor: config.stretchFactor || 1,
      texture: config.texture,
      atlas: config.atlas,
      animationSpeed: config.animationSpeed || 1,
      sortMode: config.sortMode || 'none',
      trailsEnabled: config.trailsEnabled || false,
      trailLength: config.trailLength || 10,
      trailWidth: config.trailWidth || 0.1,
      trailFade: config.trailFade ?? true,
    };
    
    const id = `emitter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Find available particle index
    let particleIndex = 0;
    let usedCount = 0;
    for (const emitter of this.emitters.values()) {
      usedCount += emitter.getParticleCount();
    }
    particleIndex = usedCount;
    
    if (particleIndex + fullConfig.maxParticles > this.maxTotalParticles) {
      console.warn('GPU Particle System: Maximum particles limit reached');
      particleIndex = Math.max(0, this.maxTotalParticles - fullConfig.maxParticles);
    }
    
    const emitter = new GPUEmitter(id, fullConfig, this, particleIndex);
    this.emitters.set(id, emitter);
    
    this.stats.totalEmitters = this.emitters.size;
    
    return emitter;
  }
  
  destroyEmitter(emitter: GPUEmitter): void {
    emitter.dispose();
    this.emitters.delete(emitter.id);
    this.stats.totalEmitters = this.emitters.size;
  }
  
  triggerEmission(emitter: GPUEmitter, count: number): void {
    // This would trigger a burst emission
    // In GPU compute, we'd update the emission rate temporarily
    const config = emitter.config;
    const originalRate = config.rate;
    config.rate = count * 10; // High rate for burst
    setTimeout(() => {
      config.rate = originalRate;
    }, 100);
  }
  
  getActiveParticleCount(emitter: GPUEmitter): number {
    // Count would be read from GPU texture
    return 0; // Placeholder
  }
  
  update(deltaTime: number): void {
    if (!this.gpuCompute || !this.positionVariable || !this.velocityVariable) return;
    
    this.time += deltaTime;
    
    // Update uniforms
    this.positionVariable.material.uniforms.uDeltaTime.value = deltaTime;
    this.positionVariable.material.uniforms.uTime.value = this.time;
    this.positionVariable.material.uniforms.uVelocityTexture.value = 
      this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
    
    // Update per-emitter uniforms and compute
    let activeCount = 0;
    
    for (const emitter of this.emitters.values()) {
      if (!emitter.state.isPlaying) continue;
      
      // Update velocity shader uniforms
      const config = emitter.config;
      const state = emitter.state;
      
      this.velocityVariable.material.uniforms.uEmitterPosition.value.copy(state.position);
      this.velocityVariable.material.uniforms.uEmitterVelocity.value.copy(state.velocity);
      this.velocityVariable.material.uniforms.uEmitterRotation.value.set(
        state.rotation.x,
        state.rotation.y,
        state.rotation.z,
        state.rotation.w
      );
      this.velocityVariable.material.uniforms.uEmitRate.value = config.rate;
      this.velocityVariable.material.uniforms.uTime.value = this.time;
      this.velocityVariable.material.uniforms.uLifetimeMin.value = config.lifetimeMin;
      this.velocityVariable.material.uniforms.uLifetimeMax.value = config.lifetimeMax;
      this.velocityVariable.material.uniforms.uSpeedMin.value = config.speedMin;
      this.velocityVariable.material.uniforms.uSpeedMax.value = config.speedMax;
      this.velocityVariable.material.uniforms.uRadius.value = config.radius;
      this.velocityVariable.material.uniforms.uShape.value = this.getShapeIndex(config.shape);
      this.velocityVariable.material.uniforms.uDirection.value = this.getDirectionIndex(config.direction);
      this.velocityVariable.material.uniforms.uInheritVelocity.value = config.inheritVelocity;
      this.velocityVariable.material.uniforms.uAngularVelMin.value = config.angularVelocityMin;
      this.velocityVariable.material.uniforms.uAngularVelMax.value = config.angularVelocityMax;
      this.velocityVariable.material.uniforms.uPositionTexture.value = 
        this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
      
      // Update position shader physics uniforms
      this.positionVariable.material.uniforms.uGravity.value.copy(config.gravity).add(this.globalGravity);
      this.positionVariable.material.uniforms.uWind.value.copy(config.wind).add(this.globalWind);
      this.positionVariable.material.uniforms.uDrag.value = config.drag;
      this.positionVariable.material.uniforms.uTurbulence.value = config.turbulence;
      this.positionVariable.material.uniforms.uTurbulenceFrequency.value = config.turbulenceFrequency;
      
      activeCount += Math.floor(config.rate * deltaTime);
      
      // Handle burst emissions
      if (config.burstCount && config.burstInterval && config.burstInterval > 0) {
        state.burstTimer += deltaTime;
        if (state.burstTimer >= config.burstInterval) {
          this.triggerEmission(emitter, config.burstCount);
          state.burstTimer = 0;
        }
      }
      
      // Initial burst
      if (config.burstCount && state.emitAccumulator === 0) {
        this.triggerEmission(emitter, config.burstCount);
        state.emitAccumulator = 1;
      }
    }
    
    // Run GPU computation
    this.gpuCompute.compute();
    
    // Update particle rendering uniforms
    if (this.particleMaterial && this.camera) {
      this.particleMaterial.uniforms.uPositionTexture.value = 
        this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
      this.particleMaterial.uniforms.uVelocityTexture.value = 
        this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
      this.particleMaterial.uniforms.uCameraPosition.value.copy(this.camera.position);
    }
    
    this.stats.activeParticles = activeCount;
  }
  
  render(): void {
    // Particle rendering is handled by the scene graph
    // This method can be used for additional rendering passes
    this.stats.drawCalls = this.emitters.size;
  }
  
  private getShapeIndex(shape: string): number {
    const shapes = ['point', 'sphere', 'cone', 'box', 'circle', 'mesh'];
    return shapes.indexOf(shape);
  }
  
  private getDirectionIndex(direction: string): number {
    const directions = ['up', 'outward', 'random', 'forward', 'normal'];
    return directions.indexOf(direction);
  }
  
  setGlobalWind(wind: THREE.Vector3): void {
    this.globalWind.copy(wind);
  }
  
  setGlobalGravity(gravity: THREE.Vector3): void {
    this.globalGravity.copy(gravity);
  }
  
  getStats(): ParticleStats {
    return { ...this.stats };
  }
  
  dispose(): void {
    // Dispose all emitters
    for (const emitter of this.emitters.values()) {
      emitter.dispose();
    }
    this.emitters.clear();
    
    // Dispose GPU resources
    if (this.particleGeometry) {
      this.particleGeometry.dispose();
    }
    if (this.particleMaterial) {
      this.particleMaterial.dispose();
    }
    if (this.particleMesh) {
      this.particleMesh.geometry.dispose();
      this.scene?.remove(this.particleMesh);
    }
    
    // GPU compute textures are managed internally
    this.stats = {
      activeParticles: 0,
      totalEmitters: 0,
      memoryUsage: 0,
      gpuTime: 0,
      drawCalls: 0,
    };
  }
}

// ============================================
// PARTICLE PRESETS
// ============================================

export const GPUParticlePresets: Record<string, Partial<GPUParticleConfig>> = {
  fire: {
    maxParticles: 500,
    rate: 50,
    lifetimeMin: 0.5,
    lifetimeMax: 1.5,
    shape: 'circle',
    radius: 0.3,
    speedMin: 2,
    speedMax: 4,
    direction: 'up',
    startSizeMin: 0.3,
    startSizeMax: 0.6,
    sizeCurve: [1, 0.5, 0],
    colorGradient: [new THREE.Color(1, 0.8, 0.2), new THREE.Color(1, 0.3, 0), new THREE.Color(0.5, 0.1, 0)],
    alphaCurve: [1, 0.8, 0],
    gravity: new THREE.Vector3(0, 0.5, 0),
    turbulence: 0.3,
    blendMode: 'additive',
    renderMode: 'billboard',
  },
  
  smoke: {
    maxParticles: 200,
    rate: 20,
    lifetimeMin: 2,
    lifetimeMax: 4,
    shape: 'circle',
    radius: 0.2,
    speedMin: 0.5,
    speedMax: 1.5,
    direction: 'up',
    startSizeMin: 0.2,
    startSizeMax: 0.4,
    sizeCurve: [1, 2, 3],
    colorGradient: [new THREE.Color(0.3, 0.3, 0.3), new THREE.Color(0.1, 0.1, 0.1)],
    alphaCurve: [0.8, 0.4, 0],
    gravity: new THREE.Vector3(0, 0.5, 0),
    drag: 0.1,
    turbulence: 0.5,
    blendMode: 'alpha',
    renderMode: 'billboard',
  },
  
  explosion: {
    maxParticles: 200,
    rate: 0,
    burstCount: 100,
    lifetimeMin: 0.5,
    lifetimeMax: 1.5,
    shape: 'point',
    radius: 0,
    speedMin: 5,
    speedMax: 15,
    direction: 'outward',
    startSizeMin: 0.2,
    startSizeMax: 0.5,
    sizeCurve: [1, 0.5, 0],
    colorGradient: [new THREE.Color(1, 0.8, 0.2), new THREE.Color(1, 0.3, 0), new THREE.Color(0.3, 0.1, 0)],
    alphaCurve: [1, 0.5, 0],
    gravity: new THREE.Vector3(0, -5, 0),
    drag: 0.2,
    blendMode: 'additive',
    renderMode: 'billboard',
  },
  
  sparkles: {
    maxParticles: 300,
    rate: 100,
    lifetimeMin: 0.3,
    lifetimeMax: 0.8,
    shape: 'sphere',
    radius: 0.5,
    speedMin: 1,
    speedMax: 3,
    direction: 'outward',
    startSizeMin: 0.05,
    startSizeMax: 0.15,
    sizeCurve: [1, 0.5, 0],
    colorGradient: [new THREE.Color(0.5, 0.8, 1), new THREE.Color(1, 1, 1)],
    alphaCurve: [1, 0.5, 0],
    blendMode: 'additive',
    renderMode: 'billboard',
  },
  
  magic: {
    maxParticles: 150,
    rate: 30,
    lifetimeMin: 1,
    lifetimeMax: 2,
    shape: 'sphere',
    radius: 0.3,
    speedMin: 0.5,
    speedMax: 2,
    direction: 'random',
    startSizeMin: 0.1,
    startSizeMax: 0.3,
    sizeCurve: [1, 0.5, 0],
    colorGradient: [new THREE.Color(0.5, 0, 1), new THREE.Color(1, 0, 0.5), new THREE.Color(0.8, 0.5, 1)],
    alphaCurve: [1, 0.5, 0],
    turbulence: 0.5,
    turbulenceFrequency: 2,
    blendMode: 'additive',
    renderMode: 'billboard',
  },
  
  snow: {
    maxParticles: 1000,
    rate: 50,
    lifetimeMin: 5,
    lifetimeMax: 10,
    shape: 'box',
    radius: 10,
    speedMin: 0.5,
    speedMax: 1,
    direction: 'up',
    startSizeMin: 0.05,
    startSizeMax: 0.15,
    sizeCurve: [1, 1, 1],
    colorGradient: [new THREE.Color(1, 1, 1), new THREE.Color(0.9, 0.9, 1)],
    alphaCurve: [0.8, 0.6, 0.3],
    gravity: new THREE.Vector3(0, -2, 0),
    wind: new THREE.Vector3(0.5, 0, 0.2),
    turbulence: 0.2,
    blendMode: 'alpha',
    renderMode: 'billboard',
  },
  
  rain: {
    maxParticles: 2000,
    rate: 200,
    lifetimeMin: 1,
    lifetimeMax: 2,
    shape: 'box',
    radius: 15,
    speedMin: 15,
    speedMax: 25,
    direction: 'up',
    startSizeMin: 0.02,
    startSizeMax: 0.05,
    sizeCurve: [1, 1, 1],
    colorGradient: [new THREE.Color(0.7, 0.8, 1), new THREE.Color(0.5, 0.6, 0.8)],
    alphaCurve: [0.6, 0.4, 0.2],
    gravity: new THREE.Vector3(0, -30, 0),
    blendMode: 'alpha',
    renderMode: 'stretched',
    stretchFactor: 2,
  },
  
  debris: {
    maxParticles: 50,
    rate: 0,
    burstCount: 20,
    lifetimeMin: 1,
    lifetimeMax: 2,
    shape: 'point',
    radius: 0,
    speedMin: 3,
    speedMax: 8,
    direction: 'outward',
    startSizeMin: 0.1,
    startSizeMax: 0.3,
    sizeCurve: [1, 0.8, 0.5],
    colorGradient: [new THREE.Color(0.6, 0.5, 0.4), new THREE.Color(0.4, 0.3, 0.2)],
    alphaCurve: [1, 0.7, 0],
    gravity: new THREE.Vector3(0, -15, 0),
    drag: 0.1,
    bounce: 0.3,
    collisionEnabled: true,
    collisionRadius: 0.1,
    blendMode: 'alpha',
    renderMode: 'billboard',
    angularVelocityMin: -5,
    angularVelocityMax: 5,
  },
  
  dust: {
    maxParticles: 100,
    rate: 10,
    lifetimeMin: 2,
    lifetimeMax: 4,
    shape: 'box',
    radius: 2,
    speedMin: 0.1,
    speedMax: 0.5,
    direction: 'random',
    startSizeMin: 0.05,
    startSizeMax: 0.2,
    sizeCurve: [1, 1, 1],
    colorGradient: [new THREE.Color(0.6, 0.5, 0.4), new THREE.Color(0.4, 0.3, 0.2)],
    alphaCurve: [0.5, 0.3, 0],
    turbulence: 0.3,
    blendMode: 'alpha',
    renderMode: 'billboard',
  },
  
  bubbles: {
    maxParticles: 100,
    rate: 20,
    lifetimeMin: 2,
    lifetimeMax: 5,
    shape: 'circle',
    radius: 0.5,
    speedMin: 0.5,
    speedMax: 1.5,
    direction: 'up',
    startSizeMin: 0.05,
    startSizeMax: 0.2,
    sizeCurve: [1, 1.2, 1.5],
    colorGradient: [new THREE.Color(0.5, 0.7, 1), new THREE.Color(0.8, 0.9, 1)],
    alphaCurve: [0.6, 0.4, 0],
    gravity: new THREE.Vector3(0, 0.5, 0),
    turbulence: 0.5,
    blendMode: 'alpha',
    renderMode: 'billboard',
  },
  
  blood: {
    maxParticles: 50,
    rate: 0,
    burstCount: 20,
    lifetimeMin: 0.5,
    lifetimeMax: 1,
    shape: 'point',
    radius: 0,
    speedMin: 3,
    speedMax: 8,
    direction: 'outward',
    startSizeMin: 0.1,
    startSizeMax: 0.3,
    sizeCurve: [1, 0.8, 0.5],
    colorGradient: [new THREE.Color(0.8, 0, 0), new THREE.Color(0.4, 0, 0)],
    alphaCurve: [1, 0.7, 0],
    gravity: new THREE.Vector3(0, -15, 0),
    drag: 0.1,
    blendMode: 'alpha',
    renderMode: 'billboard',
  },
  
  waterSplash: {
    maxParticles: 100,
    rate: 0,
    burstCount: 50,
    lifetimeMin: 0.5,
    lifetimeMax: 1,
    shape: 'circle',
    radius: 0.2,
    speedMin: 2,
    speedMax: 5,
    direction: 'outward',
    startSizeMin: 0.05,
    startSizeMax: 0.15,
    sizeCurve: [1, 0.5, 0],
    colorGradient: [new THREE.Color(0.5, 0.7, 1), new THREE.Color(0.8, 0.9, 1)],
    alphaCurve: [0.8, 0.4, 0],
    gravity: new THREE.Vector3(0, -10, 0),
    drag: 0.2,
    blendMode: 'alpha',
    renderMode: 'billboard',
  },
  
  confetti: {
    maxParticles: 200,
    rate: 0,
    burstCount: 100,
    lifetimeMin: 2,
    lifetimeMax: 4,
    shape: 'circle',
    radius: 0.5,
    speedMin: 3,
    speedMax: 8,
    direction: 'up',
    startSizeMin: 0.1,
    startSizeMax: 0.2,
    sizeCurve: [1, 1, 1],
    colorGradient: [
      new THREE.Color(1, 0.2, 0.2),
      new THREE.Color(0.2, 1, 0.2),
      new THREE.Color(0.2, 0.2, 1),
      new THREE.Color(1, 1, 0.2),
    ],
    alphaCurve: [1, 0.8, 0],
    gravity: new THREE.Vector3(0, -5, 0),
    turbulence: 1,
    blendMode: 'alpha',
    renderMode: 'billboard',
    angularVelocityMin: -10,
    angularVelocityMax: 10,
  },
  
  electricity: {
    maxParticles: 50,
    rate: 100,
    lifetimeMin: 0.1,
    lifetimeMax: 0.2,
    shape: 'sphere',
    radius: 0.3,
    speedMin: 5,
    speedMax: 10,
    direction: 'random',
    startSizeMin: 0.05,
    startSizeMax: 0.1,
    sizeCurve: [1, 0.5, 0],
    colorGradient: [new THREE.Color(0.5, 0.8, 1), new THREE.Color(1, 1, 1)],
    alphaCurve: [1, 0.5, 0],
    blendMode: 'additive',
    renderMode: 'billboard',
    trailsEnabled: true,
    trailLength: 5,
  },
  
  laser: {
    maxParticles: 10,
    rate: 50,
    lifetimeMin: 0.1,
    lifetimeMax: 0.2,
    shape: 'point',
    radius: 0,
    speedMin: 50,
    speedMax: 50,
    direction: 'forward',
    startSizeMin: 0.05,
    startSizeMax: 0.1,
    sizeCurve: [1, 1, 1],
    colorGradient: [new THREE.Color(1, 0, 0), new THREE.Color(1, 0.5, 0.5)],
    alphaCurve: [1, 1, 0.5],
    blendMode: 'additive',
    renderMode: 'stretched',
    stretchFactor: 5,
    trailsEnabled: true,
    trailLength: 10,
  },
  
  portal: {
    maxParticles: 200,
    rate: 50,
    lifetimeMin: 2,
    lifetimeMax: 4,
    shape: 'circle',
    radius: 1.5,
    speedMin: 0.5,
    speedMax: 1.5,
    direction: 'outward',
    startSizeMin: 0.1,
    startSizeMax: 0.3,
    sizeCurve: [1, 1.5, 0],
    colorGradient: [
      new THREE.Color(0.5, 0, 1),
      new THREE.Color(0.8, 0.2, 1),
      new THREE.Color(0.3, 0, 0.5),
    ],
    alphaCurve: [0.8, 0.5, 0],
    turbulence: 1,
    turbulenceFrequency: 3,
    blendMode: 'additive',
    renderMode: 'billboard',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a GPU particle emitter from a preset
 */
export function createGPUParticlePreset(
  system: GPUParticleSystem,
  preset: keyof typeof GPUParticlePresets,
  position?: THREE.Vector3
): GPUEmitter {
  const config = GPUParticlePresets[preset];
  if (!config) {
    console.warn(`GPU Particle preset "${preset}" not found, using default`);
  }
  
  const emitter = system.createEmitter(config || {});
  
  if (position) {
    emitter.setPosition(position);
  }
  
  return emitter;
}

/**
 * Create a texture from a gradient for particle effects
 */
export function createGradientTexture(
  colors: THREE.Color[],
  size: number = 64
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  
  colors.forEach((color, index) => {
    const stop = index / (colors.length - 1);
    gradient.addColorStop(stop, `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`);
  });
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Create a sprite sheet texture for animated particles
 */
export function createSpriteSheetTexture(
  frames: number,
  columns: number,
  rows: number,
  generator: (frame: number, ctx: CanvasRenderingContext2D, width: number, height: number) => void
): THREE.Texture {
  const frameWidth = 64;
  const frameHeight = 64;
  const canvas = document.createElement('canvas');
  canvas.width = frameWidth * columns;
  canvas.height = frameHeight * rows;
  const ctx = canvas.getContext('2d')!;
  
  for (let frame = 0; frame < frames; frame++) {
    const col = frame % columns;
    const row = Math.floor(frame / columns);
    ctx.save();
    ctx.translate(col * frameWidth, row * frameHeight);
    generator(frame, ctx, frameWidth, frameHeight);
    ctx.restore();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ============================================
// COLLISION SYSTEM
// ============================================

export class ParticleCollisionSystem {
  private heightmapTexture: THREE.Texture | null = null;
  private collisionMeshes: THREE.Mesh[] = [];
  
  setHeightmap(texture: THREE.Texture): void {
    this.heightmapTexture = texture;
  }
  
  addCollisionMesh(mesh: THREE.Mesh): void {
    this.collisionMeshes.push(mesh);
  }
  
  removeCollisionMesh(mesh: THREE.Mesh): void {
    const index = this.collisionMeshes.indexOf(mesh);
    if (index !== -1) {
      this.collisionMeshes.splice(index, 1);
    }
  }
  
  clearCollisionMeshes(): void {
    this.collisionMeshes = [];
  }
  
  getCollisionUniforms(): Record<string, { value: unknown }> {
    return {
      uHeightmap: { value: this.heightmapTexture },
      uCollisionMeshCount: { value: this.collisionMeshes.length },
    };
  }
}

// ============================================
// LOD SYSTEM
// ============================================

export class ParticleLODSystem {
  private distanceThresholds: Map<string, number[]> = new Map();
  private lodLevels: Map<string, number[]> = new Map();
  
  setLODLevels(emitterId: string, distances: number[], particleCounts: number[]): void {
    this.distanceThresholds.set(emitterId, distances);
    this.lodLevels.set(emitterId, particleCounts);
  }
  
  getLODLevel(emitterId: string, distance: number): number {
    const thresholds = this.distanceThresholds.get(emitterId);
    if (!thresholds) return 0;
    
    for (let i = 0; i < thresholds.length; i++) {
      if (distance < thresholds[i]) {
        return i;
      }
    }
    return thresholds.length;
  }
  
  getParticleCountForDistance(emitterId: string, distance: number, baseCount: number): number {
    const lodLevel = this.getLODLevel(emitterId, distance);
    const lodLevels = this.lodLevels.get(emitterId);
    
    if (!lodLevels || lodLevel >= lodLevels.length) {
      return Math.floor(baseCount * 0.1); // Minimum quality
    }
    
    return Math.floor(baseCount * lodLevels[lodLevel]);
  }
}

// ============================================
// EXPORTS
// ============================================

export default GPUParticleSystem;
