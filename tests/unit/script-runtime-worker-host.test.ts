import { describe, expect, it, vi } from 'vitest';
import { ScriptRuntimeWorkerHost } from '@/engine/gameplay/script-runtime-worker-host';
import type { ScriptRuntimeWorkerRequest, ScriptRuntimeWorkerResponse } from '@/engine/gameplay/script-runtime-protocol';

class FakeWorker {
  onmessage: ((event: { data: ScriptRuntimeWorkerResponse }) => void) | null = null;
  onerror: ((event: { message?: string; error?: unknown }) => void) | null = null;
  terminated = false;
  private readonly behavior: (message: ScriptRuntimeWorkerRequest, worker: FakeWorker) => void;

  constructor(behavior: (message: ScriptRuntimeWorkerRequest, worker: FakeWorker) => void) {
    this.behavior = behavior;
  }

  postMessage(message: ScriptRuntimeWorkerRequest): void {
    this.behavior(message, this);
  }

  emit(response: ScriptRuntimeWorkerResponse): void {
    this.onmessage?.({ data: response });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('script runtime worker host', () => {
  it('kills and recreates the worker when an invocation times out', async () => {
    const workers: FakeWorker[] = [];
    const host = new ScriptRuntimeWorkerHost({
      loadTimeoutMs: 25,
      invokeTimeoutMs: 25,
      createWorker: () => {
        const index = workers.length;
        const worker = new FakeWorker((message, current) => {
          if (message.type === 'load') {
            current.emit({
              type: 'load',
              requestId: message.requestId,
              ok: true,
              availablePhases: {
                onStart: false,
                update: true,
                onStop: false,
                default: false,
              },
            });
            return;
          }

          if (index > 0 && message.type === 'invoke') {
            current.emit({
              type: 'invoke',
              requestId: message.requestId,
              ok: true,
              commands: [],
            });
          }
        });
        workers.push(worker);
        return worker;
      },
    });

    await host.loadModule({
      moduleKey: 'legacy:demo:1',
      moduleKind: 'legacy',
      scriptId: 'demo.ts',
      compiledHash: 'hash-1',
      compiledCode: 'exports.update = function update() {};',
    });

    await expect(
      host.invokeModule({
        moduleKey: 'legacy:demo:1',
        moduleKind: 'legacy',
        phase: 'update',
        context: {
          deltaTime: 0.016,
          entityId: 'entity-1',
          entity: {
            id: 'entity-1',
            name: 'Cube',
            components: new Map(),
            children: [],
            parentId: null,
            active: true,
            tags: [],
          },
        },
        maxExecutionMs: 12,
        maxExecutionTicks: 6000,
      })
    ).rejects.toThrow(/timed out/i);

    expect(workers[0].terminated).toBe(true);

    await host.loadModule({
      moduleKey: 'legacy:demo:2',
      moduleKind: 'legacy',
      scriptId: 'demo.ts',
      compiledHash: 'hash-2',
      compiledCode: 'exports.update = function update() {};',
    });
    await expect(
      host.invokeModule({
        moduleKey: 'legacy:demo:2',
        moduleKind: 'legacy',
        phase: 'update',
        context: {
          deltaTime: 0.016,
          entityId: 'entity-1',
          entity: {
            id: 'entity-1',
            name: 'Cube',
            components: new Map(),
            children: [],
            parentId: null,
            active: true,
            tags: [],
          },
        },
        maxExecutionMs: 12,
        maxExecutionTicks: 6000,
      })
    ).resolves.toEqual([]);

    expect(workers).toHaveLength(2);
  });
});

