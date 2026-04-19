import type {
  AgentPlannerCustomTaskMetadataChange,
  AgentPlannerCustomTaskPriority,
  AgentPlannerStageStatus,
} from './agentPlanner';

export type CustomTaskMetadataHistoryReportFormat = 'json' | 'markdown';
export type CustomTaskMetadataRevertAuditFilter = 'all' | 'staleConfirmed';

export type CustomTaskMetadataHistoryReportTask = {
  taskId: string;
  title: string;
  summary: string;
  owner: string;
  priority: AgentPlannerCustomTaskPriority;
  sourceBlockId: string | null;
  status: AgentPlannerStageStatus;
};

export type CustomTaskMetadataHistoryCounts = {
  edits: number;
  reverts: number;
  staleConfirmed: number;
};

export type CustomTaskMetadataRevertAuditEntry = AgentPlannerCustomTaskMetadataChange & {
  task?: CustomTaskMetadataHistoryReportTask;
};

export function countCustomTaskMetadataHistory(
  metadataHistory: AgentPlannerCustomTaskMetadataChange[]
): CustomTaskMetadataHistoryCounts {
  return metadataHistory.reduce(
    (counts, entry) => {
      if (entry.source === 'metadata_revert') {
        counts.reverts += 1;
      } else {
        counts.edits += 1;
      }
      if (entry.staleRevertConfirmation) {
        counts.staleConfirmed += 1;
      }
      return counts;
    },
    {
      edits: 0,
      reverts: 0,
      staleConfirmed: 0,
    }
  );
}

export function sumCustomTaskMetadataHistoryCounts(
  countsList: CustomTaskMetadataHistoryCounts[]
): CustomTaskMetadataHistoryCounts {
  return countsList.reduce(
    (total, counts) => ({
      edits: total.edits + counts.edits,
      reverts: total.reverts + counts.reverts,
      staleConfirmed: total.staleConfirmed + counts.staleConfirmed,
    }),
    {
      edits: 0,
      reverts: 0,
      staleConfirmed: 0,
    }
  );
}

export function createCustomTaskMetadataHistoryReport(params: {
  projectKey: string;
  planId: string;
  task: CustomTaskMetadataHistoryReportTask;
  metadataHistory: AgentPlannerCustomTaskMetadataChange[];
  format: CustomTaskMetadataHistoryReportFormat;
}) {
  const generatedAt = new Date().toISOString();
  if (params.format === 'json') {
    return JSON.stringify(
      {
        reportVersion: 2,
        kind: 'agent_planner_custom_task_metadata_history',
        generatedAt,
        projectKey: params.projectKey,
        planId: params.planId,
        task: params.task,
        historyCount: params.metadataHistory.length,
        metadataHistory: params.metadataHistory,
      },
      null,
      2
    );
  }

  const lines = [
    '# Custom Task Metadata History',
    '',
    `Generated At: ${generatedAt}`,
    `Project: ${params.projectKey}`,
    `Plan: ${params.planId}`,
    `Task: ${params.task.taskId}`,
    `Title: ${params.task.title}`,
    `Status: ${params.task.status}`,
    `Owner: ${params.task.owner}`,
    `Priority: ${params.task.priority}`,
    `Source Block: ${params.task.sourceBlockId ?? 'none'}`,
    `History Count: ${params.metadataHistory.length}`,
    '',
    '## Changes',
    '',
  ];

  if (params.metadataHistory.length === 0) {
    lines.push('- No metadata changes recorded.');
  } else {
    for (const entry of params.metadataHistory) {
      lines.push(
        `### ${entry.field}`,
        '',
        `- id: ${entry.id}`,
        `- source: ${entry.source}`,
        `- changedAt: ${entry.changedAt}`,
        `- before: ${entry.before ?? 'none'}`,
        `- after: ${entry.after ?? 'none'}`,
        ...(entry.revertedChangeId ? [`- revertedChangeId: ${entry.revertedChangeId}`] : [])
      );

      if (entry.staleRevertConfirmation) {
        lines.push(
          `- staleRevert.confirmedAt: ${entry.staleRevertConfirmation.confirmedAt}`,
          `- staleRevert.confirmedByUserId: ${entry.staleRevertConfirmation.confirmedByUserId}`,
          `- staleRevert.confirmedByEmail: ${entry.staleRevertConfirmation.confirmedByEmail}`,
          `- staleRevert.reason: ${entry.staleRevertConfirmation.reason}`,
          `- staleRevert.field: ${entry.staleRevertConfirmation.blocker.field}`,
          `- staleRevert.revertToValue: ${entry.staleRevertConfirmation.blocker.revertToValue ?? 'none'}`,
          `- staleRevert.laterChangeIds: ${entry.staleRevertConfirmation.blocker.laterChangeIds.join(', ') || 'none'}`,
          ...(entry.staleRevertConfirmation.policySnapshot
            ? [
                `- staleRevert.policyId: ${entry.staleRevertConfirmation.policySnapshot.policyId}`,
                `- staleRevert.policySource: ${entry.staleRevertConfirmation.policySnapshot.source}`,
                `- staleRevert.policyAllowedRoles: ${entry.staleRevertConfirmation.policySnapshot.allowedRoles.join(', ')}`,
                `- staleRevert.policyEvaluatedRole: ${entry.staleRevertConfirmation.policySnapshot.evaluatedRole}`,
              ]
            : [])
        );
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

export function filterCustomTaskMetadataRevertAudits(
  metadataHistory: CustomTaskMetadataRevertAuditEntry[],
  filter: CustomTaskMetadataRevertAuditFilter = 'all'
) {
  return metadataHistory.filter((entry) => {
    if (entry.source !== 'metadata_revert') {
      return false;
    }
    if (filter === 'staleConfirmed') {
      return Boolean(entry.staleRevertConfirmation);
    }
    return true;
  });
}

export function createCustomTaskMetadataRevertAuditReport(params: {
  projectKey: string;
  planId: string;
  scope: 'task' | 'planner';
  task?: CustomTaskMetadataHistoryReportTask | null;
  taskCount?: number;
  counts?: CustomTaskMetadataHistoryCounts;
  audits: CustomTaskMetadataRevertAuditEntry[];
  totalAuditCount?: number;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  exportScope?: 'page' | 'all';
  filter: CustomTaskMetadataRevertAuditFilter;
  format: CustomTaskMetadataHistoryReportFormat;
}) {
  const generatedAt = new Date().toISOString();
  if (params.format === 'json') {
    return JSON.stringify(
      {
        reportVersion: 1,
        kind: 'agent_planner_custom_task_metadata_revert_audits',
        generatedAt,
        projectKey: params.projectKey,
        planId: params.planId,
        scope: params.scope,
        task: params.task ?? null,
        taskCount: params.taskCount ?? (params.task ? 1 : 0),
        counts: params.counts ?? null,
        filter: params.filter,
        exportScope: params.exportScope ?? 'page',
        auditCount: params.audits.length,
        totalAuditCount: params.totalAuditCount ?? params.audits.length,
        pagination: params.pagination ?? null,
        audits: params.audits,
      },
      null,
      2
    );
  }

  const lines = [
    '# Custom Task Metadata Revert Audits',
    '',
    `Generated At: ${generatedAt}`,
    `Project: ${params.projectKey}`,
    `Plan: ${params.planId}`,
    `Scope: ${params.scope}`,
    ...(params.task
      ? [`Task: ${params.task.taskId}`, `Title: ${params.task.title}`]
      : [`Task Count: ${params.taskCount ?? 0}`]),
    ...(params.counts
      ? [
          `Total Edits: ${params.counts.edits}`,
          `Reverts: ${params.counts.reverts}`,
          `Stale Confirmed: ${params.counts.staleConfirmed}`,
        ]
      : []),
    `Filter: ${params.filter}`,
    `Export Scope: ${params.exportScope ?? 'page'}`,
    `Audit Count: ${params.audits.length}`,
    `Total Audit Count: ${params.totalAuditCount ?? params.audits.length}`,
    ...(params.pagination
      ? [
          `Limit: ${params.pagination.limit}`,
          `Offset: ${params.pagination.offset}`,
          `Has More: ${params.pagination.hasMore ? 'true' : 'false'}`,
          `Next Offset: ${params.pagination.nextOffset ?? 'none'}`,
        ]
      : []),
    '',
    '## Revert Audits',
    '',
  ];

  if (params.audits.length === 0) {
    lines.push('- No revert audit entries recorded.');
  } else {
    for (const entry of params.audits) {
      lines.push(
        `### ${entry.field}`,
        '',
        ...(entry.task
          ? [
              `- taskId: ${entry.task.taskId}`,
              `- taskTitle: ${entry.task.title}`,
              `- taskStatus: ${entry.task.status}`,
            ]
          : []),
        `- id: ${entry.id}`,
        `- changedAt: ${entry.changedAt}`,
        `- before: ${entry.before ?? 'none'}`,
        `- after: ${entry.after ?? 'none'}`,
        `- revertedChangeId: ${entry.revertedChangeId ?? 'none'}`,
        `- staleConfirmed: ${entry.staleRevertConfirmation ? 'true' : 'false'}`
      );

      if (entry.staleRevertConfirmation) {
        lines.push(
          `- confirmedAt: ${entry.staleRevertConfirmation.confirmedAt}`,
          `- confirmedByUserId: ${entry.staleRevertConfirmation.confirmedByUserId}`,
          `- confirmedByEmail: ${entry.staleRevertConfirmation.confirmedByEmail}`,
          `- reason: ${entry.staleRevertConfirmation.reason}`,
          `- blockedField: ${entry.staleRevertConfirmation.blocker.field}`,
          `- currentValueAtBlock: ${entry.staleRevertConfirmation.blocker.currentValue ?? 'none'}`,
          `- revertToValue: ${entry.staleRevertConfirmation.blocker.revertToValue ?? 'none'}`,
          `- laterChangeIds: ${entry.staleRevertConfirmation.blocker.laterChangeIds.join(', ') || 'none'}`,
          ...(entry.staleRevertConfirmation.policySnapshot
            ? [
                `- policyId: ${entry.staleRevertConfirmation.policySnapshot.policyId}`,
                `- policySource: ${entry.staleRevertConfirmation.policySnapshot.source}`,
                `- policyAllowedRoles: ${entry.staleRevertConfirmation.policySnapshot.allowedRoles.join(', ')}`,
                `- policyEvaluatedRole: ${entry.staleRevertConfirmation.policySnapshot.evaluatedRole}`,
                `- policyAllowed: ${entry.staleRevertConfirmation.policySnapshot.allowed ? 'true' : 'false'}`,
              ]
            : [])
        );
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

export function createCustomTaskMetadataHistoryReportFilename(params: {
  projectKey: string;
  planId: string;
  taskId: string;
  format: CustomTaskMetadataHistoryReportFormat;
}) {
  const extension = params.format === 'json' ? 'json' : 'md';
  const safeProjectKey = (params.projectKey || 'untitled_project').replace(/[^a-z0-9_-]/gi, '_');
  const safeTaskId = params.taskId.replace(/[^a-z0-9_-]/gi, '_');
  return `${safeProjectKey}-${params.planId}-${safeTaskId}-metadata-history.${extension}`;
}

export function createCustomTaskMetadataRevertAuditReportFilename(params: {
  projectKey: string;
  planId: string;
  taskId?: string;
  format: CustomTaskMetadataHistoryReportFormat;
}) {
  const extension = params.format === 'json' ? 'json' : 'md';
  const safeProjectKey = (params.projectKey || 'untitled_project').replace(/[^a-z0-9_-]/gi, '_');
  const safeTaskId = (params.taskId || 'planner').replace(/[^a-z0-9_-]/gi, '_');
  return `${safeProjectKey}-${params.planId}-${safeTaskId}-metadata-revert-audits.${extension}`;
}
