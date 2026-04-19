'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformTools } from './gizmos';
import type { ViewportCamera } from './viewportCamera';

type NavigationMode = 'orbit' | 'walk' | 'fly';

export function useSceneViewNavigation(params: {
  cameraRef: MutableRefObject<ViewportCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  navigationMode: NavigationMode | null | undefined;
  cameraSpeed: number | null | undefined;
  viewportCameraEntityId: string | null | undefined;
}) {
  const navigationKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      navigationKeysRef.current.add(event.key.toLowerCase());
    };

    const onKeyUp = (event: KeyboardEvent) => {
      navigationKeysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    let lastFrame = performance.now();

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);

      const controls = params.controlsRef.current;
      const camera = params.cameraRef.current;
      if (!controls || !camera) {
        lastFrame = now;
        return;
      }

      const navigationMode = params.navigationMode ?? 'orbit';
      if (navigationMode === 'orbit' || params.viewportCameraEntityId) {
        lastFrame = now;
        return;
      }

      const deltaSeconds = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const keys = navigationKeysRef.current;
      if (keys.size === 0) return;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      if (navigationMode === 'walk') {
        forward.y = 0;
      }
      if (forward.lengthSq() === 0) {
        forward.set(0, 0, -1);
      }
      forward.normalize();

      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const movement = new THREE.Vector3();

      if (keys.has('w') || keys.has('arrowup')) movement.add(forward);
      if (keys.has('s') || keys.has('arrowdown')) movement.sub(forward);
      if (keys.has('d') || keys.has('arrowright')) movement.add(right);
      if (keys.has('a') || keys.has('arrowleft')) movement.sub(right);

      if (navigationMode === 'fly') {
        if (keys.has(' ') || keys.has('pageup')) movement.y += 1;
        if (keys.has('c') || keys.has('pagedown')) movement.y -= 1;
      }

      if (movement.lengthSq() === 0) return;

      movement.normalize();
      const speedMultiplier = navigationMode === 'walk' ? 6 : 10;
      const sprintMultiplier = navigationMode === 'fly' && keys.has('shift') ? 1.75 : 1;
      movement.multiplyScalar(
        speedMultiplier * (params.cameraSpeed ?? 1) * sprintMultiplier * deltaSeconds
      );

      if (navigationMode === 'walk') {
        movement.y = 0;
      }

      camera.position.add(movement);
      controls.target.add(movement);
      controls.update();
      params.transformToolsRef.current?.gizmo.updateTransform();
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    params.cameraRef,
    params.cameraSpeed,
    params.controlsRef,
    params.navigationMode,
    params.transformToolsRef,
    params.viewportCameraEntityId,
  ]);
}
