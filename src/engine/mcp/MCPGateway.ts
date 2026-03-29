// ============================================
// MCP Gateway - Model Context Protocol Integration
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// Version: 2.0 - Force rebuild
// ============================================

import { v4 as uuidv4 } from 'uuid';
import { ToolRegistry, ToolExecutor } from '../command/tools/ToolRegistry';
import { createToolRegistry } from '../command/tools';
import { CommandBus, DefaultLogger, DefaultEventBus } from '../command/bus/CommandBus';
import type {
  MCPToolCall,
  MCPToolResult,
  MCPContext,
  EngineStateSnapshot,
  ProjectTreeNode,
  ExecutionConstraints,
  ProjectMemory,
  Decision,
  TaskGraph,
  TaskNode,
  CommandContext,
} from '../command/types';
import { useEngineStore } from '@/store/editorStore';
import type { CommandPermission } from '../command/types';

// ============================================
// MCP Gateway Configuration
// ============================================

export interface MCPGatewayConfig {
  maxConcurrentCalls: number;
  defaultTimeout: number;
  enableAuditLog: boolean;
  permissions: Set<string>;
}

const DEFAULT_CONFIG: MCPGatewayConfig = {
  maxConcurrentCalls: 10,
  defaultTimeout: 30000,
  enableAuditLog: true,
  permissions: new Set(['read', 'write', 'delete', 'export', 'import']),
};

// ============================================
// MCP Gateway - Main Interface for MLL
// ============================================

export class MCPGateway {
  private registry: ToolRegistry;
  private executor: ToolExecutor;
  private commandBus: CommandBus;
  private config: MCPGatewayConfig;
  private auditLog: MCPAuditEntry[] = [];
  private projectMemory: ProjectMemory;
  private logger: DefaultLogger;
  private eventBus: DefaultEventBus;

  constructor(
    registry: ToolRegistry,
    config: Partial<MCPGatewayConfig> = {}
  ) {
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new DefaultLogger('[MCPGateway]');
    this.eventBus = new DefaultEventBus();
    this.commandBus = new CommandBus(this.logger, this.eventBus);
    this.executor = new ToolExecutor(registry);
    
    this.projectMemory = {
      style: '',
      targetAudience: '',
      genre: '',
      artStyle: '',
      previousDecisions: [],
    };
  }

  // ============================================
  // Tool Discovery
  // ============================================

  getAvailableTools(): MCPToolInfo[] {
    return this.registry.getMCPTools();
  }

  getToolSchema(toolName: string): MCPToolInfo | undefined {
    const tool = this.registry.get(toolName);
    if (!tool) return undefined;
    
    return {
      name: tool.schema.fullName,
      description: tool.schema.description,
      parameters: this.registry.getMCPTools().find(t => t.name === toolName)?.parameters || {},
    };
  }

  // ============================================
  // Context Management
  // ============================================

  getContext(): MCPContext {
    return {
      availableTools: this.registry.getSchemas(),
      engineState: this.getEngineState(),
      projectTree: this.getProjectTree(),
      constraints: this.getConstraints(),
      memory: this.projectMemory,
    };
  }

  getEngineState(): EngineStateSnapshot {
    const store = useEngineStore.getState();
    return {
      version: '1.0.0',
      fps: store.profiler.fps,
      frameTime: store.profiler.frameTime,
      gpuMemory: store.profiler.memory.used,
      systemMemory: 0,
      openSceneId: store.activeSceneId,
      selectedEntityIds: store.editor.selectedEntities,
      activeTool: store.editor.tool,
      aiMode: store.aiMode,
    };
  }

  getProjectTree(): ProjectTreeNode {
    const store = useEngineStore.getState();
    
    return {
      type: 'folder',
      name: 'Project',
      path: '/',
      children: [
        {
          type: 'folder',
          name: 'Scenes',
          path: '/Scenes',
          children: store.scenes.map(s => ({
            type: 'scene' as const,
            name: s.name,
            path: `/Scenes/${s.name}`,
            metadata: { id: s.id },
          })),
        },
        {
          type: 'folder',
          name: 'Assets',
          path: '/Assets',
          children: [
            {
              type: 'folder',
              name: 'Meshes',
              path: '/Assets/Meshes',
              children: store.assets.filter(a => a.type === 'mesh').map(a => ({
                type: 'asset' as const,
                name: a.name,
                path: `/Assets/Meshes/${a.name}`,
                metadata: a.metadata,
              })),
            },
            {
              type: 'folder',
              name: 'Materials',
              path: '/Assets/Materials',
              children: store.assets.filter(a => a.type === 'material').map(a => ({
                type: 'asset' as const,
                name: a.name,
                path: `/Assets/Materials/${a.name}`,
                metadata: a.metadata,
              })),
            },
            {
              type: 'folder',
              name: 'Modifier Presets',
              path: '/Assets/ModifierPresets',
              children: store.assets.filter(a => a.type === 'modifier_preset').map(a => ({
                type: 'asset' as const,
                name: a.name,
                path: `/Assets/ModifierPresets/${a.name}`,
                metadata: a.metadata,
              })),
            },
          ],
        },
      ],
    };
  }

  getConstraints(): ExecutionConstraints {
    return {
      targetFps: 60,
      targetResolution: { width: 1920, height: 1080 },
      maxMemoryMB: 2048,
      allowedExternalAssets: false,
      platforms: ['windows', 'linux', 'macos', 'web'],
    };
  }

  // ============================================
  // Tool Execution
  // ============================================

  async executeToolCall(toolCall: MCPToolCall): Promise<MCPToolResult> {
    const startTime = Date.now();
    const auditId = uuidv4();

    // Create context
    const ctx = this.createContext();

    // Log call
    if (this.config.enableAuditLog) {
      this.auditLog.push({
        id: auditId,
        timestamp: startTime,
        toolCall,
        status: 'started',
      });
    }

    try {
      const result = await this.executor.execute(toolCall, ctx);

      // Update audit log
      if (this.config.enableAuditLog) {
        const entry = this.auditLog.find(e => e.id === auditId);
        if (entry) {
          entry.status = result.status;
          entry.duration = Date.now() - startTime;
          entry.result = result.result;
        }
      }

      // Record decision
      this.recordDecision(toolCall.name, JSON.stringify(toolCall.arguments), result);

      return result;

    } catch (error) {
      // Update audit log
      if (this.config.enableAuditLog) {
        const entry = this.auditLog.find(e => e.id === auditId);
        if (entry) {
          entry.status = 'error';
          entry.duration = Date.now() - startTime;
          entry.error = String(error);
        }
      }

      return {
        toolCallId: toolCall.id,
        status: 'error',
        error: String(error),
      };
    }
  }

  async executeToolCalls(toolCalls: MCPToolCall[]): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = [];

    for (const call of toolCalls) {
      const result = await this.executeToolCall(call);
      results.push(result);

      // Stop on error unless continue on error
      if (result.status === 'error') {
        break;
      }
    }

    return results;
  }

  // ============================================
  // Transaction Support
  // ============================================

  async beginTransaction(name: string): Promise<string> {
    const transaction = this.commandBus.beginTransaction(name);
    return transaction.id;
  }

  async commitTransaction(): Promise<void> {
    await this.commandBus.commitTransaction();
  }

  async rollbackTransaction(): Promise<void> {
    await this.commandBus.rollbackTransaction();
  }

  // ============================================
  // Undo/Redo Support
  // ============================================

  async undo(steps: number = 1): Promise<void> {
    await this.commandBus.undo(steps);
  }

  async redo(steps: number = 1): Promise<void> {
    await this.commandBus.redo(steps);
  }

  // ============================================
  // Task Graph Execution
  // ============================================

  async executeTaskGraph(taskGraph: TaskGraph): Promise<TaskGraph> {
    const ctx = this.createContext();

    // Sort tasks by dependencies (topological sort)
    const sortedNodes = this.sortTasksByDependencies(taskGraph.nodes);

    taskGraph.status = 'executing';

    for (const node of sortedNodes) {
      if (node.status !== 'pending' && node.status !== 'ready') {
        continue;
      }

      taskGraph.currentNodeId = node.id;
      node.status = 'executing';

      try {
        const result = await this.executeToolCall({
          id: uuidv4(),
          name: node.tool,
          arguments: node.params,
        });

        if (result.status === 'success') {
          node.status = 'completed';
          node.result = result.result;
        } else {
          node.status = 'failed';
          node.error = result.error;
          
          // Stop on error
          taskGraph.status = 'failed';
          break;
        }
      } catch (error) {
        node.status = 'failed';
        node.error = String(error);
        taskGraph.status = 'failed';
        break;
      }
    }

    if (taskGraph.status === 'executing') {
      taskGraph.status = 'completed';
    }

    return taskGraph;
  }

  private sortTasksByDependencies(nodes: TaskNode[]): TaskNode[] {
    const sorted: TaskNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (node: TaskNode) => {
      if (visited.has(node.id)) return;
      if (visiting.has(node.id)) {
        throw new Error(`Circular dependency detected at node ${node.id}`);
      }

      visiting.add(node.id);

      // Visit dependencies first
      for (const depId of node.dependencies) {
        const depNode = nodes.find(n => n.id === depId);
        if (depNode) {
          visit(depNode);
        }
      }

      visiting.delete(node.id);
      visited.add(node.id);
      sorted.push(node);
    };

    for (const node of nodes) {
      visit(node);
    }

    return sorted;
  }

  // ============================================
  // Memory & Learning
  // ============================================

  updateProjectMemory(updates: Partial<ProjectMemory>): void {
    this.projectMemory = { ...this.projectMemory, ...updates };
  }

  recordDecision(action: string, params: string, result: MCPToolResult): void {
    this.projectMemory.previousDecisions.push({
      timestamp: Date.now(),
      prompt: params,
      action,
      result: JSON.stringify(result),
    });

    // Keep only last 100 decisions
    if (this.projectMemory.previousDecisions.length > 100) {
      this.projectMemory.previousDecisions = this.projectMemory.previousDecisions.slice(-100);
    }
  }

  // ============================================
  // Audit Log
  // ============================================

  getAuditLog(limit: number = 100): MCPAuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  exportAuditLog(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  // ============================================
  // Helper Methods
  // ============================================

  private createContext(): CommandContext {
    const perms = useEngineStore.getState().automationPermissions;
    const allowed = new Set<CommandPermission>();
    if (perms.mcp_tool?.allowed) {
      allowed.add('read');
      allowed.add('write');
    }
    if (perms.asset_delete?.allowed) allowed.add('delete');
    if (perms.build_project?.allowed) allowed.add('export');
    allowed.add('import'); // baseline
    return {
      engineState: this.getEngineState(),
      sessionId: uuidv4(),
      timestamp: Date.now(),
      eventBus: this.eventBus,
      logger: this.logger,
      permissions: allowed,
    };
  }
}

// ============================================
// Types
// ============================================

export interface MCPToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface MCPAuditEntry {
  id: string;
  timestamp: number;
  toolCall: MCPToolCall;
  status: 'started' | 'success' | 'error';
  duration?: number;
  result?: unknown;
  error?: string;
}

// ============================================
// Singleton Instance
// ============================================

let gatewayInstance: MCPGateway | null = null;

export function getMCPGateway(): MCPGateway {
  if (!gatewayInstance) {
    const registry = createToolRegistry();
    gatewayInstance = new MCPGateway(registry);
  }
  return gatewayInstance;
}

export function initializeMCPGateway(registry: ToolRegistry): MCPGateway {
  gatewayInstance = new MCPGateway(registry);
  return gatewayInstance;
}
