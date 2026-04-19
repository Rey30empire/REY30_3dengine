import {
  type AgentContext,
  type AgentOutcome,
  type AgentReport,
  type AgentRole,
  type JsonObject,
  type TaskStep,
  type ToolCall,
  type ToolResult,
  type WorldState,
} from '../schemas';

type ScratchValue = string | number | boolean | null;
type Scratch = Record<string, ScratchValue>;

function resolveReferences(value: unknown, scratch: Scratch): unknown {
  if (typeof value === 'string' && value.startsWith('$')) {
    return scratch[value.slice(1)] ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveReferences(item, scratch));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveReferences(item, scratch)])
    );
  }

  return value;
}

function rememberToolOutput(result: ToolResult, scratch: Scratch): void {
  if (!result.output) {
    return;
  }

  const aliases: Record<string, string> = {
    entityId: 'lastEntityId',
    sceneId: 'activeSceneId',
    materialId: 'lastMaterialId',
    scriptId: 'lastScriptId',
    animationId: 'lastAnimationId',
    assetId: 'lastAssetId',
    groupId: 'lastGroupId',
    reportId: 'lastReportId',
  };

  for (const [outputKey, scratchKey] of Object.entries(aliases)) {
    const value = result.output[outputKey];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      scratch[scratchKey] = value;
    }
  }
}

export interface AgenticAgent {
  readonly role: AgentRole;
  readonly purpose: string;
  readonly acceptedDomains: string[];
  readonly allowedTools: string[];
  canHandle(task: TaskStep): boolean;
  planLocalActions(task: TaskStep, worldState: WorldState, context?: AgentContext): ToolCall[];
  execute(task: TaskStep, context: AgentContext): Promise<AgentOutcome>;
  reportOutcome(): AgentReport;
}

export abstract class BaseAgent implements AgenticAgent {
  private lastOutcome?: AgentOutcome;

  protected constructor(
    readonly role: AgentRole,
    readonly purpose: string,
    readonly acceptedDomains: string[],
    readonly allowedTools: string[]
  ) {}

  canHandle(task: TaskStep): boolean {
    return this.acceptedDomains.includes(task.domain);
  }

  abstract planLocalActions(task: TaskStep, worldState: WorldState, context?: AgentContext): ToolCall[];

  async execute(task: TaskStep, context: AgentContext): Promise<AgentOutcome> {
    const plannedCalls = this.planLocalActions(task, context.worldState, context);
    const toolCalls: ToolCall[] = [];
    const toolResults: ToolResult[] = [];
    const errors: string[] = [];
    const scratch: Scratch = {};

    for (const call of plannedCalls) {
      if (!context.allowedToolNames.includes(call.toolName)) {
        errors.push(`${this.role} is not allowed to use ${call.toolName}`);
        continue;
      }

      const resolvedCall: ToolCall = {
        ...call,
        input: resolveReferences(call.input, scratch) as JsonObject,
      };

      toolCalls.push(resolvedCall);
      const result = await context.executeTool(resolvedCall);
      toolResults.push(result);
      rememberToolOutput(result, scratch);

      if (!result.success) {
        errors.push(result.error?.message ?? result.message);
        if (!result.error?.recoverable) {
          break;
        }
      }
    }

    const success = errors.length === 0 && toolResults.every((result) => result.success);
    const outcome: AgentOutcome = {
      agentRole: this.role,
      taskId: task.id,
      status: success ? 'completed' : 'failed',
      summary: success
        ? `${this.role} completed ${task.title}.`
        : `${this.role} failed ${task.title}.`,
      toolCalls,
      toolResults,
      errors,
      evidenceIds: toolResults.flatMap((result) => result.evidence.map((item) => item.id)),
    };

    const localErrors = this.validateOutcome(task, outcome, context.worldState);
    if (localErrors.length) {
      outcome.status = 'failed';
      outcome.errors.push(...localErrors);
      outcome.summary = `${this.role} completed tools but failed local validation.`;
    }

    this.lastOutcome = outcome;
    return outcome;
  }

  reportOutcome(): AgentReport {
    return {
      agentRole: this.role,
      acceptedTaskTypes: this.acceptedDomains,
      allowedTools: this.allowedTools,
      lastOutcome: this.lastOutcome,
    };
  }

  protected validateOutcome(_task: TaskStep, _outcome: AgentOutcome, _worldState: WorldState): string[] {
    return [];
  }
}
