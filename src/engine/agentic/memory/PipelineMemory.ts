import {
  createAgenticId,
  type DeliveryDecision,
  type ExecutionTrace,
  type PipelineExecutionState,
  type StepExecutionResult,
  type TaskPlan,
  type ToolResult,
  type UserIntent,
  type ValidationReport,
} from '../schemas';

function now(): string {
  return new Date().toISOString();
}

export class PipelineMemory {
  private state: PipelineExecutionState;

  constructor(originalRequest: string, pipelineId = createAgenticId('pipeline')) {
    const timestamp = now();
    this.state = {
      pipelineId,
      status: 'pending',
      iteration: 1,
      originalRequest,
      stepResults: [],
      toolResults: [],
      validationReports: [],
      sharedMemory: {
        analyses: [],
        actionableRecommendations: [],
      },
      traces: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  getState(): PipelineExecutionState {
    return {
      ...this.state,
      stepResults: [...this.state.stepResults],
      toolResults: [...this.state.toolResults],
      validationReports: [...this.state.validationReports],
      sharedMemory: {
        analyses: [...this.state.sharedMemory.analyses],
        actionableRecommendations: [...this.state.sharedMemory.actionableRecommendations],
      },
      traces: [...this.state.traces],
    };
  }

  setStatus(status: PipelineExecutionState['status']): void {
    this.state.status = status;
    this.touch();
  }

  setIntent(intent: UserIntent): void {
    this.state.intent = intent;
    this.touch();
  }

  setPlan(plan: TaskPlan): void {
    this.state.plan = plan;
    this.state.iteration = plan.iteration;
    this.touch();
  }

  addStepResult(result: StepExecutionResult): void {
    this.state.stepResults.push(result);
    this.state.toolResults.push(...result.toolResults);
    if (result.sharedMemory) {
      this.state.sharedMemory = {
        analyses: [...result.sharedMemory.analyses],
        actionableRecommendations: [...result.sharedMemory.actionableRecommendations],
      };
    }
    this.touch();
  }

  addToolResult(result: ToolResult): void {
    this.state.toolResults.push(result);
    this.touch();
  }

  addValidationReport(report: ValidationReport): void {
    this.state.validationReports.push(report);
    this.touch();
  }

  setFinalDecision(decision: DeliveryDecision): void {
    this.state.finalDecision = decision;
    this.state.status = decision.approved ? 'approved' : 'rejected';
    this.touch();
  }

  setTraces(traces: ExecutionTrace[]): void {
    this.state.traces = [...traces];
    this.touch();
  }

  nextIteration(): number {
    this.state.iteration += 1;
    this.touch();
    return this.state.iteration;
  }

  private touch(): void {
    this.state.updatedAt = now();
  }
}
