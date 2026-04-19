import type {
  AgenticExecutionHistoryRecord,
  AgenticSemanticComponentChange,
} from './requestClient';

export type AgenticExecutionReportFormat = 'json' | 'markdown';

export type AgenticSemanticChangeGroup = {
  entityId: string;
  entityName: string;
  changes: AgenticSemanticComponentChange[];
};

export function groupAgenticSemanticChanges(
  changes: AgenticSemanticComponentChange[]
): AgenticSemanticChangeGroup[] {
  const groups = new Map<string, AgenticSemanticChangeGroup>();

  for (const change of changes) {
    const current = groups.get(change.entityId) ?? {
      entityId: change.entityId,
      entityName: change.entityName,
      changes: [],
    };
    current.changes.push(change);
    groups.set(change.entityId, current);
  }

  return [...groups.values()];
}

function reportList(values: string[], empty = 'none') {
  return values.length ? values.join(', ') : empty;
}

function reportNamedList(values: Array<{ name: string }>, empty = 'none') {
  return values.length ? values.map((value) => value.name).join(', ') : empty;
}

function sanitizeReportFilenameSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agentic-execution';
}

export function createAgenticExecutionReportFilename(
  record: AgenticExecutionHistoryRecord,
  format: AgenticExecutionReportFormat
) {
  const extension = format === 'json' ? 'json' : 'md';
  return `${sanitizeReportFilenameSegment(record.id)}-agentic-report.${extension}`;
}

export function createAgenticExecutionReportObject(
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
      action: record.action,
      sourceExecutionId: record.sourceExecutionId,
      prompt: record.prompt,
      approved: record.approved,
      status: record.status,
      iteration: record.iteration,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      artifactPath: record.artifactPath,
    },
    plan: {
      stepCount: record.stepCount,
      steps: record.steps ?? [],
      agentRoles: record.agentRoles ?? [],
    },
    tools: {
      names: record.toolNames ?? [],
      stats: record.toolStats ?? [],
      calls: record.toolCalls ?? [],
    },
    validation: record.validation,
    runtimeScaffold: record.runtimeScaffold,
    traces: record.traces ?? [],
    diff: record.diff,
    rollbackPreview: record.diff?.rollbackPreview ?? null,
  };
}

function createMarkdownReport(record: AgenticExecutionHistoryRecord, generatedAt: string) {
  const validation = record.validation;
  const diff = record.diff;
  const semanticGroups = groupAgenticSemanticChanges(diff?.semantic.componentChanges ?? []);
  const lines: string[] = [
    '# Agentic Execution Report',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Execution',
    '',
    `- ID: ${record.id}`,
    `- Project: ${record.projectKey}`,
    `- Slot: ${record.slot}`,
    `- Action: ${record.action}`,
    `- Source execution: ${record.sourceExecutionId ?? 'none'}`,
    `- Prompt: ${record.prompt}`,
    `- Status: ${record.status}`,
    `- Approved: ${record.approved ? 'yes' : 'no'}`,
    `- Iteration: ${record.iteration}`,
    `- Artifact: ${record.artifactPath ?? 'none'}`,
    '',
    '## Plan',
    '',
    `- Steps: ${record.stepCount}`,
    `- Agents: ${reportList(record.agentRoles ?? [])}`,
    '',
  ];

  for (const step of record.steps ?? []) {
    lines.push(`- [${step.status}] ${step.title} (${step.agentRole})`);
    lines.push(`  - Evidence: ${step.evidenceCount}`);
    lines.push(`  - Errors: ${step.errorCount}`);
  }

  lines.push('', '## Tools', '');
  for (const tool of record.toolStats ?? []) {
    lines.push(`- ${tool.name}: ${tool.successCount} success, ${tool.failureCount} failure`);
  }
  if (!(record.toolStats ?? []).length) {
    lines.push(`- ${reportList(record.toolNames ?? [])}`);
  }

  lines.push('', '## Tool Calls Raw Diff', '');
  if ((record.toolCalls ?? []).length) {
    for (const toolCall of record.toolCalls ?? []) {
      lines.push(`- ${toolCall.toolName} (${toolCall.callId}): ${toolCall.message}`);
      for (const evidence of (toolCall.evidence ?? []).slice(0, 5)) {
        lines.push(`  - ${evidence.type}: ${evidence.summary}`);
        if (evidence.before !== undefined || evidence.after !== undefined) {
          lines.push(
            `    - before: ${JSON.stringify(evidence.before ?? null)}`
          );
          lines.push(
            `    - after: ${JSON.stringify(evidence.after ?? null)}`
          );
        }
      }
    }
  } else {
    lines.push('- No stored tool call evidence.');
  }

  lines.push('', '## Validation', '');
  if (validation) {
    lines.push(`- Approved: ${validation.approved ? 'yes' : 'no'}`);
    lines.push(`- Confidence: ${Math.round(validation.confidence * 100)}%`);
    lines.push(`- Matched: ${reportList(validation.matchedRequirements)}`);
    lines.push(`- Missing: ${reportList(validation.missingRequirements)}`);
    lines.push(`- Incorrect: ${reportList(validation.incorrectOutputs)}`);
    lines.push(`- Retry: ${reportList(validation.retryInstructions)}`);
  } else {
    lines.push('- No validation report stored.');
  }

  lines.push('', '## Traces', '');
  if ((record.traces ?? []).length) {
    for (const trace of record.traces ?? []) {
      lines.push(`- [${trace.severity}] ${trace.eventType} (${trace.actor}): ${trace.message}`);
    }
  } else {
    lines.push('- No execution traces stored.');
  }

  lines.push('', '## Diff', '');
  if (diff) {
    lines.push(`- Has changes: ${diff.hasChanges ? 'yes' : 'no'}`);
    lines.push(`- Scenes: ${diff.counts.scenes.before} -> ${diff.counts.scenes.after}`);
    lines.push(`- Entities: ${diff.counts.entities.before} -> ${diff.counts.entities.after}`);
    lines.push(`- Assets: ${diff.counts.assets.before} -> ${diff.counts.assets.after}`);
    lines.push(`- Added entities: ${reportNamedList(diff.entities.added)}`);
    lines.push(`- Removed entities: ${reportNamedList(diff.entities.removed)}`);
    lines.push(`- Changed entities: ${reportNamedList(diff.entities.changed)}`);
  } else {
    lines.push('- No snapshot diff stored.');
  }

  lines.push('', '## Semantic Changes', '');
  if (semanticGroups.length) {
    for (const group of semanticGroups) {
      lines.push(`### ${group.entityName}`);
      for (const change of group.changes) {
        lines.push(`- ${change.summary}`);
        for (const fieldChange of change.fieldChanges ?? []) {
          lines.push(
            `  - ${change.component}.${fieldChange.field}: ${fieldChange.before} -> ${fieldChange.after}`
          );
        }
      }
      lines.push('');
    }
  } else {
    lines.push('- No semantic component changes.');
  }

  lines.push('## Rollback Preview', '');
  if (diff) {
    lines.push(`- Will remove entities: ${reportNamedList(diff.rollbackPreview.willRemove.entities)}`);
    lines.push(`- Will restore entities: ${reportNamedList(diff.rollbackPreview.willRestore.entities)}`);
    lines.push(`- Will revert entities: ${reportNamedList(diff.rollbackPreview.willRevert.entities)}`);
    lines.push(
      `- Will revert components: ${diff.rollbackPreview.willRevert.components
        .map((component) => component.summary)
        .join(' | ') || 'none'}`
    );
  } else {
    lines.push('- No rollback preview stored.');
  }

  return lines.join('\n');
}

export function createAgenticExecutionReport(
  record: AgenticExecutionHistoryRecord,
  format: AgenticExecutionReportFormat,
  generatedAt = new Date().toISOString()
) {
  if (format === 'json') {
    return JSON.stringify(createAgenticExecutionReportObject(record, generatedAt), null, 2);
  }

  return createMarkdownReport(record, generatedAt);
}
