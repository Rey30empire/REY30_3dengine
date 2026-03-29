import * as THREE from 'three';
import { SelectionBox } from './SelectionBox';
import type {
  FilterFunction,
  SelectionCallback,
  SelectionEvent,
  SelectionFilter,
  SelectionMode,
} from './types';

export class SelectionManager {
  public selectedObjects: Set<THREE.Object3D>;
  public hoveredObject: THREE.Object3D | null;
  public activeObject: THREE.Object3D | null;

  private callbacks: Set<SelectionCallback>;
  private filters: Map<SelectionFilter, FilterFunction>;
  private activeFilter: SelectionFilter;
  private selectionBox: SelectionBox | null;
  private camera: THREE.Camera | null;
  private scene: THREE.Scene | null;
  private element: HTMLElement | null;

  private selectedMaterial: THREE.Material;
  private hoveredMaterial: THREE.Material;
  private originalMaterials: Map<THREE.Object3D, THREE.Material | THREE.Material[]>;

  constructor() {
    this.selectedObjects = new Set();
    this.hoveredObject = null;
    this.activeObject = null;
    this.callbacks = new Set();
    this.filters = new Map();
    this.activeFilter = 'all';
    this.selectionBox = null;
    this.camera = null;
    this.scene = null;
    this.element = null;
    this.originalMaterials = new Map();

    this.selectedMaterial = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.3,
      depthTest: false,
    });

    this.hoveredMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.2,
      depthTest: false,
    });

    this.setupDefaultFilters();
  }

  private setupDefaultFilters(): void {
    this.filters.set('all', () => true);
    this.filters.set('meshes', (obj) => (obj as THREE.Mesh).isMesh);
    this.filters.set('lights', (obj) => (obj as THREE.Light).isLight);
    this.filters.set('cameras', (obj) => (obj as THREE.Camera).isCamera);
    this.filters.set('groups', (obj) => (obj as THREE.Group).isGroup);
  }

  initialize(camera: THREE.Camera, scene: THREE.Scene, element: HTMLElement): void {
    this.camera = camera;
    this.scene = scene;
    this.element = element;
    this.selectionBox = new SelectionBox(camera, scene, element);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.selectionBox?.setCamera(camera);
  }

  setFilter(filter: SelectionFilter): void {
    this.activeFilter = filter;
  }

  addFilter(name: string, filterFn: FilterFunction): void {
    this.filters.set(name as SelectionFilter, filterFn);
  }

  private passesFilter(object: THREE.Object3D): boolean {
    const filter = this.filters.get(this.activeFilter);
    return filter ? filter(object) : true;
  }

  select(object: THREE.Object3D, mode: SelectionMode = 'replace'): void {
    const added: THREE.Object3D[] = [];
    const removed: THREE.Object3D[] = [];

    switch (mode) {
      case 'replace':
        this.selectedObjects.forEach((obj) => {
          removed.push(obj);
          this.unhighlightObject(obj);
        });
        this.selectedObjects.clear();

        if (this.passesFilter(object)) {
          this.selectedObjects.add(object);
          added.push(object);
          this.highlightObject(object, 'selected');
        }
        break;

      case 'add':
        if (this.passesFilter(object) && !this.selectedObjects.has(object)) {
          this.selectedObjects.add(object);
          added.push(object);
          this.highlightObject(object, 'selected');
        }
        break;

      case 'subtract':
        if (this.selectedObjects.has(object)) {
          this.selectedObjects.delete(object);
          removed.push(object);
          this.unhighlightObject(object);
        }
        break;

      case 'toggle':
        if (this.selectedObjects.has(object)) {
          this.selectedObjects.delete(object);
          removed.push(object);
          this.unhighlightObject(object);
        } else if (this.passesFilter(object)) {
          this.selectedObjects.add(object);
          added.push(object);
          this.highlightObject(object, 'selected');
        }
        break;
    }

    if (this.selectedObjects.size === 1) {
      this.activeObject = this.selectedObjects.values().next().value ?? null;
    } else {
      this.activeObject = null;
    }

    if (added.length > 0 || removed.length > 0) {
      this.emit({
        type: 'selected',
        objects: Array.from(this.selectedObjects),
        added,
        removed,
      });
    }
  }

  selectMultiple(objects: THREE.Object3D[], mode: SelectionMode = 'replace'): void {
    if (mode === 'replace') {
      this.clearSelection();
    }

    objects.forEach((obj) => this.select(obj, mode === 'replace' ? 'add' : mode));
  }

  deselect(object: THREE.Object3D): void {
    if (this.selectedObjects.has(object)) {
      this.selectedObjects.delete(object);
      this.unhighlightObject(object);

      this.emit({
        type: 'deselected',
        objects: Array.from(this.selectedObjects),
        removed: [object],
      });
    }
  }

  clearSelection(): void {
    const objects = Array.from(this.selectedObjects);

    this.selectedObjects.forEach((obj) => this.unhighlightObject(obj));
    this.selectedObjects.clear();
    this.activeObject = null;

    if (objects.length > 0) {
      this.emit({
        type: 'cleared',
        objects: [],
        removed: objects,
      });
    }
  }

  selectAll(): void {
    if (!this.scene) return;

    const objects: THREE.Object3D[] = [];

    this.scene.traverse((object) => {
      if (this.passesFilter(object) && !this.selectedObjects.has(object)) {
        objects.push(object);
      }
    });

    this.selectMultiple(objects, 'add');
  }

  invertSelection(): void {
    if (!this.scene) return;

    const toSelect: THREE.Object3D[] = [];
    const toDeselect: THREE.Object3D[] = [];

    this.scene.traverse((object) => {
      if (this.passesFilter(object)) {
        if (this.selectedObjects.has(object)) {
          toDeselect.push(object);
        } else {
          toSelect.push(object);
        }
      }
    });

    toDeselect.forEach((obj) => this.deselect(obj));
    toSelect.forEach((obj) => this.select(obj, 'add'));
  }

  hover(object: THREE.Object3D | null): void {
    if (this.hoveredObject === object) return;

    if (this.hoveredObject && !this.selectedObjects.has(this.hoveredObject)) {
      this.unhighlightObject(this.hoveredObject);
    }

    this.hoveredObject = object;

    if (object && !this.selectedObjects.has(object)) {
      this.highlightObject(object, 'hovered');
    }
  }

  private highlightObject(object: THREE.Object3D, type: 'selected' | 'hovered'): void {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;

        if (!this.originalMaterials.has(mesh)) {
          this.originalMaterials.set(mesh, mesh.material);
        }

        mesh.material = type === 'selected' ? this.selectedMaterial : this.hoveredMaterial;
      }
    });
  }

  private unhighlightObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const original = this.originalMaterials.get(mesh);

        if (original) {
          mesh.material = original;
          this.originalMaterials.delete(mesh);
        }
      }
    });
  }

  startBoxSelection(x: number, y: number): void {
    this.selectionBox?.start(x, y);
  }

  updateBoxSelection(x: number, y: number): void {
    this.selectionBox?.update(x, y);
  }

  endBoxSelection(mode: SelectionMode = 'replace'): THREE.Object3D[] {
    if (!this.selectionBox) return [];

    const objects = this.selectionBox.end();
    this.selectMultiple(objects, mode);
    return objects;
  }

  pickObject(x: number, y: number): THREE.Object3D | null {
    if (!this.camera || !this.scene || !this.element) return null;

    const rect = this.element.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const objects: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Group).isGroup) {
        objects.push(obj);
      }
    });

    const intersects = raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
      let result = intersects[0].object;
      while (result.parent && result.parent !== this.scene) {
        result = result.parent;
      }
      return result;
    }

    return null;
  }

  getSelectionBounds(): THREE.Box3 | null {
    if (this.selectedObjects.size === 0) return null;

    const box = new THREE.Box3();
    this.selectedObjects.forEach((object) => {
      box.expandByObject(object);
    });

    return box;
  }

  getSelectionCenter(): THREE.Vector3 | null {
    const bounds = this.getSelectionBounds();
    if (!bounds) return null;
    return bounds.getCenter(new THREE.Vector3());
  }

  on(callback: SelectionCallback): void {
    this.callbacks.add(callback);
  }

  off(callback: SelectionCallback): void {
    this.callbacks.delete(callback);
  }

  private emit(event: SelectionEvent): void {
    this.callbacks.forEach((callback) => callback(event));
  }

  isSelected(object: THREE.Object3D): boolean {
    return this.selectedObjects.has(object);
  }

  get selectionCount(): number {
    return this.selectedObjects.size;
  }

  getSelectedObjects(): THREE.Object3D[] {
    return Array.from(this.selectedObjects);
  }

  dispose(): void {
    this.clearSelection();
    this.selectionBox?.dispose();
    this.selectedMaterial.dispose();
    this.hoveredMaterial.dispose();
    this.originalMaterials.clear();
  }
}

export const selectionManager = new SelectionManager();
