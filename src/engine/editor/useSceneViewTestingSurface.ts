'use client';

import { useCallback, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { TransformTools } from './gizmos';
import { useSceneViewTestBridge } from './useSceneViewTestBridge';
import type { ViewportCamera } from './viewportCamera';

interface ViewportCaptureOptions {
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
}

interface ViewportRenderMeasurementOptions {
  frames?: number;
}

interface ViewportRenderMeasurement {
  frames: number;
  totalMs: number;
  averageFrameTimeMs: number;
  fps: number;
  frameTimeMs: number;
  cpuTimeMs: number;
  gpuTimeMs: number;
  drawCalls: number;
  triangles: number;
  vertices: number;
  memoryUsedMb: number;
  memoryAllocatedMb: number;
  textures: number;
  meshes: number;
  audioBuffers: number;
  source: 'editor_viewport_manual_smoke';
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
  };
}

function roundMetric(value: number, digits = 1): number {
  const safe = Number.isFinite(value) ? value : 0;
  const scale = 10 ** digits;
  return Math.round(safe * scale) / scale;
}

function toMb(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return roundMetric((value || 0) / (1024 * 1024), 1);
}

export function useSceneViewTestingSurface(params: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  renderFrameRef: MutableRefObject<(() => void) | null>;
  createManualEntity: (kind: 'cube' | 'sphere' | 'light' | 'camera') => string;
  simulatePaintStroke: (points: Array<{ x: number; y: number }>) => boolean;
}) {
  const {
    containerRef,
    sceneRef,
    cameraRef,
    transformToolsRef,
    rendererRef,
    renderFrameRef,
    createManualEntity,
    simulatePaintStroke,
  } = params;

  const captureViewportDataUrl = useCallback((options?: ViewportCaptureOptions) => {
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
  }, [cameraRef, renderFrameRef, rendererRef, sceneRef]);

  const measureViewportRender = useCallback((options?: ViewportRenderMeasurementOptions): ViewportRenderMeasurement | null => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return null;

    const frameCount = Math.max(1, Math.min(120, Math.round(options?.frames ?? 30)));
    let totalMs = 0;

    for (let index = 0; index < frameCount; index += 1) {
      const startedAt = performance.now();
      if (renderFrameRef.current) {
        renderFrameRef.current();
      } else {
        renderer.render(scene, camera);
      }
      totalMs += Math.max(0, performance.now() - startedAt);
    }

    const renderInfo = renderer.info.render;
    const memoryInfo = renderer.info.memory;
    const triangleCount = Number.isFinite(renderInfo.triangles) ? renderInfo.triangles : 0;
    const lineCount = Number.isFinite(renderInfo.lines) ? renderInfo.lines : 0;
    const pointCount = Number.isFinite(renderInfo.points) ? renderInfo.points : 0;
    const averageFrameTimeMs = roundMetric(Math.max(totalMs / frameCount, 1000 / 120), 2);
    const performanceMemory = (performance as PerformanceWithMemory).memory;

    return {
      frames: frameCount,
      totalMs: roundMetric(totalMs, 2),
      averageFrameTimeMs,
      fps: averageFrameTimeMs > 0 ? roundMetric(Math.min(120, 1000 / averageFrameTimeMs), 1) : 60,
      frameTimeMs: averageFrameTimeMs,
      cpuTimeMs: averageFrameTimeMs,
      gpuTimeMs: 0,
      drawCalls: Math.round(Number.isFinite(renderInfo.calls) ? renderInfo.calls : 0),
      triangles: Math.round(triangleCount),
      vertices: Math.round(triangleCount * 3 + lineCount * 2 + pointCount),
      memoryUsedMb: toMb(performanceMemory?.usedJSHeapSize),
      memoryAllocatedMb: toMb(performanceMemory?.totalJSHeapSize),
      textures: Math.round(Number.isFinite(memoryInfo.textures) ? memoryInfo.textures : 0),
      meshes: Math.round(Number.isFinite(memoryInfo.geometries) ? memoryInfo.geometries : 0),
      audioBuffers: 0,
      source: 'editor_viewport_manual_smoke',
    };
  }, [cameraRef, renderFrameRef, rendererRef, sceneRef]);

  useSceneViewTestBridge({
    containerRef,
    sceneRef,
    cameraRef,
    transformToolsRef,
    createManualEntity,
    simulatePaintStroke,
    captureViewportDataUrl,
    measureViewportRender,
  });
}
