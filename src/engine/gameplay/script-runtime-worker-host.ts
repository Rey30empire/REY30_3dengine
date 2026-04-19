import type {
  ScriptRuntimeAvailablePhases,
  ScriptRuntimeCommand,
  ScriptRuntimeInvocationContext,
  ScriptRuntimeModuleKind,
  ScriptRuntimePhase,
  ScriptRuntimeWorkerRequest,
  ScriptRuntimeWorkerResponse,
} from './script-runtime-protocol';

export interface ScriptRuntimeWorkerLike {
  onmessage: ((event: { data: ScriptRuntimeWorkerResponse }) => void) | null;
  onerror: ((event: { message?: string; error?: unknown }) => void) | null;
  postMessage(message: ScriptRuntimeWorkerRequest): void;
  terminate(): void;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function nextId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export class ScriptRuntimeWorkerHost {
  private worker: ScriptRuntimeWorkerLike | null = null;
  private readonly pending = new Map<string, PendingRequest<unknown>>();
  private readonly createWorker: () => ScriptRuntimeWorkerLike;
  private readonly loadTimeoutMs: number;
  private readonly invokeTimeoutMs: number;

  constructor(params?: {
    createWorker?: () => ScriptRuntimeWorkerLike;
    loadTimeoutMs?: number;
    invokeTimeoutMs?: number;
  }) {
    this.createWorker =
      params?.createWorker ||
      (() =>
        new Worker(new URL('./script-runtime.worker.ts', import.meta.url), {
          type: 'module',
          name: 'rey30-script-runtime',
        }) as unknown as ScriptRuntimeWorkerLike);
    this.loadTimeoutMs = params?.loadTimeoutMs ?? 400;
    this.invokeTimeoutMs = params?.invokeTimeoutMs ?? 40;
  }

  async loadModule(params: {
    moduleKey: string;
    moduleKind: ScriptRuntimeModuleKind;
    scriptId: string;
    compiledHash: string;
    compiledCode: string;
  }): Promise<ScriptRuntimeAvailablePhases> {
    const response = await this.sendRequest<{
      availablePhases: ScriptRuntimeAvailablePhases;
    }>(
      {
        type: 'load',
        requestId: nextId(),
        moduleKey: params.moduleKey,
        moduleKind: params.moduleKind,
        scriptId: params.scriptId,
        compiledHash: params.compiledHash,
        compiledCode: params.compiledCode,
      },
      this.loadTimeoutMs
    );
    return response.availablePhases;
  }

  async invokeModule(params: {
    moduleKey: string;
    moduleKind: ScriptRuntimeModuleKind;
    phase: ScriptRuntimePhase;
    context: ScriptRuntimeInvocationContext;
    maxExecutionMs: number;
    maxExecutionTicks: number;
  }): Promise<ScriptRuntimeCommand[]> {
    const response = await this.sendRequest<{ commands: ScriptRuntimeCommand[] }>(
      {
        type: 'invoke',
        requestId: nextId(),
        moduleKey: params.moduleKey,
        moduleKind: params.moduleKind,
        phase: params.phase,
        context: params.context,
        maxExecutionMs: params.maxExecutionMs,
        maxExecutionTicks: params.maxExecutionTicks,
      },
      this.invokeTimeoutMs
    );
    return response.commands;
  }

  unloadModule(moduleKey: string): void {
    if (!this.worker) return;
    this.worker.postMessage({
      type: 'unload',
      requestId: nextId(),
      moduleKey,
    });
  }

  reset(reason = 'sandbox_reset'): void {
    this.rejectPending(new Error(reason));
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private ensureWorker(): ScriptRuntimeWorkerLike {
    if (this.worker) return this.worker;

    const worker = this.createWorker();
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const error = new Error(
        event.message ||
          String(
            (event.error as { message?: unknown })?.message ??
              event.error ??
              'Sandbox worker error'
          )
      );
      this.reset(error.message);
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: ScriptRuntimeWorkerResponse): void {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(message.requestId);

    if (!message.ok) {
      pending.reject(new Error(message.error));
      return;
    }

    if (message.type === 'load') {
      pending.resolve({ availablePhases: message.availablePhases });
      return;
    }

    if (message.type === 'invoke') {
      pending.resolve({ commands: message.commands });
      return;
    }

    pending.resolve({});
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private sendRequest<T>(
    request: ScriptRuntimeWorkerRequest,
    timeoutMs: number
  ): Promise<T> {
    const worker = this.ensureWorker();

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.requestId);
        this.reset(
          `Sandbox worker timed out after ${timeoutMs}ms while processing ${request.type}.`
        );
        reject(
          new Error(
            `Sandbox worker timed out after ${timeoutMs}ms while processing ${request.type}.`
          )
        );
      }, timeoutMs);

      this.pending.set(request.requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });

      try {
        worker.postMessage(request);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(request.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

