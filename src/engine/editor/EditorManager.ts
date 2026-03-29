// ============================================
// Editor Manager - Unified Editor System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import {
  TransformGizmo,
  TransformTools,
  GizmoMode,
  SnapSettings,
  DEFAULT_GIZMO_BASE_AXES,
} from './gizmos';
import { SelectionManager, selectionManager, SelectionMode } from './selection';
import { PrefabManager, prefabManager, PrefabDefinition } from './prefabs';
import { useEngineStore } from '@/store/editorStore';

// Editor state
export interface EditorState {
  mode: 'edit' | 'play' | 'pause';
  transformMode: GizmoMode;
  transformSpace: 'world' | 'local';
  snapSettings: SnapSettings;
  gridVisible: boolean;
  gridSize: number;
  showColliders: boolean;
  showLights: boolean;
  showNavMesh: boolean;
  selectedTool: string;
  historyPosition: number;
}

// Undo/Redo action
export interface EditorAction {
  type: string;
  description: string;
  timestamp: number;
  data: Record<string, unknown>;
  undo: () => void;
  redo: () => void;
}

// ============================================
// Editor Manager
// ============================================
export class EditorManager {
  // Core systems
  public transformTools: TransformTools;
  public selection: SelectionManager;
  public prefabs: PrefabManager;
  
  // State
  public state: EditorState;
  
  // History
  private history: EditorAction[];
  private historyIndex: number;
  private maxHistory: number;
  
  // Scene reference
  private scene: THREE.Scene | null;
  private camera: THREE.Camera | null;
  private renderer: THREE.WebGLRenderer | null;
  private domElement: HTMLElement | null;
  
  // Event handlers
  private boundHandlers: {
    onMouseDown: (e: MouseEvent) => void;
    onMouseMove: (e: MouseEvent) => void;
    onMouseUp: (e: MouseEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onKeyUp: (e: KeyboardEvent) => void;
  };

  constructor() {
    this.transformTools = new TransformTools();
    this.selection = selectionManager;
    this.prefabs = prefabManager;
    
    this.state = {
      mode: 'edit',
      transformMode: 'translate',
      transformSpace: 'world',
      snapSettings: {
        enabled: false,
        translateSnap: 1,
        rotateSnap: 15,
        scaleSnap: 0.1,
        translateAxes: { ...DEFAULT_GIZMO_BASE_AXES },
        rotateAxes: { ...DEFAULT_GIZMO_BASE_AXES },
        scaleAxes: { ...DEFAULT_GIZMO_BASE_AXES },
        snapTarget: 'grid',
        vertexSnap: false,
        surfaceSnap: false,
        gridVisible: true,
        gridSize: 1,
      },
      gridVisible: true,
      gridSize: 1,
      showColliders: false,
      showLights: true,
      showNavMesh: false,
      selectedTool: 'select',
      historyPosition: 0,
    };
    
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 100;
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.domElement = null;
    
    this.boundHandlers = {
      onMouseDown: this.handleMouseDown.bind(this),
      onMouseMove: this.handleMouseMove.bind(this),
      onMouseUp: this.handleMouseUp.bind(this),
      onKeyDown: this.handleKeyDown.bind(this),
      onKeyUp: this.handleKeyUp.bind(this),
    };
  }

  // Initialize
  initialize(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, domElement: HTMLElement): void {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;
    
    // Initialize selection
    this.selection.initialize(camera, scene, domElement);
    
    // Setup gizmo
    this.transformTools.setScene(scene);
    this.transformTools.setCamera(camera);
    this.transformTools.gizmo.setDomElement(domElement);
    this.scene.add(this.transformTools.gizmo.object);
    
    // Add event listeners
    this.addEventListeners();
    
    // Add grid
    this.addGrid();
    
    // Add event handlers
    this.transformTools.setOnTransformChange((object) => {
      this.onObjectTransformed(object);
    });
    
    this.selection.on((event) => {
      this.onSelectionChanged(event);
    });
  }

  // Add event listeners
  private addEventListeners(): void {
    if (!this.domElement) return;
    
    this.domElement.addEventListener('mousedown', this.boundHandlers.onMouseDown);
    this.domElement.addEventListener('mousemove', this.boundHandlers.onMouseMove);
    this.domElement.addEventListener('mouseup', this.boundHandlers.onMouseUp);
    window.addEventListener('keydown', this.boundHandlers.onKeyDown);
    window.addEventListener('keyup', this.boundHandlers.onKeyUp);
  }

  // Remove event listeners
  private removeEventListeners(): void {
    if (this.domElement) {
      this.domElement.removeEventListener('mousedown', this.boundHandlers.onMouseDown);
      this.domElement.removeEventListener('mousemove', this.boundHandlers.onMouseMove);
      this.domElement.removeEventListener('mouseup', this.boundHandlers.onMouseUp);
    }
    window.removeEventListener('keydown', this.boundHandlers.onKeyDown);
    window.removeEventListener('keyup', this.boundHandlers.onKeyUp);
  }

  // Mouse handlers
  private handleMouseDown(event: MouseEvent): void {
    if (event.button === 2) return; // Right click - context menu
    
    // Check if clicking on gizmo
    const axis = this.transformTools.onMouseDown(event, this.camera!, this.domElement!);
    if (axis) {
      event.preventDefault();
      return;
    }
    
    // Start box selection if shift is held
    if (event.shiftKey) {
      this.selection.startBoxSelection(event.clientX, event.clientY);
      return;
    }
    
    // Pick object
    const picked = this.selection.pickObject(event.clientX, event.clientY);
    
    const mode: SelectionMode = event.shiftKey ? 'toggle' : event.ctrlKey ? 'add' : 'replace';
    if (picked) {
      this.selection.select(picked, mode);
    } else {
      this.selection.clearSelection();
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.camera || !this.domElement) return;
    
    // Update transform tools
    const axis = this.transformTools.onMouseMove(event, this.camera, this.domElement);
    this.transformTools.gizmo.highlightAxis(axis);
    
    // Update hover
    const hovered = this.selection.pickObject(event.clientX, event.clientY);
    this.selection.hover(hovered);
    
    // Update box selection if active
    // (this would be tracked with a flag)
  }

  private handleMouseUp(event: MouseEvent): void {
    this.transformTools.onMouseUp();
    // this.selection.endBoxSelection(this.state.shiftKey ? 'add' : 'replace');
  }

  // Keyboard handlers
  private handleKeyDown(event: KeyboardEvent): void {
    // Don't handle if typing in input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'w':
        this.setTransformMode('translate');
        break;
      case 'e':
        this.setTransformMode('rotate');
        break;
      case 'r':
        this.setTransformMode('scale');
        break;
      case 'q':
        this.toggleTransformSpace();
        break;
      case 'g':
        this.toggleGrid();
        break;
      case 's':
        if (event.ctrlKey) {
          event.preventDefault();
          this.saveScene();
        }
        break;
      case 'z':
        if (event.ctrlKey) {
          event.preventDefault();
          if (event.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
        }
        break;
      case 'y':
        if (event.ctrlKey) {
          event.preventDefault();
          this.redo();
        }
        break;
      case 'delete':
      case 'backspace':
        this.deleteSelected();
        break;
      case 'd':
        if (event.ctrlKey) {
          event.preventDefault();
          this.duplicateSelected();
        }
        break;
      case 'escape':
        this.selection.clearSelection();
        break;
      case 'a':
        if (event.ctrlKey) {
          event.preventDefault();
          this.selection.selectAll();
        }
        break;
      case 'f':
        this.focusSelected();
        break;
    }
  }

  private handleKeyUp(_event: KeyboardEvent): void {
    // Key release handling
  }

  // Transform mode
  setTransformMode(mode: GizmoMode): void {
    this.state.transformMode = mode;
    this.transformTools.gizmo.setMode(mode);
    
    // Update store
    useEngineStore.getState().setGizmoMode(mode);
  }

  // Toggle transform space
  toggleTransformSpace(): void {
    this.state.transformSpace = this.state.transformSpace === 'world' ? 'local' : 'world';
    this.transformTools.gizmo.setSpace(this.state.transformSpace);
  }

  // Grid
  private addGrid(): void {
    const grid = new THREE.GridHelper(100, 100, 0x444466, 0x222244);
    grid.name = 'editor-grid';
    this.scene?.add(grid);
  }

  toggleGrid(): void {
    this.state.gridVisible = !this.state.gridVisible;
    const grid = this.scene?.getObjectByName('editor-grid');
    if (grid) {
      grid.visible = this.state.gridVisible;
    }
  }

  // Snap settings
  setSnapEnabled(enabled: boolean): void {
    this.state.snapSettings.enabled = enabled;
    this.transformTools.snapSettings.enabled = enabled;
  }

  setTranslateSnap(value: number): void {
    this.state.snapSettings.translateSnap = value;
    this.transformTools.snapSettings.translateSnap = value;
  }

  // Selection callbacks
  private onSelectionChanged(event: { objects: THREE.Object3D[] }): void {
    if (event.objects.length === 1) {
      this.transformTools.gizmo.attach(event.objects[0]);
    } else {
      this.transformTools.gizmo.detach();
    }
    
    // Update store
    const store = useEngineStore.getState();
    // store.setSelectedEntities(event.objects.map(o => o.userData.entityId));
  }

  private onObjectTransformed(object: THREE.Object3D): void {
    // Record action for undo
    // this.recordAction(...);
    
    // Update store
    // This would update the entity in the store
  }

  // Object operations
  deleteSelected(): void {
    const selected = this.selection.getSelectedObjects();
    selected.forEach((object) => {
      object.parent?.remove(object);
    });
    this.selection.clearSelection();
  }

  duplicateSelected(): void {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return;
    
    const clones: THREE.Object3D[] = [];
    
    selected.forEach((object) => {
      const clone = object.clone();
      clone.position.x += 1;
      clone.position.z += 1;
      object.parent?.add(clone);
      clones.push(clone);
    });
    
    this.selection.clearSelection();
    clones.forEach((clone) => this.selection.select(clone, 'add'));
  }

  focusSelected(): void {
    const center = this.selection.getSelectionCenter();
    if (center && this.camera) {
      // Move camera to focus on selection
      const distance = 10;
      const direction = new THREE.Vector3(1, 1, 1).normalize();
      
      if (this.camera.position) {
        this.camera.position.copy(center).add(direction.multiplyScalar(distance));
      }
    }
  }

  // Prefab operations
  instantiatePrefab(prefabId: string, position?: THREE.Vector3): THREE.Object3D | null {
    const instance = this.prefabs.instantiate(prefabId, position);
    if (instance && this.scene) {
      this.scene.add(instance.object);
      return instance.object;
    }
    return null;
  }

  createPrefabFromSelected(name: string, category: string): PrefabDefinition | null {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return null;
    
    return this.prefabs.createPrefab(selected[0], name, category as any);
  }

  // Play mode
  setMode(mode: 'edit' | 'play' | 'pause'): void {
    this.state.mode = mode;
    
    if (mode === 'play') {
      // Save current state for reset
      // Start game loop
    } else if (mode === 'edit') {
      // Restore saved state
    }
  }

  // Save/Load
  saveScene(): void {
    // Serialize scene to JSON
    const sceneData = this.serializeScene();
    
    // Save to store or file
    console.log('Scene saved:', sceneData);
  }

  private serializeScene(): Record<string, unknown> {
    if (!this.scene) return {};
    
    const data: Record<string, unknown> = {
      objects: [],
    };
    
    this.scene.traverse((object) => {
      if (object.userData.entityId) {
        // Serialize entity
      }
    });
    
    return data;
  }

  // Undo/Redo
  undo(): void {
    if (this.historyIndex < 0) return;
    
    const action = this.history[this.historyIndex];
    action.undo();
    this.historyIndex--;
  }

  redo(): void {
    if (this.historyIndex >= this.history.length - 1) return;
    
    this.historyIndex++;
    const action = this.history[this.historyIndex];
    action.redo();
  }

  recordAction(action: EditorAction): void {
    // Remove future actions
    this.history = this.history.slice(0, this.historyIndex + 1);
    
    // Add new action
    this.history.push(action);
    this.historyIndex = this.history.length - 1;
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  // Update loop
  update(): void {
    if (this.state.mode === 'edit') {
      // Update gizmo scale
      this.transformTools.gizmo.updateTransform();
    }
  }

  // Dispose
  dispose(): void {
    this.removeEventListeners();
    this.transformTools.dispose();
    this.selection.dispose();
    this.prefabs.dispose();
  }
}

// Export singleton
export const editorManager = new EditorManager();
