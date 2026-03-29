import * as THREE from 'three';

interface SelectionBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class SelectionBox {
  public startPoint: THREE.Vector2;
  public endPoint: THREE.Vector2;
  public element: HTMLElement | null;
  public div: HTMLDivElement | null;

  private camera: THREE.Camera;
  private scene: THREE.Scene;
  private tempBox: THREE.Box3;
  private tempCenter: THREE.Vector3;
  private tempPoint: THREE.Vector3;

  constructor(camera: THREE.Camera, scene: THREE.Scene, element?: HTMLElement) {
    this.startPoint = new THREE.Vector2();
    this.endPoint = new THREE.Vector2();
    this.camera = camera;
    this.scene = scene;
    this.element = element || document.body;
    this.div = null;
    this.tempBox = new THREE.Box3();
    this.tempCenter = new THREE.Vector3();
    this.tempPoint = new THREE.Vector3();
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  start(x: number, y: number): void {
    this.startPoint.set(x, y);
    this.endPoint.set(x, y);
    this.updateVisual();
  }

  update(x: number, y: number): void {
    this.endPoint.set(x, y);
    this.updateVisual();
  }

  end(): THREE.Object3D[] {
    this.hideVisual();
    return this.select();
  }

  select(): THREE.Object3D[] {
    const selection: THREE.Object3D[] = [];
    const bounds = this.getBounds();

    if (bounds.width <= 0 || bounds.height <= 0) {
      return selection;
    }

    this.scene.traverse((object) => {
      if (object.userData?.entityId && this.objectIntersectsBounds(object, bounds)) {
        selection.push(object);
      }
    });

    return selection;
  }

  private objectIntersectsBounds(object: THREE.Object3D, bounds: SelectionBounds): boolean {
    this.tempBox.makeEmpty();
    this.tempBox.setFromObject(object);

    if (this.tempBox.isEmpty()) {
      object.getWorldPosition(this.tempCenter);
      const projectedPoint = this.projectWorldPoint(this.tempCenter);
      return projectedPoint ? this.containsProjectedBounds(projectedPoint, projectedPoint, bounds) : false;
    }

    const corners = [
      new THREE.Vector3(this.tempBox.min.x, this.tempBox.min.y, this.tempBox.min.z),
      new THREE.Vector3(this.tempBox.min.x, this.tempBox.min.y, this.tempBox.max.z),
      new THREE.Vector3(this.tempBox.min.x, this.tempBox.max.y, this.tempBox.min.z),
      new THREE.Vector3(this.tempBox.min.x, this.tempBox.max.y, this.tempBox.max.z),
      new THREE.Vector3(this.tempBox.max.x, this.tempBox.min.y, this.tempBox.min.z),
      new THREE.Vector3(this.tempBox.max.x, this.tempBox.min.y, this.tempBox.max.z),
      new THREE.Vector3(this.tempBox.max.x, this.tempBox.max.y, this.tempBox.min.z),
      new THREE.Vector3(this.tempBox.max.x, this.tempBox.max.y, this.tempBox.max.z),
      this.tempBox.getCenter(new THREE.Vector3()),
    ];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let hasProjectedPoint = false;

    for (const corner of corners) {
      const projectedPoint = this.projectWorldPoint(corner);
      if (!projectedPoint) continue;
      hasProjectedPoint = true;
      minX = Math.min(minX, projectedPoint.x);
      minY = Math.min(minY, projectedPoint.y);
      maxX = Math.max(maxX, projectedPoint.x);
      maxY = Math.max(maxY, projectedPoint.y);
    }

    if (!hasProjectedPoint) {
      return false;
    }

    return this.containsProjectedBounds(new THREE.Vector2(minX, minY), new THREE.Vector2(maxX, maxY), bounds);
  }

  private projectWorldPoint(point: THREE.Vector3): THREE.Vector2 | null {
    this.tempPoint.copy(point).project(this.camera);

    if (
      !Number.isFinite(this.tempPoint.x) ||
      !Number.isFinite(this.tempPoint.y) ||
      !Number.isFinite(this.tempPoint.z)
    ) {
      return null;
    }

    return new THREE.Vector2((this.tempPoint.x + 1) / 2, (-this.tempPoint.y + 1) / 2);
  }

  private containsProjectedBounds(minPoint: THREE.Vector2, maxPoint: THREE.Vector2, bounds: SelectionBounds): boolean {
    const selectionRight = bounds.left + bounds.width;
    const selectionBottom = bounds.top + bounds.height;

    return !(
      maxPoint.x < bounds.left ||
      minPoint.x > selectionRight ||
      maxPoint.y < bounds.top ||
      minPoint.y > selectionBottom
    );
  }

  private getBounds(): SelectionBounds {
    if (!this.element) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    const rect = this.element.getBoundingClientRect();

    const left = Math.min(this.startPoint.x, this.endPoint.x) - rect.left;
    const top = Math.min(this.startPoint.y, this.endPoint.y) - rect.top;
    const width = Math.abs(this.endPoint.x - this.startPoint.x);
    const height = Math.abs(this.endPoint.y - this.startPoint.y);

    return {
      left: left / rect.width,
      top: top / rect.height,
      width: width / rect.width,
      height: height / rect.height,
    };
  }

  private createVisual(): void {
    if (this.div) return;

    this.div = document.createElement('div');
    this.div.style.cssText = `
      position: fixed;
      border: 1px solid #5555ff;
      background: rgba(85, 85, 255, 0.2);
      pointer-events: none;
      z-index: 99999;
    `;
    document.body.appendChild(this.div);
  }

  private updateVisual(): void {
    this.createVisual();

    if (!this.div) return;

    const left = Math.min(this.startPoint.x, this.endPoint.x);
    const top = Math.min(this.startPoint.y, this.endPoint.y);
    const width = Math.abs(this.endPoint.x - this.startPoint.x);
    const height = Math.abs(this.endPoint.y - this.startPoint.y);

    this.div.style.left = `${left}px`;
    this.div.style.top = `${top}px`;
    this.div.style.width = `${width}px`;
    this.div.style.height = `${height}px`;
    this.div.style.display = 'block';
  }

  hideVisual(): void {
    if (this.div) {
      this.div.style.display = 'none';
    }
  }

  dispose(): void {
    if (this.div && this.div.parentNode) {
      this.div.parentNode.removeChild(this.div);
      this.div = null;
    }
  }
}
