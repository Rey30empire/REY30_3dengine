import { describe, expect, it } from 'vitest';
import { createIsolatedEngineStore } from '@/store/editorStore';

describe('editor store agentic mutation index audit', () => {
  it('persists and clears the latest agentic mutation index audit state', () => {
    const store = createIsolatedEngineStore();

    expect(store.getState().agenticMutationIndexAudit).toBeNull();

    store.getState().setAgenticMutationIndexAudit({
      repairCount: 2,
      latestRepairId: 'mutation-index-repair-unit',
      latestRepairAt: '2026-04-17T10:00:00.000Z',
      integrityStatus: 'mismatch',
      integrityValid: false,
      recommendationCount: 3,
      checkedAt: '2026-04-17T10:01:00.000Z',
    });

    expect(store.getState().agenticMutationIndexAudit).toEqual({
      repairCount: 2,
      latestRepairId: 'mutation-index-repair-unit',
      latestRepairAt: '2026-04-17T10:00:00.000Z',
      integrityStatus: 'mismatch',
      integrityValid: false,
      recommendationCount: 3,
      checkedAt: '2026-04-17T10:01:00.000Z',
    });

    store.getState().setAgenticMutationIndexAudit(null);

    expect(store.getState().agenticMutationIndexAudit).toBeNull();
  });
});
