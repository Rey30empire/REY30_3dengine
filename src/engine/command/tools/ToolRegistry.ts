// ============================================
// Tool Registry - Tool Calling System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type {
  ToolSchema,
  ToolDefinition,
  Command,
  CommandResult,
  CommandContext,
  CommandPermission,
  ValidationResult,
  ResourceCost,
  MCPToolCall,
  MCPToolResult,
} from '../types';

// ============================================
// Base Tool Class
// ============================================

export abstract class BaseTool<TParams = unknown, TResult = unknown> implements ToolDefinition<TParams, TResult> {
  abstract schema: ToolSchema;

  async validate(params: TParams, ctx: CommandContext): Promise<ValidationResult> {
    try {
      this.schema.parameters.parse(params);
      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(e => ({
            code: 'VALIDATION_ERROR',
            message: e.message,
            path: e.path.join('.'),
          })),
          warnings: [],
        };
      }
      return {
        valid: false,
        errors: [{ code: 'UNKNOWN_ERROR', message: String(error) }],
        warnings: [],
      };
    }
  }

  abstract execute(params: TParams, ctx: CommandContext): Promise<CommandResult<TResult>>;

  async undo?(params: TParams, undoData: unknown, ctx: CommandContext): Promise<void>;

  createCommand(params: TParams): Command<TParams> {
    return {
      type: this.schema.fullName,
      id: uuidv4(),
      params,
      permission: this.schema.permission,
      category: this.schema.namespace,
      description: this.schema.description,
      
      validate: async (ctx) => this.validate(params, ctx),
      execute: async (ctx) => this.execute(params, ctx),
      undo: async (ctx, undoData) => {
        if (this.undo) {
          await this.undo(params, undoData, ctx);
        }
      },
      serialize: () => ({
        type: this.schema.fullName,
        id: uuidv4(),
        params,
        timestamp: Date.now(),
      }),
      costEstimate: () => this.schema.cost,
    };
  }
}

// ============================================
// Tool Registry
// ============================================

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  register(tool: ToolDefinition): void {
    const name = tool.schema.fullName;
    this.tools.set(name, tool);

    // Add to category
    const category = tool.schema.namespace;
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(name);
  }

  unregister(name: string): void {
    const tool = this.tools.get(name);
    if (tool) {
      this.tools.delete(name);
      this.categories.get(tool.schema.namespace)?.delete(name);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getByCategory(category: string): ToolDefinition[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names).map(name => this.tools.get(name)!).filter(Boolean);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getSchemas(): ToolSchema[] {
    return this.getAll().map(t => t.schema);
  }

  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  // MCP Integration
  getMCPTools(): MCPToolInfo[] {
    return this.getAll().map(tool => ({
      name: tool.schema.fullName,
      description: tool.schema.description,
      parameters: this.zodToJSONSchema(tool.schema.parameters),
    }));
  }

  private zodToJSONSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
    // Convert Zod schema to JSON Schema format
    const schema: {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      items?: Record<string, unknown>;
      enum?: string[];
    } = {};

    if (zodType instanceof z.ZodObject) {
      schema.type = 'object';
      schema.properties = {};
      schema.required = [];

      for (const [key, value] of Object.entries(zodType.shape)) {
        schema.properties[key] = this.zodToJSONSchema(value as z.ZodTypeAny);
        // Simple check for optional
        if (!(value instanceof z.ZodOptional)) {
          schema.required.push(key);
        }
      }
    } else if (zodType instanceof z.ZodString) {
      schema.type = 'string';
    } else if (zodType instanceof z.ZodNumber) {
      schema.type = 'number';
    } else if (zodType instanceof z.ZodBoolean) {
      schema.type = 'boolean';
    } else if (zodType instanceof z.ZodArray) {
      schema.type = 'array';
      schema.items = this.zodToJSONSchema((zodType as z.ZodArray<z.ZodTypeAny>).element);
    } else if (zodType instanceof z.ZodOptional) {
      return this.zodToJSONSchema((zodType as z.ZodOptional<z.ZodTypeAny>).unwrap());
    } else if (zodType instanceof z.ZodDefault) {
      return this.zodToJSONSchema((zodType as z.ZodDefault<z.ZodTypeAny>).removeDefault());
    } else if (zodType instanceof z.ZodEnum) {
      schema.type = 'string';
      schema.enum = [...zodType.options] as string[];
    }

    return schema;
  }
}

export interface MCPToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ============================================
// Tool Executor
// ============================================

export class ToolExecutor {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async execute(toolCall: MCPToolCall, ctx: CommandContext): Promise<MCPToolResult> {
    const tool = this.registry.get(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        status: 'error',
        error: `Tool not found: ${toolCall.name}`,
      };
    }

    // Check permissions
    if (!ctx.permissions.has(tool.schema.permission)) {
      return {
        toolCallId: toolCall.id,
        status: 'error',
        error: `Permission denied: ${tool.schema.permission}`,
      };
    }

    // Validate
    const validation = await tool.validate(toolCall.arguments, ctx);
    if (!validation.valid) {
      return {
        toolCallId: toolCall.id,
        status: 'error',
        error: validation.errors.map(e => e.message).join('; '),
      };
    }

    // Execute
    try {
      const result = await tool.execute(toolCall.arguments, ctx);
      return {
        toolCallId: toolCall.id,
        status: result.success ? 'success' : 'error',
        result: result.data,
        error: result.error?.message,
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        status: 'error',
        error: String(error),
      };
    }
  }

  async executeBatch(toolCalls: MCPToolCall[], ctx: CommandContext): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = [];

    for (const call of toolCalls) {
      if (ctx.signal?.aborted) {
        results.push({
          toolCallId: call.id,
          status: 'error',
          error: 'Aborted',
        });
        break;
      }
      results.push(await this.execute(call, ctx));
    }

    return results;
  }
}

// ============================================
// Tool Builder - Fluent API
// ============================================

export class ToolBuilder<TParams = unknown, TResult = unknown> {
  private schema: Partial<ToolSchema> = {};
  private executeFn?: (params: TParams, ctx: CommandContext) => Promise<CommandResult<TResult>>;
  private undoFn?: (params: TParams, undoData: unknown, ctx: CommandContext) => Promise<void>;
  private validateFn?: (params: TParams, ctx: CommandContext) => Promise<ValidationResult>;

  private syncFullName() {
    if (this.schema.namespace && this.schema.name) {
      this.schema.fullName = `${this.schema.namespace}.${this.schema.name}`;
    }
  }

  name(name: string): this {
    this.schema.name = name;
    this.syncFullName();
    return this;
  }

  namespace(ns: string): this {
    this.schema.namespace = ns;
    this.syncFullName();
    return this;
  }

  description(desc: string): this {
    this.schema.description = desc;
    return this;
  }

  parameters<TSchema extends z.ZodTypeAny>(params: TSchema): ToolBuilder<z.infer<TSchema>, TResult> {
    this.schema.parameters = params as z.ZodType<unknown>;
    return this as unknown as ToolBuilder<z.infer<TSchema>, TResult>;
  }

  returns<TSchema extends z.ZodTypeAny>(type: TSchema): ToolBuilder<TParams, z.infer<TSchema>> {
    this.schema.returns = type as z.ZodType<unknown>;
    return this as unknown as ToolBuilder<TParams, z.infer<TSchema>>;
  }

  permission(perm: CommandPermission): this {
    this.schema.permission = perm;
    return this;
  }

  cost(cost: Partial<ResourceCost>): this {
    this.schema.cost = {
      cpu: cost.cpu || 0,
      gpu: cost.gpu || 0,
      memory: cost.memory || 0,
      time: cost.time || 0,
      risk: cost.risk || 'low',
    };
    return this;
  }

  executor(fn: (params: TParams, ctx: CommandContext) => Promise<CommandResult<TResult>>): this {
    this.executeFn = fn;
    return this;
  }

  undoable(fn: (params: TParams, undoData: unknown, ctx: CommandContext) => Promise<void>): this {
    this.undoFn = fn;
    return this;
  }

  validator(fn: (params: TParams, ctx: CommandContext) => Promise<ValidationResult>): this {
    this.validateFn = fn;
    return this;
  }

  build(): ToolDefinition<TParams, TResult> {
    if (!this.schema.name || !this.schema.namespace || !this.schema.parameters || !this.executeFn) {
      throw new Error('Tool requires name, namespace, parameters, and executor');
    }

    const schema: ToolSchema = {
      name: this.schema.name,
      namespace: this.schema.namespace,
      fullName: this.schema.fullName!,
      description: this.schema.description || '',
      parameters: this.schema.parameters as z.ZodType<unknown>,
      returns: this.schema.returns as z.ZodType<unknown>,
      permission: this.schema.permission || 'read',
      cost: this.schema.cost || { cpu: 0, gpu: 0, memory: 0, time: 0, risk: 'low' },
      examples: [],
    };

    const executeFn = this.executeFn;
    const undoFn = this.undoFn;
    const validateFn = this.validateFn;

    return {
      schema,
      validate: async (params: TParams, ctx: CommandContext) => {
        if (validateFn) {
          return validateFn(params, ctx);
        }
        try {
          schema.parameters.parse(params);
          return { valid: true, errors: [], warnings: [] };
        } catch (error) {
          if (error instanceof z.ZodError) {
            return {
              valid: false,
              errors: error.issues.map(e => ({
                code: 'VALIDATION_ERROR',
                message: e.message,
                path: e.path.join('.'),
              })),
              warnings: [],
            };
          }
          return {
            valid: false,
            errors: [{ code: 'UNKNOWN_ERROR', message: String(error) }],
            warnings: [],
          };
        }
      },
      execute: executeFn,
      undo: undoFn,
      createCommand: (params: TParams) => ({
        type: schema.fullName,
        id: uuidv4(),
        params,
        permission: schema.permission,
        category: schema.namespace,
        description: schema.description,
        validate: async (ctx) => validateFn ? validateFn(params, ctx) : { valid: true, errors: [], warnings: [] },
        execute: async (ctx) => executeFn(params, ctx),
        undo: async (ctx, undoData) => undoFn?.(params, undoData, ctx),
        serialize: () => ({ type: schema.fullName, id: uuidv4(), params, timestamp: Date.now() }),
        costEstimate: () => schema.cost,
      }),
    };
  }
}

// Helper function
export function createTool<TParams = unknown, TResult = unknown>(): ToolBuilder<TParams, TResult> {
  return new ToolBuilder<TParams, TResult>();
}
