// ============================================
// Scene View Component - 3D Viewport with Editor Tools
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useCallback, useRef, useState } from 'react';
import { useActiveScene, useEngineStore } from '@/store/editorStore';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { TransformTools } from './gizmos';
import type { SelectionManager, SelectionBox } from './selection';
import {
  type CameraMode,
  type PivotMode,
} from './EditorToolbar';
import { useSceneEntitySync } from './useSceneEntitySync';
import { useEditorShortcutConfig } from './useEditorShortcutConfig';
import { useSceneViewRenderPipeline } from './useSceneViewRenderPipeline';
import { useSceneViewWorldPipeline } from './useSceneViewWorldPipeline';
import { useSceneViewPaint } from './useSceneViewPaint';
import { useSceneViewSetup } from './useSceneViewSetup';
import { useSceneViewLOD } from './useSceneViewLOD';
import { useSceneViewCameraController } from './useSceneViewCameraController';
import { useSceneViewEditorBindings } from './useSceneViewEditorBindings';
import { useSceneViewNavigation } from './useSceneViewNavigation';
import { useSceneViewViewModel } from './useSceneViewViewModel';
import { useSceneViewViewportController } from './useSceneViewViewportController';
import {
  getViewportAspect,
  type ViewportCamera,
} from './viewportCamera';
import { SceneViewportHud } from './viewport/SceneViewportHud';
import { SceneViewportOverlays } from './viewport/SceneViewportOverlays';
import { SceneViewportShell } from './viewport/SceneViewportShell';
import {
  createEmptyViewportRuntimeMetrics,
  useViewportTelemetry,
} from './viewport/useViewportTelemetry';
import type { LightingSystem } from '@/engine/rendering/LightingSystem';
import { GlobalIlluminationFeature } from '@/engine/rendering/RenderPipeline';

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
  const lightingSystemRef = useRef<LightingSystem | null>(null);
  const globalIlluminationRef = useRef<GlobalIlluminationFeature | null>(null);
  const lastLightingBakeTokenRef = useRef<number | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const renderPassRef = useRef<RenderPass | null>(null);
  const ssaoPassRef = useRef<SSAOPass | null>(null);
  const ssrPassRef = useRef<SSRPass | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const colorGradingPassRef = useRef<ShaderPass | null>(null);
  const vignettePassRef = useRef<ShaderPass | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const resizeViewportRef = useRef<((width: number, height: number) => void) | null>(null);
  const viewportRuntimeMetricsRef = useRef(createEmptyViewportRuntimeMetrics());

  const transformToolsRef = useRef<TransformTools | null>(null);
  const selectionRef = useRef<SelectionManager | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
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
  const shortcutConfig = useEditorShortcutConfig();
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
  const viewportTelemetry = useViewportTelemetry({
    rendererRef,
    runtimeMetricsRef: viewportRuntimeMetricsRef,
    sceneId: activeScene?.id ?? null,
    objectCount: activeScene?.entities.length ?? 0,
    selectionCount: editor.selectedEntities.length,
    runtimeState: playRuntimeState,
  });
  const {
    cameraMode,
    snapTarget,
    virtualCameraEntity,
    selectedModelerEntityId,
    selectedOriginMesh,
    canAdjustOrigin,
    selectedModelerMesh,
    topologyViewportMode,
    topologyViewportTemplateType,
    modelerMode,
    safeModelerSelection,
    selectedModelerVertexIndices,
    modelerSubSelectionActive,
    topologyViewportReady,
    selectedModelerMeshSignature,
    safeModelerSelectionSignature,
  } = useSceneViewViewModel({
    activeScene: activeScene ?? null,
    editor,
  });

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
    viewportRuntimeMetricsRef,
  });

  useSceneViewLOD({
    sceneRef,
    cameraRef,
    rendererRef,
    transformToolsRef,
  });

  useSceneViewNavigation({
    cameraRef,
    controlsRef,
    transformToolsRef,
    navigationMode: (editor.navigationMode ?? 'orbit') as 'orbit' | 'walk' | 'fly',
    cameraSpeed: editor.cameraSpeed,
    viewportCameraEntityId: editor.viewportCameraEntityId,
  });

  useSceneViewRenderPipeline({
    containerRef,
    rendererRef,
    sceneRef,
    cameraRef,
    perspectiveCameraRef,
    globalIlluminationRef,
    composerRef,
    renderPassRef,
    ssaoPassRef,
    ssrPassRef,
    bloomPassRef,
    colorGradingPassRef,
    vignettePassRef,
    pmremGeneratorRef,
    renderFrameRef,
    resizeViewportRef,
  });

  useSceneViewWorldPipeline({
    activeScene: activeScene ?? null,
    showLights: editor.showLights,
    lightingBakeRequest: editor.lightingBakeRequest,
    sceneRef,
    rendererRef,
    cameraRef,
    perspectiveCameraRef,
    environmentTextureRef,
    environmentRenderTargetRef,
    pmremGeneratorRef,
    lightingSystemRef,
    globalIlluminationRef,
    lastLightingBakeTokenRef,
    bloomPassRef,
    colorGradingPassRef,
    ssaoPassRef,
    ssrPassRef,
    vignettePassRef,
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

  const { applyCameraMode, focusSelected, resetView } = useSceneViewCameraController({
    activeScene: activeScene ?? null,
    selectedEntities: editor.selectedEntities,
    cameraMode,
    viewportFov: editor.viewportFov,
    viewportCameraEntityId: editor.viewportCameraEntityId,
    sceneRef,
    cameraRef,
    perspectiveCameraRef,
    orthographicCameraRef,
    controlsRef,
    transformToolsRef,
    selectionRef,
    selectionBoxRef,
    renderPassRef,
    ssaoPassRef,
    ssrPassRef,
    lastAppliedCameraModeRef,
    getViewportSize,
    setViewportCameraMode,
    setViewportCameraEntity,
  });

  useSceneViewEditorBindings({
    sceneRef,
    transformToolsRef,
    timerRef,
    playRuntimeState,
    gridVisible: editor.gridVisible,
    showLights: editor.showLights,
    gridSize,
    gizmoMode: editor.gizmoMode,
    transformSpace,
    activeAxes,
    snapEnabled: editor.snapEnabled,
    snapValue: editor.snapValue,
    snapTarget,
    snapValues,
  });

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
    shellHandlers: {
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleMouseLeave,
    },
    toolbarProps,
    overlaysProps,
    onCreateEntity,
    onRemoveSelected,
  } = useSceneViewViewportController({
    refs: {
      containerRef,
      sceneRef,
      cameraRef,
      controlsRef,
      transformToolsRef,
      selectionRef,
      selectionBoxRef,
      rendererRef,
      renderFrameRef,
    },
    activeScene: activeScene
      ? {
          entities: activeScene.entities,
          collections: activeScene.collections,
        }
      : null,
    virtualCameraName: virtualCameraEntity?.name ?? null,
    shortcutConfig,
    viewportTelemetry: {
      fps: viewportTelemetry.fps,
      frameTimeMs: viewportTelemetry.frameTimeMs,
    },
    editorState: {
      selectedEntities: editor.selectedEntities,
      viewportCameraEntityId: editor.viewportCameraEntityId ?? null,
      tool: editor.tool ?? 'select',
      paintEnabled: Boolean(editor.paintEnabled),
      navigationMode: (editor.navigationMode ?? 'orbit') as 'orbit' | 'walk' | 'fly',
      gizmoMode: editor.gizmoMode,
      showColliders: editor.showColliders,
      showLights: editor.showLights,
      playRuntimeState,
      modelerMode,
      modelerSelectedElements: editor.modelerSelectedElements,
    },
    modelerState: {
      selectedModelerEntityId,
      selectedModelerMesh,
      selectedOriginMesh,
      safeModelerSelection,
      selectedModelerVertexIndices,
      modelerSubSelectionActive,
      topologyViewportReady,
      selectedModelerMeshSignature,
      safeModelerSelectionSignature,
      topologyViewportMode,
      topologyViewportTemplateType,
    },
    paint: {
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
    },
    viewportUi: {
      cameraMode,
      pivotMode,
      transformSpace,
      gridVisible: editor.gridVisible,
      gridSize,
      snapEnabled: editor.snapEnabled,
      snapTarget,
      snapValue: editor.snapValue,
      snapValues,
      activeAxes,
      canAdjustOrigin,
    },
    actions: {
      selectEntity,
      setGizmoMode,
      setModelerMode,
      setModelerSelection: setModelerSelection as (selection: number[]) => void,
      setPlayRuntimeState,
      setTransformSpace,
      setGridVisible,
      setGridSize,
      setSnapEnabled,
      setSnapValue,
      setSnapTarget,
      setSnapValues,
      setActiveAxes,
      setPivotMode,
      setShowLights,
      setShowColliders,
      addEntity,
      updateEntity,
      updateEntityTransient,
      applyCameraMode,
      focusSelected,
      resetView,
    },
  });

  return (
    <SceneViewportShell
      ref={containerRef}
      className={className}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <SceneViewportHud
        toolbarProps={toolbarProps}
        onCreateEntity={onCreateEntity}
        onRemoveSelected={onRemoveSelected}
      />

      <SceneViewportOverlays {...overlaysProps} />
    </SceneViewportShell>
  );
}
