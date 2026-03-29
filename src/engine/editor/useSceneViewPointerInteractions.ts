'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GizmoAxis, TransformTools } from './gizmos';
import type { SelectionBox, SelectionManager } from './selection';
import type { ViewportCamera } from './viewportCamera';

export function useSceneViewPointerInteractions(params: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  selectionRef: MutableRefObject<SelectionManager | null>;
  selectionBoxRef: MutableRefObject<SelectionBox | null>;
  tool: string;
  paintEnabled: boolean;
  isPainting: boolean;
  startPaint: (event: React.MouseEvent) => void;
  continuePaint: (event: React.MouseEvent) => void;
  finishPaint: () => boolean;
  cancelPaint: () => boolean;
  selectEntity: (entityId: string | null, additive?: boolean) => void;
  onModelerElementPick?: (type: string, index: number, additive: boolean) => void;
  customTransformHandlers?: {
    isCustomTarget: (object: THREE.Object3D | null) => boolean;
    onStart?: (object: THREE.Object3D, axis: GizmoAxis) => void;
    onChange?: (object: THREE.Object3D) => void;
    onEnd?: (object: THREE.Object3D | null, options?: { commit: boolean }) => void;
  };
  customStrokeHandlers?: {
    isEnabled: boolean;
    onStart: (event: React.MouseEvent) => boolean;
    onMove?: (event: React.MouseEvent) => void;
    onEnd?: () => boolean;
    onCancel?: () => boolean;
  };
  syncBoxSelectionToStore: (objects: THREE.Object3D[]) => void;
  syncObjectTransformToStore: (object: THREE.Object3D | null, options?: { commit?: boolean }) => void;
  controlsLocked?: boolean;
}) {
  const {
    containerRef,
    cameraRef,
    sceneRef,
    controlsRef,
    transformToolsRef,
    selectionRef,
    selectionBoxRef,
    tool,
    paintEnabled,
    isPainting,
    startPaint,
    continuePaint,
    finishPaint,
    cancelPaint,
    selectEntity,
    onModelerElementPick,
    customTransformHandlers,
    customStrokeHandlers,
    syncBoxSelectionToStore,
    syncObjectTransformToStore,
    controlsLocked = false,
  } = params;

  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectStart, setBoxSelectStart] = useState({ x: 0, y: 0 });
  const [boxSelectEnd, setBoxSelectEnd] = useState({ x: 0, y: 0 });
  const [hoveredAxis, setHoveredAxis] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isBoxSelectingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isCustomStrokingRef = useRef(false);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const mouse = new THREE.Vector2(
      (x / rect.width) * 2 - 1,
      -((y / rect.height) * 2 - 1)
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    if (
      event.button === 0 &&
      customStrokeHandlers?.isEnabled &&
      customStrokeHandlers.onStart(event)
    ) {
      if (controlsRef.current && !controlsLocked) {
        controlsRef.current.enabled = false;
      }
      isCustomStrokingRef.current = true;
      return;
    }

    if (tool === 'brush' || paintEnabled) {
      startPaint(event);
      return;
    }

    if (transformToolsRef.current) {
      const gizmoObjects: THREE.Object3D[] = [];
      transformToolsRef.current.gizmo.object.traverse((obj) => {
        gizmoObjects.push(obj);
      });

      const intersects = raycaster.intersectObjects(gizmoObjects, true);

      if (intersects.length > 0 && !isDraggingRef.current) {
        const axis =
          transformToolsRef.current.gizmo.getHoveredAxis(raycaster) ??
          transformToolsRef.current.gizmo.getAxisFromIntersection(intersects[0].object);

        if (axis) {
          const started = transformToolsRef.current.startDrag(raycaster, axis);
          if (started) {
            if (controlsRef.current) {
              controlsRef.current.enabled = false;
            }
            isDraggingRef.current = true;
            setIsDragging(true);
            const target = transformToolsRef.current.gizmo.getTarget();
            if (target && customTransformHandlers?.isCustomTarget(target)) {
              customTransformHandlers.onStart?.(target, axis);
            }
            return;
          }
        }
      }
    }

    if (event.button === 0 && sceneRef.current) {
      if (onModelerElementPick) {
        const modelerObjects: THREE.Object3D[] = [];
        sceneRef.current.traverse((obj) => {
          if (obj.userData?.modelerSelectable) {
            modelerObjects.push(obj);
          }
        });

        const helperIntersects = raycaster.intersectObjects(modelerObjects, true);
        if (helperIntersects.length > 0) {
          let helperTarget = helperIntersects[0].object;
          while (helperTarget && !helperTarget.userData?.modelerSelectable) {
            helperTarget = helperTarget.parent as THREE.Object3D;
          }

          const modelerType = helperTarget?.userData?.modelerElementType;
          const modelerIndex = helperTarget?.userData?.modelerIndex;
          if (typeof modelerType === 'string' && typeof modelerIndex === 'number') {
            onModelerElementPick(modelerType, modelerIndex, event.shiftKey);
            return;
          }
        }
      }

      const objects: THREE.Object3D[] = [];
      sceneRef.current.traverse((obj) => {
        if (obj.userData.entityId) {
          objects.push(obj);
        }
      });

      const intersects = raycaster.intersectObjects(objects, true);

      if (intersects.length > 0) {
        let targetObject = intersects[0].object;
        while (targetObject && !targetObject.userData?.entityId) {
          targetObject = targetObject.parent as THREE.Object3D;
        }

        if (targetObject?.userData?.entityId) {
          selectEntity(targetObject.userData.entityId, event.shiftKey);
          transformToolsRef.current?.gizmo.attach(targetObject);
          return;
        }
      }

      if (event.shiftKey) {
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }
        isBoxSelectingRef.current = true;
        setIsBoxSelecting(true);
        setBoxSelectStart({ x: event.clientX, y: event.clientY });
        setBoxSelectEnd({ x: event.clientX, y: event.clientY });
        selectionBoxRef.current?.start(event.clientX, event.clientY);
        return;
      }

      selectEntity(null);
      transformToolsRef.current?.gizmo.detach();
    }
  }, [cameraRef, containerRef, controlsLocked, controlsRef, customStrokeHandlers, customTransformHandlers, onModelerElementPick, paintEnabled, sceneRef, selectEntity, selectionBoxRef, startPaint, tool, transformToolsRef]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    if (isBoxSelectingRef.current) {
      setBoxSelectEnd({ x: event.clientX, y: event.clientY });
      selectionBoxRef.current?.update(event.clientX, event.clientY);
      return;
    }

    if (isCustomStrokingRef.current) {
      customStrokeHandlers?.onMove?.(event);
      return;
    }

    if (isPainting && (tool === 'brush' || paintEnabled)) {
      continuePaint(event);
      return;
    }

    if (isDraggingRef.current && transformToolsRef.current) {
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      const target = transformToolsRef.current.updateDrag(raycaster);
      if (target && customTransformHandlers?.isCustomTarget(target)) {
        customTransformHandlers.onChange?.(target);
        return;
      }
      syncObjectTransformToStore(target, { commit: false });
      return;
    }

    if (transformToolsRef.current) {
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const gizmoObjects: THREE.Object3D[] = [];
      transformToolsRef.current.gizmo.object.traverse((obj) => {
        gizmoObjects.push(obj);
      });
      const intersects = raycaster.intersectObjects(gizmoObjects, true);

      const axis =
        transformToolsRef.current.gizmo.getHoveredAxis(raycaster) ??
        (intersects.length > 0
          ? transformToolsRef.current.gizmo.getAxisFromIntersection(intersects[0].object)
          : null);

      transformToolsRef.current.gizmo.highlightAxis(axis);
      setHoveredAxis(axis);
    }
  }, [cameraRef, containerRef, continuePaint, customStrokeHandlers, customTransformHandlers, isPainting, paintEnabled, selectionBoxRef, syncObjectTransformToStore, tool, transformToolsRef]);

  const handleMouseUp = useCallback(() => {
    if (isBoxSelectingRef.current) {
      const selected = selectionBoxRef.current?.end() || [];
      selectionRef.current?.selectMultiple(selected, 'replace');
      syncBoxSelectionToStore(selected);
      if (controlsRef.current && !controlsLocked) {
        controlsRef.current.enabled = true;
      }
      isBoxSelectingRef.current = false;
      setIsBoxSelecting(false);
      return;
    }

    if (isCustomStrokingRef.current) {
      const handled = customStrokeHandlers?.onEnd?.() ?? false;
      if (controlsRef.current && !controlsLocked) {
        controlsRef.current.enabled = true;
      }
      isCustomStrokingRef.current = false;
      if (handled) {
        return;
      }
    }

    if (finishPaint()) {
      return;
    }

    if (isDraggingRef.current) {
      const target = transformToolsRef.current?.gizmo.getTarget() ?? null;
      transformToolsRef.current?.endDrag();
      if (customTransformHandlers?.isCustomTarget(target)) {
        customTransformHandlers.onEnd?.(target, { commit: true });
      } else {
        syncObjectTransformToStore(target, { commit: true });
      }
      if (controlsRef.current && !controlsLocked) {
        controlsRef.current.enabled = true;
      }
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  }, [controlsLocked, controlsRef, customStrokeHandlers, customTransformHandlers, finishPaint, selectionBoxRef, selectionRef, syncBoxSelectionToStore, syncObjectTransformToStore, transformToolsRef]);

  const handleMouseLeave = useCallback(() => {
    if (isCustomStrokingRef.current) {
      const handled = customStrokeHandlers?.onCancel?.() ?? false;
      if (controlsRef.current && !controlsLocked) {
        controlsRef.current.enabled = true;
      }
      isCustomStrokingRef.current = false;
      if (handled) {
        return;
      }
    }

    if (cancelPaint()) {
      return;
    }

    if (isBoxSelectingRef.current) {
      selectionBoxRef.current?.hideVisual();
      if (controlsRef.current && !controlsLocked) {
        controlsRef.current.enabled = true;
      }
      isBoxSelectingRef.current = false;
      setIsBoxSelecting(false);
      return;
    }

    if (isDraggingRef.current) {
      const target = transformToolsRef.current?.gizmo.getTarget() ?? null;
      transformToolsRef.current?.endDrag();
      if (customTransformHandlers?.isCustomTarget(target)) {
        customTransformHandlers.onEnd?.(target, { commit: true });
      } else {
        syncObjectTransformToStore(target, { commit: true });
      }
      if (controlsRef.current && !controlsLocked) {
        controlsRef.current.enabled = true;
      }
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  }, [cancelPaint, controlsLocked, controlsRef, customStrokeHandlers, customTransformHandlers, selectionBoxRef, syncObjectTransformToStore, transformToolsRef]);

  return {
    isBoxSelecting,
    boxSelectStart,
    boxSelectEnd,
    hoveredAxis,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  };
}
