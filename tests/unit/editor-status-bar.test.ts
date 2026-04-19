import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorStatusBarView } from '@/engine/editor/shell/EditorStatusBar';

function renderStatusBar(options?: { audit?: Parameters<typeof EditorStatusBarView>[0]['agenticMutationIndexAudit'] }) {
  return renderToStaticMarkup(
    createElement(EditorStatusBarView, {
      workspace: 'scene',
      engineModeLabel: 'AI',
      runtimeState: 'IDLE',
      sceneName: 'Main Scene',
      entityCount: 2,
      selectionCount: 0,
      assetCount: 1,
      isDirty: false,
      lastBuildReport: null,
      agenticMutationIndexAudit: options?.audit ?? null,
    })
  );
}

describe('EditorStatusBar', () => {
  it('renders the agentic index warning with checkedAt tooltip', () => {
    const audit = {
      repairCount: 0,
      latestRepairId: null,
      latestRepairAt: null,
      integrityStatus: 'mismatch',
      integrityValid: false,
      recommendationCount: 1,
      checkedAt: '2026-04-17T10:01:00.000Z',
    } as const;

    const html = renderStatusBar({ audit });

    expect(html).toContain('data-testid="agentic-statusbar-mutation-index-integrity-alert"');
    expect(html).toContain('Agentic Index');
    expect(html).toContain('mismatch');
    expect(html).toContain('title="Ultima verificacion: 2026-04-17T10:01:00.000Z"');

    expect(renderStatusBar()).not.toContain('agentic-statusbar-mutation-index-integrity-alert');
  });

  it('renders indexBehind in the status bar even when integrity is valid', () => {
    const audit = {
      repairCount: 1,
      latestRepairId: 'mutation-index-reindex-unit',
      latestRepairAt: '2026-04-17T10:00:00.000Z',
      integrityStatus: 'valid',
      integrityValid: true,
      recommendationCount: 2,
      lastIndexedExecutionId: 'pipeline-old',
      latestIndexableExecutionId: 'pipeline-new',
      pendingIndexableExecutionCount: 3,
      indexBehind: true,
      checkedAt: '2026-04-17T10:02:00.000Z',
    } as const;

    const html = renderStatusBar({ audit });

    expect(html).toContain('data-testid="agentic-statusbar-mutation-index-integrity-alert"');
    expect(html).toContain('Agentic Index');
    expect(html).toContain('behind');
    expect(html).toContain('Index atrasado: pending=3 lastIndexed=pipeline-old latestIndexable=pipeline-new');
  });
});
