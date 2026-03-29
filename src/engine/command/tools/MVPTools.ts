// ============================================
// MVP Pack Tools - Essential Tools
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { z } from 'zod';
import { createTool } from './ToolRegistry';
import type { ToolDefinition } from '../types';
import { useEngineStore } from '@/store/editorStore';

// ============================================
// Tool Namespace Constants
// ============================================

export const TOOL_NAMESPACES = {
  TOOL: 'tool',
  SCENE: 'scene',
  ENTITY: 'entity',
  ASSET: 'asset',
  MODEL: 'model',
  ANIM: 'anim',
  PHYS: 'phys',
  VFX: 'vfx',
  WATER: 'water',
  AI: 'ai',
  NET: 'net',
  BUILD: 'build',
  DEBUG: 'debug',
  RENDER: 'render',
  GAME: 'game',
  UI: 'ui',
  AUDIO: 'audio',
  MOUNT: 'mount',
  GEN: 'gen',
} as const;

// ============================================
// TOOL Namespace - Context & Query Tools
// ============================================

export const tool_getEngineState = createTool()
  .namespace('tool')
  .name('get_engine_state')
  .description('Get current engine state including version, FPS, GPU, memory, and open scene')
  .parameters(z.object({}))
  .permission('read')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (_, ctx) => ({
    success: true,
    data: ctx.engineState,
    duration: 1,
    sideEffects: [],
  }))
  .build();

export const tool_getProjectTree = createTool()
  .namespace('tool')
  .name('get_project_tree')
  .description('Get project folder structure including assets, scenes, and scripts')
  .parameters(z.object({
    path: z.string().optional().describe('Path to list (default: root)'),
    depth: z.number().optional().describe('Depth of tree to return'),
  }))
  .permission('read')
  .cost({ cpu: 5, gpu: 0, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    const { assets, scenes } = useEngineStore.getState();

    const byType = (type: string) =>
      assets
        .filter((a) => a.type === type)
        .map((a) => ({
          type: 'asset' as const,
          name: a.name,
          path: `/Assets/${type}/${a.name}`,
          metadata: a.metadata,
        }));

    const tree = {
      type: 'folder' as const,
      name: 'Project',
      path: '/',
      children: [
        {
          type: 'folder' as const,
          name: 'Scenes',
          path: '/Scenes',
          children: scenes.map(s => ({
            type: 'scene' as const,
            name: s.name,
            path: `/Scenes/${s.name}`,
            metadata: { id: s.id },
          })),
        },
        {
          type: 'folder' as const,
          name: 'Assets',
          path: '/Assets',
          children: [
            { type: 'folder' as const, name: 'mesh', path: '/Assets/mesh', children: byType('mesh') },
            { type: 'folder' as const, name: 'texture', path: '/Assets/texture', children: byType('texture') },
            { type: 'folder' as const, name: 'material', path: '/Assets/material', children: byType('material') },
            { type: 'folder' as const, name: 'script', path: '/Assets/script', children: byType('script') },
          ],
        },
      ],
    };

    return {
      success: true,
      data: tree,
      duration: 10,
      sideEffects: [],
    };
  })
  .build();

export const tool_searchAssets = createTool()
  .namespace('tool')
  .name('search_assets')
  .description('Search for assets by name, type, or tags')
  .parameters(z.object({
    query: z.string().describe('Search query'),
    type: z.enum(['mesh', 'texture', 'material', 'script', 'audio', 'prefab', 'all']).optional(),
    limit: z.number().optional(),
  }))
  .permission('read')
  .cost({ cpu: 5, gpu: 0, memory: 0, time: 5, risk: 'low' })
  .executor(async (params) => {
    const { assets } = useEngineStore.getState();
    const query = params.query.toLowerCase();
    
    const results = assets.filter(asset => {
      const matchesQuery = asset.name.toLowerCase().includes(query);
      const matchesType = params.type === 'all' || params.type === undefined || asset.type === params.type;
      return matchesQuery && matchesType;
    }).slice(0, params.limit || 50);

    return {
      success: true,
      data: { results, total: results.length },
      duration: 5,
      sideEffects: [],
    };
  })
  .build();

export const tool_getSelection = createTool()
  .namespace('tool')
  .name('get_selection')
  .description('Get currently selected entities in the editor')
  .parameters(z.object({}))
  .permission('read')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (_) => {
    const { editor, entities } = useEngineStore.getState();
    const selectedEntities = editor.selectedEntities.map(id => entities.get(id)).filter(Boolean);
    
    return {
      success: true,
      data: {
        entityIds: editor.selectedEntities,
        entities: selectedEntities,
      },
      duration: 1,
      sideEffects: [],
    };
  })
  .build();

export const tool_setSelection = createTool()
  .namespace('tool')
  .name('set_selection')
  .description('Set the current selection in the editor')
  .parameters(z.object({
    entityIds: z.array(z.string()).describe('Entity IDs to select'),
    mode: z.enum(['replace', 'add', 'remove']).optional().default('replace'),
  }))
  .permission('write')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (params) => {
    const { selectEntity, clearSelection } = useEngineStore.getState();
    
    if (params.mode === 'replace') {
      clearSelection();
      params.entityIds.forEach(id => selectEntity(id, true));
    } else if (params.mode === 'add') {
      params.entityIds.forEach(id => selectEntity(id, true));
    } else if (params.mode === 'remove') {
      const current = useEngineStore.getState().editor.selectedEntities;
      const remaining = current.filter(id => !params.entityIds.includes(id));
      useEngineStore.setState((state) => ({
        editor: { ...state.editor, selectedEntities: remaining },
      }));
    }

    return {
      success: true,
      data: { selectedCount: params.entityIds.length },
      duration: 1,
      sideEffects: [{ type: 'selection_changed', description: 'Selection updated' }],
      undoData: { previousSelection: useEngineStore.getState().editor.selectedEntities },
    };
  })
  .build();

export const tool_getViewportCamera = createTool()
  .namespace('tool')
  .name('get_viewport_camera')
  .description('Get current viewport camera position and settings')
  .parameters(z.object({}))
  .permission('read')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (_) => {
    const { entities } = useEngineStore.getState();
    const camera = Array.from(entities.values()).find(e => e.components.get('Camera'));
    const transform = camera?.components.get('Transform');
    const camData = camera?.components.get('Camera')?.data as Record<string, unknown> | undefined;

    return {
      success: true,
      data: camera ? {
        entityId: camera.id,
        position: (transform?.data as any)?.position ?? { x: 0, y: 0, z: 0 },
        rotation: (transform?.data as any)?.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
        fov: typeof camData?.fov === 'number' ? camData.fov : 60,
        near: typeof camData?.near === 'number' ? camData.near : 0.1,
        far: typeof camData?.far === 'number' ? camData.far : 1000,
        orthographic: !!camData?.orthographic,
      } : {
        position: { x: 10, y: 10, z: 10 },
        target: { x: 0, y: 0, z: 0 },
        fov: 60,
        near: 0.1,
        far: 1000,
        orthographic: false,
      },
      duration: 1,
      sideEffects: [],
    };
  })
  .build();

// ============================================
// TOOL Namespace - Transaction Tools
// ============================================

export const tool_beginTransaction = createTool()
  .namespace('tool')
  .name('begin_transaction')
  .description('Start a new transaction for batching commands')
  .parameters(z.object({
    name: z.string().describe('Transaction name'),
  }))
  .permission('write')
  .cost({ cpu: 1, gpu: 0, memory: 1, time: 1, risk: 'low' })
  .executor(async (params, ctx) => {
    // Transaction is handled by CommandBus
    return {
      success: true,
      data: { transactionName: params.name, started: true },
      duration: 1,
      sideEffects: [{ type: 'transaction_started', description: `Transaction '${params.name}' started` }],
    };
  })
  .build();

export const tool_commitTransaction = createTool()
  .namespace('tool')
  .name('commit_transaction')
  .description('Commit the current transaction, applying all changes')
  .parameters(z.object({}))
  .permission('write')
  .cost({ cpu: 5, gpu: 0, memory: 0, time: 10, risk: 'low' })
  .executor(async (_) => {
    return {
      success: true,
      data: { committed: true },
      duration: 10,
      sideEffects: [{ type: 'transaction_committed', description: 'Transaction committed' }],
    };
  })
  .build();

export const tool_rollbackTransaction = createTool()
  .namespace('tool')
  .name('rollback_transaction')
  .description('Rollback the current transaction, undoing all changes')
  .parameters(z.object({}))
  .permission('write')
  .cost({ cpu: 5, gpu: 0, memory: 0, time: 20, risk: 'medium' })
  .executor(async (_) => {
    return {
      success: true,
      data: { rolledBack: true },
      duration: 20,
      sideEffects: [{ type: 'transaction_rolled_back', description: 'Transaction rolled back' }],
    };
  })
  .build();

export const tool_createCheckpoint = createTool()
  .namespace('tool')
  .name('create_checkpoint')
  .description('Create a checkpoint within the current transaction for partial rollback')
  .parameters(z.object({
    label: z.string().describe('Checkpoint label'),
  }))
  .permission('write')
  .cost({ cpu: 3, gpu: 0, memory: 5, time: 5, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { checkpointLabel: params.label, created: true },
      duration: 5,
      sideEffects: [{ type: 'checkpoint_created', description: `Checkpoint '${params.label}' created` }],
    };
  })
  .build();

// ============================================
// TOOL Namespace - Logging Tools
// ============================================

export const tool_log = createTool()
  .namespace('tool')
  .name('log')
  .description('Log a message to the engine console')
  .parameters(z.object({
    message: z.string().describe('Message to log'),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
  }))
  .permission('read')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (params, ctx) => {
    ctx.logger[params.level](params.message);
    return {
      success: true,
      data: { logged: true },
      duration: 1,
      sideEffects: [],
    };
  })
  .build();

export const tool_openTask = createTool()
  .namespace('tool')
  .name('open_task')
  .description('Start a new task for progress tracking')
  .parameters(z.object({
    title: z.string().describe('Task title'),
    description: z.string().optional(),
  }))
  .permission('read')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (params) => {
    const taskId = `task_${Date.now()}`;
    return {
      success: true,
      data: { taskId, title: params.title },
      duration: 1,
      sideEffects: [{ type: 'task_opened', description: `Task '${params.title}' started` }],
    };
  })
  .build();

export const tool_updateTask = createTool()
  .namespace('tool')
  .name('update_task')
  .description('Update task progress')
  .parameters(z.object({
    taskId: z.string(),
    progress: z.number().min(0).max(100),
    status: z.string().optional(),
  }))
  .permission('read')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { taskId: params.taskId, progress: params.progress },
      duration: 1,
      sideEffects: [],
    };
  })
  .build();

export const tool_closeTask = createTool()
  .namespace('tool')
  .name('close_task')
  .description('Close a task')
  .parameters(z.object({
    taskId: z.string(),
    status: z.enum(['completed', 'failed', 'cancelled']),
  }))
  .permission('read')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { taskId: params.taskId, status: params.status },
      duration: 1,
      sideEffects: [{ type: 'task_closed', description: `Task ${params.status}` }],
    };
  })
  .build();

// ============================================
// Export All MVP Tools
// ============================================

export const MVP_TOOLS: ToolDefinition[] = [
  // Context & Query
  tool_getEngineState,
  tool_getProjectTree,
  tool_searchAssets,
  tool_getSelection,
  tool_setSelection,
  tool_getViewportCamera,
  
  // Transactions
  tool_beginTransaction,
  tool_commitTransaction,
  tool_rollbackTransaction,
  tool_createCheckpoint,
  
  // Logging
  tool_log,
  tool_openTask,
  tool_updateTask,
  tool_closeTask,
];
