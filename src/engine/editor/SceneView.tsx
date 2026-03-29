// ============================================
// Scene View Component - 3D Viewport with Editor Tools
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveScene, useEngineStore } from '@/store/editorStore';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { TransformTools } from './gizmos';
import type { SelectionManager, SelectionBox } from './selection';
import {
  EditorToolbar,
  type CameraMode,
  type PivotMode,
} from './EditorToolbar';
import { useSceneEntitySync } from './useSceneEntitySync';
import { useSceneViewShortcuts } from './useSceneViewShortcuts';
import { useSceneViewPaint } from './useSceneViewPaint';
import { useSceneViewPointerInteractions } from './useSceneViewPointerInteractions';
import { useSceneViewSetup } from './useSceneViewSetup';
import { useSceneViewLOD } from './useSceneViewLOD';
import { useSceneViewTestBridge } from './useSceneViewTestBridge';
import { useSceneViewEntityActions } from './useSceneViewEntityActions';
import { useSceneViewHistoryActions } from './useSceneViewHistoryActions';
import { scriptRuntime } from '@/engine/gameplay/ScriptRuntime';
import {
  STORE_OBJECT_PREFIX,
  asRecord,
  readQuaternion,
  readVector3,
} from './sceneView.visuals';
import {
  buildEditableMeshSignature,
  cloneEditableMesh,
  createPrimitiveMesh,
  getSelectionCenter,
  getSelectionVertexIndices,
  getVisibleFaceIndices,
  listMeshEdges,
  listVisibleMeshEdgeIndices,
  parseEditableMesh,
  type EditableMesh,
  type ModelerElementMode,
} from './modelerMesh';
import { acceptTopologyIntentStroke } from './modelerTopologyBridge';
import {
  createModelerHelperGroup,
  disposeModelerHelperGroup,
  MODELER_HELPER_GROUP_NAME,
} from './modelerViewportHelpers';
import {
  computeEditableMeshBoundsCenter,
  resolveEditableMeshFromEntity,
  translateEditableMesh,
} from './pivotTools';
import {
  applyCameraTransform,
  applyOrthographicLens,
  applyPerspectiveLens,
  computeOrthographicSizeToFitBox,
  deriveOrthographicSizeFromPerspective,
  getOrthographicSize,
  getViewportAspect,
  isPerspectiveCamera,
  setCameraClipPlanes,
  setOrthographicSize,
  type ViewportCamera,
} from './viewportCamera';
import {
  buildWorldEnvironmentUrl,
  computeDirectionalLightPosition,
  getThreeToneMapping,
  getWorldSkyAssetPath,
  isHdrEnvironmentAsset,
  resolveToneMapping,
  resolveWorldSkyPreset,
  WORLD_SKY_PRESETS,
} from './worldPipeline';

interface SceneViewProps {
  className?: string;
}

type SnapValues = {
  translate: number;
  rotate: number;
  scale: number;
};

type AxisState = {
  x: boolean;
  y: boolean;
  z: boolean;
};

type SceneRuntimeEnvironment = THREE.Scene & {
  backgroundIntensity?: number;
  environmentIntensity?: number;
  backgroundRotation?: THREE.Euler;
  environmentRotation?: THREE.Euler;
};

interface ModelerDragState {
  entityId: string;
  mode: ModelerElementMode;
  selection: number[];
  startMesh: EditableMesh;
  vertexIndices: number[];
  worldMatrix: THREE.Matrix4;
  worldMatrixInverse: THREE.Matrix4;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
  maxDistanceFromCenter: number;
}

interface ObjectPivotDragTarget {
  object: THREE.Object3D;
  startWorldMatrix: THREE.Matrix4;
  parentWorldMatrixInverse: THREE.Matrix4;
}

interface ObjectPivotDragState {
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
  targets: ObjectPivotDragTarget[];
}

function clampModelerSelection(indices: number[], max: number) {
  if (max <= 0) return [];
  const next = Array.from(
    new Set(indices.filter((index) => index >= 0 && index < max))
  );
  return next.length > 0 ? next : [0];
}

function clampSelectableModelerSelection(
  indices: number[],
  max: number,
  selectableIds: number[]
) {
  const clamped = clampModelerSelection(indices, max);
  const allowed = new Set(selectableIds);
  const filtered = clamped.filter((index) => allowed.has(index));
  if (filtered.length > 0) {
    return filtered;
  }
  return selectableIds.length > 0 ? [selectableIds[0]!] : [];
}

const MODELER_GIZMO_PROXY_NAME = '__modeler_gizmo_proxy';
const OBJECT_PIVOT_GIZMO_PROXY_NAME = '__object_pivot_gizmo_proxy';
const MODELER_SUBELEMENT_SCALE_MIN = 0.25;
const MODELER_SUBELEMENT_SCALE_MAX = 3.5;
const MODELER_SUBELEMENT_DISTANCE_LIMIT_MULTIPLIER = 3.5;

function createEnvironmentTexture(preset: string, rotationDegrees: number) {
  if (typeof document === 'undefined') return null;

  const palette = WORLD_SKY_PRESETS[resolveWorldSkyPreset(preset)];
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;

  const context = canvas.getContext('2d');
  if (!context) return null;

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette.top);
  gradient.addColorStop(0.52, palette.horizon);
  gradient.addColorStop(1, palette.bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const normalizedRotation = (((rotationDegrees % 360) + 360) % 360) / 360;
  const primaryGlowX = canvas.width * normalizedRotation;
  const secondaryGlowX = (primaryGlowX + canvas.width * 0.42) % canvas.width;
  const glowY = canvas.height * 0.28;

  [primaryGlowX, secondaryGlowX].forEach((glowX, index) => {
    const radius = index === 0 ? canvas.height * 0.78 : canvas.height * 0.45;
    const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, radius);
    glow.addColorStop(0, palette.sun);
    glow.addColorStop(0.3, palette.accent);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, canvas.width, canvas.height);
  });

  context.globalAlpha = 0.1;
  for (let index = 0; index < 14; index += 1) {
    const bandY = canvas.height * (0.24 + index * 0.035);
    context.strokeStyle = index % 2 === 0 ? '#ffffff' : '#9cc8ff';
    context.lineWidth = index % 3 === 0 ? 2 : 1;
    context.beginPath();
    context.moveTo(0, bandY);
    context.bezierCurveTo(
      canvas.width * 0.25,
      bandY - 16,
      canvas.width * 0.75,
      bandY + 12,
      canvas.width,
      bandY - 10
    );
    context.stroke();
  }

  if (preset === 'night' || preset === 'void') {
    context.globalAlpha = preset === 'night' ? 0.35 : 0.18;
    context.fillStyle = '#ffffff';
    for (let index = 0; index < 60; index += 1) {
      const starX = (index * 173) % canvas.width;
      const starY = (index * 97) % (canvas.height * 0.55);
      const size = index % 7 === 0 ? 2.2 : 1.2;
      context.beginPath();
      context.arc(starX, starY, size, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function disposeEnvironmentResources(
  texture: THREE.Texture | null,
  renderTarget: THREE.WebGLRenderTarget | null
) {
  texture?.dispose();
  renderTarget?.dispose();
}

function syncSSAOPassCamera(pass: SSAOPass | null, camera: ViewportCamera | null) {
  if (!pass || !camera) return;

  pass.camera = camera;
  pass.ssaoMaterial.uniforms.cameraNear.value = camera.near;
  pass.ssaoMaterial.uniforms.cameraFar.value = camera.far;
  pass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
  pass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
    camera.projectionMatrixInverse
  );
  pass.depthRenderMaterial.uniforms.cameraNear.value = camera.near;
  pass.depthRenderMaterial.uniforms.cameraFar.value = camera.far;
}

function syncSSRPassCamera(pass: SSRPass | null, camera: ViewportCamera | null) {
  if (!pass || !camera) return;

  pass.camera = camera;
  pass.ssrMaterial.uniforms.cameraNear.value = camera.near;
  pass.ssrMaterial.uniforms.cameraFar.value = camera.far;
  pass.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
  pass.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
    camera.projectionMatrixInverse
  );
  pass.depthRenderMaterial.uniforms.cameraNear.value = camera.near;
  pass.depthRenderMaterial.uniforms.cameraFar.value = camera.far;
}

const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1 },
    contrast: { value: 1 },
    saturation: { value: 1 },
    gamma: { value: 2.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float gamma;
    varying vec2 vUv;

    vec3 applySaturation(vec3 color, float amount) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), color, amount);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb * exposure;
      color = (color - 0.5) * contrast + 0.5;
      color = applySaturation(color, saturation);
      color = pow(max(color, vec3(0.0)), vec3(1.0 / max(gamma, 0.0001)));
      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.35 },
    smoothness: { value: 0.6 },
    roundness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    uniform float smoothness;
    uniform float roundness;
    varying vec2 vUv;

    void main() {
      vec2 centeredUv = vUv * 2.0 - 1.0;
      centeredUv.x *= mix(1.0, 1.6, 1.0 - roundness);
      float falloff = smoothstep(
        1.0,
        max(0.0001, 1.0 - smoothness),
        length(centeredUv)
      );
      vec4 texel = texture2D(tDiffuse, vUv);
      texel.rgb *= mix(1.0, 1.0 - intensity, falloff);
      gl_FragColor = texel;
    }
  `,
};

async function loadEnvironmentAssetTexture(
  assetPath: string,
  environmentUrl: string
): Promise<THREE.Texture> {
  if (assetPath.toLowerCase().endsWith('.hdr')) {
    const loader = new RGBELoader();
    const texture = await loader.loadAsync(environmentUrl);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  if (assetPath.toLowerCase().endsWith('.exr')) {
    const loader = new EXRLoader();
    const texture = await loader.loadAsync(environmentUrl);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  const loader = new THREE.TextureLoader();
  const texture = await loader.loadAsync(environmentUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

async function resolveEnvironmentTexture(
  skybox: string | null,
  rotationDegrees: number
): Promise<THREE.Texture | null> {
  const assetPath = getWorldSkyAssetPath(skybox);
  const environmentUrl = buildWorldEnvironmentUrl(skybox);
  if (assetPath && environmentUrl) {
    try {
      return await loadEnvironmentAssetTexture(assetPath, environmentUrl);
    } catch (error) {
      console.warn('[SceneView] Falling back to preset environment after asset load failure.', error);
    }
  }

  return createEnvironmentTexture(resolveWorldSkyPreset(skybox), rotationDegrees);
}

export function SceneView({ className }: SceneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<ViewportCamera | null>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const timerRef = useRef<THREE.Timer>(new THREE.Timer());
  const environmentTextureRef = useRef<THREE.Texture | null>(null);
  const environmentRenderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const pmremGeneratorRef = useRef<THREE.PMREMGenerator | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const renderPassRef = useRef<RenderPass | null>(null);
  const ssaoPassRef = useRef<SSAOPass | null>(null);
  const ssrPassRef = useRef<SSRPass | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const colorGradingPassRef = useRef<ShaderPass | null>(null);
  const vignettePassRef = useRef<ShaderPass | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const resizeViewportRef = useRef<((width: number, height: number) => void) | null>(null);
  const modelerGizmoTargetRef = useRef<THREE.Object3D | null>(null);
  const modelerDragStateRef = useRef<ModelerDragState | null>(null);
  const objectPivotGizmoTargetRef = useRef<THREE.Object3D | null>(null);
  const objectPivotDragStateRef = useRef<ObjectPivotDragState | null>(null);
  const topologyStrokeBaseMeshRef = useRef<EditableMesh | null>(null);
  const topologyStrokePointsRef = useRef<Array<{ x: number; y: number; z: number }>>([]);

  const transformToolsRef = useRef<TransformTools | null>(null);
  const selectionRef = useRef<SelectionManager | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const navigationKeysRef = useRef<Set<string>>(new Set());
  const lastAppliedCameraModeRef = useRef<CameraMode>('perspective');

  const [transformSpace, setTransformSpace] = useState<'world' | 'local'>('world');
  const [pivotMode, setPivotMode] = useState<PivotMode>('objectOrigin');
  const [gridSize, setGridSize] = useState(1);
  const [activeAxes, setActiveAxes] = useState<AxisState>({
    x: true,
    y: true,
    z: true,
  });
  const [snapValues, setSnapValues] = useState<SnapValues>({
    translate: 1,
    rotate: 15,
    scale: 0.1,
  });
  const [topologyStrokePointCount, setTopologyStrokePointCount] = useState(0);
  const [topologyLastIntentKind, setTopologyLastIntentKind] = useState<string | null>(null);

  const {
    editor,
    selectEntity,
    setGizmoMode,
    setGridVisible,
    setSnapEnabled,
    setSnapValue,
    setSnapTarget,
    setShowColliders,
    setShowLights,
    setPlayRuntimeState,
    setViewportCameraMode,
    setViewportCameraEntity,
    setModelerMode,
    setModelerSelection,
    playRuntimeState,
    updateEntity,
    updateEntityTransient,
    addEntity,
  } = useEngineStore();
  const activeScene = useActiveScene();
  const cameraMode = (editor.viewportCameraMode ?? 'perspective') as CameraMode;
  const snapTarget = (editor.snapTarget ?? 'grid') as 'grid' | 'vertex' | 'surface';
  const virtualCameraEntity = editor.viewportCameraEntityId
    ? activeScene?.entities.find((entity) => entity.id === editor.viewportCameraEntityId) ?? null
    : null;
  const selectedModelerEntityId =
    editor.selectedEntities.length === 1 ? editor.selectedEntities[0] : null;
  const selectedModelerEntity = selectedModelerEntityId
    ? activeScene?.entities.find((entity) => entity.id === selectedModelerEntityId) ?? null
    : null;
  const selectedModelerMeshData = asRecord(
    selectedModelerEntity?.components.get('MeshRenderer')?.data
  );
  const selectedModelerMeshId =
    typeof selectedModelerMeshData?.meshId === 'string'
      ? selectedModelerMeshData.meshId
      : 'cube';
  const selectedOriginMesh = useMemo(
    () => resolveEditableMeshFromEntity(selectedModelerEntity),
    [selectedModelerEntity]
  );
  const canAdjustOrigin = Boolean(selectedModelerEntity && selectedOriginMesh);
  const selectedModelerMesh = useMemo(
    () => {
      const editableMesh = parseEditableMesh(
        selectedModelerMeshData?.manualMesh ?? selectedModelerMeshData?.customMesh
      );
      if (editableMesh) return editableMesh;
      return selectedModelerEntity?.components.has('MeshRenderer')
        ? createPrimitiveMesh(selectedModelerMeshId)
        : null;
    },
    [selectedModelerEntity, selectedModelerEntityId, selectedModelerMeshData, selectedModelerMeshId]
  );
  const topologyViewportEnabled = Boolean(editor.topologyViewportEnabled);
  const topologyViewportMode = editor.topologyViewportMode ?? 'intent_driven';
  const topologyViewportTemplateType = editor.topologyViewportTemplateType ?? 'chair';
  const modelerMode = editor.modelerMode ?? 'face';
  const modelerSelectableIds =
    modelerMode === 'vertex'
      ? selectedModelerMesh?.vertices.map((_vertex, index) => index) ?? []
      : modelerMode === 'edge'
        ? selectedModelerMesh
          ? listVisibleMeshEdgeIndices(selectedModelerMesh)
          : []
        : modelerMode === 'face'
          ? selectedModelerMesh
            ? getVisibleFaceIndices(selectedModelerMesh)
            : []
          : [];
  const modelerSelectableCount =
    modelerMode === 'vertex'
      ? selectedModelerMesh?.vertices.length ?? 0
      : modelerMode === 'edge'
        ? selectedModelerMesh
          ? listMeshEdges(selectedModelerMesh).length
          : 0
        : modelerMode === 'face'
          ? selectedModelerMesh?.faces.length ?? 0
          : 0;
  const safeModelerSelection = clampSelectableModelerSelection(
    editor.modelerSelectedElements ?? [0],
    modelerSelectableCount,
    modelerSelectableIds
  );
  const selectedModelerVertexIndices = useMemo(
    () =>
      selectedModelerMesh && modelerMode !== 'object'
        ? getSelectionVertexIndices(
            selectedModelerMesh,
            modelerMode as ModelerElementMode,
            safeModelerSelection
          )
        : [],
    [modelerMode, safeModelerSelection, selectedModelerMesh]
  );
  const modelerSubSelectionActive =
    Boolean(selectedModelerEntityId) &&
    Boolean(selectedModelerMesh) &&
    modelerMode !== 'object' &&
    selectedModelerVertexIndices.length > 0;
  const topologyViewportReady =
    topologyViewportEnabled &&
    Boolean(selectedModelerEntityId) &&
    Boolean(selectedModelerMesh) &&
    modelerMode === 'object';
  const selectedModelerMeshSignature = useMemo(
    () =>
      selectedModelerMesh
        ? buildEditableMeshSignature(selectedModelerMesh)
        : null,
    [selectedModelerMesh]
  );
  const safeModelerSelectionSignature = safeModelerSelection.join(':');

  const {
    isPainting,
    startPaint,
    continuePaint,
    finishPaint,
    cancelPaint,
    undoPaint,
    redoPaint,
    getLastPastPaintTimestamp,
    getLastFuturePaintTimestamp,
    simulatePaintStroke,
  } = useSceneViewPaint({
    containerRef,
    cameraRef,
    sceneRef,
    paintEnabled: Boolean(editor.paintEnabled),
    tool: editor.tool,
    paintMode: editor.paintMode,
    paintColor: editor.paintColor,
    paintSize: editor.paintSize,
    paintStrength: editor.paintStrength,
    paintTextureSlot: editor.paintTextureSlot,
    paintTextureResolution: editor.paintTextureResolution,
    paintWeightBone: editor.paintWeightBone,
    paintWeightMirror: editor.paintWeightMirror,
    paintWeightSmooth: editor.paintWeightSmooth,
    paintWeightNormalize: editor.paintWeightNormalize,
    paintWeightErase: editor.paintWeightErase,
    sculptSymmetryX: editor.sculptSymmetryX,
    sculptDyntopo: editor.sculptDyntopo,
    sculptRemeshIterations: editor.sculptRemeshIterations,
    sculptVoxelSize: editor.sculptVoxelSize,
  });

  useSceneViewSetup({
    containerRef,
    rendererRef,
    sceneRef,
    cameraRef,
    perspectiveCameraRef,
    orthographicCameraRef,
    controlsRef,
    animationIdRef,
    timerRef,
    transformToolsRef,
    selectionRef,
    selectionBoxRef,
    renderFrameRef,
    resizeViewportRef,
  });

  useSceneViewLOD({
    sceneRef,
    cameraRef,
    rendererRef,
    transformToolsRef,
  });

  const getViewportSize = useCallback(() => {
    const width = Math.max(containerRef.current?.clientWidth ?? 1, 1);
    const height = Math.max(containerRef.current?.clientHeight ?? 1, 1);
    return {
      width,
      height,
      aspect: getViewportAspect(width, height),
    };
  }, []);

  const syncActiveCamera = useCallback((nextCamera: ViewportCamera | null) => {
    if (!nextCamera) return;

    cameraRef.current = nextCamera;
    if (renderPassRef.current) {
      renderPassRef.current.camera = nextCamera;
    }
    syncSSAOPassCamera(ssaoPassRef.current, nextCamera);
    syncSSRPassCamera(ssrPassRef.current, nextCamera);

    const controls = controlsRef.current as (OrbitControls & { object: THREE.Camera }) | null;
    if (controls) {
      controls.object = nextCamera;
    }

    selectionRef.current?.setCamera(nextCamera);
    selectionBoxRef.current?.setCamera(nextCamera);
    transformToolsRef.current?.setCamera(nextCamera);
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const initialCamera = cameraRef.current ?? perspectiveCameraRef.current;
    if (!renderer || !scene || !initialCamera) {
      return;
    }
    if (composerRef.current) {
      return;
    }

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, initialCamera);
    const ssrPass = new SSRPass({
      renderer,
      scene,
      camera: initialCamera,
      width: Math.max(containerRef.current?.clientWidth ?? 1, 1),
      height: Math.max(containerRef.current?.clientHeight ?? 1, 1),
      selects: null,
      groundReflector: null,
    });
    ssrPass.enabled = false;
    ssrPass.opacity = 0.5;
    ssrPass.maxDistance = 100;
    ssrPass.thickness = 0.018;
    ssrPass.blur = true;
    ssrPass.distanceAttenuation = true;
    ssrPass.fresnel = true;

    const ssaoPass = new SSAOPass(
      scene,
      initialCamera,
      Math.max(containerRef.current?.clientWidth ?? 1, 1),
      Math.max(containerRef.current?.clientHeight ?? 1, 1),
      32
    );
    ssaoPass.enabled = false;
    ssaoPass.kernelRadius = 8;
    ssaoPass.minDistance = 0.012;
    ssaoPass.maxDistance = 0.12;
    ssaoPass.copyMaterial.uniforms.opacity.value = 1;

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        Math.max(containerRef.current?.clientWidth ?? 1, 1),
        Math.max(containerRef.current?.clientHeight ?? 1, 1)
      ),
      0.5,
      0.5,
      0.85
    );
    bloomPass.enabled = false;

    const colorGradingPass = new ShaderPass(ColorGradingShader);
    colorGradingPass.enabled = false;

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.enabled = false;

    composer.addPass(renderPass);
    composer.addPass(ssrPass);
    composer.addPass(ssaoPass);
    composer.addPass(bloomPass);
    composer.addPass(colorGradingPass);
    composer.addPass(vignettePass);

    composerRef.current = composer;
    renderPassRef.current = renderPass;
    ssaoPassRef.current = ssaoPass;
    ssrPassRef.current = ssrPass;
    bloomPassRef.current = bloomPass;
    colorGradingPassRef.current = colorGradingPass;
    vignettePassRef.current = vignettePass;
    pmremGeneratorRef.current = new THREE.PMREMGenerator(renderer);
    pmremGeneratorRef.current.compileEquirectangularShader();
    renderFrameRef.current = () => {
      syncSSAOPassCamera(ssaoPass, cameraRef.current);
      syncSSRPassCamera(ssrPass, cameraRef.current);
      composer.render();
    };
    resizeViewportRef.current = (width: number, height: number) => {
      composer.setSize(width, height);
      ssrPass.setSize(width, height);
      ssaoPass.setSize(width, height);
      bloomPass.resolution.set(width, height);
      syncSSAOPassCamera(ssaoPass, cameraRef.current);
      syncSSRPassCamera(ssrPass, cameraRef.current);
    };

    return () => {
      composer.passes.length = 0;
      composerRef.current = null;
      renderPassRef.current = null;
      ssaoPassRef.current = null;
      ssrPassRef.current = null;
      bloomPassRef.current = null;
      colorGradingPassRef.current = null;
      vignettePassRef.current = null;
      renderFrameRef.current = null;
      resizeViewportRef.current = null;
      ssaoPass.dispose();
      ssrPass.dispose();
      pmremGeneratorRef.current?.dispose();
      pmremGeneratorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (playRuntimeState === 'IDLE') {
      scriptRuntime.reset();
      timerRef.current.reset();
    }
  }, [playRuntimeState]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const grid = scene.getObjectByName('grid');
    const axes = scene.getObjectByName('axes');
    const ambientLight = scene.getObjectByName('ambient_light');
    const directionalLight = scene.getObjectByName('directional_light');

    if (grid) {
      grid.visible = editor.gridVisible;
      grid.scale.setScalar(Math.max(gridSize, 0.25));
    }
    if (axes) axes.visible = editor.gridVisible;
    if (ambientLight) ambientLight.visible = editor.showLights;
    if (directionalLight) directionalLight.visible = editor.showLights;
  }, [editor.gridVisible, editor.showLights, gridSize]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !activeScene) return;

    let cancelled = false;

    const applyWorldPipeline = async () => {
      const runtimeScene = scene as SceneRuntimeEnvironment;
      const skybox = activeScene.environment.skybox ?? 'studio';
      const skyPreset = resolveWorldSkyPreset(skybox);
      const skyPalette = WORLD_SKY_PRESETS[skyPreset];
      const ambient = scene.getObjectByName('ambient_light') as THREE.AmbientLight | null;
      const directional = scene.getObjectByName('directional_light') as THREE.DirectionalLight | null;
      const ground = scene.getObjectByName('Ground') as THREE.Mesh | null;
      const ambientColor = new THREE.Color(
        activeScene.environment.ambientLight.r,
        activeScene.environment.ambientLight.g,
        activeScene.environment.ambientLight.b
      );
      const environmentRotation = activeScene.environment.environmentRotation ?? 0;
      const directionalAzimuth = activeScene.environment.directionalLightAzimuth ?? 45;
      const directionalElevation = activeScene.environment.directionalLightElevation ?? 55;
      const nextBackgroundTexture = await resolveEnvironmentTexture(
        skybox,
        environmentRotation
      );
      let nextEnvironmentRenderTarget: THREE.WebGLRenderTarget | null = null;

      if (
        renderer &&
        nextBackgroundTexture &&
        pmremGeneratorRef.current
      ) {
        nextEnvironmentRenderTarget = pmremGeneratorRef.current.fromEquirectangular(
          nextBackgroundTexture
        );
      }

      if (cancelled) {
        disposeEnvironmentResources(nextBackgroundTexture, nextEnvironmentRenderTarget);
        return;
      }

      if (nextBackgroundTexture && nextEnvironmentRenderTarget) {
        runtimeScene.background = nextBackgroundTexture;
        runtimeScene.environment = nextEnvironmentRenderTarget.texture;
        runtimeScene.backgroundIntensity = 1;
        runtimeScene.environmentIntensity = activeScene.environment.environmentIntensity ?? 1;
        runtimeScene.backgroundRotation = new THREE.Euler(
          0,
          THREE.MathUtils.degToRad(environmentRotation),
          0
        );
        runtimeScene.environmentRotation = new THREE.Euler(
          0,
          THREE.MathUtils.degToRad(environmentRotation),
          0
        );
      } else {
        runtimeScene.background = new THREE.Color(skyPalette.bottom);
        runtimeScene.environment = null;
        runtimeScene.backgroundIntensity = 1;
        runtimeScene.environmentIntensity = activeScene.environment.environmentIntensity ?? 1;
        runtimeScene.backgroundRotation = new THREE.Euler(0, 0, 0);
        runtimeScene.environmentRotation = new THREE.Euler(0, 0, 0);
      }

      if (ambient) {
        ambient.color.copy(ambientColor);
        ambient.intensity = activeScene.environment.ambientIntensity ?? 1;
        ambient.visible = editor.showLights;
      }

      if (directional) {
        directional.intensity = activeScene.environment.directionalLightIntensity ?? 1.2;
        directional.position.copy(
          computeDirectionalLightPosition(
            directionalAzimuth,
            directionalElevation,
            85
          )
        );
        let target = scene.getObjectByName('__directional_light_target');
        if (!target) {
          target = new THREE.Object3D();
          target.name = '__directional_light_target';
          scene.add(target);
        }
        target.position.set(0, 0, 0);
        target.updateMatrixWorld();
        directional.target = target;
        directional.visible = editor.showLights;
        directional.updateMatrixWorld();
      }

      if (
        ground &&
        ground.material instanceof THREE.MeshStandardMaterial
      ) {
        const groundColor = new THREE.Color(skyPalette.bottom).lerp(
          new THREE.Color(skyPalette.horizon),
          0.22
        );
        ground.material.color.copy(groundColor);
        ground.material.metalness = 0.08;
        ground.material.roughness = 0.92;
        ground.material.envMapIntensity =
          (activeScene.environment.environmentIntensity ?? 1) * 0.35;
        ground.material.needsUpdate = true;
      }

      if (activeScene.environment.fog?.enabled) {
        const fogColor = new THREE.Color(
          activeScene.environment.fog.color.r,
          activeScene.environment.fog.color.g,
          activeScene.environment.fog.color.b
        );

        scene.fog =
          activeScene.environment.fog.type === 'exponential'
            ? new THREE.FogExp2(
                fogColor,
                activeScene.environment.fog.density ?? 0.015
              )
            : new THREE.Fog(
                fogColor,
                activeScene.environment.fog.near ?? 12,
                activeScene.environment.fog.far ?? 90
              );
      } else {
        scene.fog = null;
      }

      const bloom = activeScene.environment.postProcessing.bloom;
      if (bloomPassRef.current) {
        bloomPassRef.current.enabled = bloom.enabled;
        bloomPassRef.current.strength = bloom.intensity;
        bloomPassRef.current.threshold = bloom.threshold;
        bloomPassRef.current.radius = bloom.radius;
      }

      const colorGrading = activeScene.environment.postProcessing.colorGrading;
      if (renderer) {
        renderer.toneMapping = getThreeToneMapping(resolveToneMapping(colorGrading.toneMapping));
        renderer.toneMappingExposure = colorGrading.rendererExposure ?? 1;
      }

      const ssao = activeScene.environment.postProcessing.ssao;
      if (ssaoPassRef.current) {
        const ssaoBias = THREE.MathUtils.clamp(ssao.bias, 0.001, 0.2);
        ssaoPassRef.current.enabled = ssao.enabled;
        ssaoPassRef.current.kernelRadius = THREE.MathUtils.clamp(ssao.radius * 16, 3, 32);
        ssaoPassRef.current.minDistance = ssaoBias;
        ssaoPassRef.current.maxDistance = Math.max(ssaoBias + ssao.radius * 0.18, ssaoBias + 0.01);
        ssaoPassRef.current.copyMaterial.uniforms.opacity.value = THREE.MathUtils.clamp(
          ssao.intensity,
          0,
          2
        );
      }

      const ssr = activeScene.environment.postProcessing.ssr;
      if (ssrPassRef.current) {
        ssrPassRef.current.enabled =
          ssr.enabled && isPerspectiveCamera(cameraRef.current ?? perspectiveCameraRef.current);
        ssrPassRef.current.opacity = THREE.MathUtils.clamp(ssr.intensity, 0.05, 1);
        ssrPassRef.current.maxDistance = Math.max(ssr.maxDistance, 1);
        ssrPassRef.current.thickness = THREE.MathUtils.lerp(
          0.014,
          0.04,
          THREE.MathUtils.clamp(ssr.intensity, 0, 1)
        );
      }

      if (colorGradingPassRef.current) {
        colorGradingPassRef.current.enabled = colorGrading.enabled;
        colorGradingPassRef.current.uniforms.exposure.value = colorGrading.exposure;
        colorGradingPassRef.current.uniforms.contrast.value = colorGrading.contrast;
        colorGradingPassRef.current.uniforms.saturation.value = colorGrading.saturation;
        colorGradingPassRef.current.uniforms.gamma.value = colorGrading.gamma;
      }

      const vignette = activeScene.environment.postProcessing.vignette;
      if (vignettePassRef.current) {
        vignettePassRef.current.enabled = vignette.enabled;
        vignettePassRef.current.uniforms.intensity.value = vignette.intensity;
        vignettePassRef.current.uniforms.smoothness.value = vignette.smoothness;
        vignettePassRef.current.uniforms.roundness.value = vignette.roundness;
      }

      disposeEnvironmentResources(
        environmentTextureRef.current,
        environmentRenderTargetRef.current
      );
      environmentTextureRef.current = nextBackgroundTexture;
      environmentRenderTargetRef.current = nextEnvironmentRenderTarget;
    };

    void applyWorldPipeline();

    return () => {
      cancelled = true;
    };
  }, [activeScene, cameraMode, editor.showLights, editor.viewportCameraEntityId]);

  useEffect(() => {
    const transformTools = transformToolsRef.current;
    if (!transformTools) return;

    transformTools.setScene(sceneRef.current);
    transformTools.gizmo.setMode(editor.gizmoMode);
    transformTools.gizmo.setSpace(transformSpace);
    transformTools.gizmo.setEnabledAxes(activeAxes);
    transformTools.snapSettings.enabled = editor.snapEnabled;
    transformTools.snapSettings.gridVisible = editor.gridVisible;
    transformTools.snapSettings.gridSize = gridSize;
    transformTools.snapSettings.translateSnap = editor.snapValue;
    transformTools.snapSettings.rotateSnap = snapValues.rotate;
    transformTools.snapSettings.scaleSnap = snapValues.scale;
    transformTools.snapSettings.translateAxes = { ...activeAxes };
    transformTools.snapSettings.rotateAxes = { ...activeAxes };
    transformTools.snapSettings.scaleAxes = { ...activeAxes };
    transformTools.snapSettings.snapTarget = snapTarget;
    transformTools.snapSettings.vertexSnap = snapTarget === 'vertex';
    transformTools.snapSettings.surfaceSnap = snapTarget === 'surface';
  }, [
    activeAxes,
    editor.gizmoMode,
    editor.gridVisible,
    editor.snapEnabled,
    editor.snapValue,
    gridSize,
    sceneRef,
    snapTarget,
    snapValues,
    transformSpace,
  ]);

  useSceneEntitySync({
    sceneRef,
    transformToolsRef,
    entities: activeScene?.entities ?? [],
    selectedEntities: editor.selectedEntities,
    paintMode: editor.paintMode,
    paintWeightBone: editor.paintWeightBone,
    showColliders: editor.showColliders,
    showLights: editor.showLights,
    collections: activeScene?.collections ?? [],
  });

  const {
    syncObjectTransformToStore,
    createManualEntity,
    removeSelectedEntities,
    syncBoxSelectionToStore,
  } = useSceneViewEntityActions({
    sceneRef,
    transformToolsRef,
    addEntity,
    updateEntity,
    updateEntityTransient,
    selectEntity,
  });

  const captureViewportDataUrl = useCallback(
    (options?: { mimeType?: 'image/png' | 'image/jpeg' | 'image/webp'; quality?: number }) => {
      const renderer = rendererRef.current;
      if (!renderer) return null;

      try {
        if (renderFrameRef.current) {
          renderFrameRef.current();
        } else if (sceneRef.current && cameraRef.current) {
          renderer.render(sceneRef.current, cameraRef.current);
        }
        return renderer.domElement.toDataURL(
          options?.mimeType ?? 'image/png',
          options?.quality ?? 0.92
        );
      } catch (error) {
        console.warn('[SceneView] Could not capture viewport data URL.', error);
        return null;
      }
    },
    []
  );

  useSceneViewTestBridge({
    containerRef,
    sceneRef,
    cameraRef,
    transformToolsRef,
    createManualEntity,
    simulatePaintStroke,
    captureViewportDataUrl,
  });

  const syncModelerMeshToStore = (nextMesh: EditableMesh, commit = false) => {
    const entityId = modelerDragStateRef.current?.entityId ?? selectedModelerEntityId;
    if (!entityId) return;

    const entity = useEngineStore.getState().entities.get(entityId);
    if (!entity) return;

    const meshRenderer = entity.components.get('MeshRenderer');
    if (!meshRenderer) return;

    const nextComponents = new Map(entity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...(asRecord(meshRenderer.data) ?? {}),
        meshId: 'custom',
        manualMesh: nextMesh,
      },
    });

    if (commit) {
      updateEntity(entityId, { components: nextComponents });
      return;
    }

    updateEntityTransient(entityId, { components: nextComponents });
  };

  const sampleTopologyStrokePoint = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current) {
      return null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const mouse = new THREE.Vector2(
      (x / rect.width) * 2 - 1,
      -((y / rect.height) * 2 - 1)
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const scene = sceneRef.current;
    const viewportObject =
      scene && selectedModelerEntityId
        ? scene.getObjectByName(`${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`)
        : null;
    if (viewportObject) {
      const surfaceIntersects = raycaster
        .intersectObject(viewportObject, true)
        .filter(
          (intersect) =>
            intersect.object.userData?.modelerSelectable !== true &&
            intersect.object.userData?.modelerHelperRoot !== true &&
            intersect.object.userData?.modelerGizmoProxy !== true
        );
      if (surfaceIntersects[0]) {
        const point = surfaceIntersects[0].point;
        return { x: point.x, y: point.y, z: point.z };
      }
    }

    const fallbackAnchor = viewportObject
      ? viewportObject.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(0, 0, 0);
    const workPlane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -fallbackAnchor.y
    );
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(workPlane, point)) {
      return { x: point.x, y: point.y, z: point.z };
    }

    return null;
  }, [selectedModelerEntityId]);

  const resetTopologyStroke = useCallback((options?: { restoreBase?: boolean }) => {
    if (options?.restoreBase && topologyStrokeBaseMeshRef.current) {
      syncModelerMeshToStore(topologyStrokeBaseMeshRef.current, false);
    }
    topologyStrokeBaseMeshRef.current = null;
    topologyStrokePointsRef.current = [];
    setTopologyStrokePointCount(0);
  }, [syncModelerMeshToStore]);

  const applyTopologyStroke = useCallback((commit: boolean) => {
    if (
      !topologyStrokeBaseMeshRef.current ||
      topologyStrokePointsRef.current.length === 0
    ) {
      return false;
    }

    const result = acceptTopologyIntentStroke({
      mesh: topologyStrokeBaseMeshRef.current,
      mode: topologyViewportMode,
      templateType: topologyViewportTemplateType,
      stroke: topologyStrokePointsRef.current,
    });

    if (!result.editableMesh) {
      return false;
    }

    setTopologyLastIntentKind(result.suggestionKind);
    syncModelerMeshToStore(result.editableMesh, commit);
    return true;
  }, [syncModelerMeshToStore, topologyViewportMode, topologyViewportTemplateType]);

  useEffect(() => {
    if (topologyViewportReady) {
      return;
    }
    if (topologyStrokeBaseMeshRef.current) {
      syncModelerMeshToStore(topologyStrokeBaseMeshRef.current, false);
    }
    topologyStrokeBaseMeshRef.current = null;
    topologyStrokePointsRef.current = [];
    const frame = window.requestAnimationFrame(() => {
      setTopologyStrokePointCount(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedModelerEntityId, syncModelerMeshToStore, topologyViewportReady]);

  const isModelerGizmoProxy = (object: THREE.Object3D | null) =>
    object?.userData?.modelerGizmoProxy === true;
  const isObjectPivotProxy = (object: THREE.Object3D | null) =>
    object?.userData?.objectPivotGizmoProxy === true;

  useEffect(() => {
    const scene = sceneRef.current;
    const gizmo = transformToolsRef.current?.gizmo;
    if (!scene || !gizmo) return;

    if (!modelerSubSelectionActive || !selectedModelerEntityId || !selectedModelerMesh) {
      modelerDragStateRef.current = null;
      if (modelerGizmoTargetRef.current?.parent) {
        modelerGizmoTargetRef.current.parent.remove(modelerGizmoTargetRef.current);
      }
      modelerGizmoTargetRef.current = null;

      if (selectedModelerEntityId) {
        const entityTarget = scene.getObjectByName(
          `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
        );
        if (entityTarget?.visible) {
          gizmo.attach(entityTarget);
          return;
        }
      }

      if (editor.selectedEntities.length === 0) {
        gizmo.detach();
      }
      return;
    }

    const viewportObject = scene.getObjectByName(
      `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
    );
    if (!viewportObject) return;

    let proxy = modelerGizmoTargetRef.current;
    if (!proxy) {
      proxy = new THREE.Object3D();
      proxy.name = MODELER_GIZMO_PROXY_NAME;
      proxy.userData.modelerGizmoProxy = true;
      scene.add(proxy);
      modelerGizmoTargetRef.current = proxy;
    }

    if (!modelerDragStateRef.current) {
      const selectionCenter = getSelectionCenter(
        selectedModelerMesh,
        modelerMode as ModelerElementMode,
        safeModelerSelection
      );
      const worldCenter = new THREE.Vector3(
        selectionCenter.x,
        selectionCenter.y,
        selectionCenter.z
      );
      viewportObject.localToWorld(worldCenter);

      const worldQuaternion = new THREE.Quaternion();
      viewportObject.getWorldQuaternion(worldQuaternion);

      proxy.position.copy(worldCenter);
      proxy.quaternion.copy(worldQuaternion);
      proxy.scale.set(1, 1, 1);
    }

    if (gizmo.getTarget() !== proxy) {
      gizmo.attach(proxy);
    }
  }, [
    editor.selectedEntities.length,
    modelerMode,
    modelerSubSelectionActive,
    safeModelerSelectionSignature,
    sceneRef,
    selectedModelerEntityId,
    selectedModelerMesh,
    selectedModelerMeshSignature,
    transformToolsRef,
  ]);

  useEffect(() => {
    return () => {
      if (modelerGizmoTargetRef.current?.parent) {
        modelerGizmoTargetRef.current.parent.remove(modelerGizmoTargetRef.current);
      }
      modelerGizmoTargetRef.current = null;
      modelerDragStateRef.current = null;
      if (objectPivotGizmoTargetRef.current?.parent) {
        objectPivotGizmoTargetRef.current.parent.remove(objectPivotGizmoTargetRef.current);
      }
      objectPivotGizmoTargetRef.current = null;
      objectPivotDragStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const gizmo = transformToolsRef.current?.gizmo;
    if (!scene || !gizmo) return;
    if (modelerSubSelectionActive) return;

    const selectedObjects = editor.selectedEntities
      .map((entityId) => scene.getObjectByName(`${STORE_OBJECT_PREFIX}${entityId}`))
      .filter((object): object is THREE.Object3D => Boolean(object));

    if (selectedObjects.length === 0) {
      objectPivotDragStateRef.current = null;
      if (gizmo.getTarget() && isObjectPivotProxy(gizmo.getTarget())) {
        gizmo.detach();
      }
      return;
    }

    if (pivotMode !== 'selectionCenter') {
      objectPivotDragStateRef.current = null;
      const nextTarget = selectedObjects[0] ?? null;
      if (nextTarget && gizmo.getTarget() !== nextTarget) {
        gizmo.attach(nextTarget);
      }
      return;
    }

    let proxy = objectPivotGizmoTargetRef.current;
    if (!proxy) {
      proxy = new THREE.Object3D();
      proxy.name = OBJECT_PIVOT_GIZMO_PROXY_NAME;
      proxy.userData.objectPivotGizmoProxy = true;
      scene.add(proxy);
      objectPivotGizmoTargetRef.current = proxy;
    }

    if (!objectPivotDragStateRef.current) {
      const bounds = new THREE.Box3();
      selectedObjects.forEach((object) => bounds.expandByObject(object));
      const center = bounds.getCenter(new THREE.Vector3());
      const orientation =
        transformSpace === 'local' && selectedObjects.length === 1
          ? selectedObjects[0].getWorldQuaternion(new THREE.Quaternion())
          : new THREE.Quaternion();

      proxy.position.copy(center);
      proxy.quaternion.copy(orientation);
      proxy.scale.set(1, 1, 1);
    }

    if (gizmo.getTarget() !== proxy) {
      gizmo.attach(proxy);
    }
  }, [
    activeScene,
    editor.selectedEntities,
    modelerSubSelectionActive,
    pivotMode,
    sceneRef,
    transformSpace,
    transformToolsRef,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const previousGroup = scene.getObjectByName(MODELER_HELPER_GROUP_NAME);
    if (previousGroup?.parent) {
      previousGroup.parent.remove(previousGroup);
      disposeModelerHelperGroup(previousGroup);
    }

    if (
      !selectedModelerEntityId ||
      !selectedModelerMesh ||
      modelerMode === 'object'
    ) {
      return;
    }

    const viewportObject = scene.getObjectByName(
      `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
    );
    if (!viewportObject) return;

    const helperGroup = createModelerHelperGroup({
      mesh: selectedModelerMesh,
      mode: modelerMode,
      selectedIndices: safeModelerSelection,
    });
    viewportObject.add(helperGroup);

    return () => {
      if (helperGroup.parent) {
        helperGroup.parent.remove(helperGroup);
      }
      disposeModelerHelperGroup(helperGroup);
    };
  }, [
    modelerMode,
    sceneRef,
    selectedModelerEntityId,
    selectedModelerMesh,
    selectedModelerMeshSignature,
    safeModelerSelectionSignature,
  ]);

  const handleModelerGizmoDragStart = (target: THREE.Object3D) => {
    if (!selectedModelerEntityId || !selectedModelerMesh || modelerMode === 'object') {
      return;
    }

    const scene = sceneRef.current;
    if (!scene) return;

    const viewportObject = scene.getObjectByName(
      `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
    );
    if (!viewportObject) return;

    viewportObject.updateMatrixWorld(true);
    const maxDistanceFromCenter = selectedModelerVertexIndices.reduce((maxDistance, vertexIndex) => {
      const sourceVertex = selectedModelerMesh.vertices[vertexIndex];
      if (!sourceVertex) return maxDistance;
      const worldPoint = new THREE.Vector3(
        sourceVertex.x,
        sourceVertex.y,
        sourceVertex.z
      ).applyMatrix4(viewportObject.matrixWorld);
      return Math.max(maxDistance, worldPoint.distanceTo(target.position));
    }, 0);
    modelerDragStateRef.current = {
      entityId: selectedModelerEntityId,
      mode: modelerMode as ModelerElementMode,
      selection: [...safeModelerSelection],
      startMesh: {
        vertices: selectedModelerMesh.vertices.map((vertex) => ({ ...vertex })),
        faces: selectedModelerMesh.faces.map((face) => [...face] as [number, number, number]),
        uvs: selectedModelerMesh.uvs?.map((uv) => ({ ...uv })),
      },
      vertexIndices: [...selectedModelerVertexIndices],
      worldMatrix: viewportObject.matrixWorld.clone(),
      worldMatrixInverse: viewportObject.matrixWorld.clone().invert(),
      startPosition: target.position.clone(),
      startQuaternion: target.quaternion.clone(),
      startScale: target.scale.clone(),
      maxDistanceFromCenter,
    };
  };

  const applyModelerGizmoTransform = (target: THREE.Object3D, commit: boolean) => {
    const dragState = modelerDragStateRef.current;
    if (!dragState) return;

    const translationDelta = target.position.clone().sub(dragState.startPosition);
    const rotationDelta = target.quaternion
      .clone()
      .multiply(dragState.startQuaternion.clone().invert());
    const scaleDelta = new THREE.Vector3(
      dragState.startScale.x !== 0 ? target.scale.x / dragState.startScale.x : 1,
      dragState.startScale.y !== 0 ? target.scale.y / dragState.startScale.y : 1,
      dragState.startScale.z !== 0 ? target.scale.z / dragState.startScale.z : 1
    );
    const clampedScaleDelta = new THREE.Vector3(
      THREE.MathUtils.clamp(scaleDelta.x, MODELER_SUBELEMENT_SCALE_MIN, MODELER_SUBELEMENT_SCALE_MAX),
      THREE.MathUtils.clamp(scaleDelta.y, MODELER_SUBELEMENT_SCALE_MIN, MODELER_SUBELEMENT_SCALE_MAX),
      THREE.MathUtils.clamp(scaleDelta.z, MODELER_SUBELEMENT_SCALE_MIN, MODELER_SUBELEMENT_SCALE_MAX)
    );
    const scaleFrame =
      transformSpace === 'local'
        ? dragState.startQuaternion.clone()
        : new THREE.Quaternion();
    const inverseScaleFrame = scaleFrame.clone().invert();
    const maxSelectionDistance = Math.max(
      dragState.maxDistanceFromCenter * MODELER_SUBELEMENT_DISTANCE_LIMIT_MULTIPLIER,
      1.5
    );

    const nextMesh: EditableMesh = {
      vertices: dragState.startMesh.vertices.map((vertex) => ({ ...vertex })),
      faces: dragState.startMesh.faces.map((face) => [...face] as [number, number, number]),
      uvs: dragState.startMesh.uvs?.map((uv) => ({ ...uv })),
    };

    dragState.vertexIndices.forEach((vertexIndex) => {
      const sourceVertex = dragState.startMesh.vertices[vertexIndex];
      if (!sourceVertex) return;

      let worldPoint = new THREE.Vector3(
        sourceVertex.x,
        sourceVertex.y,
        sourceVertex.z
      ).applyMatrix4(dragState.worldMatrix);

      switch (editor.gizmoMode) {
        case 'rotate': {
          worldPoint = worldPoint
            .sub(dragState.startPosition)
            .applyQuaternion(rotationDelta)
            .add(dragState.startPosition);
          break;
        }
        case 'scale': {
          const scaledPoint = worldPoint
            .clone()
            .sub(dragState.startPosition)
            .applyQuaternion(inverseScaleFrame);
          scaledPoint.set(
            scaledPoint.x * clampedScaleDelta.x,
            scaledPoint.y * clampedScaleDelta.y,
            scaledPoint.z * clampedScaleDelta.z
          );
          if (scaledPoint.length() > maxSelectionDistance) {
            scaledPoint.setLength(maxSelectionDistance);
          }
          worldPoint = scaledPoint
            .applyQuaternion(scaleFrame)
            .add(dragState.startPosition);
          break;
        }
        case 'translate':
        default:
          worldPoint.add(translationDelta);
          break;
      }

      const localPoint = worldPoint.applyMatrix4(dragState.worldMatrixInverse);
      nextMesh.vertices[vertexIndex] = {
        x: localPoint.x,
        y: localPoint.y,
        z: localPoint.z,
      };
    });

    syncModelerMeshToStore(nextMesh, commit);
  };

  const handleModelerGizmoDragEnd = (target: THREE.Object3D | null) => {
    if (!target || !isModelerGizmoProxy(target)) {
      modelerDragStateRef.current = null;
      return;
    }

    applyModelerGizmoTransform(target, true);
    modelerDragStateRef.current = null;
  };

  const updateEditableMeshOrigin = useCallback((mode: 'originToGeometry' | 'geometryToOrigin') => {
    if (!selectedModelerEntityId || !selectedModelerEntity || !selectedOriginMesh) {
      return;
    }

    const entity = useEngineStore.getState().entities.get(selectedModelerEntityId);
    if (!entity) return;

    const meshRenderer = entity.components.get('MeshRenderer');
    const transform = entity.components.get('Transform');
    if (!meshRenderer || !transform) return;

    const center = computeEditableMeshBoundsCenter(selectedOriginMesh);
    const meshOffset = center.clone().multiplyScalar(-1);
    const nextMesh = translateEditableMesh(selectedOriginMesh, meshOffset);
    const transformData = asRecord(transform.data);
    const position = readVector3(transformData?.position, new THREE.Vector3());
    const rotation = readQuaternion(transformData?.rotation, new THREE.Quaternion());
    const scale = readVector3(transformData?.scale, new THREE.Vector3(1, 1, 1));
    const nextPosition = position.clone();

    if (mode === 'originToGeometry') {
      const localOffset = center.clone().multiply(scale);
      localOffset.applyQuaternion(rotation);
      nextPosition.add(localOffset);
    }

    const nextComponents = new Map(entity.components);
    nextComponents.set('Transform', {
      ...transform,
      data: {
        position: { x: nextPosition.x, y: nextPosition.y, z: nextPosition.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        scale: { x: scale.x, y: scale.y, z: scale.z },
      },
    });
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...(asRecord(meshRenderer.data) ?? {}),
        meshId: 'custom',
        manualMesh: nextMesh,
      },
    });

    objectPivotDragStateRef.current = null;
    updateEntity(selectedModelerEntityId, { components: nextComponents });
  }, [
    selectedModelerEntity,
    selectedModelerEntityId,
    selectedOriginMesh,
    updateEntity,
  ]);

  const handlePivotDragStart = (target: THREE.Object3D) => {
    const scene = sceneRef.current;
    if (!scene || !isObjectPivotProxy(target)) {
      return;
    }

    const selectedObjects = editor.selectedEntities
      .map((entityId) => scene.getObjectByName(`${STORE_OBJECT_PREFIX}${entityId}`))
      .filter((object): object is THREE.Object3D => Boolean(object));
    if (selectedObjects.length === 0) {
      objectPivotDragStateRef.current = null;
      return;
    }

    const identityMatrix = new THREE.Matrix4();
    objectPivotDragStateRef.current = {
      startPosition: target.position.clone(),
      startQuaternion: target.quaternion.clone(),
      startScale: target.scale.clone(),
      targets: selectedObjects.map((object) => {
        object.updateMatrixWorld(true);
        const parentWorldMatrixInverse = object.parent
          ? object.parent.matrixWorld.clone().invert()
          : identityMatrix.clone();
        return {
          object,
          startWorldMatrix: object.matrixWorld.clone(),
          parentWorldMatrixInverse,
        };
      }),
    };
  };

  const applyPivotProxyTransform = (target: THREE.Object3D, commit: boolean) => {
    const dragState = objectPivotDragStateRef.current;
    if (!dragState || !isObjectPivotProxy(target)) {
      return;
    }

    const translationDelta = target.position.clone().sub(dragState.startPosition);
    const rotationDelta = target.quaternion
      .clone()
      .multiply(dragState.startQuaternion.clone().invert());
    const scaleDelta = new THREE.Vector3(
      dragState.startScale.x !== 0 ? target.scale.x / dragState.startScale.x : 1,
      dragState.startScale.y !== 0 ? target.scale.y / dragState.startScale.y : 1,
      dragState.startScale.z !== 0 ? target.scale.z / dragState.startScale.z : 1
    );
    const clampedScaleDelta = new THREE.Vector3(
      THREE.MathUtils.clamp(scaleDelta.x, 0.1, 10),
      THREE.MathUtils.clamp(scaleDelta.y, 0.1, 10),
      THREE.MathUtils.clamp(scaleDelta.z, 0.1, 10)
    );

    const pivotMatrix = new THREE.Matrix4().makeTranslation(
      dragState.startPosition.x,
      dragState.startPosition.y,
      dragState.startPosition.z
    );
    const inversePivotMatrix = new THREE.Matrix4().makeTranslation(
      -dragState.startPosition.x,
      -dragState.startPosition.y,
      -dragState.startPosition.z
    );
    const translationMatrix = new THREE.Matrix4().makeTranslation(
      translationDelta.x,
      translationDelta.y,
      translationDelta.z
    );
    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(rotationDelta);
    const scaleFrameQuaternion =
      transformSpace === 'local'
        ? dragState.startQuaternion
        : new THREE.Quaternion();
    const scaleFrameMatrix = new THREE.Matrix4().makeRotationFromQuaternion(scaleFrameQuaternion);
    const inverseScaleFrameMatrix = scaleFrameMatrix.clone().invert();
    const scaleMatrix = new THREE.Matrix4().makeScale(
      clampedScaleDelta.x,
      clampedScaleDelta.y,
      clampedScaleDelta.z
    );

    dragState.targets.forEach(({ object, startWorldMatrix, parentWorldMatrixInverse }) => {
      let nextWorldMatrix = startWorldMatrix.clone();

      switch (editor.gizmoMode) {
        case 'rotate':
          nextWorldMatrix = pivotMatrix
            .clone()
            .multiply(rotationMatrix)
            .multiply(inversePivotMatrix)
            .multiply(startWorldMatrix);
          break;
        case 'scale':
          nextWorldMatrix = pivotMatrix
            .clone()
            .multiply(scaleFrameMatrix)
            .multiply(scaleMatrix)
            .multiply(inverseScaleFrameMatrix)
            .multiply(inversePivotMatrix)
            .multiply(startWorldMatrix);
          break;
        case 'translate':
        default:
          nextWorldMatrix = translationMatrix.clone().multiply(startWorldMatrix);
          break;
      }

      const nextLocalMatrix = parentWorldMatrixInverse.clone().multiply(nextWorldMatrix);
      const nextPosition = new THREE.Vector3();
      const nextQuaternion = new THREE.Quaternion();
      const nextScale = new THREE.Vector3();
      nextLocalMatrix.decompose(nextPosition, nextQuaternion, nextScale);

      object.position.copy(nextPosition);
      object.quaternion.copy(nextQuaternion);
      object.scale.copy(nextScale);
      object.updateMatrixWorld(true);
      syncObjectTransformToStore(object, { commit });
    });
  };

  const handlePivotDragEnd = (target: THREE.Object3D | null) => {
    if (!target || !isObjectPivotProxy(target)) {
      objectPivotDragStateRef.current = null;
      return;
    }

    applyPivotProxyTransform(target, true);
    objectPivotDragStateRef.current = null;
  };

  const handleModelerElementPick = (
    type: string,
    index: number,
    additive: boolean
  ) => {
    const normalizedType =
      type === 'vertex' || type === 'edge' || type === 'face' ? type : 'face';
    const maxSelectable =
      normalizedType === 'vertex'
        ? selectedModelerMesh?.vertices.length ?? 0
        : normalizedType === 'edge'
          ? selectedModelerMesh
            ? listMeshEdges(selectedModelerMesh).length
            : 0
          : selectedModelerMesh?.faces.length ?? 0;
    const selectableIds =
      normalizedType === 'vertex'
        ? selectedModelerMesh?.vertices.map((_vertex, vertexIndex) => vertexIndex) ?? []
        : normalizedType === 'edge'
          ? selectedModelerMesh
            ? listVisibleMeshEdgeIndices(selectedModelerMesh)
            : []
          : selectedModelerMesh
            ? getVisibleFaceIndices(selectedModelerMesh)
            : [];

    if (normalizedType !== modelerMode) {
      setModelerMode(normalizedType);
    }

    const currentSelection =
      normalizedType === modelerMode ? editor.modelerSelectedElements ?? [0] : [index];
    const nextSelection = additive
      ? currentSelection.includes(index)
        ? currentSelection.filter((candidate) => candidate !== index)
        : [...currentSelection, index]
      : [index];

    setModelerSelection(
      clampSelectableModelerSelection(nextSelection, maxSelectable, selectableIds)
    );
  };

  const handleTopologyViewportStrokeStart = useCallback((event: React.MouseEvent) => {
    if (!topologyViewportReady || !selectedModelerMesh || event.shiftKey) {
      return false;
    }

    const point = sampleTopologyStrokePoint(event);
    if (!point) {
      return false;
    }

    topologyStrokeBaseMeshRef.current = cloneEditableMesh(selectedModelerMesh);
    topologyStrokePointsRef.current = [point];
    setTopologyLastIntentKind(null);
    setTopologyStrokePointCount(1);
    applyTopologyStroke(false);
    return true;
  }, [applyTopologyStroke, sampleTopologyStrokePoint, selectedModelerMesh, topologyViewportReady]);

  const handleTopologyViewportStrokeMove = useCallback((event: React.MouseEvent) => {
    if (!topologyStrokeBaseMeshRef.current) {
      return;
    }

    const point = sampleTopologyStrokePoint(event);
    if (!point) {
      return;
    }

    const currentPoints = topologyStrokePointsRef.current;
    const lastPoint = currentPoints[currentPoints.length - 1];
    if (
      lastPoint &&
      Math.hypot(
        point.x - lastPoint.x,
        point.y - lastPoint.y,
        point.z - lastPoint.z
      ) < 0.04
    ) {
      return;
    }

    topologyStrokePointsRef.current = [...currentPoints, point];
    setTopologyStrokePointCount(topologyStrokePointsRef.current.length);
    applyTopologyStroke(false);
  }, [applyTopologyStroke, sampleTopologyStrokePoint]);

  const handleTopologyViewportStrokeEnd = useCallback(() => {
    const handled = applyTopologyStroke(true);
    resetTopologyStroke();
    return handled;
  }, [applyTopologyStroke, resetTopologyStroke]);

  const handleTopologyViewportStrokeCancel = useCallback(() => {
    const hadStroke = Boolean(topologyStrokeBaseMeshRef.current);
    resetTopologyStroke({ restoreBase: hadStroke });
    return hadStroke;
  }, [resetTopologyStroke]);

  const {
    isBoxSelecting,
    boxSelectStart,
    boxSelectEnd,
    hoveredAxis,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  } = useSceneViewPointerInteractions({
    containerRef,
    cameraRef,
    sceneRef,
    controlsRef,
    transformToolsRef,
    selectionRef,
    selectionBoxRef,
    tool: editor.tool,
    paintEnabled: Boolean(editor.paintEnabled),
    isPainting,
    startPaint,
    continuePaint,
    finishPaint,
    cancelPaint,
    selectEntity,
    onModelerElementPick: handleModelerElementPick,
    customStrokeHandlers: {
      isEnabled: topologyViewportReady,
      onStart: handleTopologyViewportStrokeStart,
      onMove: handleTopologyViewportStrokeMove,
      onEnd: handleTopologyViewportStrokeEnd,
      onCancel: handleTopologyViewportStrokeCancel,
    },
    customTransformHandlers: {
      isCustomTarget: (object) => isModelerGizmoProxy(object) || isObjectPivotProxy(object),
      onStart: (target) => {
        if (isModelerGizmoProxy(target)) {
          handleModelerGizmoDragStart(target);
          return;
        }
        handlePivotDragStart(target);
      },
      onChange: (target) => {
        if (isModelerGizmoProxy(target)) {
          applyModelerGizmoTransform(target, false);
          return;
        }
        applyPivotProxyTransform(target, false);
      },
      onEnd: (target) => {
        if (isModelerGizmoProxy(target)) {
          handleModelerGizmoDragEnd(target);
          return;
        }
        handlePivotDragEnd(target);
      },
    },
    syncBoxSelectionToStore,
    syncObjectTransformToStore,
    controlsLocked: Boolean(editor.viewportCameraEntityId),
  });

  const { handleUndo, handleRedo } = useSceneViewHistoryActions({
    undoPaint,
    redoPaint,
    getLastPastPaintTimestamp,
    getLastFuturePaintTimestamp,
  });

  const applyCameraPose = useCallback((
    position: THREE.Vector3,
    target: THREE.Vector3,
    options?: {
      camera?: ViewportCamera | null;
      fov?: number;
      zoom?: number;
      up?: THREE.Vector3;
      orthoSize?: number;
      near?: number;
      far?: number;
    }
  ) => {
    const controls = controlsRef.current;
    const nextCamera = options?.camera ?? cameraRef.current;
    if (!controls || !nextCamera) return;

    syncActiveCamera(nextCamera);

    const { width, height } = getViewportSize();
    setCameraClipPlanes(nextCamera, options?.near, options?.far);
    applyCameraTransform(
      nextCamera,
      position,
      target,
      options?.up ?? new THREE.Vector3(0, 1, 0)
    );

    if (isPerspectiveCamera(nextCamera)) {
      applyPerspectiveLens(
        nextCamera,
        width,
        height,
        options?.fov ?? editor.viewportFov ?? 60,
        options?.zoom ?? 1
      );
    } else {
      applyOrthographicLens(
        nextCamera,
        width,
        height,
        options?.orthoSize ?? getOrthographicSize(nextCamera),
        options?.zoom ?? nextCamera.zoom ?? 1
      );
    }

    controls.target.copy(target);
    controls.update();
    transformToolsRef.current?.gizmo.updateTransform();
  }, [editor.viewportFov, getViewportSize, syncActiveCamera]);

  const getSelectedViewportObjects = () => {
    const scene = sceneRef.current;
    if (!scene) return [] as THREE.Object3D[];

    return editor.selectedEntities
      .map((entityId) => scene.getObjectByName(`${STORE_OBJECT_PREFIX}${entityId}`))
      .filter((object): object is THREE.Object3D => Boolean(object));
  };

  const getSelectionBounds = () => {
    const selectedObjects = getSelectedViewportObjects();
    if (selectedObjects.length === 0) return null;

    const bounds = new THREE.Box3();
    selectedObjects.forEach((object) => bounds.expandByObject(object));
    return bounds;
  };

  const focusSelected = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (editor.viewportCameraEntityId) {
      setViewportCameraEntity(null);
    }

    const bounds = getSelectionBounds();
    if (!bounds) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.55, 2);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() === 0) {
      direction.set(1, 1, 1);
    }

    const distance = Math.max(camera.position.distanceTo(controls.target), radius * 2.25, 4);
    const position = center
      .clone()
      .add(direction.normalize().multiplyScalar(distance));

    if (cameraMode === 'perspective') {
      applyCameraPose(position, center, {
        camera: perspectiveCameraRef.current,
        fov: editor.viewportFov ?? 60,
      });
      return;
    }

    const { aspect } = getViewportSize();
    applyCameraPose(position, center, {
      camera: orthographicCameraRef.current,
      up: camera.up.clone(),
      orthoSize: computeOrthographicSizeToFitBox(
        bounds,
        position,
        center,
        camera.up.clone(),
        aspect
      ),
    });
  };

  const resetView = () => {
    if (editor.viewportCameraEntityId) {
      setViewportCameraEntity(null);
    }
    applyCameraMode('perspective');
  };

  const applyCameraMode = (mode: CameraMode, options?: { skipStore?: boolean }) => {
    const camera = cameraRef.current;
    const perspectiveCamera = perspectiveCameraRef.current;
    const orthographicCamera = orthographicCameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !perspectiveCamera || !orthographicCamera) return;
    if (editor.viewportCameraEntityId && !options?.skipStore) {
      setViewportCameraEntity(null);
    }

    const selectionBounds = getSelectionBounds();
    const target = selectionBounds
      ? selectionBounds.getCenter(new THREE.Vector3())
      : controls.target.clone();
    const distance = Math.max(camera.position.distanceTo(target), 10);
    const { aspect } = getViewportSize();

    let position = camera.position.clone();
    let up = camera.up.clone();
    let fov = editor.viewportFov ?? 60;
    let orthoSize = getOrthographicSize(orthographicCamera);
    let nextCamera: ViewportCamera = perspectiveCamera;

    switch (mode) {
      case 'orthographic':
        nextCamera = orthographicCamera;
        position = camera.position.clone();
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(
              selectionBounds,
              position,
              target,
              up,
              aspect
            )
          : isPerspectiveCamera(camera)
            ? deriveOrthographicSizeFromPerspective(distance, camera.fov)
            : getOrthographicSize(orthographicCamera);
        break;
      case 'top':
        nextCamera = orthographicCamera;
        position = target.clone().add(new THREE.Vector3(0, distance, 0.001));
        up = new THREE.Vector3(0, 0, -1);
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(
              selectionBounds,
              position,
              target,
              up,
              aspect
            )
          : Math.max(distance * 0.5, 5);
        break;
      case 'front':
        nextCamera = orthographicCamera;
        position = target.clone().add(new THREE.Vector3(0, distance * 0.12, distance));
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(
              selectionBounds,
              position,
              target,
              up,
              aspect
            )
          : Math.max(distance * 0.5, 5);
        break;
      case 'side':
        nextCamera = orthographicCamera;
        position = target.clone().add(new THREE.Vector3(distance, distance * 0.12, 0));
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(
              selectionBounds,
              position,
              target,
              up,
              aspect
            )
          : Math.max(distance * 0.5, 5);
        break;
      case 'perspective':
      default:
        nextCamera = perspectiveCamera;
        fov = isPerspectiveCamera(camera) ? camera.fov : editor.viewportFov ?? 60;
        break;
    }

    lastAppliedCameraModeRef.current = mode;
    if (!options?.skipStore) {
      setViewportCameraMode(mode);
    }
    applyCameraPose(position, target, {
      camera: nextCamera,
      fov,
      up,
      orthoSize,
    });
  };

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (editor.viewportCameraEntityId) return;
    if (lastAppliedCameraModeRef.current === cameraMode) return;
    applyCameraMode(cameraMode, { skipStore: true });
  }, [cameraMode, editor.viewportCameraEntityId]);

  useEffect(() => {
    const camera = perspectiveCameraRef.current;
    if (!camera) return;
    if (editor.viewportCameraEntityId) return;
    camera.fov = editor.viewportFov ?? 60;
    camera.updateProjectionMatrix();
  }, [cameraMode, editor.viewportCameraEntityId, editor.viewportFov]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const perspectiveCamera = perspectiveCameraRef.current;
    const orthographicCamera = orthographicCameraRef.current;
    if (!camera || !controls || !perspectiveCamera || !orthographicCamera) return;

    if (!editor.viewportCameraEntityId) {
      syncActiveCamera(cameraMode === 'perspective' ? perspectiveCamera : orthographicCamera);
      controls.enabled = true;
      return;
    }

    const cameraEntity = activeScene?.entities.find(
      (entity) =>
        entity.id === editor.viewportCameraEntityId &&
        entity.components.has('Camera')
    );
    if (!cameraEntity) {
      setViewportCameraEntity(null);
      return;
    }

    const transform = asRecord(cameraEntity.components.get('Transform')?.data);
    const cameraData = asRecord(cameraEntity.components.get('Camera')?.data);
    const position = readVector3(transform?.position, new THREE.Vector3(0, 3, 6));
    const rotation = readQuaternion(
      transform?.rotation,
      new THREE.Quaternion(0, 0, 0, 1)
    );
    const isOrthographic = cameraData?.orthographic === true;

    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(rotation)
      .normalize();
    applyCameraPose(position, position.clone().add(forward), {
      camera: isOrthographic ? orthographicCamera : perspectiveCamera,
      near: typeof cameraData?.near === 'number' ? cameraData.near : undefined,
      far: typeof cameraData?.far === 'number' ? cameraData.far : undefined,
      fov:
        typeof cameraData?.fov === 'number'
          ? cameraData.fov
          : editor.viewportFov ?? 60,
      orthoSize:
        typeof cameraData?.orthoSize === 'number'
          ? cameraData.orthoSize
          : getOrthographicSize(orthographicCamera),
      up: new THREE.Vector3(0, 1, 0),
    });
    const activeCamera = isOrthographic ? orthographicCamera : perspectiveCamera;
    activeCamera.quaternion.copy(rotation);
    activeCamera.updateProjectionMatrix();
    controls.target.copy(position.clone().add(forward));
    controls.enabled = false;
    controls.update();
    transformToolsRef.current?.gizmo.updateTransform();
  }, [
    activeScene,
    applyCameraPose,
    cameraMode,
    editor.viewportCameraEntityId,
    editor.viewportFov,
    setViewportCameraEntity,
    syncActiveCamera,
  ]);

  useEffect(() => {
    return () => {
      disposeEnvironmentResources(
        environmentTextureRef.current,
        environmentRenderTargetRef.current
      );
      environmentTextureRef.current = null;
      environmentRenderTargetRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      navigationKeysRef.current.add(event.key.toLowerCase());
    };

    const onKeyUp = (event: KeyboardEvent) => {
      navigationKeysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    let lastFrame = performance.now();

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);

      const controls = controlsRef.current;
      const camera = cameraRef.current;
      if (!controls || !camera) {
        lastFrame = now;
        return;
      }

      const navigationMode = editor.navigationMode ?? 'orbit';
      if (navigationMode === 'orbit' || editor.viewportCameraEntityId) {
        lastFrame = now;
        return;
      }

      const deltaSeconds = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const keys = navigationKeysRef.current;
      if (keys.size === 0) return;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      if (navigationMode === 'walk') {
        forward.y = 0;
      }
      if (forward.lengthSq() === 0) {
        forward.set(0, 0, -1);
      }
      forward.normalize();

      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const movement = new THREE.Vector3();

      if (keys.has('w') || keys.has('arrowup')) movement.add(forward);
      if (keys.has('s') || keys.has('arrowdown')) movement.sub(forward);
      if (keys.has('d') || keys.has('arrowright')) movement.add(right);
      if (keys.has('a') || keys.has('arrowleft')) movement.sub(right);

      if (navigationMode === 'fly') {
        if (keys.has(' ') || keys.has('pageup')) movement.y += 1;
        if (keys.has('c') || keys.has('pagedown')) movement.y -= 1;
      }

      if (movement.lengthSq() === 0) return;

      movement.normalize();
      const speedMultiplier = navigationMode === 'walk' ? 6 : 10;
      const sprintMultiplier = navigationMode === 'fly' && keys.has('shift') ? 1.75 : 1;
      movement.multiplyScalar(speedMultiplier * (editor.cameraSpeed ?? 1) * sprintMultiplier * deltaSeconds);

      if (navigationMode === 'walk') {
        movement.y = 0;
      }

      camera.position.add(movement);
      controls.target.add(movement);
      controls.update();
      transformToolsRef.current?.gizmo.updateTransform();
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [editor.cameraSpeed, editor.navigationMode, editor.viewportCameraEntityId]);

  const stepRuntime = () => {
    if (playRuntimeState === 'PLAYING') return;
    setPlayRuntimeState('PLAYING');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPlayRuntimeState('PAUSED');
      });
    });
  };

  useSceneViewShortcuts({
    selectEntity,
    setGizmoMode,
    transformToolsRef,
    removeSelectedEntities,
    handleUndo,
    handleRedo,
    onToggleTransformSpace: () =>
      setTransformSpace((current) => (current === 'world' ? 'local' : 'world')),
    onFocusSelected: focusSelected,
  });

  return (
    <div
      ref={containerRef}
      data-testid="scene-view"
      className={`relative h-full w-full overflow-hidden bg-slate-900 ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="absolute left-2 right-2 top-2 z-20"
        onMouseDown={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
      >
        <EditorToolbar
          playState={playRuntimeState}
          transformMode={editor.gizmoMode}
          transformSpace={transformSpace}
          showGrid={editor.gridVisible}
          gridSize={gridSize}
          snapEnabled={editor.snapEnabled}
          snapTarget={snapTarget}
          snapValues={{ ...snapValues, translate: editor.snapValue }}
          activeAxes={activeAxes}
          cameraMode={cameraMode}
          pivotMode={pivotMode}
          canAdjustOrigin={canAdjustOrigin}
          showLights={editor.showLights}
          showColliders={editor.showColliders}
          onPlay={() => setPlayRuntimeState('PLAYING')}
          onPause={() =>
            setPlayRuntimeState(playRuntimeState === 'PAUSED' ? 'PLAYING' : 'PAUSED')
          }
          onStop={() => setPlayRuntimeState('IDLE')}
          onStep={stepRuntime}
          onTransformModeChange={(mode) => {
            setGizmoMode(mode);
            transformToolsRef.current?.gizmo.setMode(mode);
          }}
          onTransformSpaceChange={(space) => {
            setTransformSpace(space);
            transformToolsRef.current?.gizmo.setSpace(space);
          }}
          onGridVisibilityChange={setGridVisible}
          onGridSizeChange={setGridSize}
          onSnapEnabledChange={setSnapEnabled}
          onSnapTargetChange={setSnapTarget}
          onSnapValuesChange={(values) => {
            setSnapValues(values);
            setSnapValue(values.translate);
          }}
          onActiveAxesChange={(nextAxes) => {
            if (!nextAxes.x && !nextAxes.y && !nextAxes.z) {
              return;
            }
            setActiveAxes(nextAxes);
          }}
          onCameraModeChange={applyCameraMode}
          onPivotModeChange={(mode) => {
            objectPivotDragStateRef.current = null;
            setPivotMode(mode);
          }}
          onOriginToGeometry={() => updateEditableMeshOrigin('originToGeometry')}
          onGeometryToOrigin={() => updateEditableMeshOrigin('geometryToOrigin')}
          onShowLightsChange={setShowLights}
          onShowCollidersChange={setShowColliders}
          onFocusSelected={focusSelected}
          onResetView={resetView}
        />
      </div>

      <div
        className="absolute left-2 top-[4.75rem] z-20 flex max-w-[420px] flex-wrap gap-1 rounded-lg bg-slate-800/85 p-1.5 backdrop-blur-sm"
        onMouseDown={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
      >
        <button
          onClick={() => createManualEntity('cube')}
          data-testid="scene-add-cube"
          className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
        >
          + Cubo
        </button>
        <button
          onClick={() => createManualEntity('sphere')}
          data-testid="scene-add-sphere"
          className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
        >
          + Esfera
        </button>
        <button
          onClick={() => createManualEntity('light')}
          data-testid="scene-add-light"
          className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
        >
          + Luz
        </button>
        <button
          onClick={() => createManualEntity('camera')}
          data-testid="scene-add-camera"
          className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
        >
          + Camara
        </button>
        <button
          onClick={removeSelectedEntities}
          data-testid="scene-remove-selected"
          className="rounded bg-rose-700/80 px-2 py-1 text-xs text-rose-100 hover:bg-rose-600"
        >
          Eliminar seleccion
        </button>
      </div>

      {isBoxSelecting && (
        <div
          className="pointer-events-none fixed z-[1000] border border-blue-500 bg-blue-500/20"
          style={{
            left: Math.min(boxSelectStart.x, boxSelectEnd.x),
            top: Math.min(boxSelectStart.y, boxSelectEnd.y),
            width: Math.abs(boxSelectEnd.x - boxSelectStart.x),
            height: Math.abs(boxSelectEnd.y - boxSelectStart.y),
          }}
        />
      )}

      <div
        className="absolute bottom-2 left-2 z-10 rounded-lg bg-slate-800/80 px-3 py-1.5 font-mono text-xs text-slate-300 backdrop-blur-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span>FPS: 60</span>
        <span className="mx-2 text-slate-500">|</span>
        <span>Objects: {activeScene?.entities.length ?? 0}</span>
      </div>

      <div
        className="absolute right-2 top-[4.75rem] z-10 rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-slate-400 backdrop-blur-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span>
          W/E/R: Transform | Q: Space | F: Focus |{' '}
          {editor.viewportCameraEntityId
            ? `Virtual Camera: ${virtualCameraEntity?.name ?? 'Locked'}`
            : editor.navigationMode === 'orbit'
              ? 'Orbit'
              : 'WASD + Space/C'}
        </span>
      </div>

      {selectedModelerEntityId && selectedModelerMesh && modelerMode !== 'object' && (
        <div
          className="absolute right-2 top-[7.5rem] z-10 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm"
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
        >
          Edit {modelerMode.toUpperCase()} | Gizmo sub-elemento + click directo | Shift multi |
          Sel: {safeModelerSelection.length}
        </div>
      )}

      {topologyViewportReady && (
        <div
          className="absolute right-2 top-[10.25rem] z-10 rounded-lg bg-emerald-950/90 px-3 py-1.5 text-xs text-emerald-100 backdrop-blur-sm"
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
        >
          Topology Viewport | {topologyViewportMode === 'template' ? `Template ${topologyViewportTemplateType}` : 'Intent'}
          {' '}| Stroke pts: {topologyStrokePointCount}
          {topologyLastIntentKind ? ` | Last: ${topologyLastIntentKind}` : ''}
        </div>
      )}

      {hoveredAxis && (
        <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-blue-500/80 px-3 py-1.5 text-xs text-white">
          Axis: {hoveredAxis.toUpperCase()}
        </div>
      )}
    </div>
  );
}
