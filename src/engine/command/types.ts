// ============================================
// Command System Types
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { z } from 'zod';

// ============================================
// Command Result Types
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  path?: string;
  value?: unknown;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: CommandError;
  duration: number; // ms
  sideEffects: SideEffect[];
  undoData?: unknown;
}

export interface CommandError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

export interface SideEffect {
  type: string;
  description: string;
  entityId?: string;
  assetId?: string;
  data?: unknown;
}

// ============================================
// Resource Cost Estimation
// ============================================

export interface ResourceCost {
  cpu: number;      // 0-100 scale
  gpu: number;      // 0-100 scale
  memory: number;   // MB estimate
  time: number;     // ms estimate
  risk: 'low' | 'medium' | 'high';
}

// ============================================
// Command Interface
// ============================================

export interface Command<T = unknown, TUndo = unknown> {
  // Unique identifier for this command type
  readonly type: string;
  
  // Unique instance ID
  readonly id: string;
  
  // Command parameters
  readonly params: T;
  
  // Permission required to execute
  readonly permission: CommandPermission;
  
  // Category for grouping
  readonly category: string;
  
  // Human-readable description
  readonly description: string;
  
  // Validate parameters before execution
  validate(ctx: CommandContext): Promise<ValidationResult>;
  
  // Execute the command
  execute(ctx: CommandContext): Promise<CommandResult>;
  
  // Undo the command
  undo(ctx: CommandContext, undoData: TUndo): Promise<void>;
  
  // Serialize for logging/replay
  serialize(): SerializedCommand;
  
  // Estimate resource cost
  costEstimate(): ResourceCost;
}

export interface SerializedCommand {
  type: string;
  id: string;
  params: unknown;
  timestamp: number;
  userId?: string;
  sessionId?: string;
}

// ============================================
// Command Permission
// ============================================

export type CommandPermission = 
  | 'read'           // Can read data
  | 'write'          // Can modify data
  | 'delete'         // Can delete data
  | 'export'         // Can export data
  | 'import'         // Can import data
  | 'network'        // Can make network requests
  | 'filesystem'     // Can access filesystem
  | 'execute'        // Can execute external code
  | 'admin';         // Full access

// ============================================
// Command Context
// ============================================

export interface CommandContext {
  // Engine state access
  engineState: EngineStateSnapshot;
  
  // Current user/session
  userId?: string;
  sessionId: string;
  timestamp: number;
  
  // Transaction context
  transactionId?: string;
  parentCommandId?: string;
  
  // Services
  eventBus: EventBusInterface;
  logger: LoggerInterface;
  
  // Permissions
  permissions: Set<CommandPermission>;
  
  // Abort signal for cancellation
  signal?: AbortSignal;
}

export interface EngineStateSnapshot {
  version: string;
  fps: number;
  frameTime: number;
  gpuMemory: number;
  systemMemory: number;
  openSceneId: string | null;
  selectedEntityIds: string[];
  activeTool: string;
  aiMode: string;
}

export interface EventBusInterface {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): () => void;
}

export interface LoggerInterface {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

// ============================================
// Command Status
// ============================================

export type CommandStatus = 
  | 'pending'
  | 'validating'
  | 'queued'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'undone';

export interface CommandRecord {
  id: string;
  command: SerializedCommand;
  status: CommandStatus;
  result?: CommandResult;
  error?: string;
  startTime: number;
  endTime?: number;
  transactionId?: string;
  checkpoint?: string;
}

// ============================================
// Transaction Types
// ============================================

export interface Transaction {
  id: string;
  name: string;
  status: TransactionStatus;
  commands: CommandRecord[];
  startTime: number;
  endTime?: number;
  checkpoints: Checkpoint[];
  parentTransactionId?: string;
}

export type TransactionStatus = 
  | 'active'
  | 'committed'
  | 'rolled_back'
  | 'failed';

export interface Checkpoint {
  id: string;
  label: string;
  commandIndex: number;
  timestamp: number;
  stateSnapshot: unknown;
}

// ============================================
// Tool Schema Types
// ============================================

export interface ToolSchema {
  name: string;
  namespace: string;
  fullName: string;
  description: string;
  parameters: z.ZodType<unknown>;
  returns: z.ZodType<unknown>;
  permission: CommandPermission;
  cost: ResourceCost;
  examples: ToolExample[];
  deprecated?: boolean;
  replacement?: string;
}

export interface ToolExample {
  description: string;
  params: Record<string, unknown>;
  result: unknown;
}

// ============================================
// Tool Definition
// ============================================

export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  schema: ToolSchema;
  
  // Validate parameters
  validate(params: TParams, ctx: CommandContext): Promise<ValidationResult>;
  
  // Execute the tool
  execute(params: TParams, ctx: CommandContext): Promise<CommandResult<TResult>>;
  
  // Undo if applicable
  undo?(params: TParams, undoData: unknown, ctx: CommandContext): Promise<void>;
  
  // Create command from tool
  createCommand(params: TParams): Command<TParams>;
}

// ============================================
// MCP Types
// ============================================

export interface MCPToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  toolCallId: string;
  status: 'success' | 'error';
  result?: unknown;
  error?: string;
}

export interface MCPContext {
  availableTools: ToolSchema[];
  engineState: EngineStateSnapshot;
  projectTree: ProjectTreeNode;
  constraints: ExecutionConstraints;
  memory: ProjectMemory;
}

export interface ProjectTreeNode {
  type: 'folder' | 'file' | 'asset' | 'scene' | 'script';
  name: string;
  path: string;
  children?: ProjectTreeNode[];
  metadata?: Record<string, unknown>;
}

export interface ExecutionConstraints {
  targetFps: number;
  targetResolution: { width: number; height: number };
  maxMemoryMB: number;
  allowedExternalAssets: boolean;
  platforms: string[];
}

export interface ProjectMemory {
  style: string;
  targetAudience: string;
  genre: string;
  artStyle: string;
  previousDecisions: Decision[];
}

export interface Decision {
  timestamp: number;
  prompt: string;
  action: string;
  result: string;
}

// ============================================
// Task Graph for Game Generation
// ============================================

export interface TaskGraph {
  id: string;
  prompt: string;
  nodes: TaskNode[];
  edges: TaskEdge[];
  status: 'planning' | 'ready' | 'executing' | 'completed' | 'failed';
  currentNodeId?: string;
}

export interface TaskNode {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  status: 'pending' | 'ready' | 'executing' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  dependencies: string[];
}

export interface TaskEdge {
  from: string;
  to: string;
  condition?: string;
}

// ============================================
// History Types
// ============================================

export interface HistoryEntry {
  id: string;
  command: SerializedCommand;
  result: CommandResult;
  timestamp: number;
  undone: boolean;
  label?: string;
}

export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
  maxEntries: number;
}
