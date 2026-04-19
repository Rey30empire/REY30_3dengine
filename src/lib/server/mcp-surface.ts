import { createToolRegistry } from '@/engine/command/tools';
import { getMCPGateway } from '@/engine/mcp/MCPGateway';
import type { MCPToolCall, MCPToolResult } from '@/engine/command/types';
import {
  executeEditorSessionToolCalls,
  getEditorSessionContext,
  resolveEditorSessionRecord,
} from '@/lib/server/editor-session-bridge';

const registry = createToolRegistry();

export const MCP_MINIMUM_ROLE = 'EDITOR';
export const MCP_EXECUTION_MODE = 'server-curated';
export const MCP_GENERATION_DEPRECATED_MESSAGE =
  'La planeación automática por MCP ahora vive dentro del asistente principal.';

const SERVER_EXECUTABLE_TOOL_NAMES = new Set([
  'tool.get_engine_state',
  'tool.get_project_tree',
  'tool.search_assets',
  'tool.get_selection',
  'tool.get_viewport_camera',
  'entity.find_by_name',
]);

const EDITOR_SESSION_TOOL_NAMES = new Set([
  'tool.set_selection',
  'scene.create',
  'scene.open',
  'scene.set_sky',
  'scene.add_fog',
  'scene.set_time_of_day',
  'entity.create',
  'entity.delete',
  'entity.set_transform',
  'entity.add_component',
  'entity.clone',
  'phys.add_collider',
  'phys.add_rigidbody',
  'phys.add_character_controller',
  'render.create_light',
  'game.add_health_component',
]);

const SIMPLE_MCP_TOOL_NAMES = new Set([
  'tool.get_engine_state',
  'tool.get_project_tree',
  'tool.search_assets',
  'tool.get_selection',
]);

type PublicMcpTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  category: string;
  availableInRoute: boolean;
  requiresActiveEditorSession: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toToolCategory(name: string): string {
  const [category] = name.split('.');
  return category || 'tool';
}

function sanitizeToolErrorMessage(message: unknown): string {
  const value = String(message || '');
  if (!value) return 'No se pudo completar la herramienta MCP.';
  if (value.includes('Tool not found')) {
    return 'La herramienta solicitada no está disponible.';
  }
  if (value.includes('Permission denied')) {
    return 'La herramienta no está habilitada para esta sesión.';
  }
  if (
    value.includes('ZodError') ||
    value.includes('VALIDATION_ERROR') ||
    value.includes('Expected')
  ) {
    return 'La solicitud de la herramienta no es válida.';
  }
  if (
    value.includes('TypeError') ||
    value.includes('ReferenceError') ||
    value.includes('SyntaxError')
  ) {
    return 'La herramienta MCP no se pudo ejecutar.';
  }
  return value.length > 240 ? 'La herramienta MCP no se pudo ejecutar.' : value;
}

function toPublicTool(tool: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}): PublicMcpTool {
  const availableInRoute =
    SERVER_EXECUTABLE_TOOL_NAMES.has(tool.name) || EDITOR_SESSION_TOOL_NAMES.has(tool.name);
  return {
    ...tool,
    category: toToolCategory(tool.name),
    availableInRoute,
    requiresActiveEditorSession:
      availableInRoute &&
      !SERVER_EXECUTABLE_TOOL_NAMES.has(tool.name) &&
      EDITOR_SESSION_TOOL_NAMES.has(tool.name),
  };
}

export function listMcpTools(options: { simple?: boolean } = {}): PublicMcpTool[] {
  const tools = registry.getMCPTools().map(toPublicTool);
  if (!options.simple) return tools;
  return tools.filter((tool) => SIMPLE_MCP_TOOL_NAMES.has(tool.name));
}

export function getMcpStats(options: { simple?: boolean } = {}) {
  const tools = listMcpTools(options);
  return {
    total: tools.length,
    categories: [...new Set(tools.map((tool) => tool.category))],
    executableCount: tools.filter((tool) => tool.availableInRoute).length,
    executionMode: MCP_EXECUTION_MODE,
  };
}

export async function getMcpContextSummary(options: {
  userId?: string;
  preferredSessionId?: string | null;
  projectKey?: string | null;
} = {}) {
  if (options.userId) {
    const sessionContext = await getEditorSessionContext({
      userId: options.userId,
      preferredSessionId: options.preferredSessionId,
      projectKey: options.projectKey,
    });
    if (sessionContext.context) {
      const { availableTools: _availableTools, ...context } = sessionContext.context;
      return {
        ...context,
        activeEditorSession: Boolean(sessionContext.session),
      };
    }
  }

  const { availableTools: _availableTools, ...context } = getMCPGateway().getContext();
  return context;
}

export function parseToolCalls(
  payload: unknown
): { ok: true; toolCalls: MCPToolCall[] } | { ok: false; status: number; error: string } {
  if (!isRecord(payload) || !Array.isArray(payload.toolCalls)) {
    return {
      ok: false,
      status: 400,
      error: 'Debes enviar un arreglo toolCalls.',
    };
  }

  const toolCalls: MCPToolCall[] = [];
  for (let index = 0; index < payload.toolCalls.length; index += 1) {
    const rawCall = payload.toolCalls[index];
    if (!isRecord(rawCall) || typeof rawCall.name !== 'string' || !rawCall.name.trim()) {
      return {
        ok: false,
        status: 400,
        error: `La herramienta #${index + 1} no es válida.`,
      };
    }

    if (
      rawCall.arguments !== undefined &&
      !isRecord(rawCall.arguments)
    ) {
      return {
        ok: false,
        status: 400,
        error: `Los argumentos de la herramienta #${index + 1} no son válidos.`,
      };
    }

    toolCalls.push({
      id:
        typeof rawCall.id === 'string' && rawCall.id.trim()
          ? rawCall.id
          : `tool_call_${index + 1}`,
      name: rawCall.name.trim(),
      arguments: isRecord(rawCall.arguments) ? rawCall.arguments : {},
    });
  }

  return { ok: true, toolCalls };
}

function isRouteExecutable(toolName: string): boolean {
  return (
    SERVER_EXECUTABLE_TOOL_NAMES.has(toolName) ||
    EDITOR_SESSION_TOOL_NAMES.has(toolName)
  );
}

function isSimpleTool(toolName: string): boolean {
  return SIMPLE_MCP_TOOL_NAMES.has(toolName);
}

function blockedToolResult(toolCallId: string, error: string): MCPToolResult {
  return {
    toolCallId,
    status: 'error',
    error,
  };
}

function toPublicToolResult(result: MCPToolResult): MCPToolResult {
  if (result.status === 'success') return result;
  return {
    ...result,
    error: sanitizeToolErrorMessage(result.error),
  };
}

export async function executeMcpToolCalls(
  toolCalls: MCPToolCall[],
  options: {
    simple?: boolean;
    userId?: string;
    preferredSessionId?: string | null;
    projectKey?: string | null;
  } = {}
): Promise<MCPToolResult[]> {
  const gateway = getMCPGateway();
  const results: MCPToolResult[] = [];
  const activeSession =
    !options.simple && options.userId
      ? resolveEditorSessionRecord({
          userId: options.userId,
          preferredSessionId: options.preferredSessionId,
          projectKey: options.projectKey,
        })
      : null;

  if (activeSession && options.userId) {
    const executableCalls: MCPToolCall[] = [];

    for (const toolCall of toolCalls) {
      if (options.simple && !isSimpleTool(toolCall.name)) {
        results.push(
          blockedToolResult(
            toolCall.id,
            'La herramienta solicitada no está disponible en MCP simple.'
          )
        );
        continue;
      }

      if (!isRouteExecutable(toolCall.name)) {
        results.push(
          blockedToolResult(
            toolCall.id,
            'La herramienta solicitada no está disponible.'
          )
        );
        continue;
      }

      executableCalls.push(toolCall);
    }

    if (executableCalls.length > 0) {
      const execution = await executeEditorSessionToolCalls({
        userId: options.userId,
        preferredSessionId: activeSession.sessionId,
        projectKey: options.projectKey,
        toolCalls: executableCalls,
      });

      for (const result of execution.results) {
        results.push(toPublicToolResult(result));
      }
    }

    return results;
  }

  for (const toolCall of toolCalls) {
    if (options.simple && !isSimpleTool(toolCall.name)) {
      results.push(
        blockedToolResult(
          toolCall.id,
          'La herramienta solicitada no está disponible en MCP simple.'
        )
      );
      continue;
    }

    if (!isRouteExecutable(toolCall.name)) {
      results.push(
        blockedToolResult(
          toolCall.id,
          'La herramienta solicitada no está disponible.'
        )
      );
      continue;
    }

    if (EDITOR_SESSION_TOOL_NAMES.has(toolCall.name)) {
      results.push(
        blockedToolResult(
          toolCall.id,
          'Esta herramienta requiere una sesión activa del editor.'
        )
      );
      continue;
    }

    const result = await gateway.executeToolCall(toolCall);
    results.push(toPublicToolResult(result));
  }

  return results;
}

export function sanitizeMcpRouteError(error: unknown): string {
  return sanitizeToolErrorMessage(error);
}
