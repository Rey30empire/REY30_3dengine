// ============================================
// Physics System - Module Exports
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

export { PhysicsEngine, physicsEngine, type PhysicsEngineOptions as PhysicsConfig } from './PhysicsEngine';
export type { RigidBodyOptions as PhysicsBodyOptions } from './RigidBody';
export { RigidBody, type RigidBodyType, type RigidBodyOptions } from './RigidBody';
export { Collider, type ColliderShapeType as ColliderShape, type ColliderOptions } from './Collider';
export { CharacterController, type CharacterControllerOptions } from './CharacterController';
export { Raycaster, Raycaster as Raycast, type RaycastHit, type RaycastOptions } from './Raycast';
export { Joint, type JointType, type JointOptions } from './Joint';
export { PhysicsRuntimeBridge, physicsRuntimeBridge } from './physicsRuntimeBridge';
