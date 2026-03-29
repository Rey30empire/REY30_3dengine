// ============================================
// Entity Component System (ECS) Core
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { v4 as uuidv4 } from 'uuid';
import type { Entity, Component, ComponentType } from '@/types/engine';

// Component Registry
type ComponentConstructor = new (...args: unknown[]) => Component;
const componentRegistry = new Map<ComponentType, ComponentConstructor>();

export function registerComponent(type: ComponentType, componentClass: ComponentConstructor) {
  componentRegistry.set(type, componentClass);
}

export function getComponentClass(type: ComponentType) {
  return componentRegistry.get(type);
}

// Entity Factory
export class EntityFactory {
  static create(name: string = 'Entity'): Entity {
    return {
      id: uuidv4(),
      name,
      components: new Map(),
      children: [],
      parentId: null,
      active: true,
      tags: [],
    };
  }

  static createFromTemplate(template: Partial<Entity>): Entity {
    const entity = this.create(template.name || 'Entity');
    
    if (template.components) {
      template.components.forEach((component, key) => {
        entity.components.set(key, { ...component, id: uuidv4() });
      });
    }
    
    if (template.tags) {
      entity.tags = [...template.tags];
    }
    
    return entity;
  }

  static clone(entity: Entity): Entity {
    const cloned = this.create(`${entity.name}_copy`);
    
    entity.components.forEach((component, key) => {
      cloned.components.set(key, {
        ...component,
        id: uuidv4(),
        data: JSON.parse(JSON.stringify(component.data)),
      });
    });
    
    cloned.tags = [...entity.tags];
    cloned.active = entity.active;
    
    return cloned;
  }
}

// Component Manager
export class ComponentManager {
  private entities: Map<string, Entity> = new Map();

  addEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  removeEntity(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (entity) {
      // Remove from parent
      if (entity.parentId) {
        const parent = this.entities.get(entity.parentId);
        if (parent) {
          parent.children = parent.children.filter(c => c.id !== entityId);
        }
      }
      
      // Remove children recursively
      entity.children.forEach(child => {
        this.removeEntity(child.id);
      });
      
      this.entities.delete(entityId);
    }
  }

  getEntity(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  addComponent(entityId: string, type: ComponentType, data: Record<string, unknown>): Component | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;

    const component: Component = {
      id: uuidv4(),
      type,
      data,
      enabled: true,
    };

    entity.components.set(type, component);
    return component;
  }

  removeComponent(entityId: string, type: ComponentType): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    return entity.components.delete(type);
  }

  getComponent(entityId: string, type: ComponentType): Component | undefined {
    const entity = this.entities.get(entityId);
    if (!entity) return undefined;

    return entity.components.get(type);
  }

  getEntitiesWithComponent(type: ComponentType): Entity[] {
    return this.getAllEntities().filter(e => e.components.has(type));
  }

  updateComponent(entityId: string, type: ComponentType, data: Partial<Record<string, unknown>>): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    const component = entity.components.get(type);
    if (!component) return false;

    component.data = { ...component.data, ...data };
    return true;
  }

  setParent(entityId: string, parentId: string | null): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    // Remove from old parent
    if (entity.parentId) {
      const oldParent = this.entities.get(entity.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(c => c.id !== entityId);
      }
    }

    // Set new parent
    entity.parentId = parentId;

    // Add to new parent
    if (parentId) {
      const newParent = this.entities.get(parentId);
      if (newParent) {
        newParent.children.push(entity);
      }
    }

    return true;
  }

  findByName(name: string): Entity[] {
    return this.getAllEntities().filter(e => e.name.includes(name));
  }

  findByTag(tag: string): Entity[] {
    return this.getAllEntities().filter(e => e.tags.includes(tag));
  }
}

// System Base Class
export abstract class System {
  abstract name: string;
  abstract priority: number;
  abstract requiredComponents: ComponentType[];
  
  protected componentManager: ComponentManager;

  constructor(componentManager: ComponentManager) {
    this.componentManager = componentManager;
  }

  abstract update(deltaTime: number): void;

  getEntities(): Entity[] {
    return this.requiredComponents.reduce((entities, type) => {
      const withComponent = this.componentManager.getEntitiesWithComponent(type);
      if (entities.length === 0) return withComponent;
      return entities.filter(e => withComponent.includes(e));
    }, [] as Entity[]);
  }
}

// Event Bus
type EventCallback = (data: unknown) => void;

export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, data?: unknown): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Global instances
export const eventBus = new EventBus();
export const componentManager = new ComponentManager();

// Transform helper functions
export const TransformUtils = {
  createTransform(position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0, w: 1 }, scale = { x: 1, y: 1, z: 1 }) {
    return { position, rotation, scale };
  },

  setPosition(transform: ReturnType<typeof TransformUtils.createTransform>, x: number, y: number, z: number) {
    transform.position = { x, y, z };
    return transform;
  },

  setRotation(transform: ReturnType<typeof TransformUtils.createTransform>, x: number, y: number, z: number, w: number) {
    transform.rotation = { x, y, z, w };
    return transform;
  },

  setScale(transform: ReturnType<typeof TransformUtils.createTransform>, x: number, y: number, z: number) {
    transform.scale = { x, y, z };
    return transform;
  },

  lookAt(transform: ReturnType<typeof TransformUtils.createTransform>, target: { x: number; y: number; z: number }) {
    // Simple look-at implementation
    const dx = target.x - transform.position.x;
    const dy = target.y - transform.position.y;
    const dz = target.z - transform.position.z;
    
    const yaw = Math.atan2(dz, dx);
    const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    
    // Convert to quaternion (simplified)
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    
    transform.rotation = {
      x: sp * cy,
      y: cp * sy,
      z: -sp * sy,
      w: cp * cy,
    };
    
    return transform;
  },
};
