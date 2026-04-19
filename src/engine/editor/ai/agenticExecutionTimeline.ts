import type {
  AgenticExecutionHistoryRecord,
  AgenticExecutionToolCallEvidence,
} from './requestClient';

export type AgenticExecutionTimelinePhase =
  | 'intent'
  | 'plan'
  | 'agent'
  | 'tool'
  | 'memory'
  | 'approval'
  | 'diff'
  | 'validation'
  | 'trace';

export type AgenticExecutionTimelineItem = {
  id: string;
  phase: AgenticExecutionTimelinePhase;
  title: string;
  detail: string;
  status: 'ok' | 'warning' | 'error' | 'neutral';
  timestamp?: string;
  toolCallId?: string;
  mutatesWorld?: boolean | null;
  evidenceContract?: 'before_after' | 'none' | null;
  rawDiff?: AgenticExecutionToolCallEvidence[];
  rawInput?: Record<string, unknown> | null;
  rawOutput?: Record<string, unknown> | null;
  rawData?: Record<string, unknown> | null;
};

export type AgenticExecutionTimelineReportFormat = 'json' | 'markdown';

function phaseStatusFromApproved(approved: boolean): AgenticExecutionTimelineItem['status'] {
  return approved ? 'ok' : 'warning';
}

function summarizeDiff(record: AgenticExecutionHistoryRecord) {
  const diff = record.diff;
  if (!diff) return 'No snapshot diff stored.';
  const parts = [
    `entities ${diff.counts.entities.before}->${diff.counts.entities.after}`,
    `assets ${diff.counts.assets.before}->${diff.counts.assets.after}`,
    `semantic ${diff.semantic.componentChanges.length}`,
  ];
  return parts.join(', ');
}

export function createAgenticExecutionTimeline(
  record: AgenticExecutionHistoryRecord,
  options?: { includeAllTraces?: boolean }
): AgenticExecutionTimelineItem[] {
  const validation = record.validation;
  const failedTools = (record.toolStats ?? []).filter((tool) => tool.failureCount > 0);
  const toolCallItems = (record.toolCalls ?? []).map(
    (toolCall, index): AgenticExecutionTimelineItem => ({
      id: `tool-call-${toolCall.callId || index}`,
      phase: 'tool',
      title: `Tool call: ${toolCall.toolName}`,
      detail: `${toolCall.success ? 'success' : 'failed'}: ${toolCall.message}`,
      status: toolCall.success ? 'ok' : 'error',
      timestamp: toolCall.completedAt,
      toolCallId: toolCall.callId,
      mutatesWorld: toolCall.mutatesWorld,
      evidenceContract: toolCall.evidenceContract,
      rawDiff: toolCall.evidence ?? [],
      rawInput: toolCall.input,
      rawOutput: toolCall.output,
    })
  );
  const traceSource = options?.includeAllTraces ? (record.traces ?? []) : (record.traces ?? []).slice(-8);
  const traceItems = traceSource.map((trace, index): AgenticExecutionTimelineItem => ({
    id: `trace-${index}-${trace.timestamp}`,
    phase: 'trace',
    title: trace.eventType,
    detail: trace.message,
    status:
      trace.severity === 'error'
        ? 'error'
        : trace.severity === 'warn' || trace.severity === 'warning'
          ? 'warning'
          : 'neutral',
    timestamp: trace.timestamp,
    rawData: trace.data ?? null,
  }));
  const approvalItems = (record.traces ?? [])
    .filter((trace) => trace.eventType === 'recommendation.unlocked_mutation')
    .map((trace, index): AgenticExecutionTimelineItem => {
      const recommendationKeys = Array.isArray(trace.data?.approvedRecommendationKeys)
        ? trace.data.approvedRecommendationKeys.filter((item): item is string => typeof item === 'string')
        : [];
      const suggestedToolNames = Array.isArray(trace.data?.suggestedToolNames)
        ? trace.data.suggestedToolNames.filter((item): item is string => typeof item === 'string')
        : [];
      return {
        id: `approval-unlock-${index}-${trace.timestamp}`,
        phase: 'approval',
        title: 'Approved recommendation unlocked mutation',
        detail: `${trace.message}${recommendationKeys.length ? ` Recommendation: ${recommendationKeys.join(', ')}` : ''}${suggestedToolNames.length ? ` Tools: ${suggestedToolNames.join(', ')}` : ''}`,
        status: 'ok',
        timestamp: trace.timestamp,
        rawData: trace.data ?? null,
      };
    });
  const sharedMemory = record.sharedMemory;
  const memoryItems: AgenticExecutionTimelineItem[] = sharedMemory
    ? [
        {
          id: 'shared-memory',
          phase: 'memory',
          title: 'Shared memory',
          detail: `${sharedMemory.analyses.length} analysis record(s), ${sharedMemory.actionableRecommendations.length} recommendation(s)`,
          status: sharedMemory.actionableRecommendations.some((recommendation) => recommendation.approvalStatus === 'pending')
            ? 'warning'
            : sharedMemory.actionableRecommendations.length
              ? 'ok'
              : 'neutral',
        },
      ]
    : [];

  return [
    {
      id: 'intent',
      phase: 'intent',
      title: 'Intent',
      detail: record.prompt,
      status: 'neutral',
      timestamp: record.createdAt,
    },
    {
      id: 'plan',
      phase: 'plan',
      title: 'Plan',
      detail: `${record.stepCount} step(s): ${(record.steps ?? []).map((step) => step.title).join(' | ') || 'no stored steps'}`,
      status: record.stepCount > 0 ? 'ok' : 'warning',
      timestamp: record.createdAt,
    },
    {
      id: 'agent',
      phase: 'agent',
      title: 'Agent',
      detail: (record.agentRoles ?? []).join(', ') || 'No agent roles stored.',
      status: (record.agentRoles ?? []).length ? 'ok' : 'warning',
    },
    {
      id: 'tool',
      phase: 'tool',
      title: 'Tool',
      detail:
        (record.toolStats ?? [])
          .map((tool) => `${tool.name} ${tool.successCount}/${tool.failureCount}`)
          .join(', ') || 'No tool stats stored.',
      status: failedTools.length ? 'warning' : 'ok',
    },
    ...toolCallItems,
    ...memoryItems,
    ...approvalItems,
    {
      id: 'diff',
      phase: 'diff',
      title: 'Diff',
      detail: summarizeDiff(record),
      status: record.diff?.hasChanges ? 'ok' : 'neutral',
    },
    {
      id: 'validation',
      phase: 'validation',
      title: 'Validation',
      detail: validation
        ? `${validation.approved ? 'approved' : 'rejected'} at ${Math.round(validation.confidence * 100)}% confidence`
        : 'No validation report stored.',
      status: validation ? phaseStatusFromApproved(validation.approved) : 'warning',
      timestamp: record.completedAt,
    },
    ...traceItems,
  ];
}

function sanitizeFilenameSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agentic-execution';
}

export function createAgenticExecutionTimelineReportObject(
  record: AgenticExecutionHistoryRecord,
  generatedAt = new Date().toISOString()
) {
  return {
    reportVersion: 1,
    generatedAt,
    execution: {
      id: record.id,
      projectKey: record.projectKey,
      slot: record.slot,
      prompt: record.prompt,
      status: record.status,
      approved: record.approved,
      iteration: record.iteration,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    },
    timeline: createAgenticExecutionTimeline(record, { includeAllTraces: true }),
    traces: record.traces ?? [],
    sharedMemory: record.sharedMemory ?? { analyses: [], actionableRecommendations: [] },
    toolCalls: record.toolCalls ?? [],
  };
}

function formatValue(value: unknown) {
  if (value === undefined) return '(missing)';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function createMarkdownTimelineReport(record: AgenticExecutionHistoryRecord, generatedAt: string) {
  const lines = [
    '# Agentic Execution Timeline',
    '',
    `Generated: ${generatedAt}`,
    '',
    `Execution: ${record.id}`,
    `Prompt: ${record.prompt}`,
    `Status: ${record.status}`,
    `Approved: ${record.approved ? 'yes' : 'no'}`,
    '',
    '## Timeline',
    '',
  ];

  for (const item of createAgenticExecutionTimeline(record, { includeAllTraces: true })) {
    lines.push(`- [${item.phase}/${item.status}] ${item.title}: ${item.detail}`);
    if (item.timestamp) {
      lines.push(`  - timestamp: ${item.timestamp}`);
    }
    if (item.toolCallId) {
      lines.push(`  - toolCallId: ${item.toolCallId}`);
      lines.push(`  - mutatesWorld: ${item.mutatesWorld === true ? 'true' : item.mutatesWorld === false ? 'false' : 'unknown'}`);
      lines.push(`  - evidenceContract: ${item.evidenceContract ?? 'unknown'}`);
    }
    if (item.rawInput !== undefined) {
      lines.push(`  - input: ${formatValue(item.rawInput)}`);
    }
    if (item.rawOutput !== undefined) {
      lines.push(`  - output: ${formatValue(item.rawOutput)}`);
    }
    if (item.rawData) {
      lines.push(`  - data: ${formatValue(item.rawData)}`);
    }
    for (const evidence of item.rawDiff ?? []) {
      lines.push(`  - evidence ${evidence.id}: ${evidence.type} - ${evidence.summary}`);
      lines.push(`    - before: ${formatValue(evidence.before)}`);
      lines.push(`    - after: ${formatValue(evidence.after)}`);
    }
  }

  if (record.sharedMemory) {
    lines.push('', '## Shared Memory', '');
    lines.push(`- analyses: ${record.sharedMemory.analyses.length}`);
    lines.push(`- actionableRecommendations: ${record.sharedMemory.actionableRecommendations.length}`);
    for (const recommendation of record.sharedMemory.actionableRecommendations) {
      lines.push(
        `- [${recommendation.approvalStatus}] ${recommendation.summary} -> ${recommendation.suggestedToolNames.join(', ') || recommendation.suggestedDomain}`
      );
    }
  }

  return lines.join('\n');
}

export function createAgenticExecutionTimelineReport(
  record: AgenticExecutionHistoryRecord,
  format: AgenticExecutionTimelineReportFormat,
  generatedAt = new Date().toISOString()
) {
  if (format === 'json') {
    return JSON.stringify(createAgenticExecutionTimelineReportObject(record, generatedAt), null, 2);
  }
  return createMarkdownTimelineReport(record, generatedAt);
}

export function createAgenticExecutionTimelineReportFilename(
  record: AgenticExecutionHistoryRecord,
  format: AgenticExecutionTimelineReportFormat
) {
  const extension = format === 'json' ? 'json' : 'md';
  return `${sanitizeFilenameSegment(record.id)}-agentic-timeline.${extension}`;
}
