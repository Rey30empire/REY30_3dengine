// ============================================
// Transform Gizmo Types and Defaults
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type GizmoAxis = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';
export type TransformSpace = 'world' | 'local';
export type SnapTarget = 'grid' | 'vertex' | 'surface';
export type GizmoBaseAxes = {
  x: boolean;
  y: boolean;
  z: boolean;
};

export interface SnapSettings {
  enabled: boolean;
  translateSnap: number;
  rotateSnap: number;
  scaleSnap: number;
  translateAxes: GizmoBaseAxes;
  rotateAxes: GizmoBaseAxes;
  scaleAxes: GizmoBaseAxes;
  snapTarget: SnapTarget;
  vertexSnap: boolean;
  surfaceSnap: boolean;
  gridVisible: boolean;
  gridSize: number;
}

export const DEFAULT_GIZMO_BASE_AXES: GizmoBaseAxes = {
  x: true,
  y: true,
  z: true,
};

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
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
};

export const GIZMO_COLORS = {
  x: 0xff4444,
  y: 0x44ff44,
  z: 0x4444ff,
  xy: 0xffff44,
  xz: 0xff44ff,
  yz: 0x44ffff,
  xyz: 0xffffff,
  hover: 0xffff00,
  selected: 0xffaa00,
} as const;
