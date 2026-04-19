import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEditorSessionBootstrapRequest,
  EDITOR_SESSION_FORCE_SYNC_EVENT,
  requestEditorSessionBridgeSync,
} from '@/engine/editor/useEditorSessionBridge';

describe('useEditorSessionBridge helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps and normalizes the editor project name into the bootstrap request projectKey', () => {
    expect(buildEditorSessionBootstrapRequest('bridge-1', 'Durable Project')).toEqual({
      sessionId: 'bridge-1',
      projectKey: 'durable_project',
    });
  });

  it('dispatches an explicit force-sync event for the bridge', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    requestEditorSessionBridgeSync();

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: EDITOR_SESSION_FORCE_SYNC_EVENT }));
  });
});
