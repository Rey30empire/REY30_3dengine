import {
  createAgenticId,
  type ExecutionTrace,
  type ExecutionTraceWriter,
} from '../schemas';

export class ExecutionTracer implements ExecutionTraceWriter {
  private readonly traces: ExecutionTrace[] = [];

  write(event: Omit<ExecutionTrace, 'id' | 'timestamp'>): ExecutionTrace {
    const trace: ExecutionTrace = {
      ...event,
      id: createAgenticId('trace'),
      timestamp: new Date().toISOString(),
    };

    this.traces.push(trace);
    return trace;
  }

  list(): ExecutionTrace[] {
    return [...this.traces];
  }

  clear(): void {
    this.traces.length = 0;
  }
}
