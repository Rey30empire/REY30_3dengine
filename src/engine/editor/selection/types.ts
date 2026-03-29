import * as THREE from 'three';

export type SelectionFilter = 'all' | 'meshes' | 'lights' | 'cameras' | 'groups' | 'custom';
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'toggle';

export interface SelectionEvent {
  type: 'selected' | 'deselected' | 'cleared';
  objects: THREE.Object3D[];
  added?: THREE.Object3D[];
  removed?: THREE.Object3D[];
}

export type SelectionCallback = (event: SelectionEvent) => void;
export type FilterFunction = (object: THREE.Object3D) => boolean;
