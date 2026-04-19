'use client';

import type { BuildReport, PlayRuntimeState } from '@/engine/reyplay/types';
import { useEngineStore } from '@/store/editorStore';
import type { AgenticMutationIndexAuditState } from '@/store/editorStore.types';
import type { EditorWorkspaceId } from './workspaceDefinitions';

interface EditorStatusBarProps {
  workspace: EditorWorkspaceId;
  engineModeLabel: string;
  runtimeState: PlayRuntimeState;
  sceneName: string;
  entityCount: number;
  selectionCount: number;
  assetCount: number;
  isDirty: boolean;
  lastBuildReport: BuildReport | null;
  showBuildStatus?: boolean;
}

function StatusChip({
  label,
  value,
  tone = 'default',
  testId,
  title,
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'info' | 'success' | 'warning';
  testId?: string;
  title?: string;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
        : tone === 'info'
          ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
          : 'border-slate-800 bg-slate-900/80 text-slate-300';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${toneClass}`}
      data-testid={testId}
      title={title}
    >
      <span className="text-slate-500">{label}</span>
      <span>{value}</span>
    </span>
  );
}

interface EditorStatusBarViewProps extends EditorStatusBarProps {
  agenticMutationIndexAudit: AgenticMutationIndexAuditState | null;
}

export function EditorStatusBarView({
  workspace,
  engineModeLabel,
  runtimeState,
  sceneName,
  entityCount,
  selectionCount,
  assetCount,
  isDirty,
  lastBuildReport,
  showBuildStatus = true,
  agenticMutationIndexAudit,
}: EditorStatusBarViewProps) {
  const runtimeTone =
    runtimeState === 'PLAYING'
      ? 'success'
      : runtimeState === 'PAUSED'
        ? 'warning'
        : 'default';
  const buildTone = lastBuildReport
    ? lastBuildReport.ok
      ? 'success'
      : 'warning'
    : 'default';
  const agenticIndexStatus = agenticMutationIndexAudit?.integrityStatus ?? null;
  const agenticIndexBehind = agenticMutationIndexAudit?.indexBehind === true;
  const showAgenticIndexWarning =
    agenticIndexStatus === 'mismatch' || agenticIndexStatus === 'missing' || agenticIndexBehind;
  const agenticIndexValue = agenticIndexBehind ? 'behind' : (agenticIndexStatus ?? 'unknown');
  const agenticIndexTitle = [
    agenticMutationIndexAudit?.checkedAt
      ? `Ultima verificacion: ${agenticMutationIndexAudit.checkedAt}`
      : 'Ultima verificacion no disponible',
    agenticIndexBehind
      ? `Index atrasado: pending=${agenticMutationIndexAudit?.pendingIndexableExecutionCount ?? 0} lastIndexed=${agenticMutationIndexAudit?.lastIndexedExecutionId ?? 'none'} latestIndexable=${agenticMutationIndexAudit?.latestIndexableExecutionId ?? 'none'}`
      : null,
  ].filter(Boolean).join(' | ');

  return (
    <footer className="border-t border-slate-800 bg-slate-950 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip label="Workspace" value={workspace} tone="info" />
        <StatusChip label="Execution" value={engineModeLabel} />
        <StatusChip label="Runtime" value={runtimeState} tone={runtimeTone} />
        <StatusChip label="Scene" value={sceneName} />
        <StatusChip label="Entities" value={entityCount} />
        <StatusChip label="Selected" value={selectionCount} />
        <StatusChip label="Assets" value={assetCount} />
        <StatusChip
          label="Project"
          value={isDirty ? 'Dirty' : 'Clean'}
          tone={isDirty ? 'warning' : 'success'}
        />
        {showBuildStatus && lastBuildReport && (
          <StatusChip
            label="Compile"
            value={lastBuildReport.summary}
            tone={buildTone}
          />
        )}
        {showAgenticIndexWarning && (
          <StatusChip
            label="Agentic Index"
            value={agenticIndexValue}
            tone="warning"
            testId="agentic-statusbar-mutation-index-integrity-alert"
            title={agenticIndexTitle}
          />
        )}
      </div>
    </footer>
  );
}

export function EditorStatusBar(props: EditorStatusBarProps) {
  const agenticMutationIndexAudit = useEngineStore((state) => state.agenticMutationIndexAudit);
  return (
    <EditorStatusBarView
      {...props}
      agenticMutationIndexAudit={agenticMutationIndexAudit}
    />
  );
}
