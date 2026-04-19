import {
  createAgenticId,
  type JsonObject,
  type ToolCall,
  type ToolDefinition,
  type ToolEvidenceContract,
  type ToolExecutionContext,
  type ToolResult,
} from '../schemas';

function failureResult(
  call: ToolCall,
  startedAt: string,
  code: string,
  message: string,
  recoverable = true
): ToolResult {
  return {
    callId: call.id,
    toolName: call.toolName,
    success: false,
    message,
    evidence: [],
    error: {
      code,
      message,
      recoverable,
    },
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

function contractFailureResult(call: ToolCall, result: ToolResult, message: string): ToolResult {
  return {
    ...result,
    callId: result.callId || call.id,
    toolName: result.toolName || call.toolName,
    success: false,
    message,
    error: {
      code: 'MUTATING_TOOL_EVIDENCE_CONTRACT_FAILED',
      message,
      recoverable: true,
    },
    completedAt: new Date().toISOString(),
  };
}

function requiresMutationEvidence(tool: ToolDefinition): boolean {
  return tool.mutatesWorld && tool.evidenceContract === 'before_after';
}

function isToolEvidenceContract(value: unknown): value is ToolEvidenceContract {
  return value === 'before_after' || value === 'none';
}

function getToolContractError(tool: ToolDefinition): string | null {
  const rawTool = tool as {
    name?: unknown;
    mutatesWorld?: unknown;
    evidenceContract?: unknown;
  };
  const toolName = typeof rawTool.name === 'string' ? rawTool.name : '(unnamed tool)';

  if (typeof rawTool.mutatesWorld !== 'boolean') {
    return `Tool ${toolName} must declare mutatesWorld as a boolean.`;
  }
  if (!isToolEvidenceContract(rawTool.evidenceContract)) {
    return `Tool ${toolName} must declare evidenceContract as before_after or none.`;
  }
  if (rawTool.mutatesWorld && rawTool.evidenceContract !== 'before_after') {
    return `Tool ${toolName} has incompatible evidence contract: mutating tools require before_after.`;
  }
  if (!rawTool.mutatesWorld && rawTool.evidenceContract !== 'none') {
    return `Tool ${toolName} has incompatible evidence contract: consultative tools require none.`;
  }

  return null;
}

function missingBeforeAfterEvidence(result: ToolResult): string[] {
  if (result.evidence.length === 0) {
    return ['(no evidence)'];
  }
  return result.evidence
    .filter((item) => item.before === undefined || item.after === undefined)
    .map((item) => item.id || item.summary || item.type);
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    const contractError = getToolContractError(tool);
    if (contractError) {
      throw new Error(`TOOL_EVIDENCE_CONTRACT_INVALID: ${contractError}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listByCapability(capability: string): ToolDefinition[] {
    return this.list().filter((tool) => tool.capabilities.includes(capability));
  }

  async execute(
    call: ToolCall,
    context: Omit<ToolExecutionContext, 'call'>
  ): Promise<ToolResult> {
    const startedAt = new Date().toISOString();
    const tool = this.get(call.toolName);

    context.trace.write({
      pipelineId: context.pipelineId,
      iteration: context.iteration,
      eventType: 'tool.called',
      severity: 'info',
      actor: context.agentRole,
      stepId: context.stepId,
      toolCallId: call.id,
      message: `Calling tool ${call.toolName}.`,
      data: call.input,
    });

    if (!tool) {
      const result = failureResult(
        call,
        startedAt,
        'TOOL_NOT_FOUND',
        `Tool not found: ${call.toolName}`
      );
      context.trace.write({
        pipelineId: context.pipelineId,
        iteration: context.iteration,
        eventType: 'tool.failed',
        severity: 'error',
        actor: context.agentRole,
        stepId: context.stepId,
        toolCallId: call.id,
        message: result.message,
      });
      return result;
    }
    const contractError = getToolContractError(tool);
    if (contractError) {
      const result = failureResult(call, startedAt, 'TOOL_EVIDENCE_CONTRACT_INVALID', contractError, false);
      context.trace.write({
        pipelineId: context.pipelineId,
        iteration: context.iteration,
        eventType: 'tool.failed',
        severity: 'error',
        actor: context.agentRole,
        stepId: context.stepId,
        toolCallId: call.id,
        message: result.message,
      });
      return result;
    }

    try {
      const result = await tool.execute(call.input as JsonObject, {
        ...context,
        stepId: call.stepId,
        agentRole: call.agentRole,
        call,
      });
      const completed = {
        ...result,
        callId: result.callId || call.id,
        toolName: result.toolName || call.toolName,
        mutatesWorld: tool.mutatesWorld,
        evidenceContract: tool.evidenceContract,
      };
      const missingEvidence = completed.success && requiresMutationEvidence(tool)
        ? missingBeforeAfterEvidence(completed)
        : [];
      const contractChecked =
        missingEvidence.length > 0
          ? contractFailureResult(
              call,
              completed,
              `Mutating tool ${call.toolName} returned evidence without before/after: ${missingEvidence.join(', ')}.`
            )
          : completed;
      const traceData: JsonObject = {
        evidenceIds: contractChecked.evidence.map((item) => item.id),
        mutatesWorld: tool.mutatesWorld,
        evidenceContract: tool.evidenceContract,
      };
      if (missingEvidence.length > 0) {
        traceData.evidenceContract = {
          required: 'before_after',
          missingEvidenceIds: missingEvidence,
        };
      }

      context.trace.write({
        pipelineId: context.pipelineId,
        iteration: context.iteration,
        eventType: contractChecked.success ? 'tool.completed' : 'tool.failed',
        severity: contractChecked.success ? 'info' : 'error',
        actor: context.agentRole,
        stepId: context.stepId,
        toolCallId: call.id,
        message: contractChecked.message,
        data: traceData,
      });

      return contractChecked;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool error';
      const result = failureResult(call, startedAt, 'TOOL_EXCEPTION', message);
      context.trace.write({
        pipelineId: context.pipelineId,
        iteration: context.iteration,
        eventType: 'tool.failed',
        severity: 'error',
        actor: context.agentRole,
        stepId: context.stepId,
        toolCallId: call.id,
        message,
      });
      return result;
    }
  }
}

export function createToolCall(
  toolName: string,
  agentRole: ToolCall['agentRole'],
  stepId: string,
  input: JsonObject
): ToolCall {
  return {
    id: createAgenticId('tool_call'),
    toolName,
    agentRole,
    stepId,
    input,
  };
}
