// ============================================
// Transform Tools - Mouse Interaction Wrapper
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import { TransformGizmo } from './TransformGizmo';
import { DEFAULT_SNAP_SETTINGS } from './types';
import type { GizmoAxis, SnapSettings } from './types';
import { resolveSurfaceSnapPoint, resolveVertexSnapPoint } from './transformSnap';

export class TransformTools {
  public gizmo: TransformGizmo;
  public snapSettings: SnapSettings;

  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private isDragging: boolean;
  private onTransformChange: ((object: THREE.Object3D) => void) | null;
  private scene: THREE.Scene | null;

  constructor() {
    this.gizmo = new TransformGizmo();
    this.snapSettings = { ...DEFAULT_SNAP_SETTINGS };
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.onTransformChange = null;
    this.scene = null;
  }

  setOnTransformChange(callback: (object: THREE.Object3D) => void): void {
    this.onTransformChange = callback;
  }

  setScene(scene: THREE.Scene | null): void {
    this.scene = scene;
  }

  setCamera(camera: THREE.Camera | null): void {
    if (!camera) return;
    this.gizmo.setCamera(camera);
  }

  updateMouse(event: MouseEvent, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  updateRaycaster(camera: THREE.Camera): void {
    this.raycaster.setFromCamera(this.mouse, camera);
  }

  onMouseMove(event: MouseEvent, camera: THREE.Camera, element: HTMLElement): GizmoAxis | null {
    this.updateMouse(event, element);
    this.updateRaycaster(camera);

    if (this.isDragging) {
      const target = this.updateDrag(this.raycaster);
      if (target && this.onTransformChange) {
        this.onTransformChange(target);
      }
      return null;
    }

    return this.gizmo.getHoveredAxis(this.raycaster);
  }

  onMouseDown(event: MouseEvent, camera: THREE.Camera, element: HTMLElement): boolean {
    this.updateMouse(event, element);
    this.updateRaycaster(camera);

    const axis = this.gizmo.getHoveredAxis(this.raycaster);
    if (!axis) return false;

    return this.startDrag(this.raycaster, axis);
  }

  onMouseUp(): void {
    this.endDrag();
  }

  startDrag(raycaster: THREE.Raycaster, axis: GizmoAxis): boolean {
    const started = this.gizmo.startDrag(raycaster, axis);
    this.isDragging = started;
    return started;
  }

  updateDrag(raycaster: THREE.Raycaster): THREE.Object3D | null {
    if (!this.isDragging) return null;

    this.gizmo.updateDrag(raycaster);
    const target = this.gizmo.getTarget();
    if (!target) return null;

    this.applySnap(target, raycaster);
    return target;
  }

  endDrag(): void {
    if (!this.isDragging) return;
    this.gizmo.endDrag();
    this.isDragging = false;
  }

  snapPosition(position: THREE.Vector3): THREE.Vector3 {
    if (!this.snapSettings.enabled) return position;

    const snap = this.snapSettings.translateSnap;
    if (this.snapSettings.translateAxes.x && this.gizmo.isBaseAxisEnabled('x')) {
      position.x = Math.round(position.x / snap) * snap;
    }
    if (this.snapSettings.translateAxes.y && this.gizmo.isBaseAxisEnabled('y')) {
      position.y = Math.round(position.y / snap) * snap;
    }
    if (this.snapSettings.translateAxes.z && this.gizmo.isBaseAxisEnabled('z')) {
      position.z = Math.round(position.z / snap) * snap;
    }

    return position;
  }

  snapRotation(rotation: THREE.Euler): THREE.Euler {
    if (!this.snapSettings.enabled) return rotation;

    const snap = (this.snapSettings.rotateSnap * Math.PI) / 180;
    if (this.snapSettings.rotateAxes.x && this.gizmo.isBaseAxisEnabled('x')) {
      rotation.x = Math.round(rotation.x / snap) * snap;
    }
    if (this.snapSettings.rotateAxes.y && this.gizmo.isBaseAxisEnabled('y')) {
      rotation.y = Math.round(rotation.y / snap) * snap;
    }
    if (this.snapSettings.rotateAxes.z && this.gizmo.isBaseAxisEnabled('z')) {
      rotation.z = Math.round(rotation.z / snap) * snap;
    }

    return rotation;
  }

  snapScale(scale: THREE.Vector3): THREE.Vector3 {
    if (!this.snapSettings.enabled) return scale;

    const snap = this.snapSettings.scaleSnap;
    if (this.snapSettings.scaleAxes.x && this.gizmo.isBaseAxisEnabled('x')) {
      scale.x = Math.round(scale.x / snap) * snap;
    }
    if (this.snapSettings.scaleAxes.y && this.gizmo.isBaseAxisEnabled('y')) {
      scale.y = Math.round(scale.y / snap) * snap;
    }
    if (this.snapSettings.scaleAxes.z && this.gizmo.isBaseAxisEnabled('z')) {
      scale.z = Math.round(scale.z / snap) * snap;
    }

    return scale;
  }

  private applySnap(target: THREE.Object3D, raycaster: THREE.Raycaster): void {
    switch (this.gizmo.mode) {
      case 'translate':
        this.applyTranslateSnap(target, raycaster);
        break;
      case 'rotate':
        if (!this.snapSettings.enabled) return;
        this.snapRotation(target.rotation);
        target.quaternion.setFromEuler(target.rotation);
        this.gizmo.updateTransform();
        break;
      case 'scale':
        if (!this.snapSettings.enabled) return;
        this.snapScale(target.scale);
        this.gizmo.updateTransform();
        break;
    }
  }

  private applyTranslateSnap(target: THREE.Object3D, raycaster: THREE.Raycaster): void {
    if (!this.snapSettings.enabled) return;

    const advancedSnapPoint =
      this.snapSettings.snapTarget === 'vertex' && this.snapSettings.vertexSnap && this.scene
        ? resolveVertexSnapPoint(this.scene, raycaster, target)
        : this.snapSettings.snapTarget === 'surface' && this.snapSettings.surfaceSnap && this.scene
          ? resolveSurfaceSnapPoint(this.scene, raycaster, target)
          : null;

    if (advancedSnapPoint) {
      this.setTargetWorldPosition(target, advancedSnapPoint);
      this.gizmo.updateTransform();
      return;
    }

    this.snapPosition(target.position);
    this.gizmo.updateTransform();
  }

  private setTargetWorldPosition(target: THREE.Object3D, worldPosition: THREE.Vector3): void {
    const localPosition = worldPosition.clone();
    if (target.parent) {
      target.parent.worldToLocal(localPosition);
    }
    target.position.copy(localPosition);
  }

  dispose(): void {
    this.gizmo.dispose();
    this.scene = null;
  }
}
