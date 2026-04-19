'use client';

import { useEffect, useState, type MutableRefObject } from 'react';
import {
  eventMatchesAnyShortcut,
  getEditorShortcutConfig,
  subscribeEditorShortcutConfig,
} from '@/lib/editor-shortcuts';
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
  const [shortcutConfig, setShortcutConfig] = useState(() => getEditorShortcutConfig());

  useEffect(() => {
    const unsubscribe = subscribeEditorShortcutConfig((config) => {
      setShortcutConfig(config);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (
        eventMatchesAnyShortcut(e, shortcutConfig['viewport.gizmo.translate'] ?? [])
      ) {
        e.preventDefault();
        setGizmoMode('translate');
        transformToolsRef.current?.gizmo.setMode('translate');
        return;
      }

      if (eventMatchesAnyShortcut(e, shortcutConfig['viewport.gizmo.rotate'] ?? [])) {
        e.preventDefault();
        setGizmoMode('rotate');
        transformToolsRef.current?.gizmo.setMode('rotate');
        return;
      }

      if (eventMatchesAnyShortcut(e, shortcutConfig['viewport.gizmo.scale'] ?? [])) {
        e.preventDefault();
        setGizmoMode('scale');
        transformToolsRef.current?.gizmo.setMode('scale');
        return;
      }

      if (eventMatchesAnyShortcut(e, shortcutConfig['viewport.gizmo.space'] ?? [])) {
        const gizmo = transformToolsRef.current?.gizmo;
        if (!gizmo) return;
        e.preventDefault();
        const newSpace = gizmo.space === 'world' ? 'local' : 'world';
        gizmo.setSpace(newSpace);
        onToggleTransformSpace?.();
        return;
      }

      if (
        eventMatchesAnyShortcut(e, shortcutConfig['viewport.focus_selected'] ?? [])
      ) {
        e.preventDefault();
        onFocusSelected?.();
        return;
      }

      if (eventMatchesAnyShortcut(e, shortcutConfig['selection.delete'] ?? [])) {
        e.preventDefault();
        removeSelectedEntities();
        return;
      }

      if (eventMatchesAnyShortcut(e, shortcutConfig['selection.clear'] ?? [])) {
        e.preventDefault();
        selectEntity(null);
        transformToolsRef.current?.gizmo.detach();
        return;
      }

      if (eventMatchesAnyShortcut(e, shortcutConfig['history.redo'] ?? [])) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (eventMatchesAnyShortcut(e, shortcutConfig['history.undo'] ?? [])) {
        e.preventDefault();
        handleUndo();
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
    shortcutConfig,
  ]);
}
