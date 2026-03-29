'use client';

import { useEffect, type MutableRefObject } from 'react';
import type { GizmoMode, TransformTools } from './gizmos';

export function useSceneViewShortcuts(params: {
  selectEntity: (entityId: string | null, additive?: boolean) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  removeSelectedEntities: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  onToggleTransformSpace?: () => void;
  onFocusSelected?: () => void;
}) {
  const {
    selectEntity,
    setGizmoMode,
    transformToolsRef,
    removeSelectedEntities,
    handleUndo,
    handleRedo,
    onToggleTransformSpace,
    onFocusSelected,
  } = params;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'w':
          setGizmoMode('translate');
          transformToolsRef.current?.gizmo.setMode('translate');
          break;
        case 'e':
          setGizmoMode('rotate');
          transformToolsRef.current?.gizmo.setMode('rotate');
          break;
        case 'r':
          setGizmoMode('scale');
          transformToolsRef.current?.gizmo.setMode('scale');
          break;
        case 'q': {
          const gizmo = transformToolsRef.current?.gizmo;
          if (!gizmo) break;
          const newSpace = gizmo.space === 'world' ? 'local' : 'world';
          gizmo.setSpace(newSpace);
          onToggleTransformSpace?.();
          break;
        }
        case 'f':
          onFocusSelected?.();
          break;
        case 'delete':
        case 'backspace':
          removeSelectedEntities();
          break;
        case 'escape':
          selectEntity(null);
          transformToolsRef.current?.gizmo.detach();
          break;
        case 'd':
          if (e.ctrlKey) {
            e.preventDefault();
          }
          break;
        case 'z':
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else if (e.ctrlKey) {
            e.preventDefault();
            handleUndo();
          }
          break;
        case 'y':
          if (e.ctrlKey) {
            e.preventDefault();
            handleRedo();
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleRedo,
    handleUndo,
    removeSelectedEntities,
    selectEntity,
    setGizmoMode,
    transformToolsRef,
    onToggleTransformSpace,
    onFocusSelected,
  ]);
}
