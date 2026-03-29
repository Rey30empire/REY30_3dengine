'use client';

import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useEngineStore } from '@/store/editorStore';
import { LODManager, LODPresets } from '@/engine/rendering/LODSystem';
import type { TransformTools } from './gizmos';
import type { ViewportCamera } from './viewportCamera';

export function useSceneViewLOD(params: {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
}) {
  const {
    sceneRef,
    cameraRef,
    rendererRef,
    transformToolsRef,
  } = params;

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;

    const lodManager = LODManager.getInstance();
    lodManager.initialize(camera, renderer);

    const handleGenerateLOD = async (e) => {
      const detail = e.detail || {};
      const selection = useEngineStore.getState().editor.selectedEntities;
      if (!selection.length || !sceneRef.current) return;

      const ratios = detail.ratios && detail.ratios.length
        ? detail.ratios
        : Array.from(LODPresets.medium.simplificationRatios).filter((v) => typeof v === 'number');
      const distances = detail.distances && detail.distances.length
        ? detail.distances.slice()
        : Array.from(LODPresets.medium.distances);
      const preserveOriginal = Boolean(detail.preserveOriginal);

      const currentScene = sceneRef.current;
      const selectedIds = new Set(selection);

      for (const targetId of selection) {
        let targetMesh: THREE.Mesh | null = null;
        currentScene.traverse((obj) => {
          const meshCandidate = obj as THREE.Mesh;
          if (obj.userData?.entityId === targetId && meshCandidate.isMesh && !targetMesh) {
            targetMesh = meshCandidate;
          }
        });
        if (!targetMesh) continue;

        const mesh = targetMesh as THREE.Mesh;
        const lod = await lodManager.generateLODs(mesh, ratios, distances);
        lod.position.copy(mesh.position);
        lod.rotation.copy(mesh.rotation);
        lod.scale.copy(mesh.scale);
        lod.userData.entityId = mesh.userData.entityId;
        lod.userData.lodSourceId = mesh.userData.entityId;
        lod.userData.isLOD = true;
        lod.name = `${mesh.name || 'LOD'}_LOD`;

        if (!preserveOriginal) {
          currentScene.remove(mesh);
        }
        currentScene.add(lod);

        if (!preserveOriginal && selectedIds.has(targetId)) {
          transformToolsRef.current?.gizmo.attach(lod);
        }
      }
    };

    window.addEventListener('editor:generate-lod', handleGenerateLOD);
    return () => {
      window.removeEventListener('editor:generate-lod', handleGenerateLOD);
    };
  }, [cameraRef, rendererRef, sceneRef, transformToolsRef]);
}
