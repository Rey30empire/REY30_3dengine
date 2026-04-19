import {
  invokeScriptRuntimeModule,
  loadScriptRuntimeModule,
  unloadScriptRuntimeModule,
} from './script-runtime-executor';
import type {
  ScriptRuntimeErrorResponse,
  ScriptRuntimeWorkerRequest,
  ScriptRuntimeWorkerResponse,
} from './script-runtime-protocol';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ScriptRuntimeWorkerRequest>) => void) | null;
  postMessage: (message: ScriptRuntimeWorkerResponse) => void;
};

function postError(
  requestId: string,
  type: ScriptRuntimeErrorResponse['type'],
  error: unknown
): void {
  const response: ScriptRuntimeErrorResponse = {
    type,
    requestId,
    ok: false,
    error: String((error as { message?: unknown })?.message ?? error),
  };
  workerScope.postMessage(response);
}

workerScope.onmessage = (event: MessageEvent<ScriptRuntimeWorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'load') {
      const availablePhases = loadScriptRuntimeModule({
        moduleKey: message.moduleKey,
        moduleKind: message.moduleKind,
        scriptId: message.scriptId,
        compiledCode: message.compiledCode,
      });
      const response: ScriptRuntimeWorkerResponse = {
        type: 'load',
        requestId: message.requestId,
        ok: true,
        availablePhases,
      };
      workerScope.postMessage(response);
      return;
    }

    if (message.type === 'invoke') {
      const commands = invokeScriptRuntimeModule({
        moduleKey: message.moduleKey,
        phase: message.phase,
        context: message.context,
        maxExecutionMs: message.maxExecutionMs,
        maxExecutionTicks: message.maxExecutionTicks,
      });
      const response: ScriptRuntimeWorkerResponse = {
        type: 'invoke',
        requestId: message.requestId,
        ok: true,
        commands,
      };
      workerScope.postMessage(response);
      return;
    }

    unloadScriptRuntimeModule(message.moduleKey);
    const response: ScriptRuntimeWorkerResponse = {
      type: 'unload',
      requestId: message.requestId,
      ok: true,
    };
    workerScope.postMessage(response);
  } catch (error) {
    postError(message.requestId, message.type, error);
  }
};

export {};
