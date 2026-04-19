'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { STORE_OBJECT_PREFIX } from './sceneView.visuals';
import { acceptTopologyIntentStroke } from './modelerTopologyBridge';
import { cloneEditableMesh, type EditableMesh } from './modelerMesh';
import type { ViewportCamera } from './viewportCamera';

export function useSceneViewTopologyInteractions(params: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  selectedModelerEntityId: string | null;
  selectedModelerMesh: EditableMesh | null;
  topologyViewportReady: boolean;
  topologyViewportMode: 'template' | 'intent_driven';
  topologyViewportTemplateType: Parameters<typeof acceptTopologyIntentStroke>[0]['templateType'];
  syncModelerMeshToStore: (nextMesh: EditableMesh, commit?: boolean) => void;
}) {
  const {
    containerRef,
    cameraRef,
    sceneRef,
    selectedModelerEntityId,
    selectedModelerMesh,
    topologyViewportReady,
    topologyViewportMode,
    topologyViewportTemplateType,
    syncModelerMeshToStore,
  } = params;

  const topologyStrokeBaseMeshRef = useRef<EditableMesh | null>(null);
  const topologyStrokePointsRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const [topologyStrokePointCount, setTopologyStrokePointCount] = useState(0);
  const [topologyLastIntentKind, setTopologyLastIntentKind] = useState<string | null>(null);

  const sampleTopologyStrokePoint = useCallback((event: MouseEvent) => {
    if (!containerRef.current || !cameraRef.current) {
      return null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const mouse = new THREE.Vector2((x / rect.width) * 2 - 1, -((y / rect.height) * 2 - 1));
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
    const workPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fallbackAnchor.y);
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(workPlane, point)) {
      return { x: point.x, y: point.y, z: point.z };
    }

    return null;
  }, [cameraRef, containerRef, sceneRef, selectedModelerEntityId]);

  const resetTopologyStroke = useCallback((options?: { restoreBase?: boolean }) => {
    if (options?.restoreBase && topologyStrokeBaseMeshRef.current) {
      syncModelerMeshToStore(topologyStrokeBaseMeshRef.current, false);
    }
    topologyStrokeBaseMeshRef.current = null;
    topologyStrokePointsRef.current = [];
    setTopologyStrokePointCount(0);
  }, [syncModelerMeshToStore]);

  const applyTopologyStroke = useCallback((commit: boolean) => {
    if (!topologyStrokeBaseMeshRef.current || topologyStrokePointsRef.current.length === 0) {
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

  const handleTopologyViewportStrokeStart = useCallback((event: MouseEvent) => {
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

  const handleTopologyViewportStrokeMove = useCallback((event: MouseEvent) => {
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
      Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y, point.z - lastPoint.z) < 0.04
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

  const customStrokeHandlers = useMemo(
    () => ({
      isEnabled: topologyViewportReady,
      onStart: handleTopologyViewportStrokeStart,
      onMove: handleTopologyViewportStrokeMove,
      onEnd: handleTopologyViewportStrokeEnd,
      onCancel: handleTopologyViewportStrokeCancel,
    }),
    [
      handleTopologyViewportStrokeCancel,
      handleTopologyViewportStrokeEnd,
      handleTopologyViewportStrokeMove,
      handleTopologyViewportStrokeStart,
      topologyViewportReady,
    ]
  );

  return {
    topologyStrokePointCount,
    topologyLastIntentKind,
    customStrokeHandlers,
  };
}
