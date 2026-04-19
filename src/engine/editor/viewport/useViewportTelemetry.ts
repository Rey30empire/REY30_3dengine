'use client';

import { useEffect, useState, type MutableRefObject } from 'react';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import type * as THREE from 'three';
import { useEngineStore } from '@/store/editorStore';

const SAMPLE_INTERVAL_MS = 500;
const INGEST_INTERVAL_MS = 2000;
const AUTH_REFRESH_INTERVAL_MS = 2000;
const CSRF_COOKIE_NAME = 'rey30_csrf';
const CSRF_HEADER_NAME = 'x-rey30-csrf';

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
    };
  }

  interface Window {
    __REY30_DISABLE_VIEWPORT_TELEMETRY__?: boolean;
  }
}

export interface ViewportRuntimeMetrics {
  renderCpuTimeMs: number;
  gpuTimeMs: number;
  drawCalls: number;
  triangles: number;
  vertices: number;
  textures: number;
  meshes: number;
  audioBuffers: number;
}

export interface ViewportTelemetrySnapshot {
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
}

export function isViewportTelemetryDocumentVisible(
  visibilityState?: string,
  webdriver = false
): boolean {
  if (!visibilityState) return true;
  if (visibilityState !== 'hidden') return true;
  return webdriver;
}

type ViewportTelemetryOptions = {
  rendererRef?: MutableRefObject<THREE.WebGLRenderer | null>;
  runtimeMetricsRef?: MutableRefObject<ViewportRuntimeMetrics>;
  sceneId?: string | null;
  objectCount?: number;
  selectionCount?: number;
  runtimeState?: string;
};

const DEFAULT_RUNTIME_METRICS: ViewportRuntimeMetrics = {
  renderCpuTimeMs: 0,
  gpuTimeMs: 0,
  drawCalls: 0,
  triangles: 0,
  vertices: 0,
  textures: 0,
  meshes: 0,
  audioBuffers: 0,
};

const DEFAULT_SNAPSHOT: ViewportTelemetrySnapshot = {
  fps: 60,
  frameTimeMs: 16.7,
  cpuTimeMs: 0,
  gpuTimeMs: 0,
  drawCalls: 0,
  triangles: 0,
  vertices: 0,
  memoryUsedMb: 0,
  memoryAllocatedMb: 0,
  textures: 0,
  meshes: 0,
  audioBuffers: 0,
};

function roundMetric(value: number, digits = 1): number {
  const safe = Number.isFinite(value) ? value : 0;
  const scale = 10 ** digits;
  return Math.round(safe * scale) / scale;
}

function toMb(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return roundMetric((value || 0) / (1024 * 1024), 1);
}

function readRendererMetrics(
  rendererRef?: MutableRefObject<THREE.WebGLRenderer | null>
): Partial<ViewportRuntimeMetrics> {
  const renderer = rendererRef?.current;
  if (!renderer) return {};

  const info = renderer.info;
  const renderInfo = info.render;
  const triangleCount = Number.isFinite(renderInfo.triangles) ? renderInfo.triangles : 0;
  const lineCount = Number.isFinite(renderInfo.lines) ? renderInfo.lines : 0;
  const pointCount = Number.isFinite(renderInfo.points) ? renderInfo.points : 0;

  return {
    drawCalls: Number.isFinite(renderInfo.calls) ? renderInfo.calls : 0,
    triangles: triangleCount,
    vertices: triangleCount * 3 + lineCount * 2 + pointCount,
    textures: Number.isFinite(info.memory.textures) ? info.memory.textures : 0,
    meshes: Number.isFinite(info.memory.geometries) ? info.memory.geometries : 0,
  };
}

function buildSnapshot(
  fps: number,
  frameTimeMs: number,
  rendererRef?: MutableRefObject<THREE.WebGLRenderer | null>,
  runtimeMetricsRef?: MutableRefObject<ViewportRuntimeMetrics>,
  sampledRuntimeMetrics?: Partial<ViewportRuntimeMetrics>
): ViewportTelemetrySnapshot {
  const runtimeMetrics = {
    ...(runtimeMetricsRef?.current ?? DEFAULT_RUNTIME_METRICS),
    ...(sampledRuntimeMetrics ?? {}),
  };
  const rendererMetrics = readRendererMetrics(rendererRef);
  const performanceMemory = typeof performance !== 'undefined' ? performance.memory : undefined;

  return {
    fps: roundMetric(fps, 0),
    frameTimeMs: roundMetric(frameTimeMs, 1),
    cpuTimeMs: roundMetric(runtimeMetrics.renderCpuTimeMs, 2),
    gpuTimeMs: roundMetric(runtimeMetrics.gpuTimeMs, 2),
    drawCalls: Math.round(rendererMetrics.drawCalls ?? runtimeMetrics.drawCalls),
    triangles: Math.round(rendererMetrics.triangles ?? runtimeMetrics.triangles),
    vertices: Math.round(rendererMetrics.vertices ?? runtimeMetrics.vertices),
    memoryUsedMb: toMb(performanceMemory?.usedJSHeapSize),
    memoryAllocatedMb: toMb(performanceMemory?.totalJSHeapSize),
    textures: Math.round(rendererMetrics.textures ?? runtimeMetrics.textures),
    meshes: Math.round(rendererMetrics.meshes ?? runtimeMetrics.meshes),
    audioBuffers: Math.round(runtimeMetrics.audioBuffers),
  };
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const all = document.cookie || '';
  if (!all) return null;

  for (const segment of all.split(';')) {
    const [rawName, ...rawValue] = segment.split('=');
    if ((rawName || '').trim() !== name) continue;
    const value = rawValue.join('=').trim();
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

function buildTelemetryHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const csrfToken = (readCookie(CSRF_COOKIE_NAME) || '').trim();
  if (/^[a-f0-9]{64}$/i.test(csrfToken)) {
    headers[CSRF_HEADER_NAME] = csrfToken;
  }
  return headers;
}

export function createEmptyViewportRuntimeMetrics(): ViewportRuntimeMetrics {
  return { ...DEFAULT_RUNTIME_METRICS };
}

export function useViewportTelemetry(options: ViewportTelemetryOptions = {}) {
  const {
    rendererRef,
    runtimeMetricsRef,
    sceneId,
    objectCount = 0,
    selectionCount = 0,
    runtimeState = 'IDLE',
  } = options;
  const [snapshot, setSnapshot] = useState<ViewportTelemetrySnapshot>(DEFAULT_SNAPSHOT);

  useEffect(() => {
    let frameId = 0;
    let previousFrame = performance.now();
    let sampleStartedAt = previousFrame;
    let lastIngestAt = 0;
    let lastAuthCheckAt = 0;
    let frameCount = 0;
    let accumulatedFrameTime = 0;
    let accumulatedRenderCpuTimeMs = 0;
    let accumulatedGpuTimeMs = 0;
    let telemetryWritable = false;
    let authCheckInFlight = false;
    let cancelled = false;

    const refreshTelemetryWritable = (forceRefresh = false) => {
      if (cancelled || authCheckInFlight || typeof fetch !== 'function') {
        return;
      }

      authCheckInFlight = true;
      lastAuthCheckAt = performance.now();
      void loadClientAuthSession({
        forceRefresh,
        maxAgeMs: forceRefresh ? 0 : AUTH_REFRESH_INTERVAL_MS,
      })
        .then((payload) => {
          if (cancelled) return;
          telemetryWritable = payload?.authenticated === true;
        })
        .catch(() => {
          telemetryWritable = false;
        })
        .finally(() => {
          authCheckInFlight = false;
        });
    };

    refreshTelemetryWritable();

    const tick = (now: number) => {
      const delta = now - previousFrame;
      previousFrame = now;
      frameCount += 1;
      accumulatedFrameTime += delta;
      const runtimeMetrics = runtimeMetricsRef?.current ?? DEFAULT_RUNTIME_METRICS;
      accumulatedRenderCpuTimeMs += Math.max(0, runtimeMetrics.renderCpuTimeMs || 0);
      accumulatedGpuTimeMs += Math.max(0, runtimeMetrics.gpuTimeMs || 0);

      if (now - sampleStartedAt >= SAMPLE_INTERVAL_MS) {
        const sampleDuration = now - sampleStartedAt;
        const fps =
          sampleDuration > 0 ? Math.max(1, (frameCount * 1000) / sampleDuration) : DEFAULT_SNAPSHOT.fps;
        const frameTimeMs =
          frameCount > 0 ? accumulatedFrameTime / frameCount : DEFAULT_SNAPSHOT.frameTimeMs;
        const nextSnapshot = buildSnapshot(fps, frameTimeMs, rendererRef, runtimeMetricsRef, {
          renderCpuTimeMs:
            frameCount > 0 ? accumulatedRenderCpuTimeMs / frameCount : DEFAULT_RUNTIME_METRICS.renderCpuTimeMs,
          gpuTimeMs:
            frameCount > 0 ? accumulatedGpuTimeMs / frameCount : DEFAULT_RUNTIME_METRICS.gpuTimeMs,
          audioBuffers: runtimeMetrics.audioBuffers,
        });

        setSnapshot(nextSnapshot);
        useEngineStore.getState().updateProfiler({
          fps: nextSnapshot.fps,
          frameTime: nextSnapshot.frameTimeMs,
          cpuTime: nextSnapshot.cpuTimeMs,
          gpuTime: nextSnapshot.gpuTimeMs,
          drawCalls: nextSnapshot.drawCalls,
          triangles: nextSnapshot.triangles,
          vertices: nextSnapshot.vertices,
          memory: {
            used: nextSnapshot.memoryUsedMb,
            allocated: nextSnapshot.memoryAllocatedMb,
            textures: nextSnapshot.textures,
            meshes: nextSnapshot.meshes,
            audio: nextSnapshot.audioBuffers,
          },
        });

        if (now - lastIngestAt >= INGEST_INTERVAL_MS) {
          if (!telemetryWritable) {
            if (now - lastAuthCheckAt >= AUTH_REFRESH_INTERVAL_MS) {
              refreshTelemetryWritable(true);
            }
          } else if (window.__REY30_DISABLE_VIEWPORT_TELEMETRY__) {
            lastIngestAt = now;
          } else {
            const telemetryDocumentVisible = isViewportTelemetryDocumentVisible(
              typeof document !== 'undefined' ? document.visibilityState : undefined,
              typeof navigator !== 'undefined' && navigator.webdriver === true
            );

            if (!telemetryDocumentVisible) {
              sampleStartedAt = now;
              frameCount = 0;
              accumulatedFrameTime = 0;
              accumulatedRenderCpuTimeMs = 0;
              accumulatedGpuTimeMs = 0;
              frameId = window.requestAnimationFrame(tick);
              return;
            }

            lastIngestAt = now;
            void fetch('/api/telemetry', {
              method: 'POST',
              headers: buildTelemetryHeaders(),
              body: JSON.stringify({
                performance: {
                  fps: nextSnapshot.fps,
                  frameTimeMs: nextSnapshot.frameTimeMs,
                  cpuTimeMs: nextSnapshot.cpuTimeMs,
                  gpuTimeMs: nextSnapshot.gpuTimeMs,
                  drawCalls: nextSnapshot.drawCalls,
                  triangles: nextSnapshot.triangles,
                  vertices: nextSnapshot.vertices,
                  memoryUsedMb: nextSnapshot.memoryUsedMb,
                  memoryAllocatedMb: nextSnapshot.memoryAllocatedMb,
                  textures: nextSnapshot.textures,
                  meshes: nextSnapshot.meshes,
                  audioBuffers: nextSnapshot.audioBuffers,
                  objectCount,
                  selectionCount,
                  runtimeState,
                  sceneId: sceneId ?? undefined,
                  source: 'editor_viewport',
                },
              }),
              keepalive: true,
              cache: 'no-store',
            })
              .then((response) => {
                if (response.status === 401 || response.status === 403) {
                  telemetryWritable = false;
                  lastAuthCheckAt = 0;
                }
              })
              .catch(() => undefined);
          }
        }

        sampleStartedAt = now;
        frameCount = 0;
        accumulatedFrameTime = 0;
        accumulatedRenderCpuTimeMs = 0;
        accumulatedGpuTimeMs = 0;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [objectCount, rendererRef, runtimeMetricsRef, runtimeState, sceneId, selectionCount]);

  return snapshot;
}
