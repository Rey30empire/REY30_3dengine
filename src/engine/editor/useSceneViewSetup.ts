'use client';

import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformTools } from './gizmos';
import { SelectionBox, SelectionManager } from './selection';
import { scriptRuntime } from '@/engine/gameplay/ScriptRuntime';
import { audioRuntimeBridge } from '@/engine/audio/audioRuntimeBridge';
import { UI_RUNTIME_CANVAS_ID, uiRuntimeBridge } from '@/engine/ui-runtime';
import { GPUParticleSystem } from '@/engine/rendering/GPUParticleSystem';
import type { ViewportRuntimeMetrics } from './viewport/useViewportTelemetry';
import {
  DEFAULT_ORTHOGRAPHIC_SIZE,
  setOrthographicSize,
  type ViewportCamera,
} from './viewportCamera';

declare global {
  interface Window {
    __rey30ThreeShaderWarnFilterInstalled?: boolean;
  }
}

function installKnownThreeShaderWarningFilter(): void {
  if (typeof window === 'undefined' || window.__rey30ThreeShaderWarnFilterInstalled) {
    return;
  }

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const [firstArg, ...rest] = args;
    const message =
      typeof firstArg === 'string'
        ? [firstArg, ...rest.filter((value): value is string => typeof value === 'string')].join(' ')
        : '';

    const isKnownAnglePrecisionWarning =
      message.includes('THREE.WebGLProgram: Program Info Log:') &&
      message.includes('warning X4122') &&
      message.includes('double precision');

    const isKnownClockDeprecationWarning =
      message.includes('THREE.Clock') &&
      message.includes('deprecated') &&
      message.includes('THREE.Timer');

    if (isKnownAnglePrecisionWarning || isKnownClockDeprecationWarning) {
      return;
    }

    originalWarn(...args);
  };

  window.__rey30ThreeShaderWarnFilterInstalled = true;
}

function disposeSceneResources(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function removeStaleViewportCanvases(container: HTMLElement): void {
  Array.from(container.children).forEach((child) => {
    if (!(child instanceof HTMLCanvasElement)) return;
    if (child.id === UI_RUNTIME_CANVAS_ID) return;
    child.remove();
  });
}

export function useSceneViewSetup(params: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  perspectiveCameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  orthographicCameraRef: MutableRefObject<THREE.OrthographicCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  animationIdRef: MutableRefObject<number | null>;
  timerRef: MutableRefObject<THREE.Timer>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  selectionRef: MutableRefObject<SelectionManager | null>;
  selectionBoxRef: MutableRefObject<SelectionBox | null>;
  renderFrameRef: MutableRefObject<(() => void) | null>;
  resizeViewportRef: MutableRefObject<((width: number, height: number) => void) | null>;
  viewportRuntimeMetricsRef: MutableRefObject<ViewportRuntimeMetrics>;
}) {
  const {
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
    viewportRuntimeMetricsRef,
  } = params;

  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    const container = containerRef.current;
    removeStaleViewportCanvases(container);
    uiRuntimeBridge.attachToContainer(container);

    installKnownThreeShaderWarningFilter();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      precision: 'mediump',
    });
    renderer.domElement.dataset.rey30ViewportCanvas = 'true';
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    let gpuParticleSystem: GPUParticleSystem | null = null;
    try {
      const candidate = new GPUParticleSystem();
      candidate.initialize(renderer);
      if (candidate.isReady()) {
        candidate.setScene(scene);
        gpuParticleSystem = candidate;
      } else {
        candidate.dispose();
      }
    } catch (error) {
      console.warn('GPU particle preview unavailable, using CPU fallback.', error);
      gpuParticleSystem = null;
    }
    scene.userData.particlePreviewRuntime = {
      gpuSystem: gpuParticleSystem,
    };

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    camera.position.set(10, 10, 10);
    perspectiveCameraRef.current = camera;

    const orthographicCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 10000);
    orthographicCamera.position.copy(camera.position);
    orthographicCamera.quaternion.copy(camera.quaternion);
    orthographicCamera.up.copy(camera.up);
    setOrthographicSize(
      orthographicCamera,
      container.clientWidth,
      container.clientHeight,
      DEFAULT_ORTHOGRAPHIC_SIZE
    );
    orthographicCameraRef.current = orthographicCamera;
    cameraRef.current = camera;

    const controls = new OrbitControls(cameraRef.current, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 1000;
    controlsRef.current = controls;

    const transformTools = new TransformTools();
    transformTools.setScene(scene);
    transformTools.setCamera(cameraRef.current);
    transformToolsRef.current = transformTools;

    const selection = new SelectionManager();
    selection.initialize(cameraRef.current, scene, container);
    selectionRef.current = selection;

    const selectionBox = new SelectionBox(cameraRef.current, scene, container);
    selectionBoxRef.current = selectionBox;

    scene.add(transformTools.gizmo.object);

    const gridHelper = new THREE.GridHelper(100, 100, 0x444466, 0x222244);
    gridHelper.name = 'grid';
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    axesHelper.name = 'axes';
    scene.add(axesHelper);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    ambientLight.name = 'ambient_light';
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.name = 'directional_light';
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.radius = 4;
    directionalLight.shadow.normalBias = 0.02;
    directionalLight.shadow.bias = -0.0002;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 400;
    directionalLight.shadow.camera.left = -120;
    directionalLight.shadow.camera.right = 120;
    directionalLight.shadow.camera.top = 120;
    directionalLight.shadow.camera.bottom = -120;
    scene.add(directionalLight);

    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x333344,
      metalness: 0.2,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'Ground';
    scene.add(ground);

    timerRef.current.connect(document);
    timerRef.current.reset();

    const animate = (timestamp?: number) => {
      animationIdRef.current = requestAnimationFrame(animate);
      timerRef.current.update(timestamp);
      const delta = timerRef.current.getDelta();
      scriptRuntime.update(delta);
      scene.traverse((object) => {
        const preview = object.userData?.particlePreview as
          | {
              emitter?: {
                update: (deltaSeconds: number) => void;
                play?: () => void;
                stop?: () => void;
                clear?: () => void;
              };
              elapsed?: number;
              duration?: number;
              looping?: boolean;
            }
          | undefined;
        if (!preview?.emitter) return;

        preview.elapsed = (preview.elapsed ?? 0) + delta;
        const duration = Math.max(preview.duration ?? 0, 0);
        if (preview.looping === false && duration > 0 && preview.elapsed >= duration) {
          preview.emitter.stop?.();
        } else {
          if (preview.looping && duration > 0 && preview.elapsed >= duration) {
            preview.elapsed %= duration;
            preview.emitter.clear?.();
          }
          preview.emitter.play?.();
        }
        preview.emitter.update(delta);
      });
      gpuParticleSystem?.setCamera(cameraRef.current ?? camera);
      gpuParticleSystem?.update(delta);
      gpuParticleSystem?.render();
      controls.update();
      audioRuntimeBridge.syncListener(cameraRef.current ?? camera, delta);
      const renderStartedAt = performance.now();
      const renderFrame = renderFrameRef.current;
      if (renderFrame) {
        renderFrame();
      } else {
        renderer.render(scene, cameraRef.current ?? camera);
      }
      const renderFinishedAt = performance.now();
      const renderInfo = renderer.info.render;
      const triangleCount = Number.isFinite(renderInfo.triangles) ? renderInfo.triangles : 0;
      const lineCount = Number.isFinite(renderInfo.lines) ? renderInfo.lines : 0;
      const pointCount = Number.isFinite(renderInfo.points) ? renderInfo.points : 0;
      viewportRuntimeMetricsRef.current = {
        renderCpuTimeMs: Math.max(0, renderFinishedAt - renderStartedAt),
        gpuTimeMs: 0,
        drawCalls: Number.isFinite(renderInfo.calls) ? renderInfo.calls : 0,
        triangles: triangleCount,
        vertices: triangleCount * 3 + lineCount * 2 + pointCount,
        textures: Number.isFinite(renderer.info.memory.textures) ? renderer.info.memory.textures : 0,
        meshes: Number.isFinite(renderer.info.memory.geometries) ? renderer.info.memory.geometries : 0,
        audioBuffers: audioRuntimeBridge.getActiveSourceCount(),
      };
    };
    animate();

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      setOrthographicSize(
        orthographicCamera,
        width,
        height,
        orthographicCamera.userData?.orthoSize ?? DEFAULT_ORTHOGRAPHIC_SIZE
      );
      renderer.setSize(width, height);
      resizeViewportRef.current?.(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }

      controls.dispose();
      transformTools.dispose();
      selection.dispose();
      selectionBox.dispose();

      gpuParticleSystem?.dispose();
      scene.userData.particlePreviewRuntime = null;
      disposeSceneResources(scene);
      (
        renderer as THREE.WebGLRenderer & {
          renderLists?: { dispose?: () => void };
        }
      ).renderLists?.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }

      timerRef.current.disconnect();
      timerRef.current.reset();
      timerRef.current = new THREE.Timer();
      audioRuntimeBridge.syncListener(null);
      uiRuntimeBridge.attachToContainer(null);
      viewportRuntimeMetricsRef.current = {
        renderCpuTimeMs: 0,
        gpuTimeMs: 0,
        drawCalls: 0,
        triangles: 0,
        vertices: 0,
        textures: 0,
        meshes: 0,
        audioBuffers: 0,
      };
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      perspectiveCameraRef.current = null;
      orthographicCameraRef.current = null;
      controlsRef.current = null;
      transformToolsRef.current = null;
      selectionRef.current = null;
      selectionBoxRef.current = null;
      renderFrameRef.current = null;
      resizeViewportRef.current = null;
    };
  }, [
    animationIdRef,
    cameraRef,
    containerRef,
    controlsRef,
    orthographicCameraRef,
    perspectiveCameraRef,
    rendererRef,
    sceneRef,
    selectionBoxRef,
    selectionRef,
    timerRef,
    transformToolsRef,
    renderFrameRef,
    resizeViewportRef,
    viewportRuntimeMetricsRef,
  ]);
}
