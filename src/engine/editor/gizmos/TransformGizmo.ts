// ============================================
// Transform Gizmo - 3D Manipulation Handle
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import { GIZMO_COLORS } from './types';
import type { GizmoAxis, GizmoBaseAxes, GizmoMode, TransformSpace } from './types';

export class TransformGizmo {
  public object: THREE.Group;
  public mode: GizmoMode;
  public space: TransformSpace;
  public size: number;
  public visible: boolean;

  private pickers: Map<GizmoAxis, THREE.Object3D>;
  private handles: Map<GizmoAxis, THREE.Object3D>;
  private target: THREE.Object3D | null;
  private hoveredAxis: GizmoAxis | null;
  private selectedAxis: GizmoAxis | null;
  private dragStart: THREE.Vector3;
  private dragStartTransform: {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    scale: THREE.Vector3;
  };
  private enabledAxes: GizmoBaseAxes;
  private camera: THREE.Camera | null;
  private domElement: HTMLElement | null;

  constructor() {
    this.object = new THREE.Group();
    this.object.name = 'TransformGizmo';
    this.mode = 'translate';
    this.space = 'world';
    this.size = 1;
    this.visible = true;

    this.pickers = new Map();
    this.handles = new Map();
    this.target = null;
    this.hoveredAxis = null;
    this.selectedAxis = null;
    this.dragStart = new THREE.Vector3();
    this.dragStartTransform = {
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    };
    this.enabledAxes = { x: true, y: true, z: true };
    this.camera = null;
    this.domElement = null;

    this.buildGizmo();
  }

  private buildGizmo(): void {
    while (this.object.children.length > 0) {
      this.object.remove(this.object.children[0]);
    }

    this.pickers.clear();
    this.handles.clear();

    const handleGroup = new THREE.Group();
    handleGroup.name = 'handles';
    const pickerGroup = new THREE.Group();
    pickerGroup.name = 'pickers';

    switch (this.mode) {
      case 'translate':
        this.buildTranslateGizmo(handleGroup, pickerGroup);
        break;
      case 'rotate':
        this.buildRotateGizmo(handleGroup, pickerGroup);
        break;
      case 'scale':
        this.buildScaleGizmo(handleGroup, pickerGroup);
        break;
    }

    this.object.add(handleGroup);
    this.object.add(pickerGroup);
    pickerGroup.visible = false;
    this.applyAxisAvailability();
  }

  private buildTranslateGizmo(handles: THREE.Group, pickers: THREE.Group): void {
    const arrowLength = 1;
    const arrowHead = 0.15;
    const shaftRadius = 0.02;
    const headRadius = 0.06;

    const xArrow = this.createArrow(GIZMO_COLORS.x, arrowLength, arrowHead, shaftRadius, headRadius);
    xArrow.rotation.z = -Math.PI / 2;
    handles.add(xArrow);
    this.handles.set('x', xArrow);

    const xPicker = this.createPicker(0.2, arrowLength + arrowHead);
    xPicker.rotation.z = -Math.PI / 2;
    pickers.add(xPicker);
    this.pickers.set('x', xPicker);

    const yArrow = this.createArrow(GIZMO_COLORS.y, arrowLength, arrowHead, shaftRadius, headRadius);
    handles.add(yArrow);
    this.handles.set('y', yArrow);

    const yPicker = this.createPicker(0.2, arrowLength + arrowHead);
    pickers.add(yPicker);
    this.pickers.set('y', yPicker);

    const zArrow = this.createArrow(GIZMO_COLORS.z, arrowLength, arrowHead, shaftRadius, headRadius);
    zArrow.rotation.x = Math.PI / 2;
    handles.add(zArrow);
    this.handles.set('z', zArrow);

    const zPicker = this.createPicker(0.2, arrowLength + arrowHead);
    zPicker.rotation.x = Math.PI / 2;
    pickers.add(zPicker);
    this.pickers.set('z', zPicker);

    const xyPlane = this.createPlaneHandle(GIZMO_COLORS.xy, 0.3);
    xyPlane.position.set(0.15, 0.15, 0);
    xyPlane.rotation.x = Math.PI / 2;
    handles.add(xyPlane);
    this.handles.set('xy', xyPlane);

    const xzPlane = this.createPlaneHandle(GIZMO_COLORS.xz, 0.3);
    xzPlane.position.set(0.15, 0, 0.15);
    handles.add(xzPlane);
    this.handles.set('xz', xzPlane);

    const yzPlane = this.createPlaneHandle(GIZMO_COLORS.yz, 0.3);
    yzPlane.position.set(0, 0.15, 0.15);
    yzPlane.rotation.y = Math.PI / 2;
    handles.add(yzPlane);
    this.handles.set('yz', yzPlane);

    const xyzHandle = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({
        color: GIZMO_COLORS.xyz,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      })
    );
    handles.add(xyzHandle);
    this.handles.set('xyz', xyzHandle);
  }

  private buildRotateGizmo(handles: THREE.Group, pickers: THREE.Group): void {
    const radius = 0.8;
    const tubeRadius = 0.02;

    const xRing = this.createRing(GIZMO_COLORS.x, radius, tubeRadius);
    xRing.rotation.y = Math.PI / 2;
    handles.add(xRing);
    this.handles.set('x', xRing);

    const yRing = this.createRing(GIZMO_COLORS.y, radius, tubeRadius);
    handles.add(yRing);
    this.handles.set('y', yRing);

    const zRing = this.createRing(GIZMO_COLORS.z, radius, tubeRadius);
    zRing.rotation.x = Math.PI / 2;
    handles.add(zRing);
    this.handles.set('z', zRing);

    const xyzRing = this.createRing(GIZMO_COLORS.xyz, radius * 0.5, tubeRadius);
    handles.add(xyzRing);
    this.handles.set('xyz', xyzRing);

    const pickerRadius = radius;
    const pickerTube = 0.1;

    const xPicker = this.createRing(0x000000, pickerRadius, pickerTube, true);
    xPicker.rotation.y = Math.PI / 2;
    pickers.add(xPicker);
    this.pickers.set('x', xPicker);

    const yPicker = this.createRing(0x000000, pickerRadius, pickerTube, true);
    pickers.add(yPicker);
    this.pickers.set('y', yPicker);

    const zPicker = this.createRing(0x000000, pickerRadius, pickerTube, true);
    zPicker.rotation.x = Math.PI / 2;
    pickers.add(zPicker);
    this.pickers.set('z', zPicker);
  }

  private buildScaleGizmo(handles: THREE.Group, pickers: THREE.Group): void {
    const handleLength = 0.8;
    const boxSize = 0.12;
    const shaftRadius = 0.02;

    const xHandle = this.createScaleHandle(GIZMO_COLORS.x, handleLength, boxSize, shaftRadius);
    xHandle.rotation.z = -Math.PI / 2;
    handles.add(xHandle);
    this.handles.set('x', xHandle);

    const yHandle = this.createScaleHandle(GIZMO_COLORS.y, handleLength, boxSize, shaftRadius);
    handles.add(yHandle);
    this.handles.set('y', yHandle);

    const zHandle = this.createScaleHandle(GIZMO_COLORS.z, handleLength, boxSize, shaftRadius);
    zHandle.rotation.x = Math.PI / 2;
    handles.add(zHandle);
    this.handles.set('z', zHandle);

    const xyPlane = this.createPlaneHandle(GIZMO_COLORS.xy, 0.25);
    xyPlane.position.set(0.125, 0.125, 0);
    xyPlane.rotation.x = Math.PI / 2;
    handles.add(xyPlane);
    this.handles.set('xy', xyPlane);

    const xzPlane = this.createPlaneHandle(GIZMO_COLORS.xz, 0.25);
    xzPlane.position.set(0.125, 0, 0.125);
    handles.add(xzPlane);
    this.handles.set('xz', xzPlane);

    const yzPlane = this.createPlaneHandle(GIZMO_COLORS.yz, 0.25);
    yzPlane.position.set(0, 0.125, 0.125);
    yzPlane.rotation.y = Math.PI / 2;
    handles.add(yzPlane);
    this.handles.set('yz', yzPlane);

    const xyzBox = new THREE.Mesh(
      new THREE.BoxGeometry(boxSize * 1.5, boxSize * 1.5, boxSize * 1.5),
      new THREE.MeshBasicMaterial({
        color: GIZMO_COLORS.xyz,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      })
    );
    handles.add(xyzBox);
    this.handles.set('xyz', xyzBox);
  }

  private createArrow(
    color: number,
    length: number,
    headLength: number,
    shaftRadius: number,
    headRadius: number
  ): THREE.Group {
    const group = new THREE.Group();

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius, shaftRadius, length - headLength, 16),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 })
    );
    shaft.position.y = (length - headLength) / 2;
    group.add(shaft);

    const head = new THREE.Mesh(
      new THREE.ConeGeometry(headRadius, headLength, 16),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 })
    );
    head.position.y = length;
    group.add(head);

    return group;
  }

  private createScaleHandle(color: number, length: number, boxSize: number, shaftRadius: number): THREE.Group {
    const group = new THREE.Group();

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius, shaftRadius, length, 16),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 })
    );
    shaft.position.y = length / 2;
    group.add(shaft);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(boxSize, boxSize, boxSize),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 })
    );
    box.position.y = length;
    group.add(box);

    return group;
  }

  private createRing(color: number, radius: number, tube: number, picker = false): THREE.Mesh {
    const geometry = new THREE.TorusGeometry(radius, tube, 16, 64);
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      transparent: true,
      opacity: picker ? 0 : 0.8,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }

  private createPlaneHandle(color: number, size: number): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }

  private createPicker(radius: number, length: number): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = length / 2;
    return mesh;
  }

  setMode(mode: GizmoMode): void {
    this.mode = mode;
    this.buildGizmo();
  }

  setEnabledAxes(axes: GizmoBaseAxes): void {
    this.enabledAxes = { ...axes };
    this.applyAxisAvailability();
  }

  getEnabledAxes(): GizmoBaseAxes {
    return { ...this.enabledAxes };
  }

  isBaseAxisEnabled(axis: keyof GizmoBaseAxes): boolean {
    return this.enabledAxes[axis];
  }

  private isAxisAllowed(axis: GizmoAxis): boolean {
    switch (axis) {
      case 'x':
        return this.enabledAxes.x;
      case 'y':
        return this.enabledAxes.y;
      case 'z':
        return this.enabledAxes.z;
      case 'xy':
        return this.enabledAxes.x && this.enabledAxes.y;
      case 'xz':
        return this.enabledAxes.x && this.enabledAxes.z;
      case 'yz':
        return this.enabledAxes.y && this.enabledAxes.z;
      case 'xyz':
        return this.enabledAxes.x && this.enabledAxes.y && this.enabledAxes.z;
      default:
        return true;
    }
  }

  private applyAxisAvailability(): void {
    this.handles.forEach((handle, axis) => {
      const enabled = this.isAxisAllowed(axis);
      handle.visible = enabled;
      this.setHandleOpacity(handle, enabled ? 0.8 : 0.12);
    });

    this.pickers.forEach((picker, axis) => {
      picker.visible = this.isAxisAllowed(axis);
    });

    if (this.hoveredAxis && !this.isAxisAllowed(this.hoveredAxis)) {
      this.hoveredAxis = null;
    }
    if (this.selectedAxis && !this.isAxisAllowed(this.selectedAxis)) {
      this.selectedAxis = null;
    }
  }

  setSpace(space: TransformSpace): void {
    this.space = space;
    this.updateTransform();
  }

  attach(object: THREE.Object3D): void {
    this.target = object;
    this.object.visible = true;
    this.updateTransform();
  }

  getTarget(): THREE.Object3D | null {
    return this.target;
  }

  detach(): void {
    this.target = null;
    this.object.visible = false;
  }

  updateTransform(): void {
    if (!this.target) return;

    this.object.position.copy(this.target.position);

    if (this.space === 'world' || this.mode === 'translate') {
      this.object.rotation.set(0, 0, 0);
    } else {
      this.object.quaternion.copy(this.target.quaternion);
    }

    if (this.camera) {
      const distance = this.object.position.distanceTo(this.camera.position);
      this.object.scale.setScalar(distance * 0.1 * this.size);
    }
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setDomElement(element: HTMLElement): void {
    this.domElement = element;
  }

  getAxisWorldPoint(axis: GizmoAxis): THREE.Vector3 | null {
    const proxy = this.pickers.get(axis) ?? this.handles.get(axis);
    if (!proxy) return null;

    const bounds = new THREE.Box3().setFromObject(proxy);
    if (bounds.isEmpty()) {
      const point = new THREE.Vector3();
      proxy.getWorldPosition(point);
      return point;
    }

    const centerY = (bounds.min.y + bounds.max.y) * 0.5;
    const centerX = (bounds.min.x + bounds.max.x) * 0.5;
    const centerZ = (bounds.min.z + bounds.max.z) * 0.5;

    switch (axis) {
      case 'x':
        return new THREE.Vector3(bounds.max.x, centerY, centerZ);
      case 'y':
        return new THREE.Vector3(centerX, bounds.max.y, centerZ);
      case 'z':
        return new THREE.Vector3(centerX, centerY, bounds.max.z);
      default:
        return bounds.getCenter(new THREE.Vector3());
    }
  }

  private resolveAxisFromMap(map: Map<GizmoAxis, THREE.Object3D>, object: THREE.Object3D | null): GizmoAxis | null {
    let candidate: THREE.Object3D | null = object;

    while (candidate) {
      for (const [axis, value] of map) {
        if (value === candidate) {
          return axis;
        }
      }
      candidate = candidate.parent;
    }

    return null;
  }

  getAxisFromIntersection(object: THREE.Object3D | null): GizmoAxis | null {
    const axis = this.resolveAxisFromMap(this.pickers, object) ?? this.resolveAxisFromMap(this.handles, object);
    return axis && this.isAxisAllowed(axis) ? axis : null;
  }

  getHoveredAxis(raycaster: THREE.Raycaster): GizmoAxis | null {
    const pickerGroup = this.object.getObjectByName('pickers');
    if (!pickerGroup) return null;

    const intersects = raycaster.intersectObjects(pickerGroup.children, true);
    if (intersects.length === 0) return null;

    for (const intersect of intersects) {
      const axis = this.resolveAxisFromMap(this.pickers, intersect.object);
      if (axis && this.isAxisAllowed(axis)) {
        return axis;
      }
    }

    return null;
  }

  highlightAxis(axis: GizmoAxis | null): void {
    const nextAxis = axis && this.isAxisAllowed(axis) ? axis : null;

    if (this.hoveredAxis === nextAxis) return;

    if (this.hoveredAxis) {
      const handle = this.handles.get(this.hoveredAxis);
      if (handle) {
        this.setHandleColor(handle, this.getAxisColor(this.hoveredAxis));
      }
    }

    this.hoveredAxis = nextAxis;
    if (nextAxis) {
      const handle = this.handles.get(nextAxis);
      if (handle) {
        this.setHandleColor(handle, GIZMO_COLORS.hover);
      }
    }
  }

  private getAxisColor(axis: GizmoAxis): number {
    return GIZMO_COLORS[axis] || GIZMO_COLORS.xyz;
  }

  private setHandleColor(handle: THREE.Object3D, color: number): void {
    handle.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const material = (child as THREE.Mesh).material;
      if (Array.isArray(material)) {
        material.forEach((item) => {
          if ((item as THREE.MeshBasicMaterial).color) {
            (item as THREE.MeshBasicMaterial).color.setHex(color);
          }
        });
        return;
      }

      if ((material as THREE.MeshBasicMaterial).color) {
        (material as THREE.MeshBasicMaterial).color.setHex(color);
      }
    });
  }

  private setHandleOpacity(handle: THREE.Object3D, opacity: number): void {
    handle.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const material = (child as THREE.Mesh).material;
      if (Array.isArray(material)) {
        material.forEach((item) => {
          if ('opacity' in item) {
            item.opacity = opacity;
            item.needsUpdate = true;
          }
        });
        return;
      }

      if ('opacity' in material) {
        material.opacity = opacity;
        material.needsUpdate = true;
      }
    });
  }

  startDrag(raycaster: THREE.Raycaster, axis: GizmoAxis): boolean {
    if (!this.target || !this.isAxisAllowed(axis)) return false;

    this.selectedAxis = axis;

    const plane = this.getDragPlane(raycaster);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);
    this.dragStart.copy(intersection);

    this.dragStartTransform.position.copy(this.target.position);
    this.dragStartTransform.rotation.copy(this.target.quaternion);
    this.dragStartTransform.scale.copy(this.target.scale);

    return true;
  }

  updateDrag(raycaster: THREE.Raycaster): void {
    if (!this.target || !this.selectedAxis) return;

    const plane = this.getDragPlane(raycaster);
    const intersection = new THREE.Vector3();

    if (!raycaster.ray.intersectPlane(plane, intersection)) return;

    const delta = intersection.clone().sub(this.dragStart);

    switch (this.mode) {
      case 'translate':
        this.applyTranslate(delta);
        break;
      case 'rotate':
        this.applyRotate(delta);
        break;
      case 'scale':
        this.applyScale(delta);
        break;
    }
  }

  endDrag(): void {
    this.selectedAxis = null;
  }

  private getDragPlane(_raycaster: THREE.Raycaster): THREE.Plane {
    const plane = new THREE.Plane();
    const eye = new THREE.Vector3(0, 0, 1);

    if (this.camera) {
      this.camera.getWorldDirection(eye);
    }

    if (!this.target) {
      plane.setFromNormalAndCoplanarPoint(eye, new THREE.Vector3());
      return plane;
    }

    const normal = new THREE.Vector3();

    if (this.mode === 'translate') {
      switch (this.selectedAxis) {
        case 'xy':
          normal.set(0, 0, 1);
          break;
        case 'xz':
          normal.set(0, 1, 0);
          break;
        case 'yz':
          normal.set(1, 0, 0);
          break;
        default:
          // For axis drags, use a camera-facing plane so ray movement produces non-zero deltas.
          normal.copy(eye);
      }

      if (this.space === 'local' && this.target && (this.selectedAxis === 'xy' || this.selectedAxis === 'xz' || this.selectedAxis === 'yz')) {
        normal.applyQuaternion(this.target.quaternion);
      }
    } else {
      switch (this.selectedAxis) {
        case 'x':
          normal.set(1, 0, 0);
          break;
        case 'y':
          normal.set(0, 1, 0);
          break;
        case 'z':
          normal.set(0, 0, 1);
          break;
        case 'xy':
          normal.set(0, 0, 1);
          break;
        case 'xz':
          normal.set(0, 1, 0);
          break;
        case 'yz':
          normal.set(1, 0, 0);
          break;
        default:
          normal.copy(eye);
      }

      if (this.space === 'local' && this.target) {
        normal.applyQuaternion(this.target.quaternion);
      }
    }

    plane.setFromNormalAndCoplanarPoint(normal.normalize(), this.target.position);

    if (plane.normal.dot(eye) < 0) {
      plane.normal.negate();
    }

    return plane;
  }

  private applyTranslate(delta: THREE.Vector3): void {
    if (!this.target) return;

    const position = this.dragStartTransform.position.clone();
    const axisVector = new THREE.Vector3();

    switch (this.selectedAxis) {
      case 'x':
        axisVector.set(1, 0, 0);
        break;
      case 'y':
        axisVector.set(0, 1, 0);
        break;
      case 'z':
        axisVector.set(0, 0, 1);
        break;
      default:
        break;
    }

    if (axisVector.lengthSq() > 0) {
      if (this.space === 'local') {
        axisVector.applyQuaternion(this.dragStartTransform.rotation);
      }

      axisVector.normalize();
      const distance = delta.dot(axisVector);
      position.addScaledVector(axisVector, distance);
      this.target.position.copy(position);
      this.updateTransform();
      return;
    }

    switch (this.selectedAxis) {
      case 'xy':
        position.x += delta.x;
        position.y += delta.y;
        break;
      case 'xz':
        position.x += delta.x;
        position.z += delta.z;
        break;
      case 'yz':
        position.y += delta.y;
        position.z += delta.z;
        break;
      case 'xyz':
        position.add(delta);
        break;
      default:
        return;
    }

    this.target.position.copy(position);
    this.updateTransform();
  }

  private applyRotate(delta: THREE.Vector3): void {
    if (!this.target) return;

    const rotation = this.dragStartTransform.rotation.clone();
    const angle = (delta.x + delta.y + delta.z) * 0.5;

    const axis = new THREE.Vector3();
    switch (this.selectedAxis) {
      case 'x':
        axis.set(1, 0, 0);
        break;
      case 'y':
        axis.set(0, 1, 0);
        break;
      case 'z':
        axis.set(0, 0, 1);
        break;
      default:
        if (this.camera) {
          this.camera.getWorldDirection(axis);
          axis.negate();
        }
    }

    if (this.space === 'local') {
      axis.applyQuaternion(rotation);
    }

    const deltaRotation = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    rotation.premultiply(deltaRotation);

    this.target.quaternion.copy(rotation);
    this.updateTransform();
  }

  private applyScale(delta: THREE.Vector3): void {
    if (!this.target) return;

    const scale = this.dragStartTransform.scale.clone();
    const scaleFactor = 1 + (delta.x + delta.y + delta.z) * 0.5;

    switch (this.selectedAxis) {
      case 'x':
        scale.x *= scaleFactor;
        break;
      case 'y':
        scale.y *= scaleFactor;
        break;
      case 'z':
        scale.z *= scaleFactor;
        break;
      case 'xy':
        scale.x *= scaleFactor;
        scale.y *= scaleFactor;
        break;
      case 'xz':
        scale.x *= scaleFactor;
        scale.z *= scaleFactor;
        break;
      case 'yz':
        scale.y *= scaleFactor;
        scale.z *= scaleFactor;
        break;
      case 'xyz':
        scale.multiplyScalar(scaleFactor);
        break;
    }

    this.target.scale.copy(scale);
    this.updateTransform();
  }

  dispose(): void {
    this.object.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();

      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material.dispose();
      }
    });
  }
}
