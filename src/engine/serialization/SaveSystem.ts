// ============================================
// Save System - Serialization, Checkpoints, Auto-save
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';

export interface SaveData {
  version: string;
  timestamp: number;
  playerName?: string;
  scene: SceneSaveData;
  player?: PlayerSaveData;
  settings?: SettingsSaveData;
  custom?: Record<string, any>;
}

export interface SceneSaveData {
  name: string;
  entities: EntitySaveData[];
  environment?: EnvironmentSaveData;
}

export interface EntitySaveData {
  id: string;
  name: string;
  prefabId?: string;
  transform: TransformSaveData;
  components: ComponentSaveData[];
  children?: EntitySaveData[];
}

export interface TransformSaveData {
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion
  scale: [number, number, number];
}

export interface ComponentSaveData {
  type: string;
  data: Record<string, any>;
}

export interface PlayerSaveData {
  health: number;
  maxHealth: number;
  position: [number, number, number];
  inventory: InventoryItemData[];
  stats: Record<string, number>;
  quests: QuestSaveData[];
}

export interface InventoryItemData {
  id: string;
  itemId: string;
  quantity: number;
  slot: number;
}

export interface QuestSaveData {
  id: string;
  state: 'not_started' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  objectives: ObjectiveSaveData[];
}

export interface ObjectiveSaveData {
  id: string;
  completed: boolean;
  progress: number;
}

export interface EnvironmentSaveData {
  timeOfDay: number;
  weather: string;
  season: string;
}

export interface SettingsSaveData {
  audio: Record<string, number>;
  graphics: Record<string, any>;
  controls: Record<string, any>;
  gameplay: Record<string, any>;
}

export interface CheckpointData extends SaveData {
  id: string;
  name: string;
  location: string;
}

/**
 * PlayerPrefs - Simple key-value storage
 */
export class PlayerPrefs {
  private static prefix = 'rey30_';
  
  /**
   * Set a value
   */
  static set(key: string, value: string | number | boolean | object): void {
    if (typeof window === 'undefined') return;
    
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    localStorage.setItem(this.prefix + key, serialized);
  }
  
  /**
   * Get a string value
   */
  static getString(key: string, defaultValue: string = ''): string {
    if (typeof window === 'undefined') return defaultValue;
    return localStorage.getItem(this.prefix + key) || defaultValue;
  }
  
  /**
   * Get a number value
   */
  static getNumber(key: string, defaultValue: number = 0): number {
    if (typeof window === 'undefined') return defaultValue;
    const value = localStorage.getItem(this.prefix + key);
    return value ? parseFloat(value) : defaultValue;
  }
  
  /**
   * Get a boolean value
   */
  static getBool(key: string, defaultValue: boolean = false): boolean {
    if (typeof window === 'undefined') return defaultValue;
    const value = localStorage.getItem(this.prefix + key);
    return value ? value === 'true' : defaultValue;
  }
  
  /**
   * Get an object value
   */
  static getObject<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    const value = localStorage.getItem(this.prefix + key);
    if (!value) return defaultValue;
    
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }
  
  /**
   * Check if key exists
   */
  static has(key: string): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(this.prefix + key) !== null;
  }
  
  /**
   * Delete a key
   */
  static delete(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.prefix + key);
  }
  
  /**
   * Delete all keys
   */
  static deleteAll(): void {
    if (typeof window === 'undefined') return;
    
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }
}

/**
 * Serializer - Convert objects to/from save format
 */
export class Serializer {
  private static version = '1.0.0';
  
  /**
   * Serialize a THREE.Vector3
   */
  static serializeVector3(v: THREE.Vector3): [number, number, number] {
    return [v.x, v.y, v.z];
  }
  
  /**
   * Deserialize a THREE.Vector3
   */
  static deserializeVector3(data: [number, number, number]): THREE.Vector3 {
    return new THREE.Vector3(data[0], data[1], data[2]);
  }
  
  /**
   * Serialize a THREE.Quaternion
   */
  static serializeQuaternion(q: THREE.Quaternion): [number, number, number, number] {
    return [q.x, q.y, q.z, q.w];
  }
  
  /**
   * Deserialize a THREE.Quaternion
   */
  static deserializeQuaternion(data: [number, number, number, number]): THREE.Quaternion {
    return new THREE.Quaternion(data[0], data[1], data[2], data[3]);
  }
  
  /**
   * Serialize a THREE.Euler
   */
  static serializeEuler(e: THREE.Euler): [number, number, number] {
    return [e.x, e.y, e.z];
  }
  
  /**
   * Deserialize a THREE.Euler
   */
  static deserializeEuler(data: [number, number, number]): THREE.Euler {
    return new THREE.Euler(data[0], data[1], data[2]);
  }
  
  /**
   * Serialize Object3D
   */
  static serializeObject3D(obj: THREE.Object3D): EntitySaveData {
    const transform: TransformSaveData = {
      position: this.serializeVector3(obj.position),
      rotation: this.serializeQuaternion(obj.quaternion),
      scale: this.serializeVector3(obj.scale),
    };
    
    const entity: EntitySaveData = {
      id: obj.uuid,
      name: obj.name,
      transform,
      components: [],
    };
    
    // Serialize children
    if (obj.children.length > 0) {
      entity.children = obj.children
        .filter(child => child.type !== 'TransformGizmo') // Skip gizmos
        .map(child => this.serializeObject3D(child));
    }
    
    return entity;
  }
  
  /**
   * Create save data
   */
  static createSaveData(
    sceneData: SceneSaveData,
    playerData?: PlayerSaveData,
    custom?: Record<string, any>
  ): SaveData {
    return {
      version: this.version,
      timestamp: Date.now(),
      scene: sceneData,
      player: playerData,
      custom: custom,
    };
  }
  
  /**
   * Validate save data
   */
  static validateSaveData(data: unknown): data is SaveData {
    if (!data || typeof data !== 'object') return false;
    
    const save = data as SaveData;
    return (
      typeof save.version === 'string' &&
      typeof save.timestamp === 'number' &&
      typeof save.scene === 'object'
    );
  }
}

/**
 * Save System - Main save/load manager
 */
export class SaveSystem {
  private static instance: SaveSystem;
  
  private saves: Map<string, SaveData> = new Map();
  private quickSaveSlot: string = 'quicksave';
  private autoSaveSlot: string = 'autosave';
  private maxAutoSaves: number = 5;
  private autoSaveInterval: number = 300000; // 5 minutes
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private onBeforeSave: (() => SaveData | null) | null = null;
  private onAfterLoad: ((data: SaveData) => void) | null = null;
  
  private constructor() {}
  
  static getInstance(): SaveSystem {
    if (!SaveSystem.instance) {
      SaveSystem.instance = new SaveSystem();
    }
    return SaveSystem.instance;
  }
  
  /**
   * Initialize the save system
   */
  initialize(): void {
    this.loadSaveList();
    this.startAutoSave();
  }
  
  /**
   * Set save callback
   */
  setSaveCallback(callback: () => SaveData | null): void {
    this.onBeforeSave = callback;
  }
  
  /**
   * Set load callback
   */
  setLoadCallback(callback: (data: SaveData) => void): void {
    this.onAfterLoad = callback;
  }
  
  /**
   * Save game to slot
   */
  save(slot: string, data?: SaveData): boolean {
    const saveData = data || this.onBeforeSave?.();
    
    if (!saveData) {
      console.error('[SaveSystem] No save data provided');
      return false;
    }
    
    try {
      const serialized = JSON.stringify(saveData);
      PlayerPrefs.set(`save_${slot}`, serialized);
      this.saves.set(slot, saveData);
      
      console.log(`[SaveSystem] Saved to slot '${slot}'`);
      return true;
    } catch (error) {
      console.error('[SaveSystem] Save failed:', error);
      return false;
    }
  }
  
  /**
   * Load game from slot
   */
  load(slot: string): SaveData | null {
    const saveData = PlayerPrefs.getObject<SaveData>(`save_${slot}`, null as any);
    
    if (!saveData || !Serializer.validateSaveData(saveData)) {
      console.warn(`[SaveSystem] No valid save found in slot '${slot}'`);
      return null;
    }
    
    try {
      this.onAfterLoad?.(saveData);
      console.log(`[SaveSystem] Loaded from slot '${slot}'`);
      return saveData;
    } catch (error) {
      console.error('[SaveSystem] Load failed:', error);
      return null;
    }
  }
  
  /**
   * Quick save
   */
  quickSave(): boolean {
    return this.save(this.quickSaveSlot);
  }
  
  /**
   * Quick load
   */
  quickLoad(): SaveData | null {
    return this.load(this.quickSaveSlot);
  }
  
  /**
   * Auto save
   */
  autoSave(): void {
    const timestamp = Date.now();
    const slotName = `${this.autoSaveSlot}_${timestamp}`;
    
    // Save to timestamped slot
    this.save(slotName);
    
    // Clean up old auto saves
    this.cleanupAutoSaves();
  }
  
  /**
   * Start auto save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(() => {
      this.autoSave();
    }, this.autoSaveInterval);
  }
  
  /**
   * Stop auto save
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
  
  /**
   * Clean up old auto saves
   */
  private cleanupAutoSaves(): void {
    const autoSaveSlots = this.getSaveSlots()
      .filter(slot => slot.startsWith(this.autoSaveSlot))
      .sort((a, b) => {
        const timeA = parseInt(a.split('_')[1]) || 0;
        const timeB = parseInt(b.split('_')[1]) || 0;
        return timeB - timeA;
      });
    
    // Keep only the most recent auto saves
    const toDelete = autoSaveSlots.slice(this.maxAutoSaves);
    toDelete.forEach(slot => this.deleteSave(slot));
  }
  
  /**
   * Delete a save
   */
  deleteSave(slot: string): void {
    PlayerPrefs.delete(`save_${slot}`);
    this.saves.delete(slot);
  }
  
  /**
   * Check if save exists
   */
  hasSave(slot: string): boolean {
    return PlayerPrefs.has(`save_${slot}`);
  }
  
  /**
   * Get all save slots
   */
  getSaveSlots(): string[] {
    const slots: string[] = [];
    
    if (typeof window === 'undefined') return slots;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('rey30_save_')) {
        slots.push(key.replace('rey30_save_', ''));
      }
    }
    
    return slots.sort();
  }
  
  /**
   * Get save metadata
   */
  getSaveMetadata(slot: string): Partial<SaveData> | null {
    const data = PlayerPrefs.getObject<SaveData>(`save_${slot}`, null as any);
    if (!data) return null;
    
    return {
      version: data.version,
      timestamp: data.timestamp,
      playerName: data.playerName,
    };
  }
  
  /**
   * Load save list into memory
   */
  private loadSaveList(): void {
    const slots = this.getSaveSlots();
    slots.forEach(slot => {
      const data = PlayerPrefs.getObject<SaveData>(`save_${slot}`, null as any);
      if (data && Serializer.validateSaveData(data)) {
        this.saves.set(slot, data);
      }
    });
  }
  
  /**
   * Export save to file
   */
  exportSave(slot: string): string | null {
    const data = PlayerPrefs.getString(`save_${slot}`);
    if (!data) return null;
    
    return data;
  }
  
  /**
   * Import save from file
   */
  importSave(slot: string, data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      
      if (!Serializer.validateSaveData(parsed)) {
        throw new Error('Invalid save data format');
      }
      
      PlayerPrefs.set(`save_${slot}`, data);
      this.saves.set(slot, parsed);
      
      return true;
    } catch (error) {
      console.error('[SaveSystem] Import failed:', error);
      return false;
    }
  }
  
  /**
   * Create checkpoint
   */
  createCheckpoint(id: string, name: string, location: string, data?: SaveData): CheckpointData {
    const saveData = data || this.onBeforeSave?.();
    
    if (!saveData) {
      throw new Error('No save data available');
    }
    
    return {
      ...saveData,
      id,
      name,
      location,
    };
  }
  
  /**
   * Get last save timestamp
   */
  getLastSaveTime(): number {
    let lastTime = 0;
    
    this.saves.forEach(save => {
      if (save.timestamp > lastTime) {
        lastTime = save.timestamp;
      }
    });
    
    return lastTime;
  }
  
  /**
   * Format timestamp
   */
  formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }
}

/**
 * Scene State Manager - Manage scene-specific state
 */
export class SceneStateManager {
  private static instance: SceneStateManager;
  private states: Map<string, Map<string, any>> = new Map();
  private currentScene: string = '';
  
  private constructor() {}
  
  static getInstance(): SceneStateManager {
    if (!SceneStateManager.instance) {
      SceneStateManager.instance = new SceneStateManager();
    }
    return SceneStateManager.instance;
  }
  
  /**
   * Set current scene
   */
  setCurrentScene(sceneId: string): void {
    // Save current scene state
    if (this.currentScene) {
      this.saveSceneState(this.currentScene);
    }
    
    this.currentScene = sceneId;
    
    // Load new scene state
    this.loadSceneState(sceneId);
  }
  
  /**
   * Set a value in scene state
   */
  set(key: string, value: any): void {
    if (!this.currentScene) return;
    
    let sceneState = this.states.get(this.currentScene);
    if (!sceneState) {
      sceneState = new Map();
      this.states.set(this.currentScene, sceneState);
    }
    
    sceneState.set(key, value);
  }
  
  /**
   * Get a value from scene state
   */
  get<T>(key: string, defaultValue: T): T {
    if (!this.currentScene) return defaultValue;
    
    const sceneState = this.states.get(this.currentScene);
    if (!sceneState) return defaultValue;
    
    return sceneState.has(key) ? sceneState.get(key) : defaultValue;
  }
  
  /**
   * Check if key exists
   */
  has(key: string): boolean {
    if (!this.currentScene) return false;
    
    const sceneState = this.states.get(this.currentScene);
    return sceneState?.has(key) ?? false;
  }
  
  /**
   * Save scene state to storage
   */
  saveSceneState(sceneId: string): void {
    const sceneState = this.states.get(sceneId);
    if (!sceneState) return;
    
    const obj: Record<string, any> = {};
    sceneState.forEach((value, key) => {
      obj[key] = value;
    });
    
    PlayerPrefs.set(`scene_state_${sceneId}`, obj);
  }
  
  /**
   * Load scene state from storage
   */
  loadSceneState(sceneId: string): void {
    const obj = PlayerPrefs.getObject<Record<string, any>>(`scene_state_${sceneId}`, {});
    
    const sceneState = new Map<string, any>();
    Object.entries(obj).forEach(([key, value]) => {
      sceneState.set(key, value);
    });
    
    this.states.set(sceneId, sceneState);
  }
  
  /**
   * Clear scene state
   */
  clearSceneState(sceneId: string): void {
    this.states.delete(sceneId);
    PlayerPrefs.delete(`scene_state_${sceneId}`);
  }
}

// Export singletons
export const saveSystem = SaveSystem.getInstance();
export const sceneStateManager = SceneStateManager.getInstance();
