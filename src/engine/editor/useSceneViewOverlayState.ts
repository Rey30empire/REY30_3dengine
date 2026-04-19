'use client';

import { useMemo } from 'react';
import { getPrimaryShortcutLabel } from '@/lib/editor-shortcuts';
import type { EditorShortcutConfig } from '@/lib/editor-shortcuts';
import type { ModelerElementMode } from './modelerMesh';

interface UseSceneViewOverlayStateParams {
  shortcutConfig: EditorShortcutConfig;
  navigationMode: 'orbit' | 'walk' | 'fly';
  viewportCameraEntityId: string | null;
  virtualCameraName: string | null;
  objectCount: number;
  selectionCount: number;
  playRuntimeState: 'PLAYING' | 'PAUSED' | 'IDLE';
  viewportTelemetry: {
    fps: number;
    frameTimeMs: number;
  };
  hasSelectedModelerEntity: boolean;
  hasSelectedModelerMesh: boolean;
  modelerMode: 'object' | ModelerElementMode;
  safeModelerSelectionLength: number;
  topologyViewportReady: boolean;
  topologyViewportMode: string;
  topologyViewportTemplateType: string;
  topologyStrokePointCount: number;
  topologyLastIntentKind: string | null;
}

export function useSceneViewOverlayState(params: UseSceneViewOverlayStateParams) {
  const shortcutSummary = useMemo(() => {
    const translate = getPrimaryShortcutLabel(params.shortcutConfig, 'viewport.gizmo.translate') ?? 'W';
    const rotate = getPrimaryShortcutLabel(params.shortcutConfig, 'viewport.gizmo.rotate') ?? 'E';
    const scale = getPrimaryShortcutLabel(params.shortcutConfig, 'viewport.gizmo.scale') ?? 'R';
    const space = getPrimaryShortcutLabel(params.shortcutConfig, 'viewport.gizmo.space') ?? 'Q';
    const focus = getPrimaryShortcutLabel(params.shortcutConfig, 'viewport.focus_selected') ?? 'F';
    const clear = getPrimaryShortcutLabel(params.shortcutConfig, 'selection.clear') ?? 'Escape';
    const remove = getPrimaryShortcutLabel(params.shortcutConfig, 'selection.delete') ?? 'Delete';

    return `${translate}/${rotate}/${scale}: Transform · ${space}: Space · ${focus}: Focus · ${clear}: Clear · ${remove}: Delete`;
  }, [params.shortcutConfig]);

  const navigationLabel = useMemo(() => {
    if (params.viewportCameraEntityId) return 'Virtual Camera';
    return params.navigationMode === 'orbit' ? 'Orbit' : params.navigationMode.toUpperCase();
  }, [params.navigationMode, params.viewportCameraEntityId]);

  const cameraStatusLabel = useMemo(() => {
    if (params.viewportCameraEntityId) {
      return `Virtual Camera: ${params.virtualCameraName ?? 'Locked'}`;
    }

    return params.navigationMode === 'orbit'
      ? 'Orbit camera libre para encuadre y seleccion.'
      : 'Navegacion libre con WASD + Space/C para recorrer la escena.';
  }, [params.navigationMode, params.viewportCameraEntityId, params.virtualCameraName]);

  const telemetry = useMemo(
    () => ({
      fps: params.viewportTelemetry.fps,
      frameTimeMs: params.viewportTelemetry.frameTimeMs,
      objectCount: params.objectCount,
      selectionCount: params.selectionCount,
      runtimeState: params.playRuntimeState,
    }),
    [
      params.objectCount,
      params.playRuntimeState,
      params.selectionCount,
      params.viewportTelemetry.fps,
      params.viewportTelemetry.frameTimeMs,
    ]
  );

  const modelerOverlay = useMemo(() => {
    if (
      !params.hasSelectedModelerEntity ||
      !params.hasSelectedModelerMesh ||
      params.modelerMode === 'object'
    ) {
      return null;
    }

    return {
      mode: params.modelerMode,
      selectionCount: params.safeModelerSelectionLength,
    };
  }, [
    params.hasSelectedModelerEntity,
    params.hasSelectedModelerMesh,
    params.modelerMode,
    params.safeModelerSelectionLength,
  ]);

  const topologyOverlay = useMemo(() => {
    if (!params.topologyViewportReady) {
      return null;
    }

    return {
      mode: params.topologyViewportMode,
      templateType: params.topologyViewportTemplateType,
      strokePointCount: params.topologyStrokePointCount,
      lastIntentKind: params.topologyLastIntentKind,
    };
  }, [
    params.topologyLastIntentKind,
    params.topologyStrokePointCount,
    params.topologyViewportMode,
    params.topologyViewportReady,
    params.topologyViewportTemplateType,
  ]);

  return {
    shortcutSummary,
    navigationLabel,
    cameraStatusLabel,
    telemetry,
    modelerOverlay,
    topologyOverlay,
  };
}
