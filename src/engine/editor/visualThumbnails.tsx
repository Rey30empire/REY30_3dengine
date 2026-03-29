'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import type { Component, Entity } from '@/types/engine';
import { createEntityVisual, getEntityVisualSignature } from './sceneView.visuals';

const THUMBNAIL_CACHE_LIMIT = 320;
const thumbnailCache = new Map<string, string>();
const inflightThumbnailCache = new Map<string, Promise<string>>();
const rendererPool = new Map<string, ThumbnailRenderer>();

function buildSizeKey(width: number, height: number) {
  return `${width}x${height}`;
}

function buildCacheKey(baseKey: string, width: number, height: number) {
  return `${baseKey}:${buildSizeKey(width, height)}`;
}

function trimThumbnailCache() {
  while (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const first = thumbnailCache.keys().next();
    if (first.done) {
      break;
    }
    thumbnailCache.delete(first.value);
  }
}

function pushThumbnailCache(key: string, value: string) {
  if (!value) {
    return;
  }

  thumbnailCache.set(key, value);
  trimThumbnailCache();
}

function waitForNextPaint(delayMs = 0) {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    const run = () => window.requestAnimationFrame(() => resolve());
    if (delayMs > 0) {
      window.setTimeout(run, delayMs);
      return;
    }
    run();
  });
}

class ThumbnailRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;

  constructor(private readonly width: number, private readonly height: number) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.camera.position.set(2.4, 1.8, 2.4);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0x6d86a9, 0.78));
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.keyLight.position.set(2.6, 3.4, 2.2);
    this.scene.add(this.keyLight);
    this.rimLight = new THREE.DirectionalLight(0x8bc7ff, 0.42);
    this.rimLight.position.set(-2.2, 1.1, -2.4);
    this.scene.add(this.rimLight);
  }

  private disposeObject3D(object: THREE.Object3D) {
    object.userData?.dispose?.();
    object.traverse((child) => {
      const renderable = child as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      renderable.geometry?.dispose?.();
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }

  renderEntity(entity: Entity) {
    const visual = createEntityVisual(entity);
    this.scene.add(visual);

    const bounds = new THREE.Box3().setFromObject(visual);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.6);

    visual.position.sub(center);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.max((maxDimension * 0.66) / Math.tan(fovRad / 2), 1.6);
    this.camera.position.set(distance * 1.05, distance * 0.7, distance * 1.05);
    this.camera.near = Math.max(0.05, distance / 80);
    this.camera.far = Math.max(30, distance * 16);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);

    this.keyLight.position.set(distance * 0.95, distance * 1.15, distance * 0.9);
    this.rimLight.position.set(-distance * 0.9, distance * 0.45, -distance * 0.95);
    this.renderer.render(this.scene, this.camera);

    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(visual);
    this.disposeObject3D(visual);
    return dataUrl;
  }
}

function getRenderer(width: number, height: number) {
  const safeWidth = Math.min(512, Math.max(48, Math.round(width)));
  const safeHeight = Math.min(512, Math.max(48, Math.round(height)));
  const key = buildSizeKey(safeWidth, safeHeight);
  let renderer = rendererPool.get(key);
  if (!renderer) {
    renderer = new ThumbnailRenderer(safeWidth, safeHeight);
    rendererPool.set(key, renderer);
  }
  return renderer;
}

export async function renderEntityThumbnail(request: {
  cacheKey: string;
  entity: Entity;
  width?: number;
  height?: number;
}) {
  if (typeof window === 'undefined' || request.cacheKey.trim().length === 0) {
    return '';
  }

  const width = request.width ?? 160;
  const height = request.height ?? 112;
  const cacheKey = buildCacheKey(request.cacheKey, width, height);

  const cached = thumbnailCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = inflightThumbnailCache.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const job = (async () => {
    try {
      const renderer = getRenderer(width, height);
      const firstFrame = renderer.renderEntity(request.entity);
      await waitForNextPaint(72);
      const settledFrame = renderer.renderEntity(request.entity);
      const resolved = settledFrame || firstFrame;
      pushThumbnailCache(cacheKey, resolved);
      return resolved;
    } catch {
      return '';
    } finally {
      inflightThumbnailCache.delete(cacheKey);
    }
  })();

  inflightThumbnailCache.set(cacheKey, job);
  return job;
}

export function createMeshRendererThumbnailEntity(options: {
  idSeed: string;
  name: string;
  meshRendererData: Record<string, unknown>;
}) {
  const idSeed = options.idSeed.trim() || 'thumbnail';
  const meshRendererComponent: Component = {
    id: `${idSeed}:mesh_renderer`,
    type: 'MeshRenderer',
    enabled: true,
    data: options.meshRendererData,
  };

  return {
    id: `${idSeed}:entity`,
    name: options.name,
    components: new Map([['MeshRenderer', meshRendererComponent]]),
    children: [],
    parentId: null,
    active: true,
    tags: [],
  } satisfies Entity;
}

export function buildEntityThumbnailKey(entity: Entity, namespace: string) {
  const signature = getEntityVisualSignature(entity);
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;

  for (let index = 0; index < signature.length; index += 1) {
    const code = signature.charCodeAt(index);
    primary ^= code;
    primary = Math.imul(primary, 0x01000193);
    secondary ^= code + index;
    secondary = Math.imul(secondary, 0x85ebca6b);
  }

  return `${namespace}:${signature.length.toString(16)}:${(primary >>> 0).toString(16)}:${(secondary >>> 0).toString(16)}`;
}

export function EntityVisualThumbnail(props: {
  entity: Entity;
  thumbnailKey: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallbackLabel?: string;
  width?: number;
  height?: number;
  eager?: boolean;
}) {
  const {
    entity,
    thumbnailKey,
    alt,
    className,
    imageClassName,
    fallbackLabel,
    width = 160,
    height = 112,
    eager = false,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const supportsLazyVisibility =
    typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
  const [renderState, setRenderState] = useState(() => ({
    cacheKey: '',
    source: '',
  }));
  const [hasIntersected, setHasIntersected] = useState(eager);
  const visible = eager || !supportsLazyVisibility || hasIntersected;
  const cacheKey = thumbnailKey.trim() ? buildCacheKey(thumbnailKey, width, height) : '';
  const immediateSource = cacheKey ? thumbnailCache.get(cacheKey) ?? '' : '';
  const source = renderState.cacheKey === cacheKey ? renderState.source : immediateSource;

  useEffect(() => {
    if (visible || !supportsLazyVisibility) {
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasIntersected(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [supportsLazyVisibility, visible]);

  useEffect(() => {
    if (visible || source) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHasIntersected(true);
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [source, visible]);

  useEffect(() => {
    let cancelled = false;
    if (!cacheKey) {
      return;
    }
    if (!visible && !immediateSource) {
      return;
    }

    void renderEntityThumbnail({
      cacheKey: thumbnailKey,
      entity,
      width,
      height,
    }).then((nextSource) => {
      if (cancelled || !nextSource) return;
      setRenderState((current) => {
        if (current.cacheKey === cacheKey && current.source === nextSource) {
          return current;
        }
        return {
          cacheKey,
          source: nextSource,
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, entity, height, immediateSource, thumbnailKey, visible, width]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-md border border-slate-800 bg-slate-900/70',
        className
      )}
      style={{ aspectRatio: `${width}/${height}` }}
    >
      {source ? (
        <img
          src={source}
          alt={alt}
          className={cn('h-full w-full object-cover', imageClassName)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-slate-500">
          {fallbackLabel?.trim() || 'Preview'}
        </div>
      )}
    </div>
  );
}
