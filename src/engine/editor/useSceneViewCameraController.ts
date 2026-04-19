'use client';

import { useCallback, useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import type { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import type { Scene as EditorScene } from '@/types/engine';
import { syncSSAOPassCamera, syncSSRPassCamera } from './useSceneViewRenderPipeline';
import { STORE_OBJECT_PREFIX, asRecord, readQuaternion, readVector3 } from './sceneView.visuals';
import type { CameraMode } from './EditorToolbar';
import type { TransformTools } from './gizmos';
import type { SelectionBox, SelectionManager } from './selection';
import {
  applyCameraTransform,
  applyOrthographicLens,
  applyPerspectiveLens,
  computeOrthographicSizeToFitBox,
  deriveOrthographicSizeFromPerspective,
  getOrthographicSize,
  isPerspectiveCamera,
  setCameraClipPlanes,
  type ViewportCamera,
} from './viewportCamera';

export function useSceneViewCameraController(params: {
  activeScene: EditorScene | null;
  selectedEntities: string[];
  cameraMode: CameraMode;
  viewportFov: number | null | undefined;
  viewportCameraEntityId: string | null | undefined;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  perspectiveCameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  orthographicCameraRef: MutableRefObject<THREE.OrthographicCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  selectionRef: MutableRefObject<SelectionManager | null>;
  selectionBoxRef: MutableRefObject<SelectionBox | null>;
  renderPassRef: MutableRefObject<RenderPass | null>;
  ssaoPassRef: MutableRefObject<SSAOPass | null>;
  ssrPassRef: MutableRefObject<SSRPass | null>;
  lastAppliedCameraModeRef: MutableRefObject<CameraMode>;
  getViewportSize: () => { width: number; height: number; aspect: number };
  setViewportCameraMode: (mode: CameraMode) => void;
  setViewportCameraEntity: (entityId: string | null) => void;
}) {
  const {
    activeScene,
    selectedEntities,
    cameraMode,
    viewportFov,
    viewportCameraEntityId,
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
  } = params;

  const syncActiveCamera = useCallback((nextCamera: ViewportCamera | null) => {
    if (!nextCamera) return;

    cameraRef.current = nextCamera;
    if (renderPassRef.current) {
      renderPassRef.current.camera = nextCamera;
    }
    syncSSAOPassCamera(ssaoPassRef.current, nextCamera);
    syncSSRPassCamera(ssrPassRef.current, nextCamera);

    const controls =
      controlsRef.current as (OrbitControls & { object: THREE.Camera }) | null;
    if (controls) {
      controls.object = nextCamera;
    }

    selectionRef.current?.setCamera(nextCamera);
    selectionBoxRef.current?.setCamera(nextCamera);
    transformToolsRef.current?.setCamera(nextCamera);
  }, [
    cameraRef,
    controlsRef,
    renderPassRef,
    selectionBoxRef,
    selectionRef,
    ssaoPassRef,
    ssrPassRef,
    transformToolsRef,
  ]);

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
        options?.fov ?? viewportFov ?? 60,
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
  }, [
    cameraRef,
    controlsRef,
    getViewportSize,
    transformToolsRef,
    viewportFov,
    syncActiveCamera,
  ]);

  const getSelectedViewportObjects = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return [] as THREE.Object3D[];

    return selectedEntities
      .map((entityId) => scene.getObjectByName(`${STORE_OBJECT_PREFIX}${entityId}`))
      .filter((object): object is THREE.Object3D => Boolean(object));
  }, [sceneRef, selectedEntities]);

  const getSelectionBounds = useCallback(() => {
    const selectedObjects = getSelectedViewportObjects();
    if (selectedObjects.length === 0) return null;

    const bounds = new THREE.Box3();
    selectedObjects.forEach((object) => bounds.expandByObject(object));
    return bounds;
  }, [getSelectedViewportObjects]);

  const focusSelected = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (viewportCameraEntityId) {
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
    const position = center.clone().add(direction.normalize().multiplyScalar(distance));

    if (cameraMode === 'perspective') {
      applyCameraPose(position, center, {
        camera: perspectiveCameraRef.current,
        fov: viewportFov ?? 60,
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
  }, [
    applyCameraPose,
    getSelectionBounds,
    cameraMode,
    cameraRef,
    controlsRef,
    getViewportSize,
    orthographicCameraRef,
    perspectiveCameraRef,
    setViewportCameraEntity,
    viewportCameraEntityId,
    viewportFov,
  ]);

  const applyCameraMode = useCallback((mode: CameraMode, options?: { skipStore?: boolean }) => {
    const camera = cameraRef.current;
    const perspectiveCamera = perspectiveCameraRef.current;
    const orthographicCamera = orthographicCameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !perspectiveCamera || !orthographicCamera) return;
    if (viewportCameraEntityId && !options?.skipStore) {
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
    let fov = viewportFov ?? 60;
    let orthoSize = getOrthographicSize(orthographicCamera);
    let nextCamera: ViewportCamera = perspectiveCamera;

    switch (mode) {
      case 'orthographic':
        nextCamera = orthographicCamera;
        position = camera.position.clone();
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(selectionBounds, position, target, up, aspect)
          : isPerspectiveCamera(camera)
            ? deriveOrthographicSizeFromPerspective(distance, camera.fov)
            : getOrthographicSize(orthographicCamera);
        break;
      case 'top':
        nextCamera = orthographicCamera;
        position = target.clone().add(new THREE.Vector3(0, distance, 0.001));
        up = new THREE.Vector3(0, 0, -1);
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(selectionBounds, position, target, up, aspect)
          : Math.max(distance * 0.5, 5);
        break;
      case 'front':
        nextCamera = orthographicCamera;
        position = target.clone().add(new THREE.Vector3(0, distance * 0.12, distance));
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(selectionBounds, position, target, up, aspect)
          : Math.max(distance * 0.5, 5);
        break;
      case 'side':
        nextCamera = orthographicCamera;
        position = target.clone().add(new THREE.Vector3(distance, distance * 0.12, 0));
        orthoSize = selectionBounds
          ? computeOrthographicSizeToFitBox(selectionBounds, position, target, up, aspect)
          : Math.max(distance * 0.5, 5);
        break;
      case 'perspective':
      default:
        nextCamera = perspectiveCamera;
        fov = isPerspectiveCamera(camera) ? camera.fov : viewportFov ?? 60;
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
  }, [
    applyCameraPose,
    getSelectionBounds,
    cameraRef,
    controlsRef,
    getViewportSize,
    lastAppliedCameraModeRef,
    orthographicCameraRef,
    perspectiveCameraRef,
    setViewportCameraEntity,
    setViewportCameraMode,
    viewportCameraEntityId,
    viewportFov,
  ]);

  const resetView = useCallback(() => {
    if (viewportCameraEntityId) {
      setViewportCameraEntity(null);
    }
    applyCameraMode('perspective');
  }, [applyCameraMode, setViewportCameraEntity, viewportCameraEntityId]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (viewportCameraEntityId) return;
    if (lastAppliedCameraModeRef.current === cameraMode) return;
    applyCameraMode(cameraMode, { skipStore: true });
  }, [
    applyCameraMode,
    cameraMode,
    cameraRef,
    controlsRef,
    lastAppliedCameraModeRef,
    viewportCameraEntityId,
  ]);

  useEffect(() => {
    const camera = perspectiveCameraRef.current;
    if (!camera) return;
    if (viewportCameraEntityId) return;
    camera.fov = viewportFov ?? 60;
    camera.updateProjectionMatrix();
  }, [
    cameraMode,
    perspectiveCameraRef,
    viewportCameraEntityId,
    viewportFov,
  ]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const perspectiveCamera = perspectiveCameraRef.current;
    const orthographicCamera = orthographicCameraRef.current;
    if (!camera || !controls || !perspectiveCamera || !orthographicCamera) return;

    if (!viewportCameraEntityId) {
      syncActiveCamera(cameraMode === 'perspective' ? perspectiveCamera : orthographicCamera);
      controls.enabled = true;
      return;
    }

    const cameraEntity = activeScene?.entities.find(
      (entity) =>
        entity.id === viewportCameraEntityId &&
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

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation).normalize();
    applyCameraPose(position, position.clone().add(forward), {
      camera: isOrthographic ? orthographicCamera : perspectiveCamera,
      near: typeof cameraData?.near === 'number' ? cameraData.near : undefined,
      far: typeof cameraData?.far === 'number' ? cameraData.far : undefined,
      fov:
        typeof cameraData?.fov === 'number'
          ? cameraData.fov
          : viewportFov ?? 60,
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
    cameraMode,
    cameraRef,
    controlsRef,
    orthographicCameraRef,
    perspectiveCameraRef,
    setViewportCameraEntity,
    transformToolsRef,
    viewportCameraEntityId,
    viewportFov,
    applyCameraPose,
    syncActiveCamera,
  ]);

  return {
    applyCameraMode,
    focusSelected,
    resetView,
  };
}
