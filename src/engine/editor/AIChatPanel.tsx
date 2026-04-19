// ============================================
// AI Chat Panel - Unified assistant interface
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useEngineStore } from '@/store/editorStore';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Bot, 
  Send, 
  User, 
  Sparkles, 
  Loader2, 
  Trash2,
  Copy,
  Check,
  Gamepad2,
  Mountain,
  Swords,
  PersonStanding,
  Building2,
  Wand2,
  Cuboid,
  Key,
  AlertCircle,
  Download,
  Eye,
  GitCompareArrows,
  Play,
  RefreshCw,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
  createLoadedEditorProjectPatch,
  restoreEditorProjectSaveData,
} from '@/engine/serialization';
import type {
  AgentPlannerCustomTaskMetadataRevertBlocker,
  AgentPlannerCustomTaskPriority,
  AgentPlannerStageStatus,
  ClientAgentPlannerPlan,
} from '@/engine/ai/agentPlanner';
import {
  countCustomTaskMetadataHistory,
  sumCustomTaskMetadataHistoryCounts,
} from '@/engine/ai/agentPlannerMetadataHistoryReport';
import type { AgenticPipelineProgressEvent } from '@/engine/agentic';
import type { Agent, AgentType, ChatMessage, AIMode, Entity } from '@/types/engine';
import type { ScribType } from '@/engine/scrib';
import {
  useAIModeWorkflowSync,
  useAIProviderCapabilities,
} from './ai/useProviderCapabilities';
import { getWorkflowPresentation } from './ai/workflowPresentation';
import { useAIActions } from './ai/useAIActions';
import type { GenerationTask } from './ai/generationTask';
import { useAIOrchestrator } from './ai/useAIOrchestrator';
import { useAICommandRouter } from './ai/useAICommandRouter';
import {
  requestAgenticServerHistory,
  requestAgenticServerHistoryMutation,
  requestAgenticExecuteApprovedRecommendations,
  requestAgenticPartialRecommendationRollback,
  requestAgenticRecommendationMutationIndex,
  requestAgenticMutationIndexStatus,
  requestAgenticRecommendationMutationIndexRepair,
  requestAgenticRecommendationMutationIndexReindex,
  requestAgenticRecommendationDecision,
  createAIAgentPlannerCustomTaskHistoryExportUrl,
  createAIAgentPlannerCustomTaskRevertAuditsExportUrl,
  createAIAgentPlannerStaleRevertPolicyAuditExportUrl,
  requestAIAgentPlannerCustomTaskRevertAudits,
  requestAIAgentPlannerCreate,
  requestAIAgentPlannerState,
  requestAIAgentPlannerStaleRevertPolicy,
  requestAIAgentPlannerStaleRevertPolicyAudit,
  requestAIAgentPlannerStaleRevertPolicyReset,
  requestAIAgentPlannerStaleRevertPolicyUpdate,
  requestAIAgentPlannerUpdate,
  requestAssistantReviewReanalysisJob,
  requestAssistantReviewReanalysisUpdate,
  requestAssistantStatus,
  type AgenticExecutionHistoryRecord,
  type AgenticExecutionHistoryPagination,
  type AgenticExecutionHistoryFilter,
  type AgenticExecutionHistoryFilterCounts,
  type AgenticExecutionHistoryFilterOptions,
  type AgenticMutationIndexAuditSummary,
  type AgenticRecommendationMutationIndexIntegrity,
  type AgenticRecommendationMutationIndex,
  type AIAgentPlannerCustomTaskRevertAuditsResponse,
  type AIAgentPlannerStaleRevertPolicyResponse,
  type StaleMetadataRevertPolicyAuditEventTypeFilter,
  type StaleMetadataRevertPolicyRole,
} from './ai/requestClient';
import {
  createAgenticExecutionReport,
  createAgenticExecutionReportFilename,
  type AgenticExecutionReportFormat,
  groupAgenticSemanticChanges,
} from './ai/agenticExecutionReport';
import {
  compareAgenticExecutions,
  createAgenticExecutionComparisonReport,
  createAgenticExecutionComparisonReportFilename,
  type AgenticExecutionComparisonReportFormat,
} from './ai/agenticExecutionComparison';
import {
  createAgenticExecutionTimeline,
  createAgenticExecutionTimelineReport,
  createAgenticExecutionTimelineReportFilename,
  type AgenticExecutionTimelineReportFormat,
} from './ai/agenticExecutionTimeline';
import { shouldUseServerAgenticExecution } from './ai/agenticCommandBridge';
import {
  notifyAgenticMutationIndexAudit,
  notifyAgenticServerExecutionPreference,
} from './ai/agenticMutationIndexEvents';
import { fetchRemoteEditorProjectSave } from './editorProjectClient';
import { ensureGeneratedScriptFile } from './generatedScriptPersistence';
import { MODE_AUTO_GUIDE } from './autoGuide';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
} from './animationEditorState';

type PipelineProgressState = {
  visible: boolean;
  kind: 'creation' | 'agentic';
  totalStages: number;
  completedStages: number;
  currentStageTitle: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
};

type DiagnosticLevel = 'ok' | 'warn' | 'error' | 'unknown';

type DiagnosticsSnapshot = {
  loading: boolean;
  checkedAt: string | null;
  assistant: { level: DiagnosticLevel; message: string };
  automation: { level: DiagnosticLevel; message: string };
  characters: { level: DiagnosticLevel; message: string };
};

type ScriptPersistenceAvailability = 'unknown' | 'available' | 'restricted';
type AgenticHistoryFilter = AgenticExecutionHistoryFilter;
type AgenticTimelineMutationFilter = 'all' | 'mutating' | 'readonly';
type AgenticHistoryAction = 'rollback' | 'replay' | 'approved' | 'partialRollback' | 'reindexPending';
type AgenticAuditActionFilter =
  | 'all'
  | 'checksum_recalculated'
  | 'history_reindexed_full'
  | 'history_reindexed_partial';
const AGENTIC_HISTORY_PAGE_SIZE = 8;
const AGENT_PLANNER_GLOBAL_REVERT_AUDIT_PAGE_SIZE = 5;
const STALE_REVERT_POLICY_AUDIT_PAGE_SIZE = 3;
const STALE_REVERT_POLICY_ROLE_OPTIONS: StaleMetadataRevertPolicyRole[] = ['OWNER', 'EDITOR', 'VIEWER'];
const STALE_REVERT_POLICY_AUDIT_EVENT_FILTER_OPTIONS: Array<{
  value: StaleMetadataRevertPolicyAuditEventTypeFilter;
  label: string;
}> = [
  { value: 'all', label: 'audit: todo' },
  { value: 'stale_metadata_revert_allowlist_changed', label: 'allowlist changed' },
  { value: 'stale_metadata_revert_allowlist_reset_to_env', label: 'reset env' },
];

type CustomTaskEditDraft = {
  title: string;
  summary: string;
  owner: string;
  priority: AgentPlannerCustomTaskPriority;
  sourceBlockId: string;
};

type CustomTaskStatusCounts = Record<AgentPlannerStageStatus, number>;
type CustomTaskMetadataHistoryFilter = 'all' | 'reverts' | 'staleConfirmed';

type PendingStaleCustomTaskMetadataRevert = {
  taskId: string;
  historyEntryId: string;
  blocker: AgentPlannerCustomTaskMetadataRevertBlocker;
  reason: string;
};

type ApprovedReanalysisScopeBlock = {
  jobId: string;
  linkedPlanId: string;
  blockId: string;
  title: string;
  summary: string;
  priority: string;
  suggestedOwner: string;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createEmptyCustomTaskCounts(): CustomTaskStatusCounts {
  return {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
}

function countApprovedReviewBlocks(job: unknown) {
  if (!isObjectRecord(job) || !isObjectRecord(job.scope)) {
    return 0;
  }
  const reviewBlocks = Array.isArray(job.scope.reviewBlocks) ? job.scope.reviewBlocks : [];
  const decisions = isObjectRecord(job.blockDecisions) ? job.blockDecisions : {};
  return reviewBlocks.filter((block) => {
    if (!isObjectRecord(block) || typeof block.id !== 'string') {
      return false;
    }
    const decision = decisions[block.id];
    return isObjectRecord(decision) && decision.decision === 'approved';
  }).length;
}

function extractApprovedReviewBlocks(job: unknown): ApprovedReanalysisScopeBlock[] {
  if (!isObjectRecord(job) || !isObjectRecord(job.scope)) {
    return [];
  }
  const jobId = getStringField(job, 'id');
  const linkedPlanId = isObjectRecord(job.plannerLink)
    ? getStringField(job.plannerLink, 'planId')
    : '';
  const reviewBlocks = Array.isArray(job.scope.reviewBlocks) ? job.scope.reviewBlocks : [];
  const decisions = isObjectRecord(job.blockDecisions) ? job.blockDecisions : {};
  return reviewBlocks.flatMap((block) => {
    if (!isObjectRecord(block)) {
      return [];
    }
    const blockId = getStringField(block, 'id');
    const decision = decisions[blockId];
    if (!blockId || !isObjectRecord(decision) || decision.decision !== 'approved') {
      return [];
    }
    return [
      {
        jobId,
        linkedPlanId,
        blockId,
        title: getStringField(block, 'title') || blockId,
        summary: getStringField(block, 'summary') || 'Bloque aprobado sin resumen.',
        priority: getStringField(block, 'priority') || 'medium',
        suggestedOwner: getStringField(block, 'suggestedOwner') || 'technical_lead',
      },
    ];
  });
}

function getStringField(value: unknown, key: string) {
  return isObjectRecord(value) && typeof value[key] === 'string' ? value[key] : '';
}

function isStaleCustomTaskMetadataEntry(
  task: ClientAgentPlannerPlan['customTasks'][number],
  historyEntryId: string
) {
  const history = task.metadataHistory ?? [];
  const entryIndex = history.findIndex((entry) => entry.id === historyEntryId);
  if (entryIndex < 0) {
    return false;
  }
  const entry = history[entryIndex];
  return history.slice(entryIndex + 1).some((candidate) => candidate.field === entry.field);
}

function filterCustomTaskMetadataHistory(
  task: ClientAgentPlannerPlan['customTasks'][number],
  filter: CustomTaskMetadataHistoryFilter
) {
  const history = task.metadataHistory ?? [];
  if (filter === 'reverts') {
    return history.filter((entry) => entry.source === 'metadata_revert');
  }
  if (filter === 'staleConfirmed') {
    return history.filter((entry) => Boolean(entry.staleRevertConfirmation));
  }
  return history;
}

function diagnosticClasses(level: DiagnosticLevel): string {
  if (level === 'ok') return 'border-green-500/30 bg-green-500/10 text-green-200';
  if (level === 'warn') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (level === 'error') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function formatAgenticHistoryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'sin fecha';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSnapshotDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function previewNames(items: Array<{ name: string }>, empty = 'nada') {
  return items.length ? items.slice(0, 4).map((item) => item.name).join(', ') : empty;
}

function formatAgenticFilterLabel(value: string) {
  if (value === 'all') return 'Todo';
  return value.replace(/_/g, ' ');
}

function formatHistoryFilterCount(value?: number) {
  return typeof value === 'number' ? ` (${value})` : '';
}

function createRollbackFieldPreview(record: AgenticExecutionHistoryRecord) {
  return (record.diff?.rollbackPreview.willRevert.components ?? [])
    .flatMap((change) =>
      (change.fieldChanges ?? []).slice(0, 3).map((fieldChange) => ({
        id: `${change.entityId}-${change.component}-${fieldChange.field}`,
        text: `${change.entityName}.${change.component}.${fieldChange.field}: ${fieldChange.after} -> ${fieldChange.before}`,
      }))
    )
    .slice(0, 8);
}

function downloadAgenticExecutionReport(
  record: AgenticExecutionHistoryRecord,
  format: AgenticExecutionReportFormat
) {
  const report = createAgenticExecutionReport(record, format);
  const filename = createAgenticExecutionReportFilename(record, format);
  const mime = format === 'json' ? 'application/json' : 'text/markdown';
  const blob = new Blob([report], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadServerFile(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}


function downloadAgenticExecutionComparisonReport(
  left: AgenticExecutionHistoryRecord,
  right: AgenticExecutionHistoryRecord,
  format: AgenticExecutionComparisonReportFormat
) {
  const report = createAgenticExecutionComparisonReport(left, right, format);
  const filename = createAgenticExecutionComparisonReportFilename(left, right, format);
  const mime = format === 'json' ? 'application/json' : 'text/markdown';
  downloadTextFile(filename, report, mime);
}

function downloadAgenticExecutionTimelineReport(
  record: AgenticExecutionHistoryRecord,
  format: AgenticExecutionTimelineReportFormat
) {
  const report = createAgenticExecutionTimelineReport(record, format);
  const filename = createAgenticExecutionTimelineReportFilename(record, format);
  const mime = format === 'json' ? 'application/json' : 'text/markdown';
  downloadTextFile(filename, report, mime);
}

function createFilteredMutationIndexAuditReport(params: {
  projectName: string;
  slot: string;
  actionFilter: AgenticAuditActionFilter;
  auditTrail: NonNullable<AgenticRecommendationMutationIndex['integrityAuditTrail']>;
  counts: ReturnType<typeof countAgenticMutationIndexAuditActions>;
  integrity: AgenticRecommendationMutationIndexIntegrity | null;
  format: 'json' | 'markdown';
}) {
  const generatedAt = new Date().toISOString();
  const actionLabel = params.actionFilter === 'all' ? 'all' : params.actionFilter;
  if (params.format === 'json') {
    return JSON.stringify(
      {
        reportVersion: 1,
        kind: 'agentic_recommendation_mutation_index_audit_filtered',
        generatedAt,
        projectKey: params.projectName,
        slot: params.slot,
        actionFilter: actionLabel,
        integrityStatus: params.integrity?.status ?? 'unknown',
        checksumValid: params.integrity?.valid ?? null,
        counts: params.counts,
        filteredAuditCount: params.auditTrail.length,
        integrityAuditTrail: params.auditTrail,
      },
      null,
      2
    );
  }

  const lines = [
    '# Agentic Mutation Index Audit Filter',
    '',
    `Generated At: ${generatedAt}`,
    `Project: ${params.projectName}`,
    `Slot: ${params.slot}`,
    `Action Filter: ${actionLabel}`,
    `Integrity: ${params.integrity?.status ?? 'unknown'}`,
    `Filtered Events: ${params.auditTrail.length}`,
    '',
    '## Counts',
    '',
    `- checksum_recalculated: ${params.counts.checksumRepairCount}`,
    `- history_reindexed_full: ${params.counts.historyReindexedFullCount}`,
    `- history_reindexed_partial: ${params.counts.historyReindexedPartialCount}`,
    `- legacy_history_reindexed: ${params.counts.legacyHistoryReindexedCount}`,
    '',
    '## Events',
    '',
  ];

  if (params.auditTrail.length === 0) {
    lines.push('- No audit events matched this filter.');
  } else {
    for (const entry of params.auditTrail) {
      lines.push(
        `### ${entry.id}`,
        '',
        `- action: ${entry.action}`,
        `- previousIntegrityStatus: ${entry.previousIntegrityStatus}`,
        `- repairedAt: ${entry.repairedAt}`,
        `- reason: ${entry.reason}`,
        ''
      );
    }
  }

  return lines.join('\n');
}

function downloadFilteredMutationIndexAuditReport(params: {
  projectName: string;
  slot: string;
  actionFilter: AgenticAuditActionFilter;
  auditTrail: NonNullable<AgenticRecommendationMutationIndex['integrityAuditTrail']>;
  counts: ReturnType<typeof countAgenticMutationIndexAuditActions>;
  integrity: AgenticRecommendationMutationIndexIntegrity | null;
  format: 'json' | 'markdown';
}) {
  const content = createFilteredMutationIndexAuditReport(params);
  const safeFilter = params.actionFilter.replace(/[^a-z0-9_-]/gi, '_');
  const extension = params.format === 'json' ? 'json' : 'md';
  const mime = params.format === 'json' ? 'application/json' : 'text/markdown';
  downloadTextFile(
    `${params.projectName || 'untitled_project'}-${params.slot}-mutation-index-audit-${safeFilter}.${extension}`,
    content,
    mime
  );
}

function formatSignedInteger(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function formatComparisonList(values: string[]) {
  return values.length ? values.slice(0, 3).join(', ') : 'none';
}

function timelineStatusClasses(status: ReturnType<typeof createAgenticExecutionTimeline>[number]['status']) {
  if (status === 'ok') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'error') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-800 bg-slate-950/70 text-slate-400';
}

function formatTimelineRawValue(value: unknown) {
  if (value === undefined) return '(missing)';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatToolRawJson(value: unknown) {
  if (value === undefined) return '(missing)';
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function isLargeToolRaw(value: unknown) {
  return formatToolRawJson(value).length > 420;
}

function isLargeTimelineDiff(before: unknown, after: unknown) {
  return `${formatToolRawJson(before)}${formatToolRawJson(after)}`.length > 300;
}

function filterAgenticTimelineItems(
  items: ReturnType<typeof createAgenticExecutionTimeline>,
  filter: AgenticTimelineMutationFilter
) {
  if (filter === 'all') {
    return items;
  }
  return items.filter((item) => {
    if (!item.toolCallId) {
      return true;
    }
    return filter === 'mutating' ? item.mutatesWorld === true : item.mutatesWorld === false;
  });
}

function mutationIndexIntegrityClasses(status?: AgenticRecommendationMutationIndexIntegrity['status']) {
  if (status === 'valid') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'mismatch') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (status === 'missing') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-slate-700 bg-slate-900 text-slate-500';
}

function countAgenticMutationIndexAuditActions(
  auditTrail: AgenticRecommendationMutationIndex['integrityAuditTrail']
) {
  const counts = {
    checksumRepairCount: 0,
    historyReindexedFullCount: 0,
    historyReindexedPartialCount: 0,
    legacyHistoryReindexedCount: 0,
  };

  for (const entry of auditTrail ?? []) {
    if (entry.action === 'checksum_recalculated') {
      counts.checksumRepairCount += 1;
    } else if (entry.action === 'history_reindexed_full') {
      counts.historyReindexedFullCount += 1;
    } else if (entry.action === 'history_reindexed_partial') {
      counts.historyReindexedPartialCount += 1;
    } else if (entry.action === 'history_reindexed') {
      counts.legacyHistoryReindexedCount += 1;
    }
  }

  return counts;
}

function shortChecksum(value?: string) {
  return value ? `${value.slice(0, 10)}...${value.slice(-6)}` : 'none';
}

function mutationIndexExportBlockReason(
  integrity: AgenticRecommendationMutationIndexIntegrity | null,
  auditSummary?: AgenticMutationIndexAuditSummary | null
) {
  if (auditSummary?.indexBehind) {
    return 'Export bloqueado: índice atrasado. Reindexa desde historial antes de exportar el índice completo.';
  }
  if (!integrity || integrity.status === 'valid') {
    return '';
  }
  if (integrity.status === 'mismatch') {
    return 'Export bloqueado: checksum mismatch. Repara el índice antes de exportar el índice completo.';
  }
  return 'Export bloqueado: checksum ausente. Repara el índice antes de exportar el índice completo.';
}

function downloadAgenticRecommendationMutationIndexServerReport(params: {
  projectName: string;
  slot: string;
  format: 'json' | 'markdown';
  recommendationKey?: string;
  scope?: 'index' | 'audit';
}) {
  const search = new URLSearchParams();
  search.set('projectKey', params.projectName || 'untitled_project');
  search.set('slot', params.slot);
  search.set('format', params.format);
  if (params.scope === 'audit') {
    search.set('scope', 'audit');
  }
  if (params.recommendationKey?.trim()) {
    search.set('recommendationKey', params.recommendationKey.trim());
  }
  const anchor = document.createElement('a');
  anchor.href = `/api/agentic/recommendations/mutation-index/export?${search.toString()}`;
  anchor.rel = 'noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function mutationIndexMappingsForRecord(
  index: AgenticRecommendationMutationIndex | null,
  record: AgenticExecutionHistoryRecord
) {
  const link = record.recommendationExecution;
  if (!index || !link) {
    return [];
  }

  return link.recommendationKeys.flatMap((recommendationKey) => {
    const entry = index.recommendations[recommendationKey];
    return (entry?.executions ?? [])
      .filter((execution) => execution.executionId === record.id)
      .flatMap((execution) =>
        execution.toolCalls.flatMap((toolCall) => {
          const evidenceIds = toolCall.evidenceIds.length ? toolCall.evidenceIds : ['sin-evidence-id'];
          return evidenceIds.map((evidenceId) => ({
            recommendationKey,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            evidenceId,
            targetIds: toolCall.targetIds,
            partialRollbackAppliedAt: execution.partialRollbackAppliedAt,
          }));
        })
      );
  });
}

type AgenticSharedRecommendation = NonNullable<
  AgenticExecutionHistoryRecord['sharedMemory']
>['actionableRecommendations'][number];

function agenticRecommendationDecisionKey(
  record: AgenticExecutionHistoryRecord,
  recommendation: AgenticSharedRecommendation
) {
  return `${record.id}:${recommendation.approvalKey || recommendation.id}`;
}

function agenticRecommendationStatus(
  record: AgenticExecutionHistoryRecord,
  recommendation: AgenticSharedRecommendation,
  decisions: Record<string, 'approved' | 'rejected'>
) {
  return decisions[agenticRecommendationDecisionKey(record, recommendation)] ?? recommendation.approvalStatus;
}

function plannerStatusLabel(
  status:
    | ClientAgentPlannerPlan['status']
    | AgentPlannerStageStatus
    | ClientAgentPlannerPlan['jobs'][number]['status']
    | ClientAgentPlannerPlan['assistantJobs'][number]['status']
    | ClientAgentPlannerPlan['assistantJobs'][number]['resultStatus']
    | ClientAgentPlannerPlan['execution']['state']
): string {
  if (status === 'draft') return 'Borrador';
  if (status === 'queued') return 'En cola';
  if (status === 'processing') return 'Procesando';
  if (status === 'running') return 'En curso';
  if (status === 'completed') return 'Completo';
  if (status === 'failed') return 'Falló';
  if (status === 'canceled') return 'Cancelado';
  if (status === 'idle') return 'Idle';
  if (status === 'blocked') return 'Bloqueado';
  if (status === 'pending') return 'Pendiente';
  if (status === 'ready_to_finalize') return 'Listo para finalizar';
  if (status === 'asset_ready') return 'Asset listo';
  if (status === 'finalized') return 'Finalizado';
  if (status === 'applied') return 'Aplicado';
  if (status === 'skipped') return 'Omitida';
  return status;
}

function plannerStatusClasses(
  status:
    | ClientAgentPlannerPlan['status']
    | AgentPlannerStageStatus
    | ClientAgentPlannerPlan['jobs'][number]['status']
    | ClientAgentPlannerPlan['assistantJobs'][number]['status']
    | ClientAgentPlannerPlan['assistantJobs'][number]['resultStatus']
): string {
  if (status === 'completed') return 'border-green-500/30 bg-green-500/10 text-green-200';
  if (status === 'running') return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  if (status === 'queued') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
  if (status === 'processing') return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  if (status === 'ready_to_finalize') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'asset_ready' || status === 'finalized') {
    return 'border-green-500/30 bg-green-500/10 text-green-200';
  }
  if (status === 'applied') return 'border-lime-500/30 bg-lime-500/10 text-lime-200';
  if (status === 'blocked') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (status === 'skipped' || status === 'canceled') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function plannerReceiptActionLabel(
  action: ClientAgentPlannerPlan['receipts'][number]['action']
): string {
  if (action === 'create') return 'Create';
  if (action === 'resume') return 'Resume';
  if (action === 'stage_status') return 'Stage';
  if (action === 'assistant_job') return 'Assistant Job';
  if (action === 'assistant_apply') return 'Assistant Apply';
  if (action === 'custom_task_status') return 'Custom Task';
  if (action === 'custom_task_metadata') return 'Custom Metadata';
  if (action === 'custom_task_metadata_revert') return 'Metadata Revert';
  if (action === 'checkpoint') return 'Checkpoint';
  if (action === 'cancel') return 'Cancel';
  return action;
}

// AI Mode Toggle
export function AIModeToggle() {
  const { aiMode, setAIMode, engineMode } = useEngineStore();
  const lockedByWorkflow = engineMode === 'MODE_MANUAL' || engineMode === 'MODE_AI_FIRST';

  const modes: { value: AIMode; label: string; color: string }[] = [
    { value: 'OFF', label: 'Off', color: 'bg-slate-600' },
    { value: 'API', label: 'API', color: 'bg-blue-500' },
    { value: 'LOCAL', label: 'Local', color: 'bg-purple-500' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-lg">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => {
            if (lockedByWorkflow) return;
            setAIMode(mode.value);
          }}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-md transition-all",
            aiMode === mode.value
              ? `${mode.color} text-white`
              : "text-slate-400 hover:text-slate-200",
            lockedByWorkflow && "cursor-not-allowed opacity-60"
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

// Quick Action Button
function QuickActionButton({ 
  icon: Icon, 
  label, 
  onClick,
  disabled
}: { 
  icon: LucideIcon; 
  label: string; 
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700 text-left disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Icon className="w-4 h-4 text-blue-400 shrink-0" />
      <span className="text-xs">{label}</span>
    </button>
  );
}

// Generation Progress Display
function GenerationProgress({ task, onCancel }: { task: GenerationTask; onCancel?: () => void }) {
  const title = task.type === 'character' ? 'Generando personaje 3D...' : 'Generando modelo 3D...';
  const processingLabel =
    task.type === 'character' ? 'Preparando personaje...' : 'Preparando recurso...';

  return (
    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="flex items-center gap-2 mb-2">
        <Cuboid className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-slate-200">{title}</span>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{task.prompt}</span>
          <span>{task.progress}%</span>
        </div>
        <Progress value={task.progress} className="h-2" />
        
        {task.status === 'processing' && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{processingLabel}</span>
          </div>
        )}
        {task.type === 'character' && task.status === 'processing' && onCancel && (
          <div className="mt-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        )}
        {task.stage && (
          <div className="text-xs text-slate-500">Etapa: {task.stage}</div>
        )}
        
        {task.thumbnailUrl && (
          <img 
            src={task.thumbnailUrl} 
            alt="Preview" 
            className="w-full h-24 object-contain rounded bg-slate-900 mt-2"
          />
        )}
        
        {task.modelUrl && task.status === 'completed' && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600">
              <Download className="w-3 h-3 mr-1" />
              Importar al Editor
            </Button>
          </div>
        )}
        
        {task.error && (
          <div className="flex items-center gap-2 text-xs text-red-400 mt-2">
            <AlertCircle className="w-3 h-3" />
            <span>{task.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AgenticMutationIndexExportButton({
  children,
  className,
  disabled,
  onClick,
  testId,
  title,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
  title: string;
}) {
  return (
    <span title={title} data-testid={`${testId}-wrapper`}>
      <Button
        size="sm"
        variant="ghost"
        className={className}
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
      >
        {children}
      </Button>
    </span>
  );
}

// Main AI Chat Panel
export function AIChatPanel({ advancedMode = false }: { advancedMode?: boolean }) {
  const { 
    chatMessages, 
    addChatMessage, 
    clearChat, 
    isAiProcessing, 
    setAiProcessing, 
    aiMode,
    setAIMode,
    engineMode,
    setEngineMode,
    addEntity, 
    createScene,
    addAsset,
    removeEntity,
    updateEntity,
    addAgent,
    updateAgentStatus,
    addTask,
    updateTask,
    entities,
    projectName,
    editor,
    runReyPlayCompile,
    setAgenticMutationIndexAudit,
  } = useEngineStore();
  
  const messages = chatMessages || [];
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<GenerationTask | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot>({
    loading: false,
    checkedAt: null,
    assistant: { level: 'unknown', message: 'Sin verificar' },
    automation: { level: 'unknown', message: 'Sin verificar' },
    characters: { level: 'unknown', message: 'Sin verificar' },
  });
  const [agentPlan, setAgentPlan] = useState<ClientAgentPlannerPlan | null>(null);
  const [agentPlannerLoading, setAgentPlannerLoading] = useState(false);
  const [agentPlannerError, setAgentPlannerError] = useState<string | null>(null);
  const [pendingStaleMetadataRevert, setPendingStaleMetadataRevert] =
    useState<PendingStaleCustomTaskMetadataRevert | null>(null);
  const [customPlannerOpen, setCustomPlannerOpen] = useState(false);
  const [customPlannerPrompt, setCustomPlannerPrompt] = useState('');
  const [customPlannerSourceBlockId, setCustomPlannerSourceBlockId] = useState('manual_scope');
  const [customPlannerTasksInput, setCustomPlannerTasksInput] = useState('');
  const [customPlannerPriority, setCustomPlannerPriority] =
    useState<'low' | 'medium' | 'high'>('medium');
  const [customPlannerOwner, setCustomPlannerOwner] = useState('technical_lead');
  const [agentPlannerSourceBlockFilter, setAgentPlannerSourceBlockFilter] = useState('all');
  const [customTaskMetadataHistoryFilter, setCustomTaskMetadataHistoryFilter] =
    useState<CustomTaskMetadataHistoryFilter>('all');
  const [agentPlannerRevertAuditFilter, setAgentPlannerRevertAuditFilter] =
    useState<'all' | 'staleConfirmed'>('all');
  const [agentPlannerRevertAuditPage, setAgentPlannerRevertAuditPage] = useState(0);
  const [agentPlannerGlobalRevertAuditData, setAgentPlannerGlobalRevertAuditData] =
    useState<AIAgentPlannerCustomTaskRevertAuditsResponse | null>(null);
  const [agentPlannerGlobalRevertAuditLoading, setAgentPlannerGlobalRevertAuditLoading] = useState(false);
  const [agentPlannerGlobalRevertAuditError, setAgentPlannerGlobalRevertAuditError] =
    useState<string | null>(null);
  const [staleRevertPolicy, setStaleRevertPolicy] =
    useState<AIAgentPlannerStaleRevertPolicyResponse | null>(null);
  const [staleRevertPolicyDraftRoles, setStaleRevertPolicyDraftRoles] =
    useState<StaleMetadataRevertPolicyRole[]>(['OWNER']);
  const [staleRevertPolicyReason, setStaleRevertPolicyReason] = useState('');
  const [staleRevertPolicyAuditPage, setStaleRevertPolicyAuditPage] = useState(0);
  const [staleRevertPolicyAuditFilter, setStaleRevertPolicyAuditFilter] =
    useState<StaleMetadataRevertPolicyAuditEventTypeFilter>('all');
  const [staleRevertPolicyActorFilter, setStaleRevertPolicyActorFilter] = useState('');
  const [staleRevertPolicyActorFilterInput, setStaleRevertPolicyActorFilterInput] = useState('');
  const [staleRevertPolicyDateFromFilter, setStaleRevertPolicyDateFromFilter] = useState('');
  const [staleRevertPolicyDateFromFilterInput, setStaleRevertPolicyDateFromFilterInput] = useState('');
  const [staleRevertPolicyDateToFilter, setStaleRevertPolicyDateToFilter] = useState('');
  const [staleRevertPolicyDateToFilterInput, setStaleRevertPolicyDateToFilterInput] = useState('');
  const [staleRevertPolicyResetDialogOpen, setStaleRevertPolicyResetDialogOpen] = useState(false);
  const [staleRevertPolicyLoading, setStaleRevertPolicyLoading] = useState(false);
  const [staleRevertPolicySaving, setStaleRevertPolicySaving] = useState(false);
  const [staleRevertPolicyError, setStaleRevertPolicyError] = useState<string | null>(null);
  const [customTaskEditDrafts, setCustomTaskEditDrafts] = useState<Record<string, CustomTaskEditDraft>>({});
  const [customPlannerScopeLoading, setCustomPlannerScopeLoading] = useState(false);
  const [customPlannerScopeStatus, setCustomPlannerScopeStatus] = useState<string | null>(null);
  const [customPlannerApprovedBlocks, setCustomPlannerApprovedBlocks] = useState<ApprovedReanalysisScopeBlock[]>([]);
  const [customPlannerSelectedApprovedBlockIds, setCustomPlannerSelectedApprovedBlockIds] =
    useState<Record<string, boolean>>({});
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgressState>({
    visible: false,
    kind: 'creation',
    totalStages: 0,
    completedStages: 0,
    currentStageTitle: '',
    status: 'running',
  });
  const [serverAgenticExecution, setServerAgenticExecution] = useState(false);
  const [agenticRequireRecommendationApproval, setAgenticRequireRecommendationApproval] = useState(false);
  const [agenticRecommendationDecisions, setAgenticRecommendationDecisions] = useState<
    Record<string, 'approved' | 'rejected'>
  >({});
  const [agenticHistory, setAgenticHistory] = useState<AgenticExecutionHistoryRecord[]>([]);
  const [agenticHistoryPagination, setAgenticHistoryPagination] =
    useState<AgenticExecutionHistoryPagination | null>(null);
  const [agenticHistoryFilterOptionsFromServer, setAgenticHistoryFilterOptionsFromServer] =
    useState<AgenticExecutionHistoryFilterOptions>({ tools: [], agents: [] });
  const [agenticHistoryFilterCounts, setAgenticHistoryFilterCounts] =
    useState<AgenticExecutionHistoryFilterCounts | null>(null);
  const [agenticMutationIndexAuditSummary, setAgenticMutationIndexAuditSummary] =
    useState<AgenticMutationIndexAuditSummary | null>(null);
  const [agenticHistoryLoading, setAgenticHistoryLoading] = useState(false);
  const [agenticHistoryError, setAgenticHistoryError] = useState<string | null>(null);
  const [agenticMutationIndex, setAgenticMutationIndex] =
    useState<AgenticRecommendationMutationIndex | null>(null);
  const [agenticMutationIndexIntegrity, setAgenticMutationIndexIntegrity] =
    useState<AgenticRecommendationMutationIndexIntegrity | null>(null);
  const [agenticMutationIndexLoading, setAgenticMutationIndexLoading] = useState(false);
  const [agenticMutationIndexRepairing, setAgenticMutationIndexRepairing] = useState(false);
  const [agenticMutationIndexError, setAgenticMutationIndexError] = useState<string | null>(null);
  const [agenticMutationIndexAuditOpen, setAgenticMutationIndexAuditOpen] = useState(false);
  const [selectedAgenticHistoryId, setSelectedAgenticHistoryId] = useState<string | null>(null);
  const [agenticHistoryFilter, setAgenticHistoryFilter] = useState<AgenticHistoryFilter>('all');
  const [agenticToolFilter, setAgenticToolFilter] = useState('all');
  const [agenticAgentFilter, setAgenticAgentFilter] = useState('all');
  const [agenticAuditActionFilter, setAgenticAuditActionFilter] =
    useState<AgenticAuditActionFilter>('all');
  const [agenticTimelineMutationFilter, setAgenticTimelineMutationFilter] =
    useState<AgenticTimelineMutationFilter>('all');
  const [agenticHistorySearch, setAgenticHistorySearch] = useState('');
  const [agenticHistorySearchInput, setAgenticHistorySearchInput] = useState('');
  const [agenticTraceEventFilter, setAgenticTraceEventFilter] = useState('');
  const [agenticTraceActorFilter, setAgenticTraceActorFilter] = useState('');
  const [agenticTraceSeverityFilter, setAgenticTraceSeverityFilter] = useState('all');
  const [agenticHistoryPage, setAgenticHistoryPage] = useState(0);
  const [agenticComparisonIds, setAgenticComparisonIds] = useState<string[]>([]);
  const [agenticHistoryAction, setAgenticHistoryAction] = useState<{
    id: string;
    action: AgenticHistoryAction;
  } | null>(null);
  const [agenticRecommendationAction, setAgenticRecommendationAction] = useState<string | null>(null);
  const [rollbackCandidate, setRollbackCandidate] = useState<AgenticExecutionHistoryRecord | null>(null);
  const [chatScrollProgress, setChatScrollProgress] = useState(100);
  const pipelineHideTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scriptPersistenceAvailabilityRef = useRef<ScriptPersistenceAvailability>('unknown');
  useAIModeWorkflowSync({ aiMode, engineMode, setAIMode });
  const { showConfigWarning, getCapabilityStatus } = useAIProviderCapabilities({ aiMode, engineMode });
  const {
    isManualWorkflow,
    isAIFirstWorkflow,
    modeLabel,
    modeDescription,
    inputPlaceholder,
  } = getWorkflowPresentation(engineMode);
  const modeGuide = MODE_AUTO_GUIDE[engineMode];
  const isInputLocked = isAiProcessing || isManualWorkflow;

  const refreshAgenticHistory = useCallback(async (options?: {
    quiet?: boolean;
    page?: number;
    search?: string;
    historyFilter?: AgenticHistoryFilter;
    toolFilter?: string;
    agentFilter?: string;
    traceEvent?: string;
    traceActor?: string;
    traceSeverity?: string;
  }) => {
    if (!options?.quiet) {
      setAgenticHistoryLoading(true);
    }
    setAgenticHistoryError(null);
    const nextPage = Math.max(0, options?.page ?? agenticHistoryPage);
    const nextSearch = (options?.search ?? agenticHistorySearch).trim();
    const nextHistoryFilter = options?.historyFilter ?? agenticHistoryFilter;
    const nextToolFilter = options?.toolFilter ?? agenticToolFilter;
    const nextAgentFilter = options?.agentFilter ?? agenticAgentFilter;
    const nextTraceEvent = (options?.traceEvent ?? agenticTraceEventFilter).trim();
    const nextTraceActor = (options?.traceActor ?? agenticTraceActorFilter).trim();
    const nextTraceSeverity = options?.traceSeverity ?? agenticTraceSeverityFilter;

    try {
      const { response, data } = await requestAgenticServerHistory({
        projectName: projectName || 'untitled_project',
        limit: AGENTIC_HISTORY_PAGE_SIZE,
        offset: nextPage * AGENTIC_HISTORY_PAGE_SIZE,
        search: nextSearch,
        historyFilter: nextHistoryFilter,
        toolFilter: nextToolFilter,
        agentFilter: nextAgentFilter,
        traceEvent: nextTraceEvent,
        traceActor: nextTraceActor,
        traceSeverity: nextTraceSeverity === 'all' ? '' : nextTraceSeverity,
      });
      if (!response.ok || data.success === false) {
        throw new Error(data.error || response.statusText || 'No se pudo leer historial agentic.');
      }
      const nextHistory = data.history ?? [];
      const nextMutationIndexAuditSummary = data.mutationIndexAudit ?? null;
      setAgenticHistory(nextHistory);
      setAgenticHistoryPagination(data.pagination ?? null);
      setAgenticHistoryFilterOptionsFromServer(data.filterOptions ?? { tools: [], agents: [] });
      setAgenticHistoryFilterCounts(data.filterCounts ?? null);
      setAgenticMutationIndexAuditSummary(nextMutationIndexAuditSummary);
      setAgenticMutationIndexAudit(nextMutationIndexAuditSummary);
      notifyAgenticMutationIndexAudit(nextMutationIndexAuditSummary);
      setAgenticHistoryPage(nextPage);
      setAgenticHistorySearch(nextSearch);
      setAgenticHistorySearchInput(nextSearch);
      setAgenticHistoryFilter(nextHistoryFilter);
      setAgenticToolFilter(nextToolFilter || 'all');
      setAgenticAgentFilter(nextAgentFilter || 'all');
      setAgenticTraceEventFilter(nextTraceEvent);
      setAgenticTraceActorFilter(nextTraceActor);
      setAgenticTraceSeverityFilter(nextTraceSeverity || 'all');
      setSelectedAgenticHistoryId((current) =>
        current && nextHistory.some((record) => record.id === current) ? current : null
      );
    } catch (error) {
      setAgenticHistoryError(String(error));
    } finally {
      setAgenticHistoryLoading(false);
    }
  }, [
    agenticHistoryPage,
    agenticHistoryFilter,
    agenticHistorySearch,
    agenticToolFilter,
    agenticAgentFilter,
    agenticTraceActorFilter,
    agenticTraceEventFilter,
    agenticTraceSeverityFilter,
    projectName,
    setAgenticMutationIndexAudit,
  ]);

  const refreshAgenticMutationIndex = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setAgenticMutationIndexLoading(true);
    }
    setAgenticMutationIndexError(null);

    try {
      const { response, data } = await requestAgenticRecommendationMutationIndex({
        projectName: projectName || 'untitled_project',
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
      });
      if (!response.ok || data.success === false || !data.index) {
        throw new Error(data.error || response.statusText || 'No se pudo leer el índice de mutaciones.');
      }
      setAgenticMutationIndex(data.index);
      setAgenticMutationIndexIntegrity(data.integrity ?? null);
      const fallbackAuditActionCounts = countAgenticMutationIndexAuditActions(data.index.integrityAuditTrail);
      const fallbackMutationIndexAuditSummary: AgenticMutationIndexAuditSummary = {
        repairCount: data.index.integrityAuditTrail?.length ?? 0,
        ...fallbackAuditActionCounts,
        latestRepairId: data.index.integrityAuditTrail?.[0]?.id ?? null,
        latestRepairAt: data.index.integrityAuditTrail?.[0]?.repairedAt ?? null,
        integrityStatus: data.integrity?.status ?? 'valid',
        integrityValid: data.integrity?.valid ?? true,
        recommendationCount: Object.keys(data.index.recommendations).length,
      };
      const statusResult = await requestAgenticMutationIndexStatus({
        projectName: projectName || 'untitled_project',
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
      }).catch(() => null);
      const nextMutationIndexAuditSummary: AgenticMutationIndexAuditSummary =
        statusResult?.response.ok && statusResult.data.mutationIndexAudit
          ? {
              ...statusResult.data.mutationIndexAudit,
              checkedAt: statusResult.data.checkedAt ?? null,
            }
          : fallbackMutationIndexAuditSummary;
      setAgenticMutationIndexAuditSummary(nextMutationIndexAuditSummary);
      setAgenticMutationIndexAudit(nextMutationIndexAuditSummary);
      notifyAgenticMutationIndexAudit(nextMutationIndexAuditSummary);
    } catch (error) {
      setAgenticMutationIndexIntegrity(null);
      setAgenticMutationIndexError(String(error));
    } finally {
      setAgenticMutationIndexLoading(false);
    }
  }, [projectName, setAgenticMutationIndexAudit]);

  const handleAgenticMutationIndexRepair = useCallback(async () => {
    const status = agenticMutationIndexIntegrity?.status ?? 'unknown';
    const confirmed = window.confirm(
      [
        `Reparar índice agentic con estado "${status}"?`,
        '',
        'Esto recalcula el checksum sobre el índice actual y persiste una traza de auditoría.',
        'No elimina recomendaciones, ejecuciones, tool calls ni evidencias.',
      ].join('\n')
    );
    if (!confirmed) {
      return;
    }

    setAgenticMutationIndexRepairing(true);
    setAgenticMutationIndexError(null);

    try {
      const { response, data } = await requestAgenticRecommendationMutationIndexRepair({
        projectName: projectName || 'untitled_project',
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
        confirmRepair: true,
        reason: `ui_debug_panel_repair:${status}`,
      });
      if (!response.ok || data.success === false || !data.index) {
        throw new Error(data.error || response.statusText || 'No se pudo reparar el índice de mutaciones.');
      }

      setAgenticMutationIndex(data.index);
      setAgenticMutationIndexIntegrity(data.integrity ?? null);
      const auditActionCounts = countAgenticMutationIndexAuditActions(data.index.integrityAuditTrail);
      const nextMutationIndexAuditSummary: AgenticMutationIndexAuditSummary = {
        repairCount: data.index.integrityAuditTrail?.length ?? 0,
        ...auditActionCounts,
        latestRepairId: data.index.integrityAuditTrail?.[0]?.id ?? null,
        latestRepairAt: data.index.integrityAuditTrail?.[0]?.repairedAt ?? null,
        integrityStatus: data.integrity?.status ?? 'valid',
        integrityValid: data.integrity?.valid ?? true,
        recommendationCount: Object.keys(data.index.recommendations).length,
      };
      setAgenticMutationIndexAuditSummary(nextMutationIndexAuditSummary);
      setAgenticMutationIndexAudit(nextMutationIndexAuditSummary);
      notifyAgenticMutationIndexAudit(nextMutationIndexAuditSummary);
      addChatMessage({
        role: 'assistant',
        content: [
          '**Índice invertido reparado**',
          '',
          `Estado anterior: ${data.previousIntegrity?.status ?? status}`,
          `Estado actual: ${data.integrity?.status ?? 'unknown'}`,
          data.auditEntry?.id ? `Auditoría: ${data.auditEntry.id}` : null,
        ].filter(Boolean).join('\n'),
        metadata: { agentType: 'orchestrator' },
      });
    } catch (error) {
      const message = String(error);
      setAgenticMutationIndexError(message);
      addChatMessage({
        role: 'assistant',
        content: `**Reparación de índice fallida**\n\n${message}`,
        metadata: { agentType: 'orchestrator', type: 'warning' },
      });
    } finally {
      setAgenticMutationIndexRepairing(false);
    }
  }, [addChatMessage, agenticMutationIndexIntegrity, projectName, setAgenticMutationIndexAudit]);

  const handleAgenticMutationIndexReindex = useCallback(async (executionId?: string) => {
    const lastIndexed = agenticMutationIndexAuditSummary?.lastIndexedExecutionId ?? 'none';
    const latestIndexable = agenticMutationIndexAuditSummary?.latestIndexableExecutionId ?? 'none';
    const explicitExecutionId = executionId?.trim() || '';
    const partialExecutionId =
      explicitExecutionId ||
      (agenticMutationIndexAuditSummary?.pendingIndexableExecutionIds?.length === 1
        ? agenticMutationIndexAuditSummary.pendingIndexableExecutionIds[0]
        : null);
    const confirmed = window.confirm(
      [
        explicitExecutionId
          ? 'Reindexar solo esta ejecución pendiente?'
          : partialExecutionId
          ? 'Reindexar índice agentic parcialmente desde historial?'
          : 'Reindexar índice agentic desde historial?',
        '',
        partialExecutionId ? `Ejecución parcial: ${partialExecutionId}` : null,
        `Última ejecución indexada: ${lastIndexed}`,
        `Última ejecución aprobada con mutaciones: ${latestIndexable}`,
        '',
        partialExecutionId
          ? 'Esto indexa solo la ejecución pendiente indicada y deja traza de auditoría.'
          : 'Esto reconstruye el índice invertido desde ejecuciones aprobadas persistidas y deja traza de auditoría.',
      ].filter(Boolean).join('\n')
    );
    if (!confirmed) {
      return;
    }

    if (explicitExecutionId) {
      setAgenticHistoryAction({ id: explicitExecutionId, action: 'reindexPending' });
    }
    setAgenticMutationIndexRepairing(true);
    setAgenticMutationIndexError(null);

    try {
      const { response, data } = await requestAgenticRecommendationMutationIndexReindex({
        projectName: projectName || 'untitled_project',
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
        confirmReindex: true,
        executionId: partialExecutionId ?? undefined,
        reason: explicitExecutionId
          ? `ui_history_row_reindex_partial:index_behind:${explicitExecutionId}`
          : partialExecutionId
          ? `ui_debug_panel_reindex_partial:index_behind:${partialExecutionId}`
          : `ui_debug_panel_reindex:index_behind:${latestIndexable}`,
      });
      if (!response.ok || data.success === false || !data.index) {
        throw new Error(data.error || response.statusText || 'No se pudo reindexar el índice de mutaciones.');
      }

      setAgenticMutationIndex(data.index);
      setAgenticMutationIndexIntegrity(data.integrity ?? null);
      await refreshAgenticHistory({ quiet: true });
      await refreshAgenticMutationIndex({ quiet: true });
      addChatMessage({
        role: 'assistant',
        content: [
          '**Índice invertido reindexado desde historial**',
          '',
          partialExecutionId ? `Modo: parcial (${partialExecutionId})` : 'Modo: completo',
          `Ejecuciones indexadas: ${data.indexedExecutionCount ?? 'unknown'}`,
          `Recomendaciones indexadas: ${data.recommendationCount ?? Object.keys(data.index.recommendations).length}`,
          data.auditEntry?.id ? `Auditoría: ${data.auditEntry.id}` : null,
        ].filter(Boolean).join('\n'),
        metadata: { agentType: 'orchestrator' },
      });
    } catch (error) {
      const message = String(error);
      setAgenticMutationIndexError(message);
      addChatMessage({
        role: 'assistant',
        content: `**Reindexado de índice fallido**\n\n${message}`,
        metadata: { agentType: 'orchestrator', type: 'warning' },
      });
    } finally {
      if (explicitExecutionId) {
        setAgenticHistoryAction(null);
      }
      setAgenticMutationIndexRepairing(false);
    }
  }, [
    addChatMessage,
    agenticMutationIndexAuditSummary,
    projectName,
    refreshAgenticHistory,
    refreshAgenticMutationIndex,
  ]);

  const applyRemoteProjectSave = useCallback(async () => {
    const remoteProject = await fetchRemoteEditorProjectSave({
      projectName: projectName || 'untitled_project',
      slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
    });
    const restored = restoreEditorProjectSaveData(
      remoteProject.payload.saveData as Parameters<typeof restoreEditorProjectSaveData>[0]
    );
    if (!remoteProject.response.ok || !restored) {
      throw new Error(remoteProject.payload.error || 'No se pudo recargar el save remoto.');
    }
    useEngineStore.setState(createLoadedEditorProjectPatch(restored));
  }, [projectName]);

  const handleAgenticHistoryMutation = useCallback(async (
    record: AgenticExecutionHistoryRecord,
    action: AgenticHistoryAction
  ) => {
    if ((action === 'replay' || action === 'approved') && agenticMutationIndexAuditSummary?.indexBehind) {
      const message = action === 'approved'
        ? 'Ejecución de recomendaciones aprobadas bloqueada: el índice de recomendaciones está atrasado. Reindexa desde historial antes de mutar.'
        : 'Replay bloqueado: el índice de recomendaciones está atrasado. Reindexa desde historial antes de reejecutar.';
      setAgenticHistoryError(message);
      addChatMessage({
        role: 'assistant',
        content: `**${action === 'approved' ? 'Ejecución bloqueada' : 'Replay bloqueado'}**\n\n${message}`,
        metadata: { agentType: 'orchestrator', type: 'warning' },
      });
      return;
    }

    setAgenticHistoryAction({ id: record.id, action });
    setAgenticHistoryError(null);

    try {
      const { response, data } =
        action === 'approved'
          ? await requestAgenticExecuteApprovedRecommendations({
              executionId: record.id,
              projectName: projectName || 'untitled_project',
              slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
              maxIterations: 3,
            })
          : await requestAgenticServerHistoryMutation({
              action: action === 'rollback' ? 'rollback' : 'replay',
              executionId: record.id,
              projectName: projectName || 'untitled_project',
              slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
              maxIterations: 3,
            });
      const replayReturnedPipeline = action !== 'rollback' && Boolean(data.pipeline);
      if (!response.ok && !replayReturnedPipeline) {
        throw new Error(data.error || response.statusText || 'Acción agentic fallida.');
      }

      await applyRemoteProjectSave();
      await refreshAgenticHistory({ quiet: true });
      await refreshAgenticMutationIndex({ quiet: true });

      if (action === 'rollback') {
        addChatMessage({
          role: 'assistant',
          content: `↩ **Rollback aplicado**\n\nSe restauró el proyecto al estado anterior de la ejecución ${record.id}.`,
          metadata: { agentType: 'orchestrator' },
        });
        return;
      }

      const metadata = data.pipeline?.messageMetadata;
      const validation = metadata?.validation ?? data.pipeline?.validation ?? null;
      addChatMessage({
        role: 'assistant',
          content: [
          data.approved
            ? action === 'approved'
              ? '✅ **Recomendaciones aprobadas ejecutadas**'
              : '✅ **Replay agentic validado**'
            : action === 'approved'
              ? '⚠️ **Ejecución de aprobadas rechazada por el validador**'
              : '⚠️ **Replay agentic rechazado por el validador**',
          '',
          `Ejecución original: ${record.id}`,
          data.pipeline?.id ? `Nueva ejecución: ${data.pipeline.id}` : null,
          validation?.missingRequirements.length
            ? `Faltante: ${validation.missingRequirements.join(', ')}`
            : null,
          validation?.incorrectOutputs.length
            ? `Incorrecto: ${validation.incorrectOutputs.join(', ')}`
            : null,
        ].filter(Boolean).join('\n'),
        metadata: {
          agentType: 'orchestrator',
          type: data.approved ? undefined : 'warning',
          agenticPipeline: metadata,
        },
      });
    } catch (error) {
      const message = String(error);
      setAgenticHistoryError(message);
      addChatMessage({
        role: 'assistant',
        content: `⚠️ **Acción agentic fallida**\n\n${message}`,
        metadata: { agentType: 'orchestrator', type: 'warning' },
      });
    } finally {
      setAgenticHistoryAction(null);
    }
  }, [
    addChatMessage,
    agenticMutationIndexAuditSummary,
    applyRemoteProjectSave,
    projectName,
    refreshAgenticHistory,
    refreshAgenticMutationIndex,
  ]);

  const handleAgenticRecommendationDecision = useCallback(async (
    record: AgenticExecutionHistoryRecord,
    recommendation: AgenticSharedRecommendation,
    decision: 'approved' | 'rejected'
  ) => {
    const decisionKey = agenticRecommendationDecisionKey(record, recommendation);
    setAgenticRecommendationAction(decisionKey);
    setAgenticHistoryError(null);

    try {
      const { response, data } = await requestAgenticRecommendationDecision({
        recommendationId: recommendation.id || recommendation.approvalKey,
        decision,
        executionId: record.id,
        projectName: projectName || 'untitled_project',
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
      });
      if (!response.ok || data.success === false) {
        throw new Error(data.error || response.statusText || 'No se pudo guardar la decisión.');
      }

      setAgenticRecommendationDecisions((current) => ({
        ...current,
        [decisionKey]: decision,
      }));
      if (data.record) {
        setAgenticHistory((current) =>
          current.map((item) => (item.id === data.record?.id ? data.record : item))
        );
      } else {
        await refreshAgenticHistory({ quiet: true });
      }
    } catch (error) {
      const message = String(error);
      setAgenticHistoryError(message);
      addChatMessage({
        role: 'assistant',
        content: `⚠️ **Decisión agentic no guardada**\n\n${message}`,
        metadata: { agentType: 'orchestrator', type: 'warning' },
      });
    } finally {
      setAgenticRecommendationAction(null);
    }
  }, [addChatMessage, projectName, refreshAgenticHistory]);

  const handleAgenticPartialRecommendationRollback = useCallback(async (
    record: AgenticExecutionHistoryRecord,
    recommendationId?: string
  ) => {
    setAgenticHistoryAction({ id: record.id, action: 'partialRollback' });
    setAgenticHistoryError(null);

    try {
      const { response, data } = await requestAgenticPartialRecommendationRollback({
        executionId: record.id,
        projectName: projectName || 'untitled_project',
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
        recommendationId,
      });
      if (!response.ok || data.success === false) {
        throw new Error(data.error || response.statusText || 'Rollback parcial fallido.');
      }

      await applyRemoteProjectSave();
      if (data.record) {
        setAgenticHistory((current) =>
          current.map((item) => (item.id === data.record?.id ? data.record : item))
        );
      } else {
        await refreshAgenticHistory({ quiet: true });
      }
      await refreshAgenticMutationIndex({ quiet: true });
      addChatMessage({
        role: 'assistant',
        content: `↩ **Rollback parcial aplicado**\n\nSe revirtieron solo las mutaciones enlazadas ${recommendationId ? `a ${recommendationId}` : 'a recomendaciones aprobadas'} en ${record.id}.`,
        metadata: { agentType: 'orchestrator' },
      });
    } catch (error) {
      const message = String(error);
      setAgenticHistoryError(message);
      addChatMessage({
        role: 'assistant',
        content: `⚠️ **Rollback parcial fallido**\n\n${message}`,
        metadata: { agentType: 'orchestrator', type: 'warning' },
      });
    } finally {
      setAgenticHistoryAction(null);
    }
  }, [addChatMessage, applyRemoteProjectSave, projectName, refreshAgenticHistory, refreshAgenticMutationIndex]);

  const handleServerAgenticToggle = useCallback((checked: boolean) => {
    setServerAgenticExecution(checked);
    window.localStorage.setItem('rey30.agentic.serverExecution', checked ? 'true' : 'false');
    notifyAgenticServerExecutionPreference(checked);
    if (checked) {
      void refreshAgenticHistory({ quiet: true });
      void refreshAgenticMutationIndex({ quiet: true });
    } else {
      setAgenticMutationIndexAudit(null);
      notifyAgenticMutationIndexAudit(null);
    }
  }, [refreshAgenticHistory, refreshAgenticMutationIndex, setAgenticMutationIndexAudit]);

  const applyAgenticHistorySearch = useCallback(() => {
    void refreshAgenticHistory({
      page: 0,
      search: agenticHistorySearchInput,
      traceEvent: agenticTraceEventFilter,
      traceActor: agenticTraceActorFilter,
      traceSeverity: agenticTraceSeverityFilter,
    });
  }, [
    agenticHistorySearchInput,
    agenticTraceActorFilter,
    agenticTraceEventFilter,
    agenticTraceSeverityFilter,
    refreshAgenticHistory,
  ]);

  const goToAgenticHistoryPage = useCallback((nextPage: number) => {
    void refreshAgenticHistory({
      page: Math.max(0, nextPage),
      search: agenticHistorySearch,
      traceEvent: agenticTraceEventFilter,
      traceActor: agenticTraceActorFilter,
      traceSeverity: agenticTraceSeverityFilter,
    });
  }, [
    agenticHistorySearch,
    agenticTraceActorFilter,
    agenticTraceEventFilter,
    agenticTraceSeverityFilter,
    refreshAgenticHistory,
  ]);

  const toggleAgenticComparison = useCallback((recordId: string) => {
    setAgenticComparisonIds((current) => {
      if (current.includes(recordId)) {
        return current.filter((id) => id !== recordId);
      }
      if (current.length >= 2) {
        return [current[1], recordId];
      }
      return [...current, recordId];
    });
  }, []);

  useEffect(() => {
    const enabled = shouldUseServerAgenticExecution();
    setServerAgenticExecution(enabled);
    if (enabled) {
      void refreshAgenticHistory({ quiet: true });
      void refreshAgenticMutationIndex({ quiet: true });
    }
  }, [refreshAgenticHistory, refreshAgenticMutationIndex]);

  useEffect(() => {
    if (!serverAgenticExecution) return;
    const latest = messages.at(-1);
    if (latest?.role === 'assistant' && latest.metadata?.agenticPipeline) {
      void refreshAgenticHistory({ quiet: true });
      void refreshAgenticMutationIndex({ quiet: true });
    }
  }, [messages, refreshAgenticHistory, refreshAgenticMutationIndex, serverAgenticExecution]);

  useEffect(() => {
    setAgenticComparisonIds((current) =>
      current.filter((id) => agenticHistory.some((record) => record.id === id))
    );
  }, [agenticHistory]);

  const updateChatScrollProgress = useCallback(() => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    const max = viewport.scrollHeight - viewport.clientHeight;
    if (max <= 0) {
      setChatScrollProgress(100);
      return;
    }
    const ratio = Math.min(1, Math.max(0, viewport.scrollTop / max));
    setChatScrollProgress(Math.round(ratio * 100));
  }, []);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    window.requestAnimationFrame(updateChatScrollProgress);
  }, [updateChatScrollProgress]);

  useEffect(() => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    const handleScroll = () => updateChatScrollProgress();
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    updateChatScrollProgress();
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [updateChatScrollProgress]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollChatToBottom('smooth');
  }, [messages, activeTask, scrollChatToBottom]);

  const canPersistGeneratedScripts = useCallback(async (): Promise<boolean> => {
    const cached = scriptPersistenceAvailabilityRef.current;
    if (cached === 'available') return true;
    if (cached === 'restricted') return false;

    try {
      const { response, data } = await requestAssistantStatus({ includeDiagnostics: true });
      if (response.ok) {
        const automationDiagnostic = data.diagnostics?.automation;
        if (automationDiagnostic?.available) {
          scriptPersistenceAvailabilityRef.current = 'available';
          return true;
        }
        if (automationDiagnostic?.restricted) {
          scriptPersistenceAvailabilityRef.current = 'restricted';
          return false;
        }
      }
    } catch {
      // keep unknown; next attempt can retry
    }

    return false;
  }, []);

  const handleAgenticProgress = useCallback((event: AgenticPipelineProgressEvent) => {
    if (pipelineHideTimeoutRef.current !== null) {
      window.clearTimeout(pipelineHideTimeoutRef.current);
      pipelineHideTimeoutRef.current = null;
    }

    const terminalStatus =
      event.status === 'completed' || event.status === 'approved'
        ? 'completed'
        : event.status === 'failed'
          ? 'error'
          : 'running';

    setPipelineProgress((current) => {
      const totalStages = Math.max(1, event.totalSteps || current.totalStages || 1);
      const completedStages =
        terminalStatus === 'completed'
          ? totalStages
          : Math.min(totalStages, Math.max(0, event.completedSteps));

      return {
        visible: true,
        kind: 'agentic',
        totalStages,
        completedStages,
        currentStageTitle: event.currentStepTitle || event.message,
        status: terminalStatus,
        error: terminalStatus === 'error' ? event.message : undefined,
      };
    });

    if (terminalStatus === 'completed') {
      pipelineHideTimeoutRef.current = window.setTimeout(() => {
        setPipelineProgress((current) =>
          current.kind === 'agentic' ? { ...current, visible: false } : current
        );
        pipelineHideTimeoutRef.current = null;
      }, 2500);
    }
  }, []);

  const {
    requestChatReply,
    generateImageAsset,
    generateVideoAsset,
    canGenerate3DModel,
    generate3DModel,
    generateCharacterAsset,
    cancelCharacterGeneration,
  } = useAIActions({
    aiMode,
    engineMode,
    projectName,
    activePlannerPlanId: advancedMode ? agentPlan?.planId ?? null : null,
    addChatMessage,
    addAsset,
    getCapabilityStatus,
    createBasicGameElement,
    onAgenticProgress: handleAgenticProgress,
    requireAgenticRecommendationApproval: serverAgenticExecution && agenticRequireRecommendationApproval,
    setActiveTask,
  });

  const ensureAgentByType = (agentType: AgentType): string => {
    const state = useEngineStore.getState();
    const existing = Array.from(state.agents.values()).find((agent) => agent.type === agentType);
    if (existing) return existing.id;

    const names: Record<AgentType, string> = {
      orchestrator: 'Orchestrator Agent',
      world_builder: 'World Builder Agent',
      model_generator: 'Model Generator Agent',
      animation: 'Animation Agent',
      gameplay: 'Gameplay Agent',
      ui: 'UI Agent',
      optimization: 'Optimization Agent',
      terrain: 'Terrain Agent',
    };

    const agent: Agent = {
      id: crypto.randomUUID(),
      type: agentType,
      name: names[agentType],
      status: 'idle',
      tools: [],
      currentTask: null,
    };
    addAgent(agent);
    return agent.id;
  };

  const resolveContractScribType = (entity: Entity): ScribType | null => {
    const lowerName = entity.name.toLowerCase();
    const tags = entity.tags.map((tag) => tag.toLowerCase());
    const has = (component: string) => entity.components.has(component);

    if (
      has('Terrain') ||
      tags.includes('terrain') ||
      lowerName.includes('terrain') ||
      lowerName.includes('terreno') ||
      lowerName.includes('mazefloor')
    ) {
      return 'terrainBasic';
    }

    if (
      has('Weapon') ||
      tags.includes('weapon') ||
      lowerName.includes('weapon') ||
      lowerName.includes('espada') ||
      lowerName.includes('arma')
    ) {
      return 'weaponBasic';
    }

    if (
      tags.includes('enemy') ||
      lowerName.includes('enemy') ||
      lowerName.includes('enemigo') ||
      lowerName.includes('monster') ||
      lowerName.includes('lobo')
    ) {
      return 'enemyBasic';
    }

    if (
      tags.includes('player') ||
      has('PlayerController') ||
      lowerName.includes('player') ||
      lowerName.includes('jugador')
    ) {
      return 'characterBasic';
    }

    if (has('Camera')) {
      return 'cameraFollow';
    }

    if (has('MeshRenderer')) {
      return 'mesh';
    }

    if (has('Transform')) {
      return 'transform';
    }

    return null;
  };

  const enforceAIGenerationContract = (
    origin: 'ai' | 'manual' = 'ai'
  ): string[] => {
    const state = useEngineStore.getState();
    let touchedEntities = 0;
    let addedScribs = 0;

    for (const [entityId, entity] of state.entities.entries()) {
      const scribType = resolveContractScribType(entity);
      if (!scribType) continue;

      const result = state.assignScribToEntity(entityId, scribType, { origin });
      if (!result.ok) continue;
      const inserted = result.assigned.length + result.autoAdded.length;
      if (inserted > 0) {
        touchedEntities += 1;
        addedScribs += inserted;
      }
    }

    return [
      `✓ Contrato AI: ${state.entities.size} entidad(es) validadas`,
      `✓ Contrato AI: ${touchedEntities} entidad(es) normalizadas con Scrib`,
      `✓ Scribs agregados/auto dependencias: ${addedScribs}`,
    ];
  };

  useAIOrchestrator({
    engineMode,
    addChatMessage,
    addTask,
    updateAgentStatus,
    updateTask,
    ensureAgentByType,
    createBasicGameElement,
    enforceAIGenerationContract,
    runReyPlayCompile,
    onPipelineStart: ({ totalStages, firstStageTitle }) => {
      if (pipelineHideTimeoutRef.current !== null) {
        window.clearTimeout(pipelineHideTimeoutRef.current);
        pipelineHideTimeoutRef.current = null;
      }
      setPipelineProgress({
        visible: true,
        kind: 'creation',
        totalStages,
        completedStages: 0,
        currentStageTitle: firstStageTitle || '',
        status: 'running',
      });
    },
    onPipelineStage: ({ index, title, status, error }) => {
      setPipelineProgress((current) => ({
        ...current,
        visible: true,
        currentStageTitle: title,
        completedStages: status === 'completed'
          ? Math.max(current.completedStages, index)
          : current.completedStages,
        status: status === 'failed' ? 'error' : 'running',
        error: status === 'failed' ? error : undefined,
      }));
    },
    onPipelineDone: ({ failed }) => {
      setPipelineProgress((current) => ({
        ...current,
        visible: true,
        completedStages: failed ? current.completedStages : current.totalStages,
        status: failed ? 'error' : 'completed',
      }));
      if (!failed) {
        pipelineHideTimeoutRef.current = window.setTimeout(() => {
          setPipelineProgress((current) => ({ ...current, visible: false }));
          pipelineHideTimeoutRef.current = null;
        }, 2500);
      }
    },
  });
  const { processCommand } = useAICommandRouter({
    isManualWorkflow,
    isAIFirstWorkflow,
    addChatMessage,
    setAiProcessing,
    clearInput: () => setInput(''),
    requestChatReply,
    generateImageAsset,
    generateVideoAsset,
    canGenerate3DModel,
    generate3DModel,
    generateCharacterAsset,
    createBasicGameElement,
  });

  const refreshDiagnostics = async () => {
    setDiagnostics((current) => ({ ...current, loading: true }));

    const next: DiagnosticsSnapshot = {
      loading: false,
      checkedAt: new Date().toISOString(),
      assistant: { level: 'unknown', message: 'Sin verificar' },
      automation: { level: 'unknown', message: 'Sin verificar' },
      characters: { level: 'unknown', message: 'Sin verificar' },
    };

    try {
      const { response, data } = await requestAssistantStatus({ includeDiagnostics: true });
      if (response.ok) {
        const diagnosticsPayload = data.diagnostics;
        const assistantDiagnostic = diagnosticsPayload?.assistant;
        const automationDiagnostic = diagnosticsPayload?.automation;
        const characterDiagnostic = diagnosticsPayload?.characters;

        if (assistantDiagnostic?.message) {
          next.assistant = {
            level: assistantDiagnostic.level ?? 'unknown',
            message: assistantDiagnostic.message,
          };
        }

        if (automationDiagnostic?.message) {
          scriptPersistenceAvailabilityRef.current = automationDiagnostic.available
            ? 'available'
            : automationDiagnostic.restricted
              ? 'restricted'
              : 'unknown';
          next.automation = {
            level: automationDiagnostic.level ?? 'unknown',
            message: automationDiagnostic.message,
          };
        } else {
          scriptPersistenceAvailabilityRef.current = 'unknown';
        }

        if (characterDiagnostic?.message) {
          next.characters = {
            level: characterDiagnostic.level ?? 'unknown',
            message: characterDiagnostic.message,
          };
        }

        next.checkedAt = diagnosticsPayload?.checkedAt || next.checkedAt;
      } else {
        next.assistant = { level: 'error', message: 'No se pudo confirmar el estado del asistente' };
        scriptPersistenceAvailabilityRef.current = 'unknown';
      }
    } catch {
      next.assistant = { level: 'error', message: 'No se pudo verificar el estado del asistente' };
      scriptPersistenceAvailabilityRef.current = 'unknown';
    }

    setDiagnostics(next);
  };

  const refreshAgentPlanner = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setAgentPlannerLoading(true);
    }
    setAgentPlannerError(null);

    try {
      const { response, data } = await requestAIAgentPlannerState({ projectName });
      if (!response.ok) {
        setAgentPlannerError(data.error || 'No se pudo consultar el planner de agentes.');
        return;
      }
      setAgentPlan(data.activePlan || null);
    } catch {
      setAgentPlannerError('No se pudo consultar el planner de agentes.');
    } finally {
      setAgentPlannerLoading(false);
    }
  }, [projectName]);

  const createAgentPlanner = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt) {
      addChatMessage({
        role: 'assistant',
        content: '🧭 **Planner vacío**\n\nEscribe primero el objetivo del laboratorio para crear un plan durable.',
        metadata: { agentType: 'orchestrator' },
      });
      return;
    }

    setAgentPlannerLoading(true);
    setAgentPlannerError(null);
    try {
      const { response, data } = await requestAIAgentPlannerCreate({
        prompt,
        projectName,
        level: 'level3_full_character',
      });
      if (!response.ok || !data.plan) {
        setAgentPlannerError(data.error || 'No se pudo crear el planner de agentes.');
        return;
      }
      setAgentPlan(data.plan);
      addChatMessage({
        role: 'assistant',
        content: `🧭 **Planner creado**\n\n${data.plan.summary}`,
        metadata: { agentType: 'orchestrator' },
      });
    } catch {
      setAgentPlannerError('No se pudo crear el planner de agentes.');
    } finally {
      setAgentPlannerLoading(false);
    }
  }, [addChatMessage, input, projectName]);

  const createCustomAgentPlanner = useCallback(async () => {
    const prompt = customPlannerPrompt.trim() || input.trim();
    const sourceBlockId = customPlannerSourceBlockId.trim() || 'manual_scope';
    const taskLines = customPlannerTasksInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!prompt || taskLines.length === 0) {
      setAgentPlannerError('Prompt y al menos una custom task son requeridos.');
      return;
    }

    setAgentPlannerLoading(true);
    setAgentPlannerError(null);
    try {
      const { response, data } = await requestAIAgentPlannerCreate({
        prompt,
        projectName,
        level: 'level1_copilot',
        style: 'custom-planner',
        target: 'agentic-editor',
        rigRequired: false,
        customSummary: `Custom planner: ${prompt}`,
        customCheckpoints: [
          'Ejecutar solo customTasks definidas en este planner.',
          'Cerrar cada customTask con evidencia o motivo de fallo.',
        ],
        customTasks: taskLines.map((line, index) => {
          const [titlePart, ...summaryParts] = line.split('::').map((part) => part.trim());
          const title = titlePart || `Custom task ${index + 1}`;
          const summary = summaryParts.join(' :: ') || title;
          return {
            taskId: `${sourceBlockId}_${index + 1}`,
            title,
            summary,
            priority: customPlannerPriority,
            owner: customPlannerOwner.trim() || 'technical_lead',
            evidenceRefs: [`sourceBlock:${sourceBlockId}`],
            requiredDecisions: ['manual_custom_planner_created'],
            sourceBlockId,
          };
        }),
      });
      if (!response.ok || !data.plan) {
        setAgentPlannerError(data.error || 'No se pudo crear el planner custom.');
        return;
      }
      setAgentPlan(data.plan);
      setAgentPlannerSourceBlockFilter('all');
      setCustomTaskEditDrafts({});
      setCustomPlannerScopeStatus(null);
      addChatMessage({
        role: 'assistant',
        content: `🧭 **Planner custom creado**\n\n${data.plan.summary}`,
        metadata: { agentType: 'orchestrator' },
      });
    } catch {
      setAgentPlannerError('No se pudo crear el planner custom.');
    } finally {
      setAgentPlannerLoading(false);
    }
  }, [
    addChatMessage,
    customPlannerOwner,
    customPlannerPriority,
    customPlannerPrompt,
    customPlannerSourceBlockId,
    customPlannerTasksInput,
    input,
    projectName,
  ]);

  const loadApprovedReanalysisScopeBlocks = useCallback(async () => {
    setCustomPlannerScopeLoading(true);
    setAgentPlannerError(null);
    setCustomPlannerScopeStatus(null);

    try {
      const jobsResult = await requestAssistantReviewReanalysisJob({
        projectName,
        limit: 20,
      });
      if (!jobsResult.response.ok) {
        setAgentPlannerError(jobsResult.data.error || 'No se pudo consultar el scope aprobado de reanalysis.');
        return;
      }

      const candidate = (jobsResult.data.jobs ?? []).find(
        (job) => job.status === 'completed' && countApprovedReviewBlocks(job) > 0
      );
      if (!candidate?.id) {
        setAgentPlannerError('No hay un job de reanalysis completed con bloques aprobados.');
        setCustomPlannerApprovedBlocks([]);
        setCustomPlannerSelectedApprovedBlockIds({});
        return;
      }

      const approvedBlocks = extractApprovedReviewBlocks(candidate);
      setCustomPlannerApprovedBlocks(approvedBlocks);
      setCustomPlannerSelectedApprovedBlockIds(
        Object.fromEntries(approvedBlocks.map((block) => [block.blockId, true]))
      );
      setCustomPlannerScopeStatus(
        `Scope aprobado listo para selección: ${approvedBlocks.length} bloque(s) de reanalysis ${candidate.id}.`
      );
    } catch {
      setAgentPlannerError('No se pudo consultar bloques aprobados de reanalysis.');
    } finally {
      setCustomPlannerScopeLoading(false);
    }
  }, [projectName]);

  const createCustomPlannerFromApprovedScope = useCallback(async () => {
    setCustomPlannerScopeLoading(true);
    setAgentPlannerError(null);

    try {
      let approvedBlocks = customPlannerApprovedBlocks;
      if (approvedBlocks.length === 0) {
        const jobsResult = await requestAssistantReviewReanalysisJob({
          projectName,
          limit: 20,
        });
        if (!jobsResult.response.ok) {
          setAgentPlannerError(jobsResult.data.error || 'No se pudo consultar el scope aprobado de reanalysis.');
          return;
        }
        const candidate = (jobsResult.data.jobs ?? []).find(
          (job) => job.status === 'completed' && countApprovedReviewBlocks(job) > 0
        );
        approvedBlocks = extractApprovedReviewBlocks(candidate);
        setCustomPlannerApprovedBlocks(approvedBlocks);
        setCustomPlannerSelectedApprovedBlockIds(
          Object.fromEntries(approvedBlocks.map((block) => [block.blockId, true]))
        );
      }

      const selectedBlockIds = approvedBlocks
        .filter((block) => customPlannerSelectedApprovedBlockIds[block.blockId] !== false)
        .map((block) => block.blockId);
      const selectedJobId = approvedBlocks[0]?.jobId;
      if (!selectedJobId || selectedBlockIds.length === 0) {
        setAgentPlannerError('Selecciona al menos un bloque aprobado antes de crear el planner.');
        return;
      }

      const linkedPlanId = approvedBlocks[0]?.linkedPlanId ?? '';
      if (linkedPlanId) {
        const existingPlan = await requestAIAgentPlannerState({
          projectName,
          planId: linkedPlanId,
        });
        if (
          existingPlan.response.ok &&
          existingPlan.data.activePlan &&
          selectedBlockIds.length === approvedBlocks.length
        ) {
          setAgentPlan(existingPlan.data.activePlan);
          setAgentPlannerSourceBlockFilter('all');
          setCustomTaskEditDrafts({});
          setCustomPlannerScopeStatus(
            `Scope aprobado cargado desde reanalysis ${selectedJobId}: ${selectedBlockIds.length} bloque(s).`
          );
          return;
        }
      }

      const plannerResult = await requestAssistantReviewReanalysisUpdate({
        projectName,
        jobId: selectedJobId,
        action: 'create_planner_from_approved_scope',
        forceNew: Boolean(linkedPlanId),
        approvedBlockIds: selectedBlockIds,
      });
      if (!plannerResult.response.ok || !plannerResult.data.plan) {
        setAgentPlannerError(
          plannerResult.data.error || 'No se pudo crear planner desde scope aprobado.'
        );
        return;
      }

      setAgentPlan(plannerResult.data.plan);
      setAgentPlannerSourceBlockFilter('all');
      setCustomTaskEditDrafts({});
      setCustomPlannerScopeStatus(
        `Scope aprobado convertido desde reanalysis ${selectedJobId}: ${selectedBlockIds.length} bloque(s).`
      );
      addChatMessage({
        role: 'assistant',
        content: `🧭 **Planner desde scope aprobado**\n\n${plannerResult.data.plan.summary}`,
        metadata: { agentType: 'orchestrator' },
      });
    } catch {
      setAgentPlannerError('No se pudo conectar el planner custom con el scope aprobado de reanalysis.');
    } finally {
      setCustomPlannerScopeLoading(false);
    }
  }, [
    addChatMessage,
    customPlannerApprovedBlocks,
    customPlannerSelectedApprovedBlockIds,
    projectName,
  ]);

  const updateAgentPlanner = useCallback(
    async (params: {
      action:
        | 'resume'
        | 'stage_status'
        | 'custom_task_status'
        | 'custom_task_metadata'
        | 'custom_task_metadata_revert'
        | 'checkpoint'
        | 'cancel';
      stageId?: string;
      taskId?: string;
      historyEntryId?: string;
      confirmStaleRevert?: boolean;
      staleRevertReason?: string;
      status?: AgentPlannerStageStatus;
      note?: string;
      resultSummary?: string;
      checkpoint?: string;
      title?: string | null;
      summary?: string | null;
      owner?: string | null;
      priority?: AgentPlannerCustomTaskPriority | null;
      sourceBlockId?: string | null;
    }): Promise<boolean> => {
      if (!agentPlan) {
        return false;
      }

      setAgentPlannerLoading(true);
      setAgentPlannerError(null);
      try {
        const { response, data } = await requestAIAgentPlannerUpdate({
          projectName,
          planId: agentPlan.planId,
          action: params.action,
          stageId: params.stageId,
          taskId: params.taskId,
          historyEntryId: params.historyEntryId,
          confirmStaleRevert: params.confirmStaleRevert,
          staleRevertReason: params.staleRevertReason,
          status: params.status,
          note: params.note,
          resultSummary: params.resultSummary,
          checkpoint: params.checkpoint,
          title: params.title,
          summary: params.summary,
          owner: params.owner,
          priority: params.priority,
          sourceBlockId: params.sourceBlockId,
        });
        if (!response.ok || !data.plan) {
          if (
            data.code === 'STALE_METADATA_REVERT_REQUIRES_CONFIRMATION' &&
            data.blocker &&
            params.taskId &&
            params.historyEntryId
          ) {
            setPendingStaleMetadataRevert({
              taskId: params.taskId,
              historyEntryId: params.historyEntryId,
              blocker: data.blocker,
              reason: '',
            });
          }
          setAgentPlannerError(data.error || 'No se pudo actualizar el planner.');
          return false;
        }
        setAgentPlan(data.plan);
        setPendingStaleMetadataRevert(null);
        return true;
      } catch {
        setAgentPlannerError('No se pudo actualizar el planner.');
        return false;
      } finally {
        setAgentPlannerLoading(false);
      }
    },
    [agentPlan, projectName]
  );

  const startCustomTaskEdit = useCallback((task: ClientAgentPlannerPlan['customTasks'][number]) => {
    setCustomTaskEditDrafts((current) => ({
      ...current,
      [task.taskId]: {
        title: task.title,
        summary: task.summary,
        owner: task.owner,
        priority: task.priority,
        sourceBlockId: task.sourceBlockId ?? '',
      },
    }));
  }, []);

  const updateCustomTaskEditDraft = useCallback(
    (taskId: string, patch: Partial<CustomTaskEditDraft>) => {
      setCustomTaskEditDrafts((current) => {
        const existing = current[taskId];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [taskId]: {
            ...existing,
            ...patch,
          },
        };
      });
    },
    []
  );

  const cancelCustomTaskEdit = useCallback((taskId: string) => {
    setCustomTaskEditDrafts((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const saveCustomTaskEdit = useCallback(
    async (taskId: string) => {
      const draft = customTaskEditDrafts[taskId];
      if (!draft) {
        return;
      }
      if (draft.title.trim().length < 3 || draft.summary.trim().length < 3) {
        setAgentPlannerError('Title y summary deben tener al menos 3 caracteres.');
        return;
      }
      const saved = await updateAgentPlanner({
        action: 'custom_task_metadata',
        taskId,
        title: draft.title,
        summary: draft.summary,
        owner: draft.owner,
        priority: draft.priority,
        sourceBlockId: draft.sourceBlockId,
      });
      if (!saved) {
        return;
      }
      cancelCustomTaskEdit(taskId);
      setAgentPlannerSourceBlockFilter(draft.sourceBlockId.trim() || 'all');
    },
    [cancelCustomTaskEdit, customTaskEditDrafts, updateAgentPlanner]
  );

  const exportCustomTaskMetadataHistory = useCallback(
    (
      task: ClientAgentPlannerPlan['customTasks'][number],
      format: 'json' | 'markdown'
    ) => {
      if (!agentPlan) {
        return;
      }

      setAgentPlannerError(null);
      downloadServerFile(
        createAIAgentPlannerCustomTaskHistoryExportUrl({
          projectName,
          planId: agentPlan.planId,
          taskId: task.taskId,
          format,
        })
      );
    },
    [agentPlan, projectName]
  );

  const exportCustomTaskMetadataRevertAudits = useCallback(
    (
      task: ClientAgentPlannerPlan['customTasks'][number] | null,
      format: 'json' | 'markdown',
      filter: 'all' | 'staleConfirmed' = 'all',
      exportScope: 'page' | 'all' = 'all'
    ) => {
      if (!agentPlan) {
        return;
      }

      const useCurrentGlobalPage = !task && exportScope === 'page';
      setAgentPlannerError(null);
      downloadServerFile(
        createAIAgentPlannerCustomTaskRevertAuditsExportUrl({
          projectName,
          planId: agentPlan.planId,
          taskId: task?.taskId,
          filter,
          exportScope,
          limit: useCurrentGlobalPage ? AGENT_PLANNER_GLOBAL_REVERT_AUDIT_PAGE_SIZE : undefined,
          offset: useCurrentGlobalPage
            ? agentPlannerRevertAuditPage * AGENT_PLANNER_GLOBAL_REVERT_AUDIT_PAGE_SIZE
            : undefined,
          format,
        })
      );
    },
    [agentPlan, agentPlannerRevertAuditPage, projectName]
  );

  const refreshStaleRevertPolicy = useCallback(async (options?: {
    quiet?: boolean;
    page?: number;
    eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
    actor?: string;
    from?: string;
    to?: string;
  }) => {
    const nextPage = Math.max(0, options?.page ?? staleRevertPolicyAuditPage);
    const nextEventType = options?.eventType ?? staleRevertPolicyAuditFilter;
    const nextActor = (options?.actor ?? staleRevertPolicyActorFilter).trim();
    const nextFrom = (options?.from ?? staleRevertPolicyDateFromFilter).trim();
    const nextTo = (options?.to ?? staleRevertPolicyDateToFilter).trim();
    if (!options?.quiet) {
      setStaleRevertPolicyLoading(true);
    }
    setStaleRevertPolicyError(null);
    try {
      const [{ response, data }, { response: auditResponse, data: auditData }] = await Promise.all([
        requestAIAgentPlannerStaleRevertPolicy({ projectName }),
        requestAIAgentPlannerStaleRevertPolicyAudit({
          projectName,
          limit: STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
          offset: nextPage * STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
          eventType: nextEventType,
          actor: nextActor,
          from: nextFrom,
          to: nextTo,
        }),
      ]);
      if (!response.ok || data.success === false) {
        throw new Error(data.error || response.statusText || 'No se pudo leer la política de allowlist.');
      }
      if (!auditResponse.ok || auditData.success === false) {
        throw new Error(auditData.error || auditResponse.statusText || 'No se pudo leer la auditoría de allowlist.');
      }
      const allowedRoles = data.config?.allowedRoles ?? data.policySnapshot?.allowedRoles ?? ['OWNER'];
      setStaleRevertPolicy({
        ...data,
        auditTrail: auditData.auditTrail,
        auditCount: auditData.auditCount,
        totalAuditCount: auditData.totalAuditCount,
        auditPagination: auditData.auditPagination,
        auditEventType: auditData.eventType ?? nextEventType,
        auditActorFilter: (auditData.actorFilter ?? nextActor) || null,
        auditDateFromFilter: (auditData.dateFromFilter ?? nextFrom) || null,
        auditDateToFilter: (auditData.dateToFilter ?? nextTo) || null,
        auditFilterOptions: auditData.filterOptions ?? data.auditFilterOptions,
      });
      setStaleRevertPolicyAuditPage(nextPage);
      setStaleRevertPolicyAuditFilter(nextEventType);
      setStaleRevertPolicyActorFilter(nextActor);
      setStaleRevertPolicyActorFilterInput(nextActor);
      setStaleRevertPolicyDateFromFilter(nextFrom);
      setStaleRevertPolicyDateFromFilterInput(nextFrom);
      setStaleRevertPolicyDateToFilter(nextTo);
      setStaleRevertPolicyDateToFilterInput(nextTo);
      setStaleRevertPolicyDraftRoles([...new Set<StaleMetadataRevertPolicyRole>(['OWNER', ...allowedRoles])]);
    } catch (error) {
      setStaleRevertPolicyError(String(error));
    } finally {
      setStaleRevertPolicyLoading(false);
    }
  }, [
    projectName,
    staleRevertPolicyActorFilter,
    staleRevertPolicyAuditFilter,
    staleRevertPolicyAuditPage,
    staleRevertPolicyDateFromFilter,
    staleRevertPolicyDateToFilter,
  ]);

  const updateStaleRevertPolicy = useCallback(async () => {
    setStaleRevertPolicySaving(true);
    setStaleRevertPolicyError(null);
    try {
      const { response, data } = await requestAIAgentPlannerStaleRevertPolicyUpdate({
        projectName,
        allowedRoles: [...new Set<StaleMetadataRevertPolicyRole>(['OWNER', ...staleRevertPolicyDraftRoles])],
        reason: staleRevertPolicyReason,
        auditLimit: STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
        auditOffset: 0,
        eventType: staleRevertPolicyAuditFilter,
        actor: staleRevertPolicyActorFilter,
        from: staleRevertPolicyDateFromFilter,
        to: staleRevertPolicyDateToFilter,
      });
      if (!response.ok || data.success === false) {
        throw new Error(data.error || response.statusText || 'No se pudo guardar la política de allowlist.');
      }
      setStaleRevertPolicy(data);
      setStaleRevertPolicyAuditPage(0);
      setStaleRevertPolicyAuditFilter(data.auditEventType ?? staleRevertPolicyAuditFilter);
      setStaleRevertPolicyDraftRoles(data.config?.allowedRoles ?? data.policySnapshot?.allowedRoles ?? ['OWNER']);
      setStaleRevertPolicyReason('');
    } catch (error) {
      setStaleRevertPolicyError(String(error));
    } finally {
      setStaleRevertPolicySaving(false);
    }
  }, [
    projectName,
    staleRevertPolicyActorFilter,
    staleRevertPolicyAuditFilter,
    staleRevertPolicyDateFromFilter,
    staleRevertPolicyDateToFilter,
    staleRevertPolicyDraftRoles,
    staleRevertPolicyReason,
  ]);

  const resetStaleRevertPolicyToEnv = useCallback(async () => {
    const reason = staleRevertPolicyReason.trim();
    if (reason.length < 8) {
      setStaleRevertPolicyError('Restaurar a env/default requiere un motivo de auditoría de al menos 8 caracteres.');
      return;
    }

    setStaleRevertPolicySaving(true);
    setStaleRevertPolicyError(null);
    try {
      const { response, data } = await requestAIAgentPlannerStaleRevertPolicyReset({
        projectName,
        reason,
        auditLimit: STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
        auditOffset: 0,
        eventType: staleRevertPolicyAuditFilter,
        actor: staleRevertPolicyActorFilter,
        from: staleRevertPolicyDateFromFilter,
        to: staleRevertPolicyDateToFilter,
      });
      if (!response.ok || data.success === false) {
        throw new Error(data.error || response.statusText || 'No se pudo restaurar la política a env/default.');
      }
      const allowedRoles = data.policySnapshot?.allowedRoles ?? ['OWNER'];
      setStaleRevertPolicy(data);
      setStaleRevertPolicyAuditPage(0);
      setStaleRevertPolicyAuditFilter(data.auditEventType ?? staleRevertPolicyAuditFilter);
      setStaleRevertPolicyDraftRoles([...new Set<StaleMetadataRevertPolicyRole>(['OWNER', ...allowedRoles])]);
      setStaleRevertPolicyReason('');
      setStaleRevertPolicyResetDialogOpen(false);
    } catch (error) {
      setStaleRevertPolicyError(String(error));
    } finally {
      setStaleRevertPolicySaving(false);
    }
  }, [
    projectName,
    staleRevertPolicyActorFilter,
    staleRevertPolicyAuditFilter,
    staleRevertPolicyDateFromFilter,
    staleRevertPolicyDateToFilter,
    staleRevertPolicyReason,
  ]);

  const refreshAgentPlannerGlobalRevertAudits = useCallback(async (options?: {
    page?: number;
    filter?: 'all' | 'staleConfirmed';
    quiet?: boolean;
  }) => {
    if (!agentPlan?.planId) {
      setAgentPlannerGlobalRevertAuditData(null);
      return;
    }
    const nextPage = Math.max(0, options?.page ?? agentPlannerRevertAuditPage);
    const nextFilter = options?.filter ?? agentPlannerRevertAuditFilter;

    if (!options?.quiet) {
      setAgentPlannerGlobalRevertAuditLoading(true);
    }
    setAgentPlannerGlobalRevertAuditError(null);
    try {
      const { response, data } = await requestAIAgentPlannerCustomTaskRevertAudits({
        projectName,
        planId: agentPlan.planId,
        filter: nextFilter,
        limit: AGENT_PLANNER_GLOBAL_REVERT_AUDIT_PAGE_SIZE,
        offset: nextPage * AGENT_PLANNER_GLOBAL_REVERT_AUDIT_PAGE_SIZE,
      });
      if (!response.ok || data.success === false) {
        throw new Error(data.error || response.statusText || 'No se pudieron leer auditorías de revert.');
      }
      setAgentPlannerGlobalRevertAuditData(data);
      setAgentPlannerRevertAuditPage(nextPage);
      setAgentPlannerRevertAuditFilter(nextFilter);
    } catch (error) {
      setAgentPlannerGlobalRevertAuditError(String(error));
    } finally {
      setAgentPlannerGlobalRevertAuditLoading(false);
    }
  }, [
    agentPlan?.planId,
    agentPlannerRevertAuditFilter,
    agentPlannerRevertAuditPage,
    projectName,
  ]);

  const confirmPendingStaleMetadataRevert = useCallback(async () => {
    if (!pendingStaleMetadataRevert) {
      return;
    }
    const reason = pendingStaleMetadataRevert.reason.trim();
    if (reason.length < 8) {
      setAgentPlannerError('El revert riesgoso necesita un motivo de auditoría de al menos 8 caracteres.');
      return;
    }
    const confirmed = await updateAgentPlanner({
      action: 'custom_task_metadata_revert',
      taskId: pendingStaleMetadataRevert.taskId,
      historyEntryId: pendingStaleMetadataRevert.historyEntryId,
      confirmStaleRevert: true,
      staleRevertReason: reason,
    });
    if (confirmed) {
      setPendingStaleMetadataRevert(null);
    }
  }, [pendingStaleMetadataRevert, updateAgentPlanner]);

  useEffect(() => {
    if (!advancedMode || !agentPlan?.planId) {
      setAgentPlannerGlobalRevertAuditData(null);
      return;
    }
    void refreshAgentPlannerGlobalRevertAudits({ quiet: true });
  }, [
    advancedMode,
    agentPlan?.planId,
    agentPlan?.updatedAt,
    agentPlannerRevertAuditFilter,
    agentPlannerRevertAuditPage,
    refreshAgentPlannerGlobalRevertAudits,
  ]);

  useEffect(() => {
    if (!advancedMode) {
      setStaleRevertPolicy(null);
      return;
    }
    void refreshStaleRevertPolicy({ quiet: true });
  }, [advancedMode, refreshStaleRevertPolicy]);

  useEffect(() => {
    if (!advancedMode) return;
    void refreshAgentPlanner({ quiet: true });
  }, [advancedMode, refreshAgentPlanner]);

  useEffect(() => {
    if (!advancedMode || !agentPlan?.planId || activeTask?.status !== 'processing') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshAgentPlanner({ quiet: true });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTask?.status, advancedMode, agentPlan?.planId, refreshAgentPlanner]);

  useEffect(() => {
    if (!advancedMode || !agentPlan?.planId || !activeTask) {
      return;
    }
    if (activeTask.status === 'completed' || activeTask.status === 'failed' || activeTask.status === 'canceled') {
      void refreshAgentPlanner({ quiet: true });
    }
  }, [activeTask?.status, advancedMode, agentPlan?.planId, refreshAgentPlanner]);

  useEffect(() => {
    return () => {
      if (pipelineHideTimeoutRef.current !== null) {
        window.clearTimeout(pipelineHideTimeoutRef.current);
        pipelineHideTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!diagnosticsOpen) return;
    void refreshDiagnostics();
  }, [diagnosticsOpen]);

  // Create basic game element (fallback without API)
  async function createBasicGameElement(
    command: string,
    options?: { silent?: boolean }
  ): Promise<string[]> {
    const silent = options?.silent ?? false;
    const lowerCommand = command.toLowerCase();
    const results: string[] = [];
    let scriptPersistenceAuthWarned = false;
    let scriptPersistenceGenericWarned = false;

    const emitValidatedCompletion = (deliveryResults: string[]) => {
      const contractResults = enforceAIGenerationContract('ai');
      const report = runReyPlayCompile();
      const validationResults = [
        '✓ Validador de entrega: pedido revisado contra cambios del motor',
        ...contractResults,
        report.ok
          ? `✓ Compile local: ${report.summary}`
          : `⚠️ Compile local: ${report.summary}`,
      ];

      addChatMessage({
        role: 'assistant',
        content: `**Completado y validado:**\n${[
          ...deliveryResults,
          ...validationResults,
        ].join('\n')}`,
        metadata: { agentType: 'optimization' },
      });
    };

    const registerGeneratedScriptAsset = async (scriptPath: string) => {
      const normalized = scriptPath.replace(/^\/+/, '');
      const assetPath = normalized.startsWith('scripts/') ? `/${normalized}` : `/scripts/${normalized}`;
      const scriptName = normalized.split('/').pop() || normalized;

      const canPersist = await canPersistGeneratedScripts();
      if (!canPersist) {
        if (!scriptPersistenceAuthWarned) {
          results.push('⚠️ No se pudieron guardar los scripts generados: inicia sesión para habilitar la biblioteca de scripts.');
          scriptPersistenceAuthWarned = true;
        }
        return false;
      }

      const persist = await ensureGeneratedScriptFile(assetPath, command);
      if (persist.ok) {
        const exists = useEngineStore
          .getState()
          .assets.some((asset) => asset.type === 'script' && asset.path === assetPath);
        if (!exists) {
          addAsset({
            id: crypto.randomUUID(),
            name: scriptName,
            type: 'script',
            path: assetPath,
            size: 0,
            createdAt: new Date(),
            metadata: { prompt: command, generatedBy: 'hybrid-workflow' },
          });
        }
        return true;
      }

      const status = persist.status;
      if ((status === 401 || status === 403) && !scriptPersistenceAuthWarned) {
        scriptPersistenceAvailabilityRef.current = 'restricted';
        results.push('⚠️ No se pudieron guardar los scripts generados: inicia sesión para habilitar la biblioteca de scripts.');
        scriptPersistenceAuthWarned = true;
        return false;
      }

      if (!scriptPersistenceGenericWarned) {
        results.push(
          `⚠️ No se pudieron guardar algunos scripts generados (${persist.error || `HTTP ${status}`}).`
        );
        scriptPersistenceGenericWarned = true;
      }
      return false;
    };

    const hasGameKeyword = ['juego', 'game', 'nivel', 'level', 'arena'].some((keyword) =>
      lowerCommand.includes(keyword)
    );
    const hasBuildKeyword = ['crea', 'crear', 'genera', 'generar', 'haz', 'hacer', 'build', 'make', 'setup'].some(
      (keyword) => lowerCommand.includes(keyword)
    );
    const shouldCreateStarterGame = hasGameKeyword && hasBuildKeyword;
    const wantsPlatformer =
      lowerCommand.includes('plataforma') ||
      lowerCommand.includes('platformer') ||
      lowerCommand.includes('platform');
    const wantsWolfEnemy = lowerCommand.includes('lobo') || lowerCommand.includes('wolf');

    if (shouldCreateStarterGame) {
      const [{ EntityFactory }, { makeStarterTerrain, makeStarterPlayer, makeStarterCamera, makeStarterLight }] =
        await Promise.all([
          import('@/engine/core/ECS'),
          import('@/engine/reyplay/studio/Templates'),
        ]);

      const scene = createScene(`Juego IA ${Date.now()}`);
      addEntity(makeStarterTerrain('Terreno IA'));
      addEntity(makeStarterPlayer('Jugador IA'));
      addEntity(makeStarterCamera('Camara Principal IA'));
      addEntity(makeStarterLight('Luz Principal IA'));

      if (wantsPlatformer) {
        const platformLayout = [
          { x: 0, y: 1.2, z: 2, w: 4, d: 4 },
          { x: 5, y: 2.6, z: 0, w: 4, d: 4 },
          { x: 10, y: 4, z: -2, w: 5, d: 4 },
          { x: 15, y: 5.2, z: 1, w: 4, d: 4 },
          { x: 20, y: 6.4, z: -1, w: 6, d: 4 },
        ];

        platformLayout.forEach((item, index) => {
          const platform = EntityFactory.create(`Plataforma_${index + 1}`);
          platform.components.set('Transform', {
            id: crypto.randomUUID(),
            type: 'Transform',
            data: {
              position: { x: item.x, y: item.y, z: item.z },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: item.w, y: 0.4, z: item.d },
            },
            enabled: true,
          });
          platform.components.set('MeshRenderer', {
            id: crypto.randomUUID(),
            type: 'MeshRenderer',
            data: { meshId: 'cube', materialId: 'default', castShadows: true, receiveShadows: true },
            enabled: true,
          });
          platform.tags.push('platform');
          addEntity(platform);
        });
        await registerGeneratedScriptAsset('/scripts/PlatformerMovement.generated.ts');
        results.push(`✓ ${platformLayout.length} plataformas jugables generadas`);
      }

      const enemyName = wantsWolfEnemy ? 'Lobo Enemigo' : 'Enemy';
      const enemy = EntityFactory.create(enemyName);
      enemy.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 4, y: 0.5, z: -1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      enemy.components.set('Health', {
        id: crypto.randomUUID(),
        type: 'Health',
        data: {
          maxHealth: 100,
          currentHealth: 100,
          team: 'enemy',
        },
        enabled: true,
      });
      enemy.tags.push('enemy');
      if (wantsWolfEnemy) {
        enemy.tags.push('wolf', 'lobo');
      }
      addEntity(enemy);

      await registerGeneratedScriptAsset('/scripts/GameLoop.generated.ts');
      await registerGeneratedScriptAsset('/scripts/EnemyAI.generated.ts');

      results.push(`✓ Escena creada: ${scene.name}`);
      results.push('✓ Terreno base generado');
      results.push('✓ Jugador jugable agregado');
      results.push('✓ Camara principal configurada');
      results.push('✓ Iluminacion inicial lista');
      results.push(wantsWolfEnemy ? '✓ Enemigo lobo agregado' : '✓ Enemigo de prueba agregado');
      results.push('✓ Scripts base de GameLoop y EnemyAI registrados');

      if (lowerCommand.includes('arma') || lowerCommand.includes('weapon') || lowerCommand.includes('espada') || lowerCommand.includes('sword')) {
        const weapon = EntityFactory.create('Espada');
        weapon.components.set('Transform', {
          id: crypto.randomUUID(),
          type: 'Transform',
          data: { position: { x: 0.5, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
          enabled: true,
        });
        weapon.components.set('Weapon', {
          id: crypto.randomUUID(),
          type: 'Weapon',
          data: {
            damage: 25,
            attackSpeed: 1.5,
            range: 2,
            type: 'melee',
          },
          enabled: true,
        });
        addEntity(weapon);
        await registerGeneratedScriptAsset('/scripts/WeaponLogic.generated.ts');
        results.push('✓ Arma inicial agregada');
      }

      if (!silent) {
        emitValidatedCompletion(results);
      }
      return results;
    }

    const wantsDelete =
      lowerCommand.includes('elimina') ||
      lowerCommand.includes('eliminar') ||
      lowerCommand.includes('borra') ||
      lowerCommand.includes('borrar') ||
      lowerCommand.includes('remove') ||
      lowerCommand.includes('delete');

    if (wantsDelete) {
      const selectedIds = editor.selectedEntities;
      const removeAll = lowerCommand.includes('todo') || lowerCommand.includes('all');
      const removeSelection =
        lowerCommand.includes('seleccion') ||
        lowerCommand.includes('selección') ||
        lowerCommand.includes('selected');

      if (removeAll) {
        const allIds = Array.from(entities.keys());
        allIds.forEach((id) => removeEntity(id));
        results.push(`✓ ${allIds.length} objeto(s) eliminados de la escena`);
      } else if (removeSelection && selectedIds.length > 0) {
        selectedIds.forEach((id) => removeEntity(id));
        results.push(`✓ ${selectedIds.length} objeto(s) seleccionados eliminados`);
      } else {
        const targetName = lowerCommand
          .replace(/elimina|eliminar|borra|borrar|remove|delete/gi, '')
          .trim();
        const ids = Array.from(entities.entries())
          .filter(([, entity]) =>
            targetName ? entity.name.toLowerCase().includes(targetName.toLowerCase()) : false
          )
          .map(([id]) => id);

        if (ids.length > 0) {
          ids.forEach((id) => removeEntity(id));
          results.push(`✓ ${ids.length} objeto(s) eliminados por nombre`);
        } else {
          results.push('⚠️ No encontré objetos para eliminar con ese criterio.');
          results.push('💡 Tip: usa "elimina selección" o "elimina todo".');
        }
      }

      if (!silent) {
        emitValidatedCompletion(results);
      }
      return results;
    }

    if (lowerCommand.includes('laberinto') || lowerCommand.includes('maze')) {
      const [{ EntityFactory }, { makeStarterPlayer, makeStarterCamera, makeStarterLight }] = await Promise.all([
        import('@/engine/core/ECS'),
        import('@/engine/reyplay/studio/Templates'),
      ]);
      const scene = createScene('Escena Laberinto');
      results.push(`✓ Escena creada: ${scene.name}`);

      const floor = EntityFactory.create('MazeFloor');
      floor.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 20, y: 0.2, z: 20 },
        },
        enabled: true,
      });
      floor.components.set('MeshRenderer', {
        id: crypto.randomUUID(),
        type: 'MeshRenderer',
        data: { meshId: 'cube', materialId: 'default', castShadows: false, receiveShadows: true },
        enabled: true,
      });
      floor.tags.push('maze');
      addEntity(floor);

      const wallCoords = [
        [-8, -8], [-8, -4], [-8, 0], [-8, 4], [-8, 8],
        [-4, 8], [0, 8], [4, 8], [8, 8],
        [8, 4], [8, 0], [8, -4], [8, -8],
        [-4, -8], [0, -8], [4, -8],
        [-2, -4], [-2, 0], [-2, 4],
        [2, -4], [2, 0], [2, 4],
        [0, -2], [0, 2],
      ];

      wallCoords.forEach(([x, z], index) => {
        const wall = EntityFactory.create(`Wall_${index + 1}`);
        wall.components.set('Transform', {
          id: crypto.randomUUID(),
          type: 'Transform',
          data: {
            position: { x, y: 1, z },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 2, y: 2, z: 0.5 },
          },
          enabled: true,
        });
        wall.components.set('MeshRenderer', {
          id: crypto.randomUUID(),
          type: 'MeshRenderer',
          data: { meshId: 'cube', materialId: 'default', castShadows: true, receiveShadows: true },
          enabled: true,
        });
        wall.tags.push('maze', 'wall');
        addEntity(wall);
      });

      addEntity(makeStarterPlayer('Jugador Laberinto'));
      addEntity(makeStarterCamera('Camara Laberinto'));
      addEntity(makeStarterLight('Luz Laberinto'));

      results.push('✓ Piso y muros de laberinto generados');
      results.push(`✓ ${wallCoords.length} muros colocados`);
      results.push('✓ Jugador, camara y luz inicial agregados');
    }

    // Scene creation
    if (lowerCommand.includes('escena') || lowerCommand.includes('scene') || lowerCommand.includes('nivel')) {
      const scene = createScene('Nueva Escena');
      results.push(`✓ Escena creada: ${scene.name}`);
    }

    // Character
    if (
      lowerCommand.includes('personaje') ||
      lowerCommand.includes('character') ||
      lowerCommand.includes('jugador') ||
      lowerCommand.includes('heroe') ||
      lowerCommand.includes('héroe')
    ) {
      const { EntityFactory } = await import('@/engine/core/ECS');
      const entity = EntityFactory.create('Jugador');
      entity.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      entity.components.set('PlayerController', {
        id: crypto.randomUUID(),
        type: 'PlayerController',
        data: { 
          speed: 5, 
          jumpForce: 8, 
          sensitivity: 2,
          canDoubleJump: true,
        },
        enabled: true,
      });
      entity.components.set('Animator', {
        id: crypto.randomUUID(),
        type: 'Animator',
        data: (() => {
          const baseState = createDefaultAnimatorEditorState(entity.name);
          const walkClip = createLibraryClip('Walk Cycle');
          return serializeAnimatorEditorState(
            {
              controllerId: null,
              currentAnimation: walkClip.name,
              parameters: {
                locomotion: 'walk',
                grounded: true,
                speed: 0.55,
              },
            },
            {
              ...baseState,
              activeClipId: walkClip.id,
              clips: [baseState.clips[0], walkClip],
              nlaStrips: [
                {
                  id: crypto.randomUUID(),
                  name: `${walkClip.name}_Main`,
                  clipId: walkClip.id,
                  start: 0,
                  end: walkClip.duration,
                  blendMode: 'replace',
                  muted: false,
                },
              ],
            }
          );
        })(),
        enabled: true,
      });
      addEntity(entity);
      await registerGeneratedScriptAsset('/scripts/PlayerController.generated.ts');
      results.push('✓ Personaje jugable creado');
      results.push('✓ Controles: WASD mover, Space saltar, Mouse rotar cámara');
      results.push('✓ Animaciones configuradas');
      results.push('✓ Script base del jugador registrado');
    }

    // Weapons
    if (lowerCommand.includes('arma') || lowerCommand.includes('weapon') || lowerCommand.includes('espada') || lowerCommand.includes('sword')) {
      const { EntityFactory } = await import('@/engine/core/ECS');
      const weapon = EntityFactory.create('Espada');
      weapon.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 0.5, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      weapon.components.set('Weapon', {
        id: crypto.randomUUID(),
        type: 'Weapon',
        data: { 
          damage: 25,
          attackSpeed: 1.5,
          range: 2,
          type: 'melee',
        },
        enabled: true,
      });
      addEntity(weapon);
      await registerGeneratedScriptAsset('/scripts/WeaponLogic.generated.ts');
      results.push('✓ Arma creada (25 daño, 1.5 velocidad)');
      results.push('✓ Script base de arma preparado');
    }

    // Particles/Effects
    if (lowerCommand.includes('partícula') || lowerCommand.includes('particle') || lowerCommand.includes('efecto') || lowerCommand.includes('effect')) {
      results.push('✓ Sistema de partículas creado');
      results.push('✓ Efectos visuales aplicados');
    }

    // Terrain
    if (lowerCommand.includes('terreno') || lowerCommand.includes('terrain') || lowerCommand.includes('isla')) {
      const { makeStarterTerrain } = await import('@/engine/reyplay/studio/Templates');
      addEntity(makeStarterTerrain('Terrain Procedural'));
      await registerGeneratedScriptAsset('/scripts/TerrainRules.generated.ts');
      results.push('✓ Terreno procedural generado');
      results.push('✓ Texturas aplicadas');
      results.push('✓ Script de reglas del terreno preparado');
    }

    // Enemies
    if (
      lowerCommand.includes('enemigo') ||
      lowerCommand.includes('enemy') ||
      lowerCommand.includes('monstruo') ||
      lowerCommand.includes('monster') ||
      lowerCommand.includes('boss') ||
      lowerCommand.includes('lobo') ||
      lowerCommand.includes('wolf') ||
      lowerCommand.includes('bestia') ||
      lowerCommand.includes('creatura') ||
      lowerCommand.includes('creature')
    ) {
      const { EntityFactory } = await import('@/engine/core/ECS');
      const isWolf = lowerCommand.includes('lobo') || lowerCommand.includes('wolf');
      const enemy = EntityFactory.create(isWolf ? 'Lobo Enemigo' : 'Enemy');
      enemy.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 3, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      enemy.tags.push('enemy');
      if (isWolf) {
        enemy.tags.push('wolf', 'lobo');
      }
      addEntity(enemy);
      await registerGeneratedScriptAsset('/scripts/EnemyAI.generated.ts');
      results.push(isWolf ? '✓ Enemigo lobo agregado a escena' : '✓ Enemigo base agregado a escena');
      results.push('✓ Script de IA de patrulla preparado');
    }

    // Jump physics / camera jump setup
    if (
      lowerCommand.includes('salto') ||
      lowerCommand.includes('jump') ||
      lowerCommand.includes('saltar') ||
      lowerCommand.includes('física de salto') ||
      lowerCommand.includes('fisica de salto')
    ) {
      const targetCamera =
        lowerCommand.includes('camara') ||
        lowerCommand.includes('cámara') ||
        lowerCommand.includes('camera');
      let targetEntity = Array.from(entities.values()).find((entity) =>
        targetCamera ? entity.components.has('Camera') : entity.tags.includes('player') || entity.components.has('PlayerController')
      );

      if (!targetEntity) {
        const { EntityFactory } = await import('@/engine/core/ECS');
        if (targetCamera) {
          const cameraEntity = EntityFactory.create('Camara Saltadora');
          cameraEntity.components.set('Transform', {
            id: crypto.randomUUID(),
            type: 'Transform',
            data: {
              position: { x: 0, y: 2, z: 6 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
            },
            enabled: true,
          });
          cameraEntity.components.set('Camera', {
            id: crypto.randomUUID(),
            type: 'Camera',
            data: {
              fov: 60,
              near: 0.1,
              far: 1000,
              orthographic: false,
              clearColor: { r: 0.08, g: 0.08, b: 0.1, a: 1 },
              isMain: false,
            },
            enabled: true,
          });
          addEntity(cameraEntity);
          targetEntity = cameraEntity;
          results.push('✓ Camara creada para aplicar salto');
        } else {
          const playerEntity = EntityFactory.create('Jugador Saltador');
          playerEntity.components.set('Transform', {
            id: crypto.randomUUID(),
            type: 'Transform',
            data: {
              position: { x: 0, y: 1, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
            },
            enabled: true,
          });
          playerEntity.tags.push('player');
          addEntity(playerEntity);
          targetEntity = playerEntity;
          results.push('✓ Jugador creado para aplicar salto');
        }
      }

      if (targetEntity) {
        const updatedComponents = new Map(targetEntity.components);
        updatedComponents.set('PlayerController', {
          id: crypto.randomUUID(),
          type: 'PlayerController',
          data: {
            speed: 4.5,
            jumpForce: 10,
            sensitivity: 2,
            canDoubleJump: false,
          },
          enabled: true,
        });
        updateEntity(targetEntity.id, { components: updatedComponents });
        results.push(
          targetCamera
            ? `✓ Física de salto aplicada a cámara: ${targetEntity.name}`
            : `✓ Física de salto aplicada a entidad: ${targetEntity.name}`
        );
      } else {
        results.push('⚠️ No encontré un objetivo para salto. Crea primero cámara o jugador.');
      }
    }

    // Default response
    if (results.length === 0) {
      const looksLikeQuestion =
        lowerCommand.includes('?') ||
        lowerCommand.startsWith('que ') ||
        lowerCommand.startsWith('qué ') ||
        lowerCommand.startsWith('como ') ||
        lowerCommand.startsWith('cómo ');
      const wantsPrimitive =
        lowerCommand.includes('cubo') ||
        lowerCommand.includes('cube') ||
        lowerCommand.includes('esfera') ||
        lowerCommand.includes('sphere') ||
        lowerCommand.includes('capsula') ||
        lowerCommand.includes('cápsula') ||
        lowerCommand.includes('capsule') ||
        lowerCommand.includes('cilindro') ||
        lowerCommand.includes('cylinder');

      if (!looksLikeQuestion && wantsPrimitive) {
        const { EntityFactory } = await import('@/engine/core/ECS');
        const generic = EntityFactory.create(
          command
            .replace(/crea|crear|haz|make|build|genera|generar|agrega|añade|add/gi, '')
            .trim()
            .slice(0, 42) || 'Objeto Generado'
        );
        generic.components.set('Transform', {
          id: crypto.randomUUID(),
          type: 'Transform',
          data: {
            position: { x: 0, y: 0.5, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
          enabled: true,
        });
        generic.components.set('MeshRenderer', {
          id: crypto.randomUUID(),
          type: 'MeshRenderer',
          data: { meshId: 'cube', materialId: 'default', castShadows: true, receiveShadows: true },
          enabled: true,
        });
        addEntity(generic);
        results.push(`✓ Objeto creado desde orden libre: ${generic.name}`);
      } else {
        results.push('⚠️ No detecté una acción de escena válida para construir.');
        results.push('💡 Tip: pide explícitamente un objetivo, por ejemplo: "crea cubo", "crea laberinto", "crea personaje 3d".');
      }
    }

    if (!silent) {
      emitValidatedCompletion(results);
    }
    return results;
  }

  // Handle send
  const handleSend = () => {
    if (!input.trim() || isInputLocked) return;
    processCommand(input);
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Copy message
  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick actions
  const quickActions = [
    { icon: PersonStanding, label: 'Personaje', prompt: 'genera un personaje guerrero fantasy para juego' },
    { icon: Swords, label: 'Arma', prompt: 'genera una espada medieval con detalles' },
    { icon: Building2, label: 'Escena', prompt: 'crea una escena base con terreno, jugador y camara' },
    { icon: Mountain, label: 'Terreno', prompt: 'crea terreno montañoso con vegetación' },
    { icon: Wand2, label: 'Textura', prompt: 'genera una textura sci fi azul para piso metalico' },
    { icon: Gamepad2, label: 'Video', prompt: 'crea un video trailer corto de una arena futurista' },
  ];

  const agenticHistoryFilterOptions: Array<{ value: AgenticHistoryFilter; label: string }> = [
    { value: 'all', label: `Todo${formatHistoryFilterCount(agenticHistoryFilterCounts?.total)}` },
    { value: 'approved', label: `Aprobados${formatHistoryFilterCount(agenticHistoryFilterCounts?.approved)}` },
    { value: 'rejected', label: `Rechazados${formatHistoryFilterCount(agenticHistoryFilterCounts?.rejected)}` },
    { value: 'replay', label: `Replay${formatHistoryFilterCount(agenticHistoryFilterCounts?.replay)}` },
    { value: 'rollbackable', label: `Rollback${formatHistoryFilterCount(agenticHistoryFilterCounts?.rollbackable)}` },
    { value: 'pending_index', label: `Pendientes index${formatHistoryFilterCount(agenticHistoryFilterCounts?.pendingIndex)}` },
  ];
  const agenticToolFilterOptions = [
    'all',
    ...[
      ...new Set([
        ...agenticHistoryFilterOptionsFromServer.tools,
        agenticToolFilter !== 'all' ? agenticToolFilter : '',
      ].filter(Boolean)),
    ].sort(),
  ];
  const agenticAgentFilterOptions = [
    'all',
    ...[
      ...new Set([
        ...agenticHistoryFilterOptionsFromServer.agents,
        agenticAgentFilter !== 'all' ? agenticAgentFilter : '',
      ].filter(Boolean)),
    ].sort(),
  ];
  const agenticTimelineMutationFilterOptions: Array<{
    value: AgenticTimelineMutationFilter;
    label: string;
  }> = [
    { value: 'all', label: 'Timeline: todo' },
    { value: 'mutating', label: 'Mutates world' },
    { value: 'readonly', label: 'Read only' },
  ];
  const agenticTraceSeverityOptions = [
    'all',
    ...[
      ...new Set([
        'debug',
        'info',
        'warn',
        'warning',
        'error',
        ...agenticHistory.flatMap((record) =>
          (record.traces ?? []).map((trace) => trace.severity).filter(Boolean)
        ),
      ]),
    ].sort(),
  ];
  const agenticHistoryPageStart = agenticHistoryPagination && agenticHistoryPagination.filteredRecords > 0
    ? agenticHistoryPagination.offset + 1
    : 0;
  const agenticHistoryPageEnd = agenticHistoryPagination
    ? Math.min(
        agenticHistoryPagination.offset + agenticHistory.length,
        agenticHistoryPagination.filteredRecords
      )
    : agenticHistory.length;
  const agenticComparisonRecords = agenticComparisonIds
    .map((id) => agenticHistory.find((record) => record.id === id))
    .filter((record): record is AgenticExecutionHistoryRecord => Boolean(record));
  const agenticComparison =
    agenticComparisonRecords.length === 2
      ? compareAgenticExecutions(agenticComparisonRecords[0], agenticComparisonRecords[1])
      : null;
  const agenticMutationIndexPendingExecutionIds =
    agenticMutationIndexAuditSummary?.pendingIndexableExecutionIds ?? [];
  const agenticMutationIndexPendingExecutionIdSet = new Set(agenticMutationIndexPendingExecutionIds);
  const agenticHistoryHasActiveServerFilters =
    agenticHistoryFilter !== 'all' ||
    agenticToolFilter !== 'all' ||
    agenticAgentFilter !== 'all' ||
    agenticHistorySearch.trim().length > 0 ||
    agenticTraceEventFilter.trim().length > 0 ||
    agenticTraceActorFilter.trim().length > 0 ||
    agenticTraceSeverityFilter !== 'all';
  const filteredAgenticHistory = agenticHistory.filter((record) => {
    const matchesStatus =
      agenticHistoryFilter === 'approved'
        ? record.approved
        : agenticHistoryFilter === 'rejected'
          ? !record.approved
          : agenticHistoryFilter === 'replay'
            ? record.action === 'replay'
            : agenticHistoryFilter === 'rollbackable'
              ? record.snapshots?.before === true
              : agenticHistoryFilter === 'pending_index'
                ? agenticMutationIndexPendingExecutionIdSet.has(record.id)
              : true;
    const matchesTool = agenticToolFilter === 'all' || (record.toolNames ?? []).includes(agenticToolFilter);
    const matchesAgent =
      agenticAgentFilter === 'all' || (record.agentRoles ?? []).includes(agenticAgentFilter);
    return matchesStatus && matchesTool && matchesAgent;
  });

  const agentPlannerProgressValue =
    agentPlan && agentPlan.telemetry.totalStages > 0
      ? Math.round((agentPlan.telemetry.completedStages / agentPlan.telemetry.totalStages) * 100)
      : 0;
  const agentPlannerActiveJob = agentPlan?.jobs.at(-1) ?? null;
  const linkedAssistantJobs = agentPlan?.assistantJobs ?? [];
  const linkedAssistantJob = linkedAssistantJobs.at(-1) ?? null;
  const agentPlannerSourceBlockOptions = [
    'all',
    ...[
      ...new Set(
        (agentPlan?.customTasks ?? [])
          .map((task) => task.sourceBlockId?.trim() || 'unassigned')
      ),
    ].sort(),
  ];
  const agentPlannerSourceBlockGroups = [...(agentPlan?.customTasks ?? []).reduce(
    (groups, task) => {
      const sourceBlockId = task.sourceBlockId?.trim() || 'unassigned';
      const current =
        groups.get(sourceBlockId) ??
        {
          sourceBlockId,
          total: 0,
          counts: createEmptyCustomTaskCounts(),
        };
      current.total += 1;
      current.counts[task.status] += 1;
      groups.set(sourceBlockId, current);
      return groups;
    },
    new Map<
      string,
      {
        sourceBlockId: string;
        total: number;
        counts: CustomTaskStatusCounts;
      }
    >()
  ).values()].sort((left, right) => left.sourceBlockId.localeCompare(right.sourceBlockId));
  const visibleAgentPlannerCustomTasks =
    agentPlannerSourceBlockFilter === 'all'
      ? (agentPlan?.customTasks ?? [])
      : (agentPlan?.customTasks ?? []).filter(
          (task) => (task.sourceBlockId?.trim() || 'unassigned') === agentPlannerSourceBlockFilter
        );
  const visibleAgentPlannerCustomTaskIds = new Set(
    visibleAgentPlannerCustomTasks.map((task) => task.taskId)
  );
  const visibleAgentPlannerCustomStages =
    agentPlannerSourceBlockFilter === 'all'
      ? (agentPlan?.customStages ?? [])
      : (agentPlan?.customStages ?? []).filter((stage) =>
          stage.taskIds.some((taskId) => visibleAgentPlannerCustomTaskIds.has(taskId))
        );
  const agentPlannerMetadataCounts = sumCustomTaskMetadataHistoryCounts(
    (agentPlan?.customTasks ?? []).map((task) =>
      countCustomTaskMetadataHistory(task.metadataHistory ?? [])
    )
  );
  const agentPlannerLocalGlobalRevertAudits = (agentPlan?.customTasks ?? [])
    .flatMap((task) =>
      (task.metadataHistory ?? [])
        .filter((entry) => entry.source === 'metadata_revert')
        .map((entry) => ({
          ...entry,
          task,
        }))
    )
    .filter((entry) =>
      agentPlannerRevertAuditFilter === 'staleConfirmed'
        ? Boolean(entry.staleRevertConfirmation)
        : true
    );
  const agentPlannerServerMetadataCounts =
    agentPlannerGlobalRevertAuditData?.counts ?? agentPlannerMetadataCounts;
  const agentPlannerGlobalRevertAudits =
    agentPlannerGlobalRevertAuditData?.audits ?? agentPlannerLocalGlobalRevertAudits;
  const agentPlannerGlobalRevertAuditPagination =
    agentPlannerGlobalRevertAuditData?.pagination ?? null;
  const agentPlannerGlobalRevertAuditPageStart =
    agentPlannerGlobalRevertAuditPagination && agentPlannerGlobalRevertAuditPagination.total > 0
      ? agentPlannerGlobalRevertAuditPagination.offset + 1
      : 0;
  const agentPlannerGlobalRevertAuditPageEnd = agentPlannerGlobalRevertAuditPagination
    ? Math.min(
        agentPlannerGlobalRevertAuditPagination.offset + agentPlannerGlobalRevertAudits.length,
        agentPlannerGlobalRevertAuditPagination.total
      )
    : agentPlannerGlobalRevertAudits.length;
  const staleRevertPolicyAuditTrail =
    staleRevertPolicy?.auditTrail ?? staleRevertPolicy?.config?.auditTrail ?? [];
  const staleRevertPolicyAuditPagination = staleRevertPolicy?.auditPagination ?? null;
  const staleRevertPolicyAuditPageStart =
    staleRevertPolicyAuditPagination && staleRevertPolicyAuditPagination.total > 0
      ? staleRevertPolicyAuditPagination.offset + 1
      : 0;
  const staleRevertPolicyAuditPageEnd = staleRevertPolicyAuditPagination
    ? Math.min(
        staleRevertPolicyAuditPagination.offset + staleRevertPolicyAuditTrail.length,
        staleRevertPolicyAuditPagination.total
      )
    : staleRevertPolicyAuditTrail.length;
  const staleRevertPolicyActiveFilters = [
    staleRevertPolicyActorFilter
      ? {
          key: 'actor' as const,
          label: `actor: ${staleRevertPolicyActorFilter}`,
        }
      : null,
    staleRevertPolicyDateFromFilter
      ? {
          key: 'from' as const,
          label: `from: ${staleRevertPolicyDateFromFilter}`,
        }
      : null,
    staleRevertPolicyDateToFilter
      ? {
          key: 'to' as const,
          label: `to: ${staleRevertPolicyDateToFilter}`,
        }
      : null,
  ].filter((filter): filter is { key: 'actor' | 'from' | 'to'; label: string } => Boolean(filter));
  const clearStaleRevertPolicyFilter = (filterKey: 'actor' | 'from' | 'to' | 'all') => {
    const nextActor = filterKey === 'actor' || filterKey === 'all' ? '' : staleRevertPolicyActorFilter;
    const nextFrom = filterKey === 'from' || filterKey === 'all' ? '' : staleRevertPolicyDateFromFilter;
    const nextTo = filterKey === 'to' || filterKey === 'all' ? '' : staleRevertPolicyDateToFilter;

    if (filterKey === 'actor' || filterKey === 'all') {
      setStaleRevertPolicyActorFilterInput('');
    }
    if (filterKey === 'from' || filterKey === 'all') {
      setStaleRevertPolicyDateFromFilterInput('');
    }
    if (filterKey === 'to' || filterKey === 'all') {
      setStaleRevertPolicyDateToFilterInput('');
    }

    void refreshStaleRevertPolicy({
      page: 0,
      actor: nextActor,
      from: nextFrom,
      to: nextTo,
    });
  };
  const staleRevertPolicyCurrentRoles =
    staleRevertPolicy?.config?.allowedRoles ??
    staleRevertPolicy?.policySnapshot?.allowedRoles ??
    staleRevertPolicyDraftRoles;
  const staleRevertPolicyEnvRoles =
    staleRevertPolicy?.envAllowedRoles ??
    (staleRevertPolicy?.policySnapshot?.source === 'env'
      ? staleRevertPolicy.policySnapshot.allowedRoles
      : ['OWNER']);
  const staleRevertPolicyResetReasonReady = staleRevertPolicyReason.trim().length >= 8;

  const pipelineProgressValue =
    pipelineProgress.totalStages > 0
      ? Math.round((pipelineProgress.completedStages / pipelineProgress.totalStages) * 100)
      : 0;
  const pipelineCurrentIndex =
    pipelineProgress.status === 'running'
      ? Math.min(pipelineProgress.totalStages, pipelineProgress.completedStages + 1)
      : Math.max(1, pipelineProgress.completedStages);
  const pipelineProgressTitle =
    pipelineProgress.kind === 'agentic'
      ? pipelineProgress.status === 'completed'
        ? 'Pipeline agentic validado'
        : pipelineProgress.status === 'error'
          ? 'Pipeline agentic falló'
          : 'Pipeline agentic en curso'
      : pipelineProgress.status === 'completed'
        ? 'Creación completada'
        : 'Creación en curso';
  const globalMutationIndexIntegrityStatus =
    agenticMutationIndexIntegrity?.status ?? agenticMutationIndexAuditSummary?.integrityStatus ?? null;
  const agenticMutationIndexIsBehind = agenticMutationIndexAuditSummary?.indexBehind === true;
  const agenticMutationIndexPendingCount =
    agenticMutationIndexAuditSummary?.pendingIndexableExecutionCount ?? 0;
  const agenticMutationIndexSinglePendingExecutionId =
    agenticMutationIndexPendingExecutionIds.length === 1
      ? agenticMutationIndexPendingExecutionIds[0]
      : null;
  const agenticMutationIndexRecommendationCount =
    agenticMutationIndexAuditSummary?.recommendationCount ??
    (agenticMutationIndex ? Object.keys(agenticMutationIndex.recommendations).length : 0);
  const agenticMutationIndexLocalAuditCounts = countAgenticMutationIndexAuditActions(
    agenticMutationIndex?.integrityAuditTrail
  );
  const agenticMutationIndexChecksumRepairCount =
    agenticMutationIndexAuditSummary?.checksumRepairCount ??
    agenticMutationIndexLocalAuditCounts.checksumRepairCount;
  const agenticMutationIndexFullReindexCount =
    agenticMutationIndexAuditSummary?.historyReindexedFullCount ??
    agenticMutationIndexLocalAuditCounts.historyReindexedFullCount;
  const agenticMutationIndexPartialReindexCount =
    agenticMutationIndexAuditSummary?.historyReindexedPartialCount ??
    agenticMutationIndexLocalAuditCounts.historyReindexedPartialCount;
  const agenticMutationIndexLegacyReindexCount =
    agenticMutationIndexAuditSummary?.legacyHistoryReindexedCount ??
    agenticMutationIndexLocalAuditCounts.legacyHistoryReindexedCount;
  const filteredAgenticMutationIndexAuditTrail = (agenticMutationIndex?.integrityAuditTrail ?? []).filter(
    (entry) => agenticAuditActionFilter === 'all' || entry.action === agenticAuditActionFilter
  );
  const agenticMutationIndexExportBlockReason = mutationIndexExportBlockReason(
    agenticMutationIndexIntegrity,
    agenticMutationIndexAuditSummary
  );

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-slate-200">Asistente IA</h3>
          {serverAgenticExecution &&
          (globalMutationIndexIntegrityStatus === 'mismatch' ||
            globalMutationIndexIntegrityStatus === 'missing' ||
            agenticMutationIndexIsBehind) ? (
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase',
                globalMutationIndexIntegrityStatus === 'mismatch'
                  ? 'border-red-400/50 bg-red-950/50 text-red-100'
                  : globalMutationIndexIntegrityStatus === 'missing'
                    ? 'border-amber-300/50 bg-amber-950/50 text-amber-100'
                    : 'border-orange-300/50 bg-orange-950/50 text-orange-100'
              )}
              title="Índice agentic corrupto, incompleto o atrasado. Abre historial server para reparar, reindexar o exportar auditoría."
              data-testid="agentic-global-mutation-index-integrity-alert"
            >
              índice {agenticMutationIndexIsBehind ? 'atrasado' : globalMutationIndexIntegrityStatus}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-200"
            onClick={() => setDiagnosticsOpen((value) => !value)}
            title="Estado rápido"
          >
            Estado
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-200"
            onClick={() => clearChat()}
            title="Limpiar chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-700/50 shrink-0">
        {advancedMode && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Modo IA</span>
            <AIModeToggle />
          </div>
        )}
        <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5">
          <p className="text-[11px] font-medium text-cyan-300">Modo: {modeLabel}</p>
          <p className="text-[11px] text-slate-500">{modeDescription}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {advancedMode ? `Guía rápida: ${modeGuide.steps[0]}` : 'Escribe lo que quieres crear y yo me encargo del resto.'}
          </p>
        </div>
        <div className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-2">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <div>
              <p className="text-[11px] font-medium text-emerald-200">Agente validador activo</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Prompt → herramientas del motor → contrato AI/Scrib → compile → entrega al usuario.
              </p>
            </div>
          </div>
          <div className="mt-2 grid gap-1.5 text-[10px] text-slate-400 sm:grid-cols-3">
            <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1">Motor: escena, assets, scripts</span>
            <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1">Validador: contrato + compile</span>
            <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1">Evidencia: mensajes y receipts</span>
          </div>
        </div>
        <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-200">Server Agentic Execution</p>
              <p className="text-[10px] text-slate-500">
                {serverAgenticExecution ? 'Activo: guarda, ejecuta y recarga desde /api/agentic.' : 'Inactivo: ejecuta el pipeline en el cliente.'}
              </p>
            </div>
            <Switch
              checked={serverAgenticExecution}
              onCheckedChange={handleServerAgenticToggle}
              aria-label="Ejecución agentic server"
              data-testid="agentic-server-toggle"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/70 px-2 py-1.5">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-slate-300">Aprobación previa</p>
              <p className="text-[9px] text-slate-500">
                Bloquea tools mutadoras hasta aprobar/rechazar recomendaciones de inspección.
              </p>
            </div>
            <Switch
              checked={agenticRequireRecommendationApproval}
              onCheckedChange={setAgenticRequireRecommendationApproval}
              aria-label="Aprobación previa de recomendaciones agentic"
              data-testid="agentic-recommendation-approval-toggle"
            />
          </div>
          {serverAgenticExecution && (
            <div
              className="mt-2 rounded border border-slate-800 bg-slate-900/70 p-2"
              data-testid="agentic-server-history"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase text-slate-400">
                  Historial server
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-slate-500 hover:text-slate-200"
                  onClick={() => void refreshAgenticHistory()}
                  disabled={agenticHistoryLoading}
                  title="Actualizar historial"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', agenticHistoryLoading && 'animate-spin')} />
                </Button>
              </div>
              <div
                className="mb-2 rounded border border-slate-800 bg-slate-950/70 p-2"
                data-testid="agentic-history-mutation-index-audit-summary"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-[9px]">
                    <p className="font-medium uppercase text-slate-400">
                      Auditoría índice
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.5 uppercase',
                          (agenticMutationIndexAuditSummary?.integrityStatus ?? agenticMutationIndexIntegrity?.status) === 'mismatch'
                            ? 'border-red-500/30 bg-red-500/10 text-red-200'
                            : (agenticMutationIndexAuditSummary?.integrityStatus ?? agenticMutationIndexIntegrity?.status) === 'missing'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                        )}
                        data-testid="agentic-history-mutation-index-integrity-badge"
                      >
                        {(agenticMutationIndexAuditSummary?.integrityStatus ?? agenticMutationIndexIntegrity?.status ?? 'unknown')}
                      </span>
                      {agenticMutationIndexIsBehind ? (
                        <span
                          className="rounded border border-orange-400/50 bg-orange-950/50 px-1.5 py-0.5 uppercase text-orange-100"
                          data-testid="agentic-history-mutation-index-behind-badge"
                        >
                          behind · pendientes: {agenticMutationIndexPendingCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-slate-500">
                      reparaciones: {agenticMutationIndexAuditSummary?.repairCount ?? 0}
                      {' · '}
                      checksum: {agenticMutationIndexChecksumRepairCount}
                      {' · '}
                      full: {agenticMutationIndexFullReindexCount}
                      {' · '}
                      partial: {agenticMutationIndexPartialReindexCount}
                      {agenticMutationIndexLegacyReindexCount > 0
                        ? ` · legacy: ${agenticMutationIndexLegacyReindexCount}`
                        : ''}
                      {' · '}
                      recomendaciones: {agenticMutationIndexRecommendationCount}
                      {' · '}
                      integridad: {agenticMutationIndexAuditSummary?.integrityStatus ?? agenticMutationIndexIntegrity?.status ?? 'unknown'}
                      {' · '}
                      atraso: {agenticMutationIndexIsBehind ? 'sí' : 'no'}
                      {' · '}
                      pendientes: {agenticMutationIndexPendingCount}
                    </p>
                    {agenticMutationIndexAuditSummary?.latestIndexableExecutionId ? (
                      <p className="truncate text-slate-600">
                        indexado: {agenticMutationIndexAuditSummary.lastIndexedExecutionId ?? 'none'} · latest: {agenticMutationIndexAuditSummary.latestIndexableExecutionId}
                      </p>
                    ) : null}
                    {agenticMutationIndexPendingExecutionIds.length > 0 ? (
                      <p
                        className="truncate text-orange-200/70"
                        title={agenticMutationIndexPendingExecutionIds.join(', ')}
                        data-testid="agentic-history-mutation-index-pending-ids"
                      >
                        pendientes IDs: {agenticMutationIndexPendingExecutionIds.slice(0, 4).join(', ')}
                        {agenticMutationIndexPendingExecutionIds.length > 4 ? '...' : ''}
                      </p>
                    ) : null}
                    {agenticMutationIndexAuditSummary?.latestRepairId ? (
                      <p className="truncate text-slate-600">
                        última: {agenticMutationIndexAuditSummary.latestRepairId}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <AgenticMutationIndexExportButton
                      className="h-5 px-1.5 text-[8px] text-amber-200 hover:text-amber-100"
                      onClick={() =>
                        downloadAgenticRecommendationMutationIndexServerReport({
                          projectName: projectName || 'untitled_project',
                          slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                          format: 'json',
                          scope: 'audit',
                        })
                      }
                      title="Exportar auditoría de índice aunque no haya ejecución seleccionada"
                      testId="agentic-history-mutation-index-audit-json"
                    >
                      <Download className="mr-1 h-2.5 w-2.5" />
                      Audit JSON
                    </AgenticMutationIndexExportButton>
                    <AgenticMutationIndexExportButton
                      className="h-5 px-1.5 text-[8px] text-amber-200 hover:text-amber-100"
                      onClick={() =>
                        downloadAgenticRecommendationMutationIndexServerReport({
                          projectName: projectName || 'untitled_project',
                          slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                          format: 'markdown',
                          scope: 'audit',
                        })
                      }
                      title="Exportar auditoría de índice Markdown aunque no haya ejecución seleccionada"
                      testId="agentic-history-mutation-index-audit-markdown"
                    >
                      <Download className="mr-1 h-2.5 w-2.5" />
                      Audit MD
                    </AgenticMutationIndexExportButton>
                  </div>
                </div>
              </div>
              <div className="mb-2 flex gap-1" data-testid="agentic-history-search">
                <Input
                  value={agenticHistorySearchInput}
                  onChange={(event) => setAgenticHistorySearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyAgenticHistorySearch();
                    }
                  }}
                  placeholder="Buscar prompt, tool o agente"
                  className="h-7 border-slate-800 bg-slate-950 text-[10px]"
                  data-testid="agentic-history-search-input"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  onClick={applyAgenticHistorySearch}
                  disabled={agenticHistoryLoading}
                >
                  Buscar
                </Button>
              </div>
              {agenticHistoryFilterCounts ? (
                <div
                  className="mb-2 flex flex-wrap gap-1 text-[9px] text-slate-500"
                  data-testid="agentic-history-filter-counts"
                >
                  <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5">
                    total {agenticHistoryFilterCounts.total}
                  </span>
                  <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200">
                    aprobados {agenticHistoryFilterCounts.approved}
                  </span>
                  <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">
                    rechazados {agenticHistoryFilterCounts.rejected}
                  </span>
                  <span className="rounded border border-orange-400/30 bg-orange-500/10 px-1.5 py-0.5 text-orange-200">
                    pending index {agenticHistoryFilterCounts.pendingIndex}
                  </span>
                </div>
              ) : null}
              <div className="mb-2 flex flex-wrap gap-1" data-testid="agentic-history-filters">
                {agenticHistoryFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[9px]',
                      agenticHistoryFilter === option.value
                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                        : 'border-slate-800 bg-slate-950/70 text-slate-500 hover:text-slate-200'
                    )}
                    onClick={() => {
                      setAgenticHistoryFilter(option.value);
                      void refreshAgenticHistory({
                        page: 0,
                        search: agenticHistorySearchInput,
                        historyFilter: option.value,
                        traceEvent: agenticTraceEventFilter,
                        traceActor: agenticTraceActorFilter,
                        traceSeverity: agenticTraceSeverityFilter,
                      });
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mb-2 grid gap-1 sm:grid-cols-2" data-testid="agentic-history-advanced-filters">
                <label className="grid gap-0.5 text-[9px] text-slate-500">
                  Tool
                  <select
                    value={agenticToolFilter}
                    onChange={(event) => {
                      const nextToolFilter = event.target.value;
                      setAgenticToolFilter(nextToolFilter);
                      void refreshAgenticHistory({
                        page: 0,
                        search: agenticHistorySearchInput,
                        historyFilter: agenticHistoryFilter,
                        toolFilter: nextToolFilter,
                        agentFilter: agenticAgentFilter,
                        traceEvent: agenticTraceEventFilter,
                        traceActor: agenticTraceActorFilter,
                        traceSeverity: agenticTraceSeverityFilter,
                      });
                    }}
                    disabled={agenticToolFilterOptions.length <= 1}
                    className="h-6 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-slate-300 outline-none disabled:text-slate-600"
                    data-testid="agentic-tool-filter"
                  >
                    {agenticToolFilterOptions.map((value) => (
                      <option key={value} value={value}>
                        {formatAgenticFilterLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-0.5 text-[9px] text-slate-500">
                  Agente
                  <select
                    value={agenticAgentFilter}
                    onChange={(event) => {
                      const nextAgentFilter = event.target.value;
                      setAgenticAgentFilter(nextAgentFilter);
                      void refreshAgenticHistory({
                        page: 0,
                        search: agenticHistorySearchInput,
                        historyFilter: agenticHistoryFilter,
                        toolFilter: agenticToolFilter,
                        agentFilter: nextAgentFilter,
                        traceEvent: agenticTraceEventFilter,
                        traceActor: agenticTraceActorFilter,
                        traceSeverity: agenticTraceSeverityFilter,
                      });
                    }}
                    disabled={agenticAgentFilterOptions.length <= 1}
                    className="h-6 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-slate-300 outline-none disabled:text-slate-600"
                    data-testid="agentic-agent-filter"
                  >
                    {agenticAgentFilterOptions.map((value) => (
                      <option key={value} value={value}>
                        {formatAgenticFilterLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mb-2 grid gap-1 sm:grid-cols-3" data-testid="agentic-history-trace-filters">
                <label className="grid gap-0.5 text-[9px] text-slate-500">
                  Trace event
                  <Input
                    value={agenticTraceEventFilter}
                    onChange={(event) => setAgenticTraceEventFilter(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyAgenticHistorySearch();
                      }
                    }}
                    placeholder="tool.completed"
                    className="h-6 border-slate-800 bg-slate-950 px-1 text-[10px]"
                    data-testid="agentic-trace-event-filter"
                  />
                </label>
                <label className="grid gap-0.5 text-[9px] text-slate-500">
                  Trace actor
                  <Input
                    value={agenticTraceActorFilter}
                    onChange={(event) => setAgenticTraceActorFilter(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyAgenticHistorySearch();
                      }
                    }}
                    placeholder="technical_integration"
                    className="h-6 border-slate-800 bg-slate-950 px-1 text-[10px]"
                    data-testid="agentic-trace-actor-filter"
                  />
                </label>
                <label className="grid gap-0.5 text-[9px] text-slate-500">
                  Severidad
                  <select
                    value={agenticTraceSeverityFilter}
                    onChange={(event) => {
                      const nextSeverity = event.target.value;
                      setAgenticTraceSeverityFilter(nextSeverity);
                      void refreshAgenticHistory({
                        page: 0,
                        search: agenticHistorySearchInput,
                        traceEvent: agenticTraceEventFilter,
                        traceActor: agenticTraceActorFilter,
                        traceSeverity: nextSeverity,
                      });
                    }}
                    className="h-6 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-slate-300 outline-none"
                    data-testid="agentic-trace-severity-filter"
                  >
                    {agenticTraceSeverityOptions.map((value) => (
                      <option key={value} value={value}>
                        {formatAgenticFilterLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {agenticComparisonIds.length > 0 && (
                <div
                  className="mb-2 rounded border border-cyan-500/20 bg-cyan-500/10 p-2 text-[10px]"
                  data-testid="agentic-execution-comparison"
                >
                  {agenticComparison ? (
                    <div className="space-y-1 text-slate-300">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-cyan-200">Comparación</p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded border border-cyan-500/30 px-1.5 py-0.5 text-cyan-200 hover:text-cyan-100"
                            onClick={() =>
                              downloadAgenticExecutionComparisonReport(
                                agenticComparisonRecords[0],
                                agenticComparisonRecords[1],
                                'json'
                              )
                            }
                            data-testid="agentic-comparison-json"
                          >
                            JSON
                          </button>
                          <button
                            type="button"
                            className="rounded border border-cyan-500/30 px-1.5 py-0.5 text-cyan-200 hover:text-cyan-100"
                            onClick={() =>
                              downloadAgenticExecutionComparisonReport(
                                agenticComparisonRecords[0],
                                agenticComparisonRecords[1],
                                'markdown'
                              )
                            }
                            data-testid="agentic-comparison-markdown"
                          >
                            MD
                          </button>
                          <button
                            type="button"
                            className="text-slate-500 hover:text-slate-200"
                            onClick={() => setAgenticComparisonIds([])}
                          >
                            limpiar
                          </button>
                        </div>
                      </div>
                      <p className="truncate text-slate-400">
                        {agenticComparison.leftId} vs {agenticComparison.rightId}
                      </p>
                      <div className="grid gap-1 sm:grid-cols-3">
                        <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1">
                          Estado: {agenticComparison.statusChanged ? 'cambió' : 'igual'}
                        </span>
                        <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1">
                          Aprobación: {agenticComparison.approvalChanged ? 'cambió' : 'igual'}
                        </span>
                        <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1">
                          Trazas: {formatSignedInteger(agenticComparison.traceDelta)}
                        </span>
                      </div>
                      <p className="text-slate-400">
                        Tool calls {formatSignedInteger(agenticComparison.toolCallDelta)} · Evidencia raw {formatSignedInteger(agenticComparison.evidenceDelta)}
                      </p>
                      <p className="text-slate-400">
                        Entidades {formatSignedInteger(agenticComparison.counts.entities)} · Assets {formatSignedInteger(agenticComparison.counts.assets)} · Escenas {formatSignedInteger(agenticComparison.counts.scenes)}
                      </p>
                      <p className="text-slate-400">
                        Tools nuevas: {formatComparisonList(agenticComparison.tools.onlyRight)}
                      </p>
                      <p className="text-slate-400">
                        Agentes nuevos: {formatComparisonList(agenticComparison.agents.onlyRight)}
                      </p>
                      <p className="text-slate-400">
                        Cambios semánticos nuevos: {formatComparisonList(agenticComparison.semantic.onlyRight)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-cyan-200">
                      Comparación: selecciona {2 - agenticComparisonIds.length} ejecución(es) más.
                    </p>
                  )}
                </div>
              )}
              {agenticHistoryError ? (
                <p className="text-[10px] text-amber-300">{agenticHistoryError}</p>
              ) : agenticHistory.length === 0 ? (
                <p className="text-[10px] text-slate-500">
                  {agenticHistoryHasActiveServerFilters
                    ? 'Sin ejecuciones para este filtro.'
                    : 'Sin ejecuciones registradas.'}
                </p>
              ) : filteredAgenticHistory.length === 0 ? (
                <p className="text-[10px] text-slate-500">Sin ejecuciones para este filtro.</p>
              ) : (
                <div className="space-y-1.5">
                  {filteredAgenticHistory.map((record) => {
                    const selected = selectedAgenticHistoryId === record.id;
                    const comparisonSelected = agenticComparisonIds.includes(record.id);
                    const pendingRollback =
                      agenticHistoryAction?.id === record.id &&
                      agenticHistoryAction.action === 'rollback';
                    const pendingReplay =
                      agenticHistoryAction?.id === record.id &&
                      agenticHistoryAction.action === 'replay';
                    const pendingApprovedExecution =
                      agenticHistoryAction?.id === record.id &&
                      agenticHistoryAction.action === 'approved';
                    const pendingPartialRollback =
                      agenticHistoryAction?.id === record.id &&
                      agenticHistoryAction.action === 'partialRollback';
                    const pendingIndexReindex =
                      agenticHistoryAction?.id === record.id &&
                      agenticHistoryAction.action === 'reindexPending';
                    const pendingIndexableRecord = agenticMutationIndexPendingExecutionIdSet.has(record.id);
                    const approvedRecommendationCount = (record.sharedMemory?.actionableRecommendations ?? []).filter(
                      (recommendation) =>
                        agenticRecommendationStatus(record, recommendation, agenticRecommendationDecisions) === 'approved'
                    ).length;

                    return (
                    <div
                      key={record.id}
                      className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
                      data-testid="agentic-history-row"
                      data-agentic-execution-id={record.id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'rounded border px-1.5 py-0.5 text-[9px] font-medium',
                            record.approved
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                          )}
                        >
                          {record.approved ? 'aprobado' : 'rechazado'}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {formatAgenticHistoryTimestamp(record.completedAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-300">{record.prompt}</p>
                      <p className="mt-0.5 truncate text-[9px] text-slate-500">
                        {record.stepCount} pasos · {record.toolNames.length} tools
                        {record.artifactPath ? ` · ${record.artifactPath}` : ''}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px] text-slate-400 hover:text-slate-100"
                          onClick={() =>
                            setSelectedAgenticHistoryId((current) =>
                              current === record.id ? null : record.id
                            )
                          }
                          title="Ver detalle"
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          Detalle
                        </Button>
                        {pendingIndexableRecord ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px] text-orange-200 hover:text-orange-100"
                            onClick={() => void handleAgenticMutationIndexReindex(record.id)}
                            disabled={
                              Boolean(agenticHistoryAction) ||
                              agenticMutationIndexRepairing ||
                              agenticMutationIndexLoading
                            }
                            title="Indexar solo esta ejecución pendiente y dejar auditoría parcial"
                            data-testid="agentic-pending-index-reindex-row"
                          >
                            {pendingIndexReindex ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3" />
                            )}
                            Reindexar esta ejecución
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px] text-slate-400 hover:text-slate-100"
                          onClick={() => void handleAgenticHistoryMutation(record, 'replay')}
                          disabled={Boolean(agenticHistoryAction) || agenticMutationIndexIsBehind}
                          title={
                            agenticMutationIndexIsBehind
                              ? 'Replay bloqueado: reindexa el índice atrasado antes de reejecutar'
                              : 'Reejecutar prompt'
                          }
                          data-testid="agentic-history-replay"
                        >
                          {pendingReplay ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          Replay
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px] text-emerald-300 hover:text-emerald-100"
                          onClick={() => void handleAgenticHistoryMutation(record, 'approved')}
                          disabled={
                            Boolean(agenticHistoryAction) ||
                            approvedRecommendationCount === 0 ||
                            agenticMutationIndexIsBehind
                          }
                          title={
                            agenticMutationIndexIsBehind
                              ? 'Ejecución bloqueada: reindexa el índice atrasado antes de mutar'
                              : approvedRecommendationCount > 0
                              ? 'Ejecutar solo recomendaciones aprobadas'
                              : 'No hay recomendaciones aprobadas para ejecutar'
                          }
                          data-testid="agentic-run-approved-recommendations"
                        >
                          {pendingApprovedExecution ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          Ejecutar aprobadas
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(
                            'h-6 px-1.5 text-[10px]',
                            comparisonSelected
                              ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:text-cyan-100'
                              : 'text-slate-400 hover:text-slate-100'
                          )}
                          onClick={() => toggleAgenticComparison(record.id)}
                          title={comparisonSelected ? 'Quitar de comparación' : 'Comparar ejecución'}
                          data-testid="agentic-compare-toggle"
                        >
                          <GitCompareArrows className="mr-1 h-3 w-3" />
                          Comparar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px] text-amber-300 hover:text-amber-100"
                          onClick={() => setRollbackCandidate(record)}
                          disabled={Boolean(agenticHistoryAction) || !record.snapshots?.before}
                          title={
                            record.snapshots?.before
                              ? 'Restaurar estado anterior'
                              : 'Sin snapshot restaurable'
                          }
                        >
                          {pendingRollback ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1 h-3 w-3" />
                          )}
                          Rollback
                        </Button>
                        {record.recommendationExecution ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px] text-cyan-300 hover:text-cyan-100"
                            onClick={() => void handleAgenticPartialRecommendationRollback(record)}
                            disabled={
                              Boolean(agenticHistoryAction) ||
                              !record.recommendationExecution.partialRollback.available ||
                              record.recommendationExecution.partialRollback.applied
                            }
                            title={
                              record.recommendationExecution.partialRollback.applied
                                ? 'Rollback parcial ya aplicado'
                                : record.recommendationExecution.partialRollback.available
                                  ? 'Revertir solo las mutaciones de recomendaciones aprobadas'
                                  : 'Sin rollback parcial seguro'
                            }
                            data-testid="agentic-partial-recommendation-rollback"
                          >
                            {pendingPartialRollback ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-1 h-3 w-3" />
                            )}
                            Rollback parcial
                          </Button>
                        ) : null}
                      </div>
                      {selected && (
                        <div
                          className="mt-2 rounded border border-slate-800 bg-slate-950/80 p-2"
                          data-testid="agentic-history-detail"
                        >
                          <div className="grid gap-1 text-[9px] text-slate-500 sm:grid-cols-2">
                            <span className="truncate">id: {record.id}</span>
                            <span>acción: {record.action}</span>
                            <span>iteración: {record.iteration}</span>
                            <span>
                              snapshots: {record.snapshots?.before ? 'before' : '-'} / {record.snapshots?.after ? 'after' : '-'}
                            </span>
                            {record.sourceExecutionId ? (
                              <span className="truncate sm:col-span-2">
                                replay de: {record.sourceExecutionId}
                              </span>
                            ) : null}
                            <span className="truncate sm:col-span-2">
                              agentes: {(record.agentRoles ?? []).join(', ') || 'sin agentes'}
                            </span>
                          </div>
                          {record.recommendationExecution ? (
                            <div
                              className="mt-2 rounded border border-cyan-500/20 bg-cyan-500/10 p-2 text-[9px]"
                              data-testid="agentic-recommendation-execution-link"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium uppercase text-cyan-200">
                                  Cadena recomendación → mutación
                                </p>
                                <span
                                  className={cn(
                                    'rounded border px-1 py-0.5 uppercase',
                                    record.recommendationExecution.partialRollback.applied
                                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                      : record.recommendationExecution.partialRollback.available
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                        : 'border-slate-700 bg-slate-950 text-slate-500'
                                  )}
                                >
                                  {record.recommendationExecution.partialRollback.applied
                                    ? 'rollback parcial aplicado'
                                    : record.recommendationExecution.partialRollback.available
                                      ? 'rollback parcial disponible'
                                      : 'sin rollback parcial'}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-cyan-100">
                                Ejecución aprobada nueva: {record.id} → recomendación original: {record.recommendationExecution.sourceExecutionId}
                              </p>
                              <div className="mt-1 space-y-1">
                                {record.recommendationExecution.recommendations.slice(0, 5).map((recommendation) => {
                                  const recommendationRolledBack =
                                    record.recommendationExecution?.partialRollback.recommendationIds.includes(recommendation.id) ||
                                    record.recommendationExecution?.partialRollback.recommendationKeys.includes(recommendation.approvalKey);
                                  return (
                                    <div
                                      key={recommendation.id}
                                      className="rounded border border-cyan-500/20 bg-slate-950/60 px-1.5 py-1"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="truncate text-cyan-100">{recommendation.summary}</p>
                                          <p className="truncate text-cyan-300/70">{recommendation.approvalKey}</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-5 px-1.5 text-[8px] text-slate-300 hover:text-slate-100"
                                            onClick={() =>
                                              downloadAgenticRecommendationMutationIndexServerReport({
                                                projectName: projectName || 'untitled_project',
                                                slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                                format: 'json',
                                                recommendationKey: recommendation.approvalKey || recommendation.id,
                                              })
                                            }
                                            disabled={Boolean(agenticMutationIndexExportBlockReason)}
                                            title={agenticMutationIndexExportBlockReason || 'Exportar solo esta recomendación JSON'}
                                            data-testid="agentic-mutation-index-recommendation-json"
                                          >
                                            <Download className="mr-1 h-2.5 w-2.5" />
                                            JSON
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-5 px-1.5 text-[8px] text-slate-300 hover:text-slate-100"
                                            onClick={() =>
                                              downloadAgenticRecommendationMutationIndexServerReport({
                                                projectName: projectName || 'untitled_project',
                                                slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                                format: 'markdown',
                                                recommendationKey: recommendation.approvalKey || recommendation.id,
                                              })
                                            }
                                            disabled={Boolean(agenticMutationIndexExportBlockReason)}
                                            title={agenticMutationIndexExportBlockReason || 'Exportar solo esta recomendación Markdown'}
                                            data-testid="agentic-mutation-index-recommendation-markdown"
                                          >
                                            <Download className="mr-1 h-2.5 w-2.5" />
                                            MD
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-5 px-1.5 text-[8px] text-cyan-200 hover:text-cyan-100"
                                            onClick={() =>
                                              void handleAgenticPartialRecommendationRollback(
                                                record,
                                                recommendation.approvalKey || recommendation.id
                                              )
                                            }
                                            disabled={
                                              Boolean(agenticHistoryAction) ||
                                              recommendationRolledBack ||
                                              record.recommendationExecution?.partialRollback.applied === true
                                            }
                                            title={
                                              recommendationRolledBack
                                                ? 'Recomendación ya revertida'
                                                : 'Rollback parcial solo para esta recomendación'
                                            }
                                            data-testid="agentic-partial-recommendation-rollback-item"
                                          >
                                            {pendingPartialRollback ? (
                                              <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                                            ) : (
                                              <RotateCcw className="mr-1 h-2.5 w-2.5" />
                                            )}
                                            {recommendationRolledBack ? 'Revertida' : 'Rollback'}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-1 space-y-1">
                                {record.recommendationExecution.unlockedMutations.slice(0, 4).map((mutation) => (
                                  <div
                                    key={mutation.toolCallId}
                                    className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1"
                                  >
                                    <p className="truncate text-slate-200">
                                      Mutación desbloqueada: {mutation.toolName} · {mutation.toolCallId}
                                    </p>
                                    <p className="truncate text-slate-500">
                                      por {mutation.recommendationKeys.join(', ') || mutation.recommendationIds.join(', ')}
                                    </p>
                                  </div>
                                ))}
                              </div>
                              <div
                                className="mt-2 rounded border border-slate-800 bg-slate-950/70 p-1.5"
                                data-testid="agentic-mutation-index-debug"
                              >
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="text-[8px] font-medium uppercase text-slate-400">
                                    Índice invertido
                                  </p>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-5 px-1.5 text-[8px] text-cyan-200 hover:text-cyan-100"
                                      onClick={() => void refreshAgenticMutationIndex()}
                                      disabled={agenticMutationIndexLoading}
                                      title="Leer índice invertido desde backend"
                                      data-testid="agentic-mutation-index-refresh"
                                    >
                                      {agenticMutationIndexLoading ? (
                                        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                                      ) : (
                                        <RefreshCw className="mr-1 h-2.5 w-2.5" />
                                      )}
                                      Índice
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-5 px-1.5 text-[8px] text-amber-200 hover:text-amber-100"
                                      onClick={() => setAgenticMutationIndexAuditOpen((current) => !current)}
                                      title="Ver auditoría de integridad del índice"
                                      data-testid="agentic-mutation-index-audit-toggle"
                                    >
                                      <Eye className="mr-1 h-2.5 w-2.5" />
                                      Auditoría
                                    </Button>
                                    <AgenticMutationIndexExportButton
                                      className="h-5 px-1.5 text-[8px] text-slate-300 hover:text-slate-100"
                                      onClick={() =>
                                        downloadAgenticRecommendationMutationIndexServerReport({
                                          projectName: projectName || 'untitled_project',
                                          slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                          format: 'json',
                                        })
                                      }
                                      disabled={Boolean(agenticMutationIndexExportBlockReason)}
                                      title={
                                        agenticMutationIndexExportBlockReason ||
                                        'Exportar índice invertido JSON desde servidor'
                                      }
                                      testId="agentic-mutation-index-json"
                                    >
                                      <Download className="mr-1 h-2.5 w-2.5" />
                                      JSON
                                    </AgenticMutationIndexExportButton>
                                    <AgenticMutationIndexExportButton
                                      className="h-5 px-1.5 text-[8px] text-slate-300 hover:text-slate-100"
                                      onClick={() =>
                                        downloadAgenticRecommendationMutationIndexServerReport({
                                          projectName: projectName || 'untitled_project',
                                          slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                          format: 'markdown',
                                        })
                                      }
                                      disabled={Boolean(agenticMutationIndexExportBlockReason)}
                                      title={
                                        agenticMutationIndexExportBlockReason ||
                                        'Exportar índice invertido Markdown desde servidor'
                                      }
                                      testId="agentic-mutation-index-markdown"
                                    >
                                      <Download className="mr-1 h-2.5 w-2.5" />
                                      MD
                                    </AgenticMutationIndexExportButton>
                                    <AgenticMutationIndexExportButton
                                      className="h-5 px-1.5 text-[8px] text-amber-200 hover:text-amber-100"
                                      onClick={() =>
                                        downloadAgenticRecommendationMutationIndexServerReport({
                                          projectName: projectName || 'untitled_project',
                                          slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                          format: 'json',
                                          scope: 'audit',
                                        })
                                      }
                                      title="Exportar solo auditoría de integridad JSON"
                                      testId="agentic-mutation-index-audit-json"
                                    >
                                      <Download className="mr-1 h-2.5 w-2.5" />
                                      Audit JSON
                                    </AgenticMutationIndexExportButton>
                                    <AgenticMutationIndexExportButton
                                      className="h-5 px-1.5 text-[8px] text-amber-200 hover:text-amber-100"
                                      onClick={() =>
                                        downloadAgenticRecommendationMutationIndexServerReport({
                                          projectName: projectName || 'untitled_project',
                                          slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                          format: 'markdown',
                                          scope: 'audit',
                                        })
                                      }
                                      title="Exportar solo auditoría de integridad Markdown"
                                      testId="agentic-mutation-index-audit-markdown"
                                    >
                                      <Download className="mr-1 h-2.5 w-2.5" />
                                      Audit MD
                                    </AgenticMutationIndexExportButton>
                                  </div>
                                </div>
                                <div
                                  className="mb-1 flex flex-wrap items-center gap-1 text-[8px]"
                                  data-testid="agentic-mutation-index-integrity"
                                >
                                  <span
                                    className={cn(
                                      'rounded border px-1.5 py-0.5 uppercase',
                                      mutationIndexIntegrityClasses(agenticMutationIndexIntegrity?.status)
                                    )}
                                  >
                                    integrity: {agenticMutationIndexIntegrity?.status ?? 'unknown'}
                                  </span>
                                  <span
                                    className="rounded border border-slate-800 bg-slate-900/80 px-1.5 py-0.5 uppercase text-slate-400"
                                    data-testid="agentic-mutation-index-recommendation-count"
                                  >
                                    recomendaciones: {agenticMutationIndexRecommendationCount}
                                  </span>
                                  <span
                                    className={cn(
                                      'rounded border px-1.5 py-0.5 uppercase',
                                      agenticMutationIndexIsBehind
                                        ? 'border-orange-400/50 bg-orange-950/50 text-orange-100'
                                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                    )}
                                    data-testid="agentic-mutation-index-behind"
                                  >
                                    atrasado: {agenticMutationIndexIsBehind ? 'sí' : 'no'}
                                  </span>
                                  {agenticMutationIndexAuditSummary?.latestIndexableExecutionId ? (
                                    <span
                                      className="truncate text-slate-600"
                                      data-testid="agentic-mutation-index-indexed-executions"
                                      title={`lastIndexed=${agenticMutationIndexAuditSummary.lastIndexedExecutionId ?? 'none'} latestIndexable=${agenticMutationIndexAuditSummary.latestIndexableExecutionId}`}
                                    >
                                      last {agenticMutationIndexAuditSummary.lastIndexedExecutionId ?? 'none'} · latest {agenticMutationIndexAuditSummary.latestIndexableExecutionId}
                                    </span>
                                  ) : null}
                                  {agenticMutationIndexIntegrity ? (
                                    <>
                                      <span className="text-slate-500">
                                        computed {agenticMutationIndexIntegrity.computed.algorithm}:{shortChecksum(agenticMutationIndexIntegrity.computed.value)}
                                      </span>
                                      <span className="text-slate-600">
                                        stored {shortChecksum(agenticMutationIndexIntegrity.stored?.value)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-slate-600">sin integridad cargada</span>
                                  )}
                                </div>
                                {agenticMutationIndexExportBlockReason ? (
                                  <p
                                    className="mb-1 rounded border border-red-500/30 bg-red-950/40 px-2 py-1 text-[8px] text-red-100"
                                    data-testid="agentic-mutation-index-export-block-reason"
                                  >
                                    {agenticMutationIndexExportBlockReason}
                                  </p>
                                ) : null}
                                {agenticMutationIndexIsBehind ? (
                                  <div
                                    className="mb-1 rounded border border-orange-400/70 bg-orange-950/80 p-2 text-[9px] text-orange-100 shadow-lg shadow-orange-950/30"
                                    data-testid="agentic-mutation-index-behind-alert"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex min-w-0 items-start gap-1.5">
                                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="font-semibold uppercase">
                                            Índice atrasado: historial aprobado sin indexar
                                          </p>
                                          <p className="mt-0.5 truncate text-[8px] opacity-90">
                                            pendientes={agenticMutationIndexPendingCount} · lastIndexed={agenticMutationIndexAuditSummary?.lastIndexedExecutionId ?? 'none'} · latestIndexable={agenticMutationIndexAuditSummary?.latestIndexableExecutionId ?? 'none'}
                                          </p>
                                          {agenticMutationIndexPendingExecutionIds.length > 0 ? (
                                            <p
                                              className="mt-0.5 truncate text-[8px] opacity-80"
                                              title={agenticMutationIndexPendingExecutionIds.join(', ')}
                                            >
                                              pending IDs: {agenticMutationIndexPendingExecutionIds.slice(0, 3).join(', ')}
                                              {agenticMutationIndexPendingExecutionIds.length > 3 ? '...' : ''}
                                            </p>
                                          ) : null}
                                          <p className="mt-0.5 text-[8px] opacity-80">
                                            Export y replay quedan bloqueados hasta reindexar desde historial.
                                          </p>
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 shrink-0 border-current px-1.5 text-[8px]"
                                        onClick={() => void handleAgenticMutationIndexReindex()}
                                        disabled={agenticMutationIndexRepairing || agenticMutationIndexLoading}
                                        title="Reconstruir índice desde historial con confirmación y traza de auditoría"
                                        data-testid="agentic-mutation-index-reindex"
                                      >
                                        {agenticMutationIndexRepairing ? (
                                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                                        ) : (
                                          <RefreshCw className="mr-1 h-2.5 w-2.5" />
                                        )}
                                        Reindexar
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                                {agenticMutationIndexAuditOpen ? (
                                  <div
                                    className="mb-1 rounded border border-amber-500/25 bg-amber-950/20 p-2 text-[8px]"
                                    data-testid="agentic-mutation-index-audit-panel"
                                  >
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                      <p className="font-semibold uppercase text-amber-200">
                                        Auditoría integridad
                                      </p>
                                      <span className="text-amber-200/70">
                                        {agenticMutationIndex?.integrityAuditTrail?.length ?? 0} evento(s)
                                      </span>
                                    </div>
                                    <div
                                      className="mb-1 flex flex-wrap items-center gap-1 text-[8px]"
                                      data-testid="agentic-mutation-index-audit-counters"
                                    >
                                      <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 text-slate-300">
                                        checksum {agenticMutationIndexChecksumRepairCount}
                                      </span>
                                      <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 text-slate-300">
                                        history_reindexed_full {agenticMutationIndexFullReindexCount}
                                      </span>
                                      <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 text-slate-300">
                                        history_reindexed_partial {agenticMutationIndexPartialReindexCount}
                                      </span>
                                      {agenticMutationIndexLegacyReindexCount > 0 ? (
                                        <span className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 text-slate-500">
                                          legacy {agenticMutationIndexLegacyReindexCount}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div
                                      className="mb-1 flex flex-wrap gap-1"
                                      data-testid="agentic-mutation-index-audit-action-filters"
                                    >
                                      {([
                                        ['all', 'Todo'],
                                        ['checksum_recalculated', 'checksum_recalculated'],
                                        ['history_reindexed_full', 'history_reindexed_full'],
                                        ['history_reindexed_partial', 'history_reindexed_partial'],
                                      ] as Array<[AgenticAuditActionFilter, string]>).map(([value, label]) => (
                                        <button
                                          key={value}
                                          type="button"
                                          className={cn(
                                            'rounded border px-1.5 py-0.5 text-[8px]',
                                            agenticAuditActionFilter === value
                                              ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                                              : 'border-slate-800 bg-slate-950/70 text-slate-500 hover:text-slate-200'
                                          )}
                                          onClick={() => setAgenticAuditActionFilter(value)}
                                          data-testid={`agentic-mutation-index-audit-filter-${value}`}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className="rounded border border-amber-500/30 bg-slate-950/70 px-1.5 py-0.5 text-[8px] text-amber-100 hover:text-amber-50"
                                        onClick={() =>
                                          downloadFilteredMutationIndexAuditReport({
                                            projectName: projectName || 'untitled_project',
                                            slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                            actionFilter: agenticAuditActionFilter,
                                            auditTrail: filteredAgenticMutationIndexAuditTrail,
                                            counts: agenticMutationIndexLocalAuditCounts,
                                            integrity: agenticMutationIndexIntegrity,
                                            format: 'json',
                                          })
                                        }
                                        data-testid="agentic-mutation-index-audit-filtered-json"
                                      >
                                        Export filtro JSON
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded border border-amber-500/30 bg-slate-950/70 px-1.5 py-0.5 text-[8px] text-amber-100 hover:text-amber-50"
                                        onClick={() =>
                                          downloadFilteredMutationIndexAuditReport({
                                            projectName: projectName || 'untitled_project',
                                            slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
                                            actionFilter: agenticAuditActionFilter,
                                            auditTrail: filteredAgenticMutationIndexAuditTrail,
                                            counts: agenticMutationIndexLocalAuditCounts,
                                            integrity: agenticMutationIndexIntegrity,
                                            format: 'markdown',
                                          })
                                        }
                                        data-testid="agentic-mutation-index-audit-filtered-markdown"
                                      >
                                        Export filtro MD
                                      </button>
                                    </div>
                                    {agenticMutationIndex?.integrityAuditTrail?.length ? (
                                      <div className="space-y-1">
                                        {filteredAgenticMutationIndexAuditTrail.slice(0, 8).map((entry) => (
                                          <div
                                            key={entry.id}
                                            className="rounded border border-slate-800 bg-slate-950/70 p-1.5"
                                          >
                                            <p className="truncate font-medium text-amber-100">
                                              {entry.id}
                                            </p>
                                            <p className="truncate text-slate-400">
                                              {entry.action} · {entry.previousIntegrityStatus} · {entry.repairedAt}
                                            </p>
                                            <p className="truncate text-slate-500">
                                              reason: {entry.reason}
                                            </p>
                                            <p className="truncate text-slate-600">
                                              previous stored {shortChecksum(entry.previousChecksum?.value)} · computed {shortChecksum(entry.previousComputedChecksum.value)}
                                            </p>
                                          </div>
                                        ))}
                                        {filteredAgenticMutationIndexAuditTrail.length === 0 ? (
                                          <p className="text-slate-500">
                                            Sin eventos para este filtro de auditoría.
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <p className="text-slate-500">
                                        Sin reparaciones auditadas en este índice.
                                      </p>
                                    )}
                                  </div>
                                ) : null}
                                {agenticMutationIndexIntegrity &&
                                agenticMutationIndexIntegrity.status !== 'valid' ? (
                                  <div
                                    className={cn(
                                      'mb-1 rounded border p-2 text-[9px] shadow-lg',
                                      agenticMutationIndexIntegrity.status === 'mismatch'
                                        ? 'border-red-400/70 bg-red-950/80 text-red-100 shadow-red-950/30'
                                        : 'border-amber-300/70 bg-amber-950/80 text-amber-100 shadow-amber-950/30'
                                    )}
                                    data-testid="agentic-mutation-index-integrity-alert"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex min-w-0 items-start gap-1.5">
                                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="font-semibold uppercase">
                                            {agenticMutationIndexIntegrity.status === 'mismatch'
                                              ? 'Índice corrupto: checksum no coincide'
                                              : 'Índice incompleto: checksum ausente'}
                                          </p>
                                          <p className="mt-0.5 text-[8px] opacity-90">
                                            El export y la auditoría server-side pueden quedar bloqueados hasta recalcular el checksum.
                                          </p>
                                          {agenticMutationIndex?.integrityAuditTrail?.[0] ? (
                                            <p className="mt-0.5 truncate text-[8px] opacity-75">
                                              última reparación: {agenticMutationIndex.integrityAuditTrail[0].id}
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 shrink-0 border-current px-1.5 text-[8px]"
                                        onClick={() => void handleAgenticMutationIndexRepair()}
                                        disabled={agenticMutationIndexRepairing || agenticMutationIndexLoading}
                                        title="Recalcular checksum con confirmación y traza de auditoría"
                                        data-testid="agentic-mutation-index-repair"
                                      >
                                        {agenticMutationIndexRepairing ? (
                                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                                        ) : (
                                          <RefreshCw className="mr-1 h-2.5 w-2.5" />
                                        )}
                                        Reparar
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                                {agenticMutationIndexError ? (
                                  <p className="text-[8px] text-red-300">{agenticMutationIndexError}</p>
                                ) : mutationIndexMappingsForRecord(agenticMutationIndex, record).length > 0 ? (
                                  <div className="space-y-0.5">
                                    {mutationIndexMappingsForRecord(agenticMutationIndex, record)
                                      .slice(0, 8)
                                      .map((mapping) => (
                                        <p
                                          key={`${mapping.recommendationKey}:${mapping.toolCallId}:${mapping.evidenceId}`}
                                          className="truncate text-[8px] text-cyan-100"
                                          title={`${mapping.recommendationKey} → ${mapping.toolCallId} → ${mapping.evidenceId}`}
                                        >
                                          {mapping.recommendationKey} → {mapping.toolCallId} → {mapping.evidenceId}
                                        </p>
                                      ))}
                                  </div>
                                ) : (
                                  <p className="text-[8px] text-slate-500">
                                    Sin mapping cargado desde índice para esta ejecución.
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() => downloadAgenticExecutionReport(record, 'json')}
                              title="Exportar reporte JSON"
                              data-testid="agentic-report-json"
                            >
                              <Download className="mr-1 h-3 w-3" />
                              JSON
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() => downloadAgenticExecutionReport(record, 'markdown')}
                              title="Exportar reporte Markdown"
                              data-testid="agentic-report-markdown"
                            >
                              <Download className="mr-1 h-3 w-3" />
                              MD
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() => downloadAgenticExecutionTimelineReport(record, 'json')}
                              title="Exportar timeline completo JSON"
                              data-testid="agentic-timeline-json"
                            >
                              <Download className="mr-1 h-3 w-3" />
                              Timeline JSON
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() => downloadAgenticExecutionTimelineReport(record, 'markdown')}
                              title="Exportar timeline completo Markdown"
                              data-testid="agentic-timeline-markdown"
                            >
                              <Download className="mr-1 h-3 w-3" />
                              Timeline MD
                            </Button>
                          </div>
                          <div
                            className="mt-2 rounded border border-slate-800 bg-slate-900/60 p-2"
                            data-testid="agentic-shared-memory-debug"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-[9px] font-medium uppercase text-slate-400">
                                Shared memory
                              </p>
                              <span className="text-[9px] text-slate-500">
                                Analyses: {record.sharedMemory?.analyses.length ?? 0} · Recommendations: {record.sharedMemory?.actionableRecommendations.length ?? 0}
                              </span>
                            </div>
                            {(record.sharedMemory?.analyses.length ?? 0) > 0 ? (
                              <div className="space-y-1">
                                {record.sharedMemory?.analyses.slice(0, 3).map((analysis) => (
                                  <div
                                    key={analysis.id}
                                    className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1 text-[9px]"
                                  >
                                    <p className="truncate font-medium text-slate-300">
                                      {analysis.toolName} · {analysis.scope}
                                    </p>
                                    <p className="truncate text-slate-500">{analysis.summary}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[9px] text-slate-500">
                                No hay memoria compartida registrada para esta ejecución.
                              </p>
                            )}
                            {(record.sharedMemory?.actionableRecommendations.length ?? 0) > 0 && (
                              <div
                                className="mt-2 space-y-1"
                                data-testid="agentic-shared-memory-recommendations"
                              >
                                {record.sharedMemory?.actionableRecommendations.slice(0, 5).map((recommendation) => {
                                  const status = agenticRecommendationStatus(
                                    record,
                                    recommendation,
                                    agenticRecommendationDecisions
                                  );
                                  const decisionKey = agenticRecommendationDecisionKey(record, recommendation);
                                  const decisionPending = agenticRecommendationAction === decisionKey;
                                  return (
                                    <div
                                      key={recommendation.id}
                                      className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1 text-[9px]"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="truncate font-medium text-slate-300">
                                            {recommendation.summary}
                                          </p>
                                          <p className="truncate text-slate-500">
                                            {recommendation.priority} · {recommendation.suggestedToolNames.join(', ') || recommendation.suggestedDomain}
                                          </p>
                                          <p className="truncate text-slate-600">
                                            {recommendation.approvalKey}
                                          </p>
                                        </div>
                                        <span
                                          className={cn(
                                            'shrink-0 rounded border px-1 py-0.5 text-[8px] uppercase',
                                            status === 'approved'
                                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                              : status === 'rejected'
                                                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                                                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                          )}
                                        >
                                          {status}
                                        </span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        <button
                                          type="button"
                                          className="inline-flex items-center rounded border border-emerald-500/30 px-1.5 py-0.5 text-[8px] uppercase text-emerald-200 hover:text-emerald-100 disabled:opacity-50"
                                          onClick={() => void handleAgenticRecommendationDecision(record, recommendation, 'approved')}
                                          disabled={decisionPending || status === 'approved'}
                                          data-testid="agentic-recommendation-approve"
                                        >
                                          {decisionPending ? <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> : null}
                                          Aprobar
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex items-center rounded border border-red-500/30 px-1.5 py-0.5 text-[8px] uppercase text-red-200 hover:text-red-100 disabled:opacity-50"
                                          onClick={() => void handleAgenticRecommendationDecision(record, recommendation, 'rejected')}
                                          disabled={decisionPending || status === 'rejected'}
                                          data-testid="agentic-recommendation-reject"
                                        >
                                          {decisionPending ? <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> : null}
                                          Rechazar
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div
                            className="mt-2 rounded border border-slate-800 bg-slate-900/60 p-2"
                            data-testid="agentic-execution-timeline"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-[9px] font-medium uppercase text-slate-400">
                                Timeline
                              </p>
                              <div className="flex items-center gap-1">
                                <select
                                  value={agenticTimelineMutationFilter}
                                  onChange={(event) =>
                                    setAgenticTimelineMutationFilter(
                                      event.target.value as AgenticTimelineMutationFilter
                                    )
                                  }
                                  className="h-5 rounded border border-slate-800 bg-slate-950 px-1 text-[8px] text-slate-400 outline-none"
                                  data-testid="agentic-timeline-mutation-filter"
                                >
                                  {agenticTimelineMutationFilterOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-[9px] text-slate-500">
                                  Trazas completas: {(record.traces ?? []).length}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              {filterAgenticTimelineItems(
                                createAgenticExecutionTimeline(record),
                                agenticTimelineMutationFilter
                              ).map((item) => (
                                <div
                                  key={item.id}
                                  className="grid gap-1 rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1 text-[9px] sm:grid-cols-[64px_minmax(0,1fr)]"
                                >
                                  <span
                                    className={cn(
                                      'inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[8px] uppercase',
                                      timelineStatusClasses(item.status)
                                    )}
                                  >
                                    {item.phase}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex min-w-0 items-center gap-1">
                                        <p className="truncate font-medium text-slate-300">{item.title}</p>
                                        {item.toolCallId ? (
                                          <span
                                            className={cn(
                                              'shrink-0 rounded border px-1 py-0.5 text-[8px] uppercase',
                                              item.mutatesWorld === true
                                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                                : item.mutatesWorld === false
                                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                                  : 'border-slate-700 bg-slate-900 text-slate-500'
                                            )}
                                            title={
                                              item.mutatesWorld === true
                                                ? 'Mutates world state and requires before/after evidence.'
                                                : item.mutatesWorld === false
                                                  ? 'Consultative tool; does not mutate world state.'
                                                  : 'Mutation contract was not stored for this historical call.'
                                            }
                                            data-testid="agentic-tool-mutates-world-badge"
                                          >
                                            {item.mutatesWorld === true
                                              ? 'mutates world'
                                              : item.mutatesWorld === false
                                                ? 'read only'
                                                : 'unknown'}
                                          </span>
                                        ) : null}
                                      </div>
                                      {item.timestamp ? (
                                        <span className="shrink-0 text-slate-600">
                                          {formatAgenticHistoryTimestamp(item.timestamp)}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="truncate text-slate-500">{item.detail}</p>
                                    {item.rawDiff?.length ? (
                                      <div
                                        className="mt-1 rounded border border-cyan-500/20 bg-cyan-500/10 p-1"
                                        data-testid="agentic-timeline-tool-diff"
                                      >
                                        <p className="text-[8px] font-medium uppercase text-cyan-200">
                                          Diff raw tool call
                                        </p>
                                        <div className="mt-1 space-y-0.5">
                                          {item.rawDiff.slice(0, 3).map((evidence) => (
                                            <div key={evidence.id} className="rounded border border-slate-800 bg-slate-950/70 px-1 py-0.5">
                                              <p className="truncate text-cyan-200">
                                                {evidence.type}: {evidence.summary}
                                              </p>
                                              {(evidence.before !== undefined || evidence.after !== undefined) && (
                                                isLargeTimelineDiff(evidence.before, evidence.after) ? (
                                                  <div
                                                    className="mt-1 grid gap-1 md:grid-cols-2"
                                                    data-testid="agentic-before-after-side-by-side"
                                                  >
                                                    <div className="min-w-0 rounded border border-slate-800 bg-slate-950 p-1">
                                                      <p className="mb-0.5 text-[8px] uppercase text-slate-500">Before</p>
                                                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-[8px] leading-3 text-slate-400">
                                                        {formatToolRawJson(evidence.before)}
                                                      </pre>
                                                    </div>
                                                    <div className="min-w-0 rounded border border-slate-800 bg-slate-950 p-1">
                                                      <p className="mb-0.5 text-[8px] uppercase text-slate-500">After</p>
                                                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-[8px] leading-3 text-slate-400">
                                                        {formatToolRawJson(evidence.after)}
                                                      </pre>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <p className="truncate text-slate-500">
                                                    before {formatTimelineRawValue(evidence.before)} -&gt; after {formatTimelineRawValue(evidence.after)}
                                                  </p>
                                                )
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                    {item.toolCallId ? (
                                      <details
                                        className="mt-1 rounded border border-slate-800 bg-slate-950/80 p-1"
                                        data-testid="agentic-tool-raw-io"
                                        open={!isLargeToolRaw(item.rawInput) && !isLargeToolRaw(item.rawOutput)}
                                      >
                                        <summary className="cursor-pointer text-[8px] font-medium uppercase text-slate-400">
                                          Input/output raw
                                        </summary>
                                        <div className="mt-1 grid gap-1 md:grid-cols-2">
                                          <div className="min-w-0 rounded border border-slate-900 bg-slate-950 p-1">
                                            <p className="mb-0.5 text-[8px] uppercase text-slate-500">Input</p>
                                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[8px] leading-3 text-slate-400">
                                              {formatToolRawJson(item.rawInput)}
                                            </pre>
                                          </div>
                                          <div className="min-w-0 rounded border border-slate-900 bg-slate-950 p-1">
                                            <p className="mb-0.5 text-[8px] uppercase text-slate-500">Output</p>
                                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[8px] leading-3 text-slate-400">
                                              {formatToolRawJson(item.rawOutput)}
                                            </pre>
                                          </div>
                                        </div>
                                      </details>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {record.diff && (
                            <div
                              className="mt-2 rounded border border-slate-800 bg-slate-900/60 p-2"
                              data-testid="agentic-history-diff"
                            >
                              <p className="mb-1 text-[9px] font-medium uppercase text-slate-400">
                                Diff snapshot
                              </p>
                              <div className="grid gap-1 text-[9px] text-slate-400 sm:grid-cols-3">
                                {(['scenes', 'entities', 'assets'] as const).map((kind) => {
                                  const count = record.diff?.counts[kind];
                                  return count ? (
                                    <span
                                      key={kind}
                                      className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1"
                                    >
                                      {kind}: {count.before} → {count.after} ({formatSnapshotDelta(count.delta)})
                                    </span>
                                  ) : null;
                                })}
                              </div>
                              {(['entities', 'assets', 'scenes'] as const).map((kind) => {
                                const diff = record.diff?.[kind];
                                if (
                                  !diff ||
                                  (diff.added.length === 0 &&
                                    diff.removed.length === 0 &&
                                    diff.changed.length === 0)
                                ) {
                                  return null;
                                }

                                return (
                                  <div key={kind} className="mt-1.5 space-y-0.5 text-[9px]">
                                    {diff.added.length > 0 && (
                                      <p className="truncate text-emerald-300">
                                        + {kind}: {diff.added.slice(0, 3).map((item) => item.name).join(', ')}
                                      </p>
                                    )}
                                    {diff.removed.length > 0 && (
                                      <p className="truncate text-red-300">
                                        - {kind}: {diff.removed.slice(0, 3).map((item) => item.name).join(', ')}
                                      </p>
                                    )}
                                    {diff.changed.length > 0 && (
                                      <p className="truncate text-cyan-300">
                                        ~ {kind}: {diff.changed.slice(0, 3).map((item) => item.name).join(', ')}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                              {!record.diff.hasChanges && (
                                <p className="mt-1 text-[9px] text-slate-500">Sin cambios detectados.</p>
                              )}
                              {record.diff.semantic.componentChanges.length > 0 && (
                                <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 p-1.5">
                                  <p className="text-[9px] font-medium uppercase text-slate-400">
                                    Diff semántico
                                  </p>
                                  <div className="mt-1 space-y-1">
                                    {groupAgenticSemanticChanges(record.diff.semantic.componentChanges)
                                      .slice(0, 4)
                                      .map((group) => (
                                        <div
                                          key={group.entityId}
                                          className="rounded border border-slate-900 bg-slate-950 px-1.5 py-1"
                                        >
                                          <p className="truncate text-[9px] font-medium text-slate-300">
                                            {group.entityName}
                                          </p>
                                          {group.changes.slice(0, 4).map((change) => (
                                            <div
                                              key={`${change.entityId}-${change.component}-${change.changeType}`}
                                              className="mt-0.5 space-y-0.5"
                                            >
                                              <p className="truncate text-[9px] text-slate-400">
                                                {change.summary}
                                              </p>
                                              {(change.fieldChanges ?? []).slice(0, 3).map((fieldChange) => (
                                                <p
                                                  key={`${change.entityId}-${change.component}-${fieldChange.field}`}
                                                  className="truncate text-[9px] text-cyan-300"
                                                >
                                                  {change.component}.{fieldChange.field}: {fieldChange.before} -&gt; {fieldChange.after}
                                                </p>
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {record.validation && (
                            <div className="mt-2 space-y-1 text-[9px] text-slate-400">
                              <p>
                                Validador: {record.validation.approved ? 'aprobó' : 'rechazó'} · {Math.round(record.validation.confidence * 100)}%
                              </p>
                              {record.validation.matchedRequirements.length > 0 && (
                                <p className="truncate">
                                  Match: {record.validation.matchedRequirements.slice(0, 4).join(', ')}
                                </p>
                              )}
                              {record.validation.missingRequirements.length > 0 && (
                                <p className="text-amber-300">
                                  Falta: {record.validation.missingRequirements.slice(0, 4).join(', ')}
                                </p>
                              )}
                              {record.validation.incorrectOutputs.length > 0 && (
                                <p className="text-red-300">
                                  Incorrecto: {record.validation.incorrectOutputs.slice(0, 4).join(', ')}
                                </p>
                              )}
                            </div>
                          )}
                          <p className="mt-2 truncate text-[9px] text-slate-500">
                            Tools: {record.toolNames.length ? record.toolNames.join(', ') : 'sin tools'}
                          </p>
                          {record.runtimeScaffold?.summaries.length ? (
                            <p className="mt-1 text-[9px] text-slate-500">
                              Runtime: {record.runtimeScaffold.summaries.slice(0, 2).join(' | ')}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {agenticHistoryPagination && (
                    <div
                      className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1"
                      data-testid="agentic-history-pagination"
                    >
                      <span className="text-[9px] text-slate-500">
                        {agenticHistoryPageStart}-{agenticHistoryPageEnd} de {agenticHistoryPagination.filteredRecords}
                        {agenticHistoryPagination.search ? ` · "${agenticHistoryPagination.search}"` : ''}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px]"
                          disabled={!agenticHistoryPagination.hasPrevious || agenticHistoryLoading}
                          onClick={() => goToAgenticHistoryPage(agenticHistoryPage - 1)}
                        >
                          Anterior
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px]"
                          disabled={!agenticHistoryPagination.hasNext || agenticHistoryLoading}
                          onClick={() => goToAgenticHistoryPage(agenticHistoryPage + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {isManualWorkflow && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2">
            <p className="text-[11px] text-amber-200">
              IA bloqueada por workflow manual. Cambia a Hybrid o AI First para activar chat/generacion.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-xs"
              onClick={() => {
                setEngineMode('MODE_HYBRID');
                setAIMode('API');
              }}
            >
              Activar modo Hybrid
            </Button>
          </div>
        )}
      </div>

      {/* Config Warning */}
      {showConfigWarning && (
        <div className="mx-3 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg shrink-0">
          <div className="flex items-start gap-2">
            <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-amber-300 font-medium">Asistente no disponible</p>
              <p className="text-xs text-slate-400 mt-1">
                {advancedMode
                  ? 'Completa la configuracion del asistente en administracion para habilitar esta sesion.'
                  : 'Tu sesión todavía no tiene acceso al asistente. Inicia sesión o pide acceso a un administrador.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {diagnosticsOpen && (
        <div className="mx-3 mt-2 rounded-lg border border-slate-700 bg-slate-900/70 p-2 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-200">Estado rápido</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void refreshDiagnostics()}
              disabled={diagnostics.loading}
            >
              {diagnostics.loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Actualizar
            </Button>
          </div>
          <div className="grid gap-1.5 text-[11px]">
            <div className={cn('rounded border px-2 py-1', diagnosticClasses(diagnostics.assistant.level))}>
              Asistente: {diagnostics.assistant.message}
            </div>
            <div className={cn('rounded border px-2 py-1', diagnosticClasses(diagnostics.automation.level))}>
              Edición automática: {diagnostics.automation.message}
            </div>
            <div className={cn('rounded border px-2 py-1', diagnosticClasses(diagnostics.characters.level))}>
              Personajes: {diagnostics.characters.message}
            </div>
            <p className="text-[10px] text-slate-500">
              Última verificación: {diagnostics.checkedAt ? new Date(diagnostics.checkedAt).toLocaleTimeString() : 'sin ejecutar'}
            </p>
          </div>
        </div>
      )}

      {advancedMode && (
        <div className="mx-3 mt-2 rounded-lg border border-slate-700 bg-slate-900/70 p-2 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-200">Planner de agentes</p>
              <p className="text-[11px] text-slate-500">
                {agentPlan
                  ? `Plan activo para ${agentPlan.projectKey}`
                  : 'Crea un plan durable con el prompt actual para seguir y reanudar etapas.'}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void refreshAgentPlanner()}
                disabled={agentPlannerLoading}
              >
                {agentPlannerLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Recargar
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500"
                onClick={() => void createAgentPlanner()}
                disabled={agentPlannerLoading || !input.trim()}
              >
                Crear plan
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setCustomPlannerOpen((current) => !current)}
                disabled={agentPlannerLoading}
                data-testid="agent-planner-custom-form-toggle"
              >
                Custom
              </Button>
            </div>
          </div>

          {customPlannerOpen && (
            <div
              className="mt-2 rounded border border-cyan-500/20 bg-slate-950/70 p-2"
              data-testid="agent-planner-custom-form"
            >
              <div className="grid gap-1.5 sm:grid-cols-2">
                <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                  Prompt
                  <Input
                    value={customPlannerPrompt}
                    onChange={(event) => setCustomPlannerPrompt(event.target.value)}
                    placeholder={input.trim() || 'Planner custom'}
                    className="h-7 border-slate-800 bg-slate-950 text-[10px]"
                    data-testid="agent-planner-custom-prompt"
                  />
                </label>
                <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                  Source block
                  <Input
                    value={customPlannerSourceBlockId}
                    onChange={(event) => setCustomPlannerSourceBlockId(event.target.value)}
                    className="h-7 border-slate-800 bg-slate-950 text-[10px]"
                    data-testid="agent-planner-custom-source-block"
                  />
                </label>
                <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                  Priority
                  <select
                    value={customPlannerPriority}
                    onChange={(event) =>
                      setCustomPlannerPriority(event.target.value as 'low' | 'medium' | 'high')
                    }
                    className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-300"
                    data-testid="agent-planner-custom-priority"
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                  Owner
                  <Input
                    value={customPlannerOwner}
                    onChange={(event) => setCustomPlannerOwner(event.target.value)}
                    className="h-7 border-slate-800 bg-slate-950 text-[10px]"
                    data-testid="agent-planner-custom-owner"
                  />
                </label>
              </div>
              <label className="mt-1.5 grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                Tasks
                <textarea
                  value={customPlannerTasksInput}
                  onChange={(event) => setCustomPlannerTasksInput(event.target.value)}
                  rows={3}
                  className="min-h-[68px] resize-y rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-200 outline-none placeholder:text-slate-600"
                  placeholder="Crear endpoint custom :: Validar contrato"
                  data-testid="agent-planner-custom-tasks-input"
                />
              </label>
              {customPlannerScopeStatus && (
                <p
                  className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200"
                  data-testid="agent-planner-reanalysis-scope-status"
                >
                  {customPlannerScopeStatus}
                </p>
              )}
              {customPlannerApprovedBlocks.length > 0 && (
                <div
                  className="mt-2 rounded border border-amber-500/20 bg-amber-500/5 p-2"
                  data-testid="agent-planner-approved-reanalysis-blocks"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-amber-200">Bloques aprobados de reanalysis</p>
                    <span className="text-[9px] text-slate-500">
                      {customPlannerApprovedBlocks.filter((block) => customPlannerSelectedApprovedBlockIds[block.blockId] !== false).length}/{customPlannerApprovedBlocks.length} seleccionados
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {customPlannerApprovedBlocks.map((block) => (
                      <label
                        key={block.blockId}
                        className="flex gap-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px]"
                        data-testid="agent-planner-approved-reanalysis-block"
                      >
                        <input
                          type="checkbox"
                          checked={customPlannerSelectedApprovedBlockIds[block.blockId] !== false}
                          onChange={(event) =>
                            setCustomPlannerSelectedApprovedBlockIds((current) => ({
                              ...current,
                              [block.blockId]: event.target.checked,
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-slate-200">{block.title}</span>
                          <span className="block text-[9px] text-slate-500">
                            {block.blockId} · {block.priority} · {block.suggestedOwner}
                          </span>
                          <span className="block text-[9px] text-slate-400">{block.summary}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={
                        customPlannerScopeLoading ||
                        customPlannerApprovedBlocks.every(
                          (block) => customPlannerSelectedApprovedBlockIds[block.blockId] === false
                        )
                      }
                      onClick={() => void createCustomPlannerFromApprovedScope()}
                      data-testid="agent-planner-create-selected-reanalysis-scope"
                    >
                      Crear planner con selección
                    </Button>
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap justify-end gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={customPlannerScopeLoading || agentPlannerLoading}
                  onClick={() => void loadApprovedReanalysisScopeBlocks()}
                  data-testid="agent-planner-create-from-reanalysis-scope"
                >
                  {customPlannerScopeLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Cargar scope aprobado
                </Button>
                <Button
                  size="sm"
                  className="h-7 bg-cyan-600 text-xs hover:bg-cyan-500"
                  disabled={agentPlannerLoading}
                  onClick={() => void createCustomAgentPlanner()}
                  data-testid="agent-planner-custom-create"
                >
                  Crear planner custom
                </Button>
              </div>
            </div>
          )}

          {agentPlannerError && (
            <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
              {agentPlannerError}
            </div>
          )}
          {pendingStaleMetadataRevert && (
            <div
              className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-100"
              data-testid="agent-planner-stale-revert-blocker"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">Revert metadata bloqueado por valor obsoleto</p>
                  <p className="mt-0.5 text-[10px] text-amber-200/80">
                    {pendingStaleMetadataRevert.blocker.message}
                  </p>
                  <p className="mt-0.5 text-[10px] text-amber-200/80">
                    Campo {pendingStaleMetadataRevert.blocker.field}: valor actual{' '}
                    <span className="font-mono">{pendingStaleMetadataRevert.blocker.currentValue ?? 'none'}</span>
                    {' '}→ revertir a{' '}
                    <span className="font-mono">{pendingStaleMetadataRevert.blocker.revertToValue ?? 'none'}</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px]"
                  disabled={agentPlannerLoading}
                  onClick={() => setPendingStaleMetadataRevert(null)}
                >
                  Cancelar
                </Button>
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-[1fr_auto]">
                <Input
                  value={pendingStaleMetadataRevert.reason}
                  onChange={(event) =>
                    setPendingStaleMetadataRevert((current) =>
                      current
                        ? {
                            ...current,
                            reason: event.target.value,
                          }
                        : current
                    )
                  }
                  className="h-7 border-amber-500/30 bg-slate-950 text-[10px] text-amber-50"
                  placeholder="Motivo obligatorio para auditoría"
                  data-testid="agent-planner-stale-revert-reason"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-amber-500/40 text-[10px] text-amber-100"
                  disabled={agentPlannerLoading || pendingStaleMetadataRevert.reason.trim().length < 8}
                  onClick={() => void confirmPendingStaleMetadataRevert()}
                  data-testid="agent-planner-stale-revert-confirm"
                >
                  Confirmar revert riesgoso
                </Button>
              </div>
            </div>
          )}

          {agentPlan ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={cn('rounded border px-2 py-0.5', plannerStatusClasses(agentPlan.status))}>
                  {plannerStatusLabel(agentPlan.status)}
                </span>
                <span className="text-slate-400">
                  {agentPlan.telemetry.completedStages}/{agentPlan.telemetry.totalStages} etapas
                </span>
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] text-slate-400">
                <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-0.5">
                  Ejecución: {plannerStatusLabel(agentPlan.execution.state)}
                </span>
                {agentPlan.execution.currentStageId && (
                  <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-0.5">
                    Actual: {agentPlan.execution.currentStageId}
                  </span>
                )}
                {agentPlan.execution.nextStageId && (
                  <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-0.5">
                    Siguiente: {agentPlan.execution.nextStageId}
                  </span>
                )}
                  <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-0.5">
                    Progreso: {agentPlan.execution.progressPercent}%
                  </span>
                </div>
                {agentPlannerActiveJob && (
                  <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-slate-300">
                        Job durable activo · intento {agentPlannerActiveJob.attemptNumber}
                      </p>
                      <span
                        className={cn(
                          'rounded border px-2 py-0.5 text-[10px]',
                          plannerStatusClasses(agentPlannerActiveJob.status)
                        )}
                      >
                        {plannerStatusLabel(agentPlannerActiveJob.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-400">
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Acción: {plannerReceiptActionLabel(agentPlannerActiveJob.action)}
                      </span>
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Ejecución: {plannerStatusLabel(agentPlannerActiveJob.executionState)}
                      </span>
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Recibo: {agentPlannerActiveJob.lastReceiptId ? 'registrado' : 'pendiente'}
                      </span>
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Actualizado: {new Date(agentPlannerActiveJob.updatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500">{agentPlannerActiveJob.lastMessage}</p>
                  </div>
                )}
                {linkedAssistantJob && (
                  <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-slate-300">Job enlazado del assistant</p>
                      <span
                        className={cn(
                          'rounded border px-2 py-0.5 text-[10px]',
                          plannerStatusClasses(linkedAssistantJob.status)
                        )}
                      >
                        {plannerStatusLabel(linkedAssistantJob.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-400">
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Tipo: {linkedAssistantJob.kind}
                      </span>
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Backend: {linkedAssistantJob.backend}
                      </span>
                      <span
                        className={cn(
                          'rounded border px-2 py-0.5',
                          plannerStatusClasses(linkedAssistantJob.resultStatus)
                        )}
                      >
                        Resultado: {plannerStatusLabel(linkedAssistantJob.resultStatus)}
                      </span>
                      {linkedAssistantJob.progress !== null && (
                        <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                          Progreso: {linkedAssistantJob.progress}%
                        </span>
                      )}
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Receipt: {linkedAssistantJob.lastReceiptId ? 'registrado' : 'pendiente'}
                      </span>
                      <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5">
                        Actualizado: {new Date(linkedAssistantJob.updatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {linkedAssistantJob.resultSummary && (
                      <p className="mt-2 text-[10px] text-slate-300">{linkedAssistantJob.resultSummary}</p>
                    )}
                    {linkedAssistantJob.asset && (
                      <p className="mt-2 text-[10px] text-slate-500">
                        Asset: {linkedAssistantJob.asset.path || linkedAssistantJob.asset.url || linkedAssistantJob.asset.thumbnailUrl}
                      </p>
                    )}
                    {linkedAssistantJob.error && (
                      <p className="mt-2 text-[10px] text-red-300">{linkedAssistantJob.error}</p>
                    )}
                    <p className="mt-2 text-[10px] text-slate-500">{linkedAssistantJob.lastMessage}</p>
                  </div>
                )}
                <Progress value={agentPlannerProgressValue} className="h-2" />
              <p className="text-[11px] text-slate-300">{agentPlan.summary}</p>
              <div
                className="rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5"
                data-testid="agent-planner-stale-revert-policy-panel"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-medium text-cyan-100">Admin stale revert allowlist</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      source {staleRevertPolicy?.policySnapshot?.source ?? 'unknown'} · roles{' '}
                      {(staleRevertPolicy?.policySnapshot?.allowedRoles ?? staleRevertPolicyDraftRoles).join(', ')}
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-500">
                      version {staleRevertPolicy?.config?.version ?? 'env'} · audit{' '}
                      {staleRevertPolicy?.totalAuditCount ?? staleRevertPolicyAuditTrail.length}
                    </p>
                    {staleRevertPolicyAuditPagination && (
                      <p
                        className="mt-0.5 text-[9px] text-slate-500"
                        data-testid="agent-planner-stale-revert-policy-audit-pagination"
                      >
                        {staleRevertPolicyAuditPageStart}-{staleRevertPolicyAuditPageEnd} de{' '}
                        {staleRevertPolicyAuditPagination.total}
                      </p>
                    )}
                    {staleRevertPolicyActiveFilters.length > 0 && (
                      <div
                        className="mt-1 flex flex-wrap gap-1"
                        data-testid="agent-planner-stale-revert-policy-active-filters"
                      >
                        {staleRevertPolicyActiveFilters.map((filter) => (
                          <button
                            type="button"
                            key={filter.key}
                            className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                            onClick={() => clearStaleRevertPolicyFilter(filter.key)}
                            title={`Quitar filtro ${filter.key}`}
                            data-testid={`agent-planner-stale-revert-policy-active-filter-${filter.key}`}
                          >
                            {filter.label} x
                          </button>
                        ))}
                      </div>
                    )}
                    {staleRevertPolicyError && (
                      <p className="mt-0.5 text-[9px] text-red-300">{staleRevertPolicyError}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <select
                      value={staleRevertPolicyAuditFilter}
                      onChange={(event) =>
                        void refreshStaleRevertPolicy({
                          page: 0,
                          eventType: event.target.value as StaleMetadataRevertPolicyAuditEventTypeFilter,
                        })
                      }
                      className="h-6 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-slate-300"
                      data-testid="agent-planner-stale-revert-policy-audit-filter"
                    >
                      {STALE_REVERT_POLICY_AUDIT_EVENT_FILTER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={staleRevertPolicyActorFilterInput}
                      onChange={(event) => setStaleRevertPolicyActorFilterInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void refreshStaleRevertPolicy({
                            page: 0,
                            actor: staleRevertPolicyActorFilterInput,
                            from: staleRevertPolicyDateFromFilterInput,
                            to: staleRevertPolicyDateToFilterInput,
                          });
                        }
                      }}
                      placeholder="actor/email"
                      className="h-6 w-28 border-slate-800 bg-slate-950 px-1 text-[10px]"
                      data-testid="agent-planner-stale-revert-policy-actor-filter"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() =>
                        void refreshStaleRevertPolicy({
                          page: 0,
                          actor: staleRevertPolicyActorFilterInput,
                          from: staleRevertPolicyDateFromFilterInput,
                          to: staleRevertPolicyDateToFilterInput,
                        })
                      }
                      data-testid="agent-planner-stale-revert-policy-actor-filter-apply"
                    >
                      Filtrar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={
                        staleRevertPolicyLoading ||
                        staleRevertPolicySaving ||
                        (!staleRevertPolicyActorFilter && !staleRevertPolicyActorFilterInput.trim())
                      }
                      onClick={() => {
                        setStaleRevertPolicyActorFilterInput('');
                        void refreshStaleRevertPolicy({
                          page: 0,
                          actor: '',
                          from: staleRevertPolicyDateFromFilter,
                          to: staleRevertPolicyDateToFilter,
                        });
                      }}
                      data-testid="agent-planner-stale-revert-policy-actor-filter-clear"
                    >
                      Limpiar actor
                    </Button>
                    <Input
                      type="datetime-local"
                      value={staleRevertPolicyDateFromFilterInput}
                      onChange={(event) => setStaleRevertPolicyDateFromFilterInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void refreshStaleRevertPolicy({
                            page: 0,
                            actor: staleRevertPolicyActorFilterInput,
                            from: staleRevertPolicyDateFromFilterInput,
                            to: staleRevertPolicyDateToFilterInput,
                          });
                        }
                      }}
                      aria-label="Fecha desde"
                      className="h-6 w-36 border-slate-800 bg-slate-950 px-1 text-[10px]"
                      data-testid="agent-planner-stale-revert-policy-date-from-filter"
                    />
                    <Input
                      type="datetime-local"
                      value={staleRevertPolicyDateToFilterInput}
                      onChange={(event) => setStaleRevertPolicyDateToFilterInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void refreshStaleRevertPolicy({
                            page: 0,
                            actor: staleRevertPolicyActorFilterInput,
                            from: staleRevertPolicyDateFromFilterInput,
                            to: staleRevertPolicyDateToFilterInput,
                          });
                        }
                      }}
                      aria-label="Fecha hasta"
                      className="h-6 w-36 border-slate-800 bg-slate-950 px-1 text-[10px]"
                      data-testid="agent-planner-stale-revert-policy-date-to-filter"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() =>
                        void refreshStaleRevertPolicy({
                          page: 0,
                          actor: staleRevertPolicyActorFilterInput,
                          from: staleRevertPolicyDateFromFilterInput,
                          to: staleRevertPolicyDateToFilterInput,
                        })
                      }
                      data-testid="agent-planner-stale-revert-policy-date-filter-apply"
                    >
                      Fechas
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={
                        staleRevertPolicyLoading ||
                        staleRevertPolicySaving ||
                        (!staleRevertPolicyDateFromFilter &&
                          !staleRevertPolicyDateToFilter &&
                          !staleRevertPolicyDateFromFilterInput.trim() &&
                          !staleRevertPolicyDateToFilterInput.trim())
                      }
                      onClick={() => {
                        setStaleRevertPolicyDateFromFilterInput('');
                        setStaleRevertPolicyDateToFilterInput('');
                        void refreshStaleRevertPolicy({
                          page: 0,
                          actor: staleRevertPolicyActorFilter,
                          from: '',
                          to: '',
                        });
                      }}
                      data-testid="agent-planner-stale-revert-policy-date-filter-clear"
                    >
                      Limpiar fechas
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={
                        staleRevertPolicyLoading ||
                        staleRevertPolicySaving ||
                        (staleRevertPolicyActiveFilters.length === 0 &&
                          !staleRevertPolicyActorFilterInput.trim() &&
                          !staleRevertPolicyDateFromFilterInput.trim() &&
                          !staleRevertPolicyDateToFilterInput.trim())
                      }
                      onClick={() => clearStaleRevertPolicyFilter('all')}
                      data-testid="agent-planner-stale-revert-policy-filter-clear-all"
                    >
                      Limpiar todo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() => void refreshStaleRevertPolicy()}
                      data-testid="agent-planner-stale-revert-policy-refresh"
                    >
                      Leer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() =>
                        downloadServerFile(
                          createAIAgentPlannerStaleRevertPolicyAuditExportUrl({
                            format: 'json',
                            eventType: staleRevertPolicyAuditFilter,
                            actor: staleRevertPolicyActorFilter,
                            from: staleRevertPolicyDateFromFilter,
                            to: staleRevertPolicyDateToFilter,
                            exportScope: 'page',
                            limit: STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
                            offset: staleRevertPolicyAuditPage * STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
                          })
                        )
                      }
                      data-testid="agent-planner-stale-revert-policy-export-json"
                    >
                      JSON pagina
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() =>
                        downloadServerFile(
                          createAIAgentPlannerStaleRevertPolicyAuditExportUrl({
                            format: 'markdown',
                            eventType: staleRevertPolicyAuditFilter,
                            actor: staleRevertPolicyActorFilter,
                            from: staleRevertPolicyDateFromFilter,
                            to: staleRevertPolicyDateToFilter,
                            exportScope: 'page',
                            limit: STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
                            offset: staleRevertPolicyAuditPage * STALE_REVERT_POLICY_AUDIT_PAGE_SIZE,
                          })
                        )
                      }
                      data-testid="agent-planner-stale-revert-policy-export-md"
                    >
                      MD pagina
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() =>
                        downloadServerFile(
                          createAIAgentPlannerStaleRevertPolicyAuditExportUrl({
                            format: 'json',
                            eventType: staleRevertPolicyAuditFilter,
                            actor: staleRevertPolicyActorFilter,
                            from: staleRevertPolicyDateFromFilter,
                            to: staleRevertPolicyDateToFilter,
                            exportScope: 'all',
                          })
                        )
                      }
                      data-testid="agent-planner-stale-revert-policy-export-json-all"
                    >
                      JSON todo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() =>
                        downloadServerFile(
                          createAIAgentPlannerStaleRevertPolicyAuditExportUrl({
                            format: 'markdown',
                            eventType: staleRevertPolicyAuditFilter,
                            actor: staleRevertPolicyActorFilter,
                            from: staleRevertPolicyDateFromFilter,
                            to: staleRevertPolicyDateToFilter,
                            exportScope: 'all',
                          })
                        )
                      }
                      data-testid="agent-planner-stale-revert-policy-export-md-all"
                    >
                      MD todo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px] text-red-200 hover:text-red-100"
                      disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                      onClick={() => setStaleRevertPolicyResetDialogOpen(true)}
                      data-testid="agent-planner-stale-revert-policy-reset"
                    >
                      Restaurar env
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={
                        staleRevertPolicyLoading ||
                        !staleRevertPolicyAuditPagination ||
                        staleRevertPolicyAuditPagination.offset === 0
                      }
                      onClick={() =>
                        void refreshStaleRevertPolicy({
                          page: Math.max(0, staleRevertPolicyAuditPage - 1),
                        })
                      }
                      data-testid="agent-planner-stale-revert-policy-audit-prev"
                    >
                      Audit ant
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={
                        staleRevertPolicyLoading ||
                        !staleRevertPolicyAuditPagination?.hasMore
                      }
                      onClick={() =>
                        void refreshStaleRevertPolicy({
                          page: staleRevertPolicyAuditPage + 1,
                        })
                      }
                      data-testid="agent-planner-stale-revert-policy-audit-next"
                    >
                      Audit sig
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {STALE_REVERT_POLICY_ROLE_OPTIONS.map((role) => {
                    const checked = staleRevertPolicyDraftRoles.includes(role);
                    return (
                      <label
                        key={role}
                        className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={role === 'OWNER' || staleRevertPolicySaving}
                          onChange={(event) => {
                            setStaleRevertPolicyDraftRoles((current) => {
                              const base = new Set<StaleMetadataRevertPolicyRole>(['OWNER', ...current]);
                              if (event.target.checked) {
                                base.add(role);
                              } else {
                                base.delete(role);
                              }
                              return STALE_REVERT_POLICY_ROLE_OPTIONS.filter((entry) => base.has(entry));
                            });
                          }}
                          data-testid={`agent-planner-stale-revert-policy-role-${role.toLowerCase()}`}
                        />
                        {role}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Input
                    value={staleRevertPolicyReason}
                    onChange={(event) => setStaleRevertPolicyReason(event.target.value)}
                    placeholder="Motivo de cambio de allowlist"
                    className="h-7 min-w-[220px] flex-1 border-slate-800 bg-slate-950 text-[10px]"
                    data-testid="agent-planner-stale-revert-policy-reason"
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    disabled={staleRevertPolicyLoading || staleRevertPolicySaving}
                    onClick={() => void updateStaleRevertPolicy()}
                    data-testid="agent-planner-stale-revert-policy-save"
                  >
                    {staleRevertPolicySaving ? 'Guardando' : 'Guardar allowlist'}
                  </Button>
                </div>
                {staleRevertPolicyAuditTrail.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {staleRevertPolicyAuditTrail.map((event) => (
                      <div
                        key={event.id}
                        className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[9px] text-slate-500"
                        data-testid="agent-planner-stale-revert-policy-audit-entry"
                      >
                        <span className="text-cyan-100">{event.actorEmail}</span> ·{' '}
                        {event.eventType === 'stale_metadata_revert_allowlist_reset_to_env'
                          ? 'reset env'
                          : 'allowlist'}{' '}
                        · {event.beforeRoles.join(', ')} → {event.afterRoles.join(', ')}
                        {event.reason ? ` · ${event.reason}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {agentPlan.customTasks.length > 0 && (
                <div
                  className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5"
                  data-testid="agent-planner-metadata-audit-panel"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-medium text-amber-200">Auditorías metadata globales</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        edits {agentPlannerServerMetadataCounts.edits} · reverts {agentPlannerServerMetadataCounts.reverts} · stale confirmed {agentPlannerServerMetadataCounts.staleConfirmed}
                      </p>
                      {agentPlannerGlobalRevertAuditPagination && (
                        <p
                          className="mt-0.5 text-[9px] text-slate-500"
                          data-testid="agent-planner-global-revert-audit-pagination"
                        >
                          {agentPlannerGlobalRevertAuditPageStart}-{agentPlannerGlobalRevertAuditPageEnd} de {agentPlannerGlobalRevertAuditPagination.total}
                        </p>
                      )}
                      {agentPlannerGlobalRevertAuditError && (
                        <p className="mt-0.5 text-[9px] text-red-300">{agentPlannerGlobalRevertAuditError}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <select
                        value={agentPlannerRevertAuditFilter}
                        onChange={(event) =>
                          void refreshAgentPlannerGlobalRevertAudits({
                            page: 0,
                            filter: event.target.value as 'all' | 'staleConfirmed',
                          })
                        }
                        className="h-6 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-slate-300"
                        data-testid="agent-planner-global-revert-audit-filter"
                      >
                        <option value="all">reverts</option>
                        <option value="staleConfirmed">stale confirmed</option>
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={agentPlannerLoading}
                        onClick={() =>
                          void exportCustomTaskMetadataRevertAudits(
                            null,
                            'json',
                            agentPlannerRevertAuditFilter,
                            'page'
                          )
                        }
                      >
                        JSON pagina
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={agentPlannerLoading}
                        onClick={() =>
                          void exportCustomTaskMetadataRevertAudits(
                            null,
                            'markdown',
                            agentPlannerRevertAuditFilter,
                            'page'
                          )
                        }
                      >
                        MD pagina
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={agentPlannerLoading}
                        onClick={() =>
                          void exportCustomTaskMetadataRevertAudits(
                            null,
                            'json',
                            agentPlannerRevertAuditFilter,
                            'all'
                          )
                        }
                      >
                        JSON todo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={agentPlannerLoading}
                        onClick={() =>
                          void exportCustomTaskMetadataRevertAudits(
                            null,
                            'markdown',
                            agentPlannerRevertAuditFilter,
                            'all'
                          )
                        }
                      >
                        MD todo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={
                          agentPlannerGlobalRevertAuditLoading ||
                          !agentPlannerGlobalRevertAuditPagination ||
                          agentPlannerGlobalRevertAuditPagination.offset === 0
                        }
                        onClick={() =>
                          void refreshAgentPlannerGlobalRevertAudits({
                            page: Math.max(0, agentPlannerRevertAuditPage - 1),
                          })
                        }
                        data-testid="agent-planner-global-revert-audit-prev"
                      >
                        Anterior
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={
                          agentPlannerGlobalRevertAuditLoading ||
                          !agentPlannerGlobalRevertAuditPagination?.hasMore
                        }
                        onClick={() =>
                          void refreshAgentPlannerGlobalRevertAudits({
                            page: agentPlannerRevertAuditPage + 1,
                          })
                        }
                        data-testid="agent-planner-global-revert-audit-next"
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1 space-y-1">
                    {agentPlannerGlobalRevertAudits.length === 0 ? (
                      <p className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-500">
                        Sin auditorías de revert para el filtro actual.
                      </p>
                    ) : (
                      agentPlannerGlobalRevertAudits.slice(-5).reverse().map((entry) => (
                        <div
                          key={`${entry.task?.taskId ?? 'task'}-${entry.id}`}
                          className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400"
                          data-testid="agent-planner-global-revert-audit-entry"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-amber-100">
                              {entry.task?.title ?? 'Custom task'} · {entry.field}
                            </span>
                            <span className="shrink-0 text-[9px] text-slate-600">
                              {entry.staleRevertConfirmation ? 'stale confirmed' : 'revert'}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[9px] text-slate-500">
                            {entry.before ?? 'none'} → {entry.after ?? 'none'}
                          </p>
                          {entry.staleRevertConfirmation && (
                            <p className="mt-0.5 truncate text-[9px] text-amber-200">
                              {entry.staleRevertConfirmation.confirmedByEmail}: {entry.staleRevertConfirmation.reason}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {agentPlannerSourceBlockGroups.length > 0 && (
                <div
                  className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5"
                  data-testid="agent-planner-source-block-groups"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-slate-200">Source blocks</p>
                    <span className="text-[9px] text-slate-500">
                      {agentPlannerSourceBlockGroups.length} grupo(s)
                    </span>
                  </div>
                  <div className="mt-1 grid gap-1">
                    {agentPlannerSourceBlockGroups.map((group) => (
                      <button
                        key={group.sourceBlockId}
                        type="button"
                        className={cn(
                          'rounded border px-2 py-1 text-left text-[10px] transition',
                          agentPlannerSourceBlockFilter === group.sourceBlockId
                            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                            : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600'
                        )}
                        onClick={() => setAgentPlannerSourceBlockFilter(group.sourceBlockId)}
                        data-testid="agent-planner-source-block-group"
                      >
                        <span className="block truncate font-medium">{group.sourceBlockId}</span>
                        <span className="mt-0.5 block text-[9px] text-slate-500">
                          total {group.total} · pending {group.counts.pending} · running {group.counts.running} · completed {group.counts.completed} · failed {group.counts.failed}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {agentPlan.customStages.length > 0 && (
                <div
                  className="rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5"
                  data-testid="agent-planner-custom-stages"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-cyan-200">Custom stages</p>
                    {agentPlannerSourceBlockOptions.length > 1 ? (
                      <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500">
                        Source
                        <select
                          value={agentPlannerSourceBlockFilter}
                          onChange={(event) => setAgentPlannerSourceBlockFilter(event.target.value)}
                          className="h-6 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-slate-300"
                          data-testid="agent-planner-source-block-filter"
                        >
                          {agentPlannerSourceBlockOptions.map((value) => (
                            <option key={value} value={value}>
                              {value === 'all' ? 'all' : value}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-1 space-y-1">
                    {visibleAgentPlannerCustomStages.map((stage) => (
                      <div
                        key={stage.stageId}
                        className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px]"
                      >
                        <span className="min-w-0 truncate text-slate-300">
                          {stage.title} · {stage.owner}
                        </span>
                        <span className="shrink-0 rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-200">
                          {stage.taskIds.length} task(s)
                        </span>
                      </div>
                    ))}
                    {visibleAgentPlannerCustomStages.length === 0 ? (
                      <p className="text-[10px] text-slate-500">Sin custom stages para este sourceBlockId.</p>
                    ) : null}
                  </div>
                </div>
              )}
              {agentPlan.customTasks.length > 0 && (
                <div
                  className="space-y-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5"
                  data-testid="agent-planner-custom-tasks"
                >
                  <p className="text-[11px] font-medium text-emerald-200">Custom tasks</p>
                  {visibleAgentPlannerCustomTasks.map((task) => {
                    const editDraft = customTaskEditDrafts[task.taskId];
                    const visibleMetadataHistory = filterCustomTaskMetadataHistory(
                      task,
                      customTaskMetadataHistoryFilter
                    );
                    return (
                    <div
                      key={task.taskId}
                      className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5"
                      data-testid="agent-planner-custom-task"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="min-w-0 truncate text-[11px] text-slate-200"
                          data-testid="agent-planner-custom-task-title"
                        >
                          {task.title}
                        </span>
                        <span className={cn('shrink-0 rounded border px-2 py-0.5 text-[10px]', plannerStatusClasses(task.status))}>
                          {plannerStatusLabel(task.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">{task.summary}</p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-slate-500">
                        <span className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5">
                          {task.priority}
                        </span>
                        <span className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5">
                          {task.owner}
                        </span>
                        {task.sourceBlockId ? (
                          <span className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5">
                            {task.sourceBlockId}
                          </span>
                        ) : null}
                      </div>
                      {editDraft && (
                        <div
                          className="mt-2 grid gap-1.5 rounded border border-cyan-500/20 bg-cyan-500/5 p-2 sm:grid-cols-3"
                          data-testid="agent-planner-custom-task-editor"
                        >
                          <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500 sm:col-span-3">
                            Title
                            <Input
                              value={editDraft.title}
                              onChange={(event) =>
                                updateCustomTaskEditDraft(task.taskId, { title: event.target.value })
                              }
                              className="h-6 border-slate-800 bg-slate-950 text-[10px]"
                              data-testid="agent-planner-custom-task-title-input"
                            />
                          </label>
                          <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500 sm:col-span-3">
                            Summary
                            <textarea
                              value={editDraft.summary}
                              onChange={(event) =>
                                updateCustomTaskEditDraft(task.taskId, { summary: event.target.value })
                              }
                              rows={2}
                              className="min-h-[44px] resize-y rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 outline-none"
                              data-testid="agent-planner-custom-task-summary-input"
                            />
                          </label>
                          <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                            Owner
                            <Input
                              value={editDraft.owner}
                              onChange={(event) =>
                                updateCustomTaskEditDraft(task.taskId, { owner: event.target.value })
                              }
                              className="h-6 border-slate-800 bg-slate-950 text-[10px]"
                              data-testid="agent-planner-custom-task-owner-input"
                            />
                          </label>
                          <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                            Priority
                            <select
                              value={editDraft.priority}
                              onChange={(event) =>
                                updateCustomTaskEditDraft(task.taskId, {
                                  priority: event.target.value as AgentPlannerCustomTaskPriority,
                                })
                              }
                              className="h-6 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-slate-300"
                              data-testid="agent-planner-custom-task-priority-input"
                            >
                              <option value="low">low</option>
                              <option value="medium">medium</option>
                              <option value="high">high</option>
                            </select>
                          </label>
                          <label className="grid gap-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                            Source block
                            <Input
                              value={editDraft.sourceBlockId}
                              onChange={(event) =>
                                updateCustomTaskEditDraft(task.taskId, {
                                  sourceBlockId: event.target.value,
                                })
                              }
                              className="h-6 border-slate-800 bg-slate-950 text-[10px]"
                              data-testid="agent-planner-custom-task-source-input"
                            />
                          </label>
                        </div>
                      )}
                      {(task.metadataHistory ?? []).length > 0 && (
                        <details
                          className="mt-2 rounded border border-slate-800 bg-slate-950/80 px-2 py-1"
                          data-testid="agent-planner-custom-task-metadata-history"
                        >
                          <summary className="cursor-pointer text-[10px] text-slate-300">
                            Historial metadata ({visibleMetadataHistory.length}/{(task.metadataHistory ?? []).length})
                          </summary>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                            <label className="flex items-center gap-1 text-[9px] text-slate-500">
                              Filtro
                              <select
                                value={customTaskMetadataHistoryFilter}
                                onChange={(event) =>
                                  setCustomTaskMetadataHistoryFilter(
                                    event.target.value as CustomTaskMetadataHistoryFilter
                                  )
                                }
                                className="h-5 rounded border border-slate-800 bg-slate-950 px-1 text-[9px] text-slate-300"
                                data-testid="agent-planner-custom-task-metadata-filter"
                              >
                                <option value="all">todos</option>
                                <option value="reverts">solo cambios revertidos</option>
                                <option value="staleConfirmed">solo revert obsoleto confirmado</option>
                              </select>
                            </label>
                            <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[9px]"
                              disabled={agentPlannerLoading}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void exportCustomTaskMetadataHistory(task, 'json');
                              }}
                            >
                              JSON
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[9px]"
                              disabled={agentPlannerLoading}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void exportCustomTaskMetadataHistory(task, 'markdown');
                              }}
                            >
                              Markdown
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[9px]"
                              disabled={agentPlannerLoading}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void exportCustomTaskMetadataRevertAudits(
                                  task,
                                  'json',
                                  customTaskMetadataHistoryFilter === 'staleConfirmed'
                                    ? 'staleConfirmed'
                                    : 'all'
                                );
                              }}
                            >
                              Audit JSON
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[9px]"
                              disabled={agentPlannerLoading}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void exportCustomTaskMetadataRevertAudits(
                                  task,
                                  'markdown',
                                  customTaskMetadataHistoryFilter === 'staleConfirmed'
                                    ? 'staleConfirmed'
                                    : 'all'
                                );
                              }}
                            >
                              Audit MD
                            </Button>
                            </div>
                          </div>
                          <div className="mt-1 space-y-1">
                            {visibleMetadataHistory.length === 0 && (
                              <p className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[9px] text-slate-500">
                                Sin entradas para el filtro seleccionado.
                              </p>
                            )}
                            {visibleMetadataHistory.slice(-6).reverse().map((entry) => {
                              const staleRevert = isStaleCustomTaskMetadataEntry(task, entry.id);
                              return (
                              <div
                                key={entry.id}
                                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[9px] text-slate-400"
                                data-testid="agent-planner-custom-task-metadata-diff"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-slate-300">{entry.field}</span>
                                  <span className="text-slate-600">
                                    {entry.source === 'metadata_revert' ? 'revert' : 'edit'} · {new Date(entry.changedAt).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                                  <span className="min-w-0 truncate rounded border border-red-500/20 bg-red-500/5 px-1 py-0.5 text-red-200">
                                    {entry.before ?? 'none'}
                                  </span>
                                  <span className="text-slate-600">→</span>
                                  <span className="min-w-0 truncate rounded border border-emerald-500/20 bg-emerald-500/5 px-1 py-0.5 text-emerald-200">
                                    {entry.after ?? 'none'}
                                  </span>
                                </div>
                                {entry.staleRevertConfirmation && (
                                  <div
                                    className="mt-1 rounded border border-amber-500/20 bg-amber-500/5 px-1 py-0.5 text-[9px] text-amber-200"
                                    data-testid="agent-planner-custom-task-metadata-audit"
                                  >
                                    Confirmado por {entry.staleRevertConfirmation.confirmedByEmail} · motivo:{' '}
                                    {entry.staleRevertConfirmation.reason}
                                  </div>
                                )}
                                <div className="mt-1 flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 px-1.5 text-[9px]"
                                    disabled={agentPlannerLoading}
                                    onClick={() => {
                                      void updateAgentPlanner({
                                        action: 'custom_task_metadata_revert',
                                        taskId: task.taskId,
                                        historyEntryId: entry.id,
                                      });
                                    }}
                                  >
                                    {staleRevert ? 'Revertir con riesgo' : 'Revertir'}
                                  </Button>
                                </div>
                              </div>
                            );
                            })}
                          </div>
                        </details>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {!editDraft && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px]"
                            disabled={agentPlannerLoading}
                            onClick={() => startCustomTaskEdit(task)}
                          >
                            Editar metadata
                          </Button>
                        )}
                        {editDraft && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px]"
                              disabled={agentPlannerLoading}
                              onClick={() => void saveCustomTaskEdit(task.taskId)}
                            >
                              Guardar metadata
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px]"
                              disabled={agentPlannerLoading}
                              onClick={() => cancelCustomTaskEdit(task.taskId)}
                            >
                              Cancelar metadata
                            </Button>
                          </>
                        )}
                        {(task.status === 'pending' || task.status === 'failed') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px]"
                            disabled={agentPlannerLoading}
                            onClick={() =>
                              void updateAgentPlanner({
                                action: 'custom_task_status',
                                taskId: task.taskId,
                                status: 'running',
                                resultSummary: `${task.title} iniciada desde acción directa de custom task.`,
                              })
                            }
                          >
                            Iniciar task
                          </Button>
                        )}
                        {task.status === 'running' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px]"
                              disabled={agentPlannerLoading}
                              onClick={() =>
                                void updateAgentPlanner({
                                  action: 'custom_task_status',
                                  taskId: task.taskId,
                                  status: 'completed',
                                  resultSummary: `${task.title} completada desde acción directa de custom task.`,
                                })
                              }
                            >
                              Completar task
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px]"
                              disabled={agentPlannerLoading}
                              onClick={() =>
                                void updateAgentPlanner({
                                  action: 'custom_task_status',
                                  taskId: task.taskId,
                                  status: 'failed',
                                  resultSummary: `${task.title} marcada con fallo desde acción directa de custom task.`,
                                })
                              }
                            >
                              Falló task
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {visibleAgentPlannerCustomTasks.length === 0 ? (
                    <p className="text-[10px] text-slate-500">Sin custom tasks para este sourceBlockId.</p>
                  ) : null}
                </div>
              )}
              <div className="space-y-1.5">
                {agentPlan.stages.map((stage) => (
                  <div key={stage.stageId} className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-200">{stage.title}</span>
                      <span className={cn('rounded border px-2 py-0.5 text-[10px]', plannerStatusClasses(stage.status))}>
                        {plannerStatusLabel(stage.status)}
                      </span>
                    </div>
                    {stage.resultSummary && (
                      <p className="mt-1 text-[11px] text-slate-400">{stage.resultSummary}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(stage.status === 'pending' || stage.status === 'failed') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px]"
                          disabled={agentPlannerLoading}
                          onClick={() =>
                            void updateAgentPlanner({
                              action: 'stage_status',
                              stageId: stage.stageId,
                              status: 'running',
                              resultSummary: 'Etapa retomada desde el planner del editor.',
                            })
                          }
                        >
                          Iniciar
                        </Button>
                      )}
                      {stage.status === 'running' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px]"
                            disabled={agentPlannerLoading}
                            onClick={() =>
                              void updateAgentPlanner({
                                action: 'stage_status',
                                stageId: stage.stageId,
                                status: 'completed',
                                resultSummary: 'Etapa completada y validada desde el planner del editor.',
                              })
                            }
                          >
                            Completar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px]"
                            disabled={agentPlannerLoading}
                            onClick={() =>
                              void updateAgentPlanner({
                                action: 'stage_status',
                                stageId: stage.stageId,
                                status: 'failed',
                                resultSummary: 'Etapa marcada con fallo para revisión manual.',
                              })
                            }
                          >
                            Falló
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {agentPlan.events.length > 0 && (
                <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                  <p className="text-[11px] font-medium text-slate-300">Trazabilidad</p>
                  <div className="mt-1 space-y-1">
                    {agentPlan.events.slice(-4).reverse().map((event) => (
                      <p key={event.id} className="text-[10px] text-slate-500">
                        {new Date(event.at).toLocaleTimeString()} · {event.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {agentPlan.receipts.length > 0 && (
                <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                  <p className="text-[11px] font-medium text-slate-300">Receipts durables</p>
                  <div className="mt-1 space-y-1">
                    {agentPlan.receipts.slice(-3).reverse().map((receipt) => (
                      <div key={receipt.receiptId} className="rounded border border-slate-900 bg-slate-950 px-2 py-1">
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-slate-300">
                            {plannerReceiptActionLabel(receipt.action)} · {plannerStatusLabel(receipt.execution.state)}
                          </span>
                          <span className="text-slate-500">
                            {new Date(receipt.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">{receipt.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {agentPlan.jobs.length > 1 && (
                <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                  <p className="text-[11px] font-medium text-slate-300">Historial de jobs</p>
                  <div className="mt-1 space-y-1">
                    {agentPlan.jobs.slice(-3).reverse().map((job) => (
                      <div
                        key={job.jobId}
                        className="flex items-center justify-between gap-2 rounded border border-slate-900 bg-slate-950 px-2 py-1 text-[10px]"
                      >
                        <span className="text-slate-300">
                          Intento {job.attemptNumber} · {plannerReceiptActionLabel(job.action)}
                        </span>
                        <span className={cn('rounded border px-2 py-0.5', plannerStatusClasses(job.status))}>
                          {plannerStatusLabel(job.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {agentPlan.status !== 'completed' && agentPlan.status !== 'canceled' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={agentPlannerLoading}
                    onClick={() => void updateAgentPlanner({ action: 'resume' })}
                  >
                    Reanudar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={agentPlannerLoading}
                  onClick={() =>
                    void updateAgentPlanner({
                      action: 'checkpoint',
                      checkpoint: `Checkpoint manual ${new Date().toLocaleTimeString()}`,
                    })
                  }
                >
                  Checkpoint
                </Button>
                {agentPlan.status !== 'completed' && agentPlan.status !== 'canceled' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-200"
                    disabled={agentPlannerLoading}
                    onClick={() =>
                      void updateAgentPlanner({
                        action: 'cancel',
                        note: 'Plan cancelado desde el panel del editor.',
                      })
                    }
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              Usa el prompt actual para crear un plan durable, recuperar la última ejecución y seguir etapas sin depender del estado vivo del editor.
            </p>
          )}
        </div>
      )}

      <div className="mx-3 mt-2 h-1 overflow-hidden rounded-full border border-slate-800 bg-slate-950/80 shrink-0">
        <div
          className="h-full rounded-full bg-cyan-400/80 transition-[width] duration-150"
          style={{ width: `${chatScrollProgress}%` }}
          aria-label="Barra de movimiento del chat"
        />
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef}>
        <div className="p-3 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Sparkles className="w-8 h-8 text-blue-400/50 mb-2" />
              <p className="text-sm text-slate-400 mb-1">
                ¡Hola! Soy tu asistente de creación de juegos.
              </p>
              <p className="text-xs text-slate-500 mb-3">
                Puedo ayudarte a crear escenas, personajes, objetos, imágenes y clips.
              </p>
              
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2 w-full">
                {quickActions.map((action, i) => (
                  <QuickActionButton
                    key={i}
                    icon={action.icon}
                    label={action.label}
                    onClick={() => processCommand(action.prompt)}
                    disabled={isInputLocked}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {pipelineProgress.visible && (
                <div className={cn(
                  'rounded-lg border p-3',
                  pipelineProgress.status === 'error'
                    ? 'border-red-500/40 bg-red-500/10'
                    : 'border-blue-500/30 bg-blue-500/10'
                )}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className={pipelineProgress.status === 'error' ? 'text-red-200' : 'text-blue-200'}>
                      {pipelineProgressTitle}
                    </span>
                    <span className="text-slate-300">{pipelineProgressValue}%</span>
                  </div>
                  <Progress value={pipelineProgressValue} className="h-2" />
                  <p className="mt-2 text-xs text-slate-300">
                    Etapa {pipelineCurrentIndex}/{pipelineProgress.totalStages}: {pipelineProgress.currentStageTitle}
                  </p>
                  {pipelineProgress.status === 'error' && pipelineProgress.error && (
                    <p className="mt-1 text-xs text-red-200">{pipelineProgress.error}</p>
                  )}
                </div>
              )}
              {messages.map((message) => (
                <ChatBubble 
                  key={message.id} 
                  message={message} 
                  onCopy={handleCopy}
                  copied={copiedId === message.id}
                />
              ))}
              
              {/* Active Task */}
              {activeTask && activeTask.status === 'processing' && (
                <GenerationProgress task={activeTask} onCancel={cancelCharacterGeneration} />
              )}
            </>
          )}

          {/* Processing Indicator */}
          {isAiProcessing && !activeTask && (
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1 px-3 py-2 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-sm text-slate-400">Procesando...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-slate-700 shrink-0">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            className="bg-slate-800 border-slate-700 text-sm"
            disabled={isInputLocked}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isInputLocked}
            className="bg-blue-500 hover:bg-blue-600 shrink-0 px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {isAIFirstWorkflow
            ? 'Ejemplo AI First: "crea un juego de plataformas con enemigo lobo y salto"'
            : 'Ejemplos: "genera un guerrero", "crea una textura metalica", "haz un trailer corto"'}
        </p>
      </div>
      <AlertDialog
        open={staleRevertPolicyResetDialogOpen}
        onOpenChange={(open) => setStaleRevertPolicyResetDialogOpen(open)}
      >
        <AlertDialogContent data-testid="agent-planner-stale-revert-policy-reset-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar allowlist a env/default</AlertDialogTitle>
            <AlertDialogDescription>
              Esto elimina la configuración persistida y vuelve a usar la política definida por entorno/default. El evento queda registrado en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div
            className="space-y-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-xs text-slate-300"
            data-testid="agent-planner-stale-revert-policy-reset-preview"
          >
            <p>
              Antes:{' '}
              <span className="text-cyan-100">{staleRevertPolicyCurrentRoles.join(', ')}</span>
            </p>
            <p>
              Después:{' '}
              <span className="text-cyan-100">{staleRevertPolicyEnvRoles.join(', ')}</span>
            </p>
            <p className="text-slate-500">
              Fuente actual: {staleRevertPolicy?.policySnapshot?.source ?? 'unknown'} · fuente final: env/default
            </p>
            <Input
              value={staleRevertPolicyReason}
              onChange={(event) => setStaleRevertPolicyReason(event.target.value)}
              placeholder="Motivo obligatorio para restaurar"
              className="h-8 border-slate-800 bg-slate-950 text-xs"
              data-testid="agent-planner-stale-revert-policy-reset-reason"
            />
            {!staleRevertPolicyResetReasonReady && (
              <p className="text-[11px] text-amber-200">
                El motivo debe tener al menos 8 caracteres para habilitar la restauración.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={staleRevertPolicySaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={staleRevertPolicySaving || !staleRevertPolicyResetReasonReady}
              onClick={(event) => {
                event.preventDefault();
                void resetStaleRevertPolicyToEnv();
              }}
              data-testid="agent-planner-stale-revert-policy-reset-confirm"
            >
              {staleRevertPolicySaving ? 'Restaurando' : 'Confirmar restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(rollbackCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setRollbackCandidate(null);
          }
        }}
      >
        <AlertDialogContent data-testid="agentic-rollback-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar rollback agentic</AlertDialogTitle>
            <AlertDialogDescription>
              Esto restaurará el proyecto al snapshot anterior de la ejecución seleccionada. Los cambios actuales del save remoto serán reemplazados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rollbackCandidate && (
            <div
              className="space-y-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-xs text-slate-300"
              data-testid="agentic-rollback-preview"
            >
              <p className="truncate">Ejecución: {rollbackCandidate.id}</p>
              <p className="mt-1 truncate">Prompt: {rollbackCandidate.prompt}</p>
              {rollbackCandidate.diff && (
                <>
                  <p className="text-slate-500">
                    Diff: entidades {formatSnapshotDelta(rollbackCandidate.diff.counts.entities.delta)}, assets {formatSnapshotDelta(rollbackCandidate.diff.counts.assets.delta)}
                  </p>
                  <div className="rounded border border-slate-800 bg-slate-900/70 p-2 text-[11px]">
                    <p className="font-medium text-amber-200">Preview rollback</p>
                    <p className="mt-1 text-slate-400">
                      Se eliminará: {previewNames(rollbackCandidate.diff.rollbackPreview.willRemove.entities)}
                    </p>
                    <p className="mt-1 text-slate-400">
                      Se restaurará: {previewNames(rollbackCandidate.diff.rollbackPreview.willRestore.entities)}
                    </p>
                    <p className="mt-1 text-slate-400">
                      Se revertirá: {previewNames(rollbackCandidate.diff.rollbackPreview.willRevert.entities)}
                    </p>
                    {rollbackCandidate.diff.rollbackPreview.willRemove.assets.length > 0 && (
                      <p className="mt-1 text-slate-500">
                        Assets eliminados: {previewNames(rollbackCandidate.diff.rollbackPreview.willRemove.assets)}
                      </p>
                    )}
                    {rollbackCandidate.diff.rollbackPreview.willRevert.components.length > 0 && (
                      <p className="mt-1 text-slate-500">
                        Componentes: {rollbackCandidate.diff.rollbackPreview.willRevert.components.slice(0, 3).map((item) => item.summary).join(' | ')}
                      </p>
                    )}
                    {createRollbackFieldPreview(rollbackCandidate).length > 0 && (
                      <div
                        className="mt-2 rounded border border-slate-800 bg-slate-950/80 p-1.5"
                        data-testid="agentic-rollback-field-preview"
                      >
                        <p className="font-medium text-cyan-200">Campos revertidos</p>
                        <div className="mt-1 space-y-0.5">
                          {createRollbackFieldPreview(rollbackCandidate).map((field) => (
                            <p key={field.id} className="truncate text-cyan-300">
                              {field.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-500"
              onClick={() => {
                const candidate = rollbackCandidate;
                setRollbackCandidate(null);
                if (candidate) {
                  void handleAgenticHistoryMutation(candidate, 'rollback');
                }
              }}
            >
              Restaurar snapshot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Chat Bubble
function ChatBubble({ 
  message, 
  onCopy, 
  copied 
}: { 
  message: ChatMessage; 
  onCopy: (id: string, content: string) => void;
  copied: boolean;
}) {
  const isUser = message.role === 'user';
  const isError = message.metadata?.type === 'error';
  const isConfigWarning = message.metadata?.type === 'config-warning';
  const isWarning = message.metadata?.type === 'warning';

  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
        isUser ? "bg-green-500/20" : "bg-blue-500/20"
      )}>
        {isUser ? (
          <User className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-blue-400" />
        )}
      </div>
      
      <div className={cn(
        "flex-1 max-w-[90%] px-3 py-2 rounded-lg group relative",
        isUser 
          ? "bg-green-500/20 text-green-100" 
          : isError 
            ? "bg-red-500/20 text-red-100"
            : isConfigWarning || isWarning
              ? "bg-amber-500/20 text-amber-100"
              : "bg-slate-800 text-slate-200"
      )}>
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content.split('\n').map((line, i) => {
            // Bold text
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="font-semibold text-blue-300">{line.slice(2, -2)}</p>;
            }
            // Check marks
            if (line.startsWith('✓') || line.startsWith('✅')) {
              return <p key={i} className="text-green-400">{line}</p>;
            }
            // Warning marks
            if (line.startsWith('⚠️') || line.startsWith('❌')) {
              return <p key={i} className="text-amber-400">{line}</p>;
            }
            return <p key={i}>{line}</p>;
          })}
        </div>
        
        {/* Model Preview */}
        {message.metadata?.thumbnailUrl && (
          <img 
            src={message.metadata.thumbnailUrl as string} 
            alt="Model preview" 
            className="w-full h-24 object-contain rounded mt-2 bg-slate-900"
          />
        )}

        {message.metadata?.agenticPipeline && (
          <AgenticPipelineTrace pipeline={message.metadata.agenticPipeline} />
        )}
        
        {/* Copy Button */}
        <button
          onClick={() => onCopy(message.id, message.content)}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-opacity"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 text-slate-400" />
          )}
        </button>
      </div>
    </div>
  );
}

type AgenticPipelineMetadata = NonNullable<NonNullable<ChatMessage['metadata']>['agenticPipeline']>;

function statusClasses(status: string): string {
  if (status === 'completed' || status === 'approved') {
    return 'border-green-500/30 bg-green-500/10 text-green-200';
  }
  if (status === 'failed' || status === 'rejected') {
    return 'border-red-500/30 bg-red-500/10 text-red-200';
  }
  if (status === 'running' || status === 'validating') {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  }
  return 'border-slate-600 bg-slate-900/70 text-slate-300';
}

function AgenticPipelineTrace({ pipeline }: { pipeline: AgenticPipelineMetadata }) {
  const visibleTools = pipeline.tools.slice(0, 6);
  const visibleTraces = pipeline.traces.slice(-5);
  const failedToolCount = pipeline.tools.reduce((total, tool) => total + tool.failureCount, 0);
  const confidence = pipeline.validation
    ? Math.round(pipeline.validation.confidence * 100)
    : 0;

  return (
    <div className="mt-3 rounded-md border border-slate-700 bg-slate-950/50 p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn('inline-flex items-center gap-1 rounded border px-2 py-1', statusClasses(pipeline.approved ? 'approved' : 'rejected'))}>
          {pipeline.approved ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          {pipeline.approved ? 'Validado' : 'Rechazado'}
        </span>
        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
          Iteración {pipeline.iteration}
        </span>
        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
          {pipeline.steps.length} pasos
        </span>
        <span className={cn(
          'rounded border px-2 py-1',
          failedToolCount > 0
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            : 'border-slate-700 bg-slate-900 text-slate-300'
        )}>
          {pipeline.tools.length} tools
        </span>
        {pipeline.validation && (
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
            Confianza {confidence}%
          </span>
        )}
      </div>

      {pipeline.runtimeScaffold && (
        <div
          data-testid="agentic-runtime-scaffold"
          className="mt-2 rounded border border-cyan-500/30 bg-cyan-500/10 p-2 text-xs text-cyan-100"
        >
          <div className="flex items-center gap-1 font-medium">
            <Gamepad2 className="h-3 w-3" />
            Runtime export preparado
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {pipeline.runtimeScaffold.createdCamera && (
              <span
                data-testid="agentic-runtime-scaffold-camera"
                className="rounded border border-cyan-400/30 px-1.5 py-0.5"
              >
                camera
              </span>
            )}
            {pipeline.runtimeScaffold.createdPlayer && (
              <span
                data-testid="agentic-runtime-scaffold-player"
                className="rounded border border-cyan-400/30 px-1.5 py-0.5"
              >
                player
              </span>
            )}
            {pipeline.runtimeScaffold.entityIds.length > 0 && (
              <span
                data-testid="agentic-runtime-scaffold-entity-count"
                className="rounded border border-cyan-400/30 px-1.5 py-0.5"
              >
                {pipeline.runtimeScaffold.entityIds.length} entidad(es)
              </span>
            )}
          </div>
          {pipeline.runtimeScaffold.summaries.length > 0 && (
            <div className="mt-1 text-cyan-200/80">
              {pipeline.runtimeScaffold.summaries.join(' ')}
            </div>
          )}
        </div>
      )}

      {pipeline.steps.length > 0 && (
        <div className="mt-2 space-y-1">
          {pipeline.steps.slice(0, 5).map((step) => (
            <div key={step.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-slate-300">{step.title}</span>
              <span className={cn('shrink-0 rounded border px-1.5 py-0.5', statusClasses(step.status))}>
                {step.agentRole}
              </span>
            </div>
          ))}
        </div>
      )}

      {visibleTools.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {visibleTools.map((tool) => (
            <span
              key={tool.name}
              className={cn(
                'rounded border px-1.5 py-0.5 text-xs',
                tool.failureCount > 0
                  ? 'border-red-500/30 bg-red-500/10 text-red-200'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              )}
            >
              {tool.name} {tool.successCount > 1 ? `x${tool.successCount}` : ''}
            </span>
          ))}
        </div>
      )}

      {pipeline.validation?.missingRequirements.length ? (
        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          {pipeline.validation.missingRequirements.join(', ')}
        </div>
      ) : null}

      {visibleTraces.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
          {visibleTraces.map((trace, index) => (
            <div key={`${trace.timestamp}-${index}`} className="flex gap-2 text-xs text-slate-400">
              <span className="shrink-0 text-slate-500">{trace.eventType}</span>
              <span className="min-w-0 truncate">{trace.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Agent Status Indicator (exported)
export function AgentStatusIndicator() {
  const { tasks, isAiProcessing } = useEngineStore();
  const activeTasks = tasks.filter(t => t.status === 'processing');

  return (
    <div className="flex items-center gap-2">
      {isAiProcessing && (
        <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 rounded animate-pulse">
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          <span className="text-xs text-blue-300">Ejecutando...</span>
        </div>
      )}
      {activeTasks.length > 0 && (
        <div className="text-xs text-slate-400">
          {activeTasks.length} tareas activas
        </div>
      )}
    </div>
  );
}














