import type { AgenticExecutionHistoryRecord } from './requestClient';

export type AgenticExecutionComparisonReportFormat = 'json' | 'markdown';

export type AgenticStringSetComparison = {
  shared: string[];
  onlyLeft: string[];
  onlyRight: string[];
};

export type AgenticExecutionComparison = {
  leftId: string;
  rightId: string;
  statusChanged: boolean;
  approvalChanged: boolean;
  artifactChanged: boolean;
  stepDelta: number;
  traceDelta: number;
  toolCallDelta: number;
  evidenceDelta: number;
  tools: AgenticStringSetComparison;
  agents: AgenticStringSetComparison;
  counts: {
    scenes: number;
    entities: number;
    assets: number;
  };
  semantic: AgenticStringSetComparison;
  validation: {
    confidenceDelta: number | null;
    missing: AgenticStringSetComparison;
    incorrect: AgenticStringSetComparison;
  };
};

function sortedUnique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function compareStringSets(left: string[], right: string[]): AgenticStringSetComparison {
  const leftSet = new Set(sortedUnique(left));
  const rightSet = new Set(sortedUnique(right));
  return {
    shared: [...leftSet].filter((value) => rightSet.has(value)).sort(),
    onlyLeft: [...leftSet].filter((value) => !rightSet.has(value)).sort(),
    onlyRight: [...rightSet].filter((value) => !leftSet.has(value)).sort(),
  };
}

function countAfter(record: AgenticExecutionHistoryRecord, key: 'scenes' | 'entities' | 'assets') {
  return record.diff?.counts[key].after ?? 0;
}

function evidenceCount(record: AgenticExecutionHistoryRecord) {
  return (record.toolCalls ?? []).reduce(
    (total, toolCall) => total + (toolCall.evidence ?? []).length,
    0
  );
}

export function compareAgenticExecutions(
  left: AgenticExecutionHistoryRecord,
  right: AgenticExecutionHistoryRecord
): AgenticExecutionComparison {
  const leftSemantic = left.diff?.semantic.componentChanges.map((change) => change.summary) ?? [];
  const rightSemantic = right.diff?.semantic.componentChanges.map((change) => change.summary) ?? [];
  const leftValidation = left.validation;
  const rightValidation = right.validation;

  return {
    leftId: left.id,
    rightId: right.id,
    statusChanged: left.status !== right.status,
    approvalChanged: left.approved !== right.approved,
    artifactChanged: (left.artifactPath ?? '') !== (right.artifactPath ?? ''),
    stepDelta: right.stepCount - left.stepCount,
    traceDelta: (right.traces ?? []).length - (left.traces ?? []).length,
    toolCallDelta: (right.toolCalls ?? []).length - (left.toolCalls ?? []).length,
    evidenceDelta: evidenceCount(right) - evidenceCount(left),
    tools: compareStringSets(left.toolNames ?? [], right.toolNames ?? []),
    agents: compareStringSets(left.agentRoles ?? [], right.agentRoles ?? []),
    counts: {
      scenes: countAfter(right, 'scenes') - countAfter(left, 'scenes'),
      entities: countAfter(right, 'entities') - countAfter(left, 'entities'),
      assets: countAfter(right, 'assets') - countAfter(left, 'assets'),
    },
    semantic: compareStringSets(leftSemantic, rightSemantic),
    validation: {
      confidenceDelta:
        leftValidation && rightValidation
          ? rightValidation.confidence - leftValidation.confidence
          : null,
      missing: compareStringSets(
        leftValidation?.missingRequirements ?? [],
        rightValidation?.missingRequirements ?? []
      ),
      incorrect: compareStringSets(
        leftValidation?.incorrectOutputs ?? [],
        rightValidation?.incorrectOutputs ?? []
      ),
    },
  };
}

function sanitizeFilenameSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'agentic-execution';
}

function list(values: string[], empty = 'none') {
  return values.length ? values.join(', ') : empty;
}

function compactExecution(record: AgenticExecutionHistoryRecord) {
  return {
    id: record.id,
    prompt: record.prompt,
    status: record.status,
    approved: record.approved,
    iteration: record.iteration,
    artifactPath: record.artifactPath,
    stepCount: record.stepCount,
    toolNames: record.toolNames,
    agentRoles: record.agentRoles,
    traceCount: (record.traces ?? []).length,
    toolCallCount: (record.toolCalls ?? []).length,
    evidenceCount: evidenceCount(record),
    validation: record.validation,
    diffCounts: record.diff?.counts ?? null,
  };
}

export function createAgenticExecutionComparisonReportObject(
  left: AgenticExecutionHistoryRecord,
  right: AgenticExecutionHistoryRecord,
  generatedAt = new Date().toISOString()
) {
  return {
    reportVersion: 1,
    generatedAt,
    comparison: compareAgenticExecutions(left, right),
    left: {
      execution: compactExecution(left),
      traces: left.traces ?? [],
      toolCalls: left.toolCalls ?? [],
      semanticChanges: left.diff?.semantic.componentChanges ?? [],
    },
    right: {
      execution: compactExecution(right),
      traces: right.traces ?? [],
      toolCalls: right.toolCalls ?? [],
      semanticChanges: right.diff?.semantic.componentChanges ?? [],
    },
  };
}

function createMarkdownComparisonReport(
  left: AgenticExecutionHistoryRecord,
  right: AgenticExecutionHistoryRecord,
  generatedAt: string
) {
  const comparison = compareAgenticExecutions(left, right);
  const lines = [
    '# Agentic Execution Comparison',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Executions',
    '',
    `- Left: ${left.id} (${left.status}, approved=${left.approved})`,
    `- Right: ${right.id} (${right.status}, approved=${right.approved})`,
    `- Left prompt: ${left.prompt}`,
    `- Right prompt: ${right.prompt}`,
    '',
    '## Summary',
    '',
    `- Status changed: ${comparison.statusChanged ? 'yes' : 'no'}`,
    `- Approval changed: ${comparison.approvalChanged ? 'yes' : 'no'}`,
    `- Artifact changed: ${comparison.artifactChanged ? 'yes' : 'no'}`,
    `- Step delta: ${comparison.stepDelta}`,
    `- Trace delta: ${comparison.traceDelta}`,
    `- Tool call delta: ${comparison.toolCallDelta}`,
    `- Evidence delta: ${comparison.evidenceDelta}`,
    `- Entity count delta: ${comparison.counts.entities}`,
    `- Asset count delta: ${comparison.counts.assets}`,
    `- Scene count delta: ${comparison.counts.scenes}`,
    '',
    '## Tools And Agents',
    '',
    `- Shared tools: ${list(comparison.tools.shared)}`,
    `- Only left tools: ${list(comparison.tools.onlyLeft)}`,
    `- Only right tools: ${list(comparison.tools.onlyRight)}`,
    `- Shared agents: ${list(comparison.agents.shared)}`,
    `- Only left agents: ${list(comparison.agents.onlyLeft)}`,
    `- Only right agents: ${list(comparison.agents.onlyRight)}`,
    '',
    '## Semantic Changes',
    '',
    `- Shared: ${list(comparison.semantic.shared)}`,
    `- Only left: ${list(comparison.semantic.onlyLeft)}`,
    `- Only right: ${list(comparison.semantic.onlyRight)}`,
    '',
    '## Validation',
    '',
    `- Confidence delta: ${comparison.validation.confidenceDelta ?? 'unknown'}`,
    `- Missing only left: ${list(comparison.validation.missing.onlyLeft)}`,
    `- Missing only right: ${list(comparison.validation.missing.onlyRight)}`,
    `- Incorrect only left: ${list(comparison.validation.incorrect.onlyLeft)}`,
    `- Incorrect only right: ${list(comparison.validation.incorrect.onlyRight)}`,
    '',
    '## Raw Tool Evidence',
    '',
  ];

  for (const [label, record] of [['Left', left], ['Right', right]] as const) {
    lines.push(`### ${label}`);
    const toolCalls = record.toolCalls ?? [];
    if (!toolCalls.length) {
      lines.push('- No stored tool calls.');
      continue;
    }
    for (const toolCall of toolCalls) {
      lines.push(`- ${toolCall.toolName} (${toolCall.callId}): ${toolCall.message}`);
      for (const evidence of (toolCall.evidence ?? []).slice(0, 5)) {
        lines.push(`  - ${evidence.type}: ${evidence.summary}`);
      }
    }
  }

  return lines.join('\n');
}

export function createAgenticExecutionComparisonReport(
  left: AgenticExecutionHistoryRecord,
  right: AgenticExecutionHistoryRecord,
  format: AgenticExecutionComparisonReportFormat,
  generatedAt = new Date().toISOString()
) {
  if (format === 'json') {
    return JSON.stringify(
      createAgenticExecutionComparisonReportObject(left, right, generatedAt),
      null,
      2
    );
  }
  return createMarkdownComparisonReport(left, right, generatedAt);
}

export function createAgenticExecutionComparisonReportFilename(
  left: AgenticExecutionHistoryRecord,
  right: AgenticExecutionHistoryRecord,
  format: AgenticExecutionComparisonReportFormat
) {
  const extension = format === 'json' ? 'json' : 'md';
  return `${sanitizeFilenameSegment(left.id)}-vs-${sanitizeFilenameSegment(right.id)}-agentic-comparison.${extension}`;
}
