import { createHash } from 'crypto';
import type { AgenticRecommendationMutationIndex } from './requestClient';

export type AgenticRecommendationMutationIndexReportFormat = 'json' | 'markdown';
export type AgenticRecommendationMutationIndexAuditReportFormat = AgenticRecommendationMutationIndexReportFormat;
export type AgenticRecommendationMutationIndexChecksum = {
  algorithm: 'sha256';
  value: string;
  updatedAt?: string;
};
export type AgenticRecommendationMutationIndexIntegrity = {
  valid: boolean;
  status: 'valid' | 'mismatch' | 'missing';
  stored: AgenticRecommendationMutationIndexChecksum | null;
  computed: AgenticRecommendationMutationIndexChecksum;
};

function sortedObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedObject);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((next, key) => {
      next[key] = sortedObject((value as Record<string, unknown>)[key]);
      return next;
    }, {});
}

export function createAgenticRecommendationMutationIndexChecksum(
  index: AgenticRecommendationMutationIndex
): AgenticRecommendationMutationIndexChecksum {
  const { checksum: _storedChecksum, ...indexWithoutChecksum } = index;
  return {
    algorithm: 'sha256',
    value: createHash('sha256').update(JSON.stringify(sortedObject(indexWithoutChecksum))).digest('hex'),
  };
}

export function createAgenticRecommendationMutationIndexIntegrity(
  index: AgenticRecommendationMutationIndex,
  options?: { requireStoredChecksum?: boolean }
): AgenticRecommendationMutationIndexIntegrity {
  const computed = createAgenticRecommendationMutationIndexChecksum(index);
  const stored = index.checksum ?? null;
  const hasRecommendations = Object.keys(index.recommendations).length > 0;
  const valid =
    !stored && (!hasRecommendations || options?.requireStoredChecksum !== true)
      ? true
      : Boolean(stored && stored.algorithm === computed.algorithm && stored.value === computed.value);
  const status: AgenticRecommendationMutationIndexIntegrity['status'] =
    valid ? 'valid' : stored ? 'mismatch' : 'missing';

  return {
    valid,
    stored,
    computed,
    status,
  };
}

function sanitizeFilenameSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agentic-recommendation-mutation-index';
}

export function createAgenticRecommendationMutationIndexReportObject(
  index: AgenticRecommendationMutationIndex,
  generatedAt = new Date().toISOString()
) {
  const integrity = createAgenticRecommendationMutationIndexIntegrity(index);
  const checksum = integrity.computed;
  const recommendations = Object.entries(index.recommendations).map(([key, entry]) => ({
    key,
    recommendationId: entry.recommendationId,
    recommendationKey: entry.recommendationKey,
    summary: entry.summary,
    executionCount: entry.executions.length,
    executions: entry.executions.map((execution) => ({
      executionId: execution.executionId,
      sourceExecutionId: execution.sourceExecutionId,
      partialRollbackAppliedAt: execution.partialRollbackAppliedAt,
      toolCallCount: execution.toolCalls.length,
      toolCalls: execution.toolCalls.map((toolCall) => ({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        evidenceIds: toolCall.evidenceIds,
        targetIds: toolCall.targetIds,
      })),
    })),
  }));

  return {
    reportVersion: 1,
    generatedAt,
    index: {
      version: index.version,
      projectKey: index.projectKey,
      slot: index.slot,
      updatedAt: index.updatedAt,
      recommendationCount: recommendations.length,
      checksum,
      storedChecksum: integrity.stored,
      checksumValid: integrity.valid,
      checksumStatus: integrity.status,
      integrityAuditCount: index.integrityAuditTrail?.length ?? 0,
      integrityAuditTrail: index.integrityAuditTrail ?? [],
    },
    recommendations,
  };
}

function createMarkdownReport(index: AgenticRecommendationMutationIndex, generatedAt: string) {
  const integrity = createAgenticRecommendationMutationIndexIntegrity(index);
  const checksum = integrity.computed;
  const lines = [
    '# Agentic Recommendation Mutation Index',
    '',
    `Generated: ${generatedAt}`,
    `Project: ${index.projectKey}`,
    `Slot: ${index.slot}`,
    `Updated: ${index.updatedAt}`,
    `Checksum: ${checksum.algorithm}:${checksum.value}`,
    `Stored Checksum: ${integrity.stored ? `${integrity.stored.algorithm}:${integrity.stored.value}` : 'none'}`,
    `Checksum Valid: ${integrity.valid ? 'yes' : 'no'} (${integrity.status})`,
    '',
    '## Integrity Audit Trail',
    '',
  ];

  const auditTrail = index.integrityAuditTrail ?? [];
  if (!auditTrail.length) {
    lines.push('- No integrity repair events recorded.');
  } else {
    for (const entry of auditTrail) {
      lines.push(`- ${entry.id}`);
      lines.push(`  - action: ${entry.action}`);
      lines.push(`  - actor: ${entry.actor}`);
      lines.push(`  - requestedBy: ${entry.requestedBy}`);
      lines.push(`  - repairedAt: ${entry.repairedAt}`);
      lines.push(`  - reason: ${entry.reason}`);
      lines.push(`  - previousIntegrityStatus: ${entry.previousIntegrityStatus}`);
      lines.push(`  - previousChecksum: ${entry.previousChecksum ? `${entry.previousChecksum.algorithm}:${entry.previousChecksum.value}` : 'none'}`);
      lines.push(`  - previousComputedChecksum: ${entry.previousComputedChecksum.algorithm}:${entry.previousComputedChecksum.value}`);
    }
  }

  lines.push(
    '',
    '## Recommendations',
    '',
  );

  const entries = Object.entries(index.recommendations);
  if (!entries.length) {
    lines.push('- No recommendation mutations indexed.');
    return lines.join('\n');
  }

  for (const [key, entry] of entries) {
    lines.push(`### ${key}`);
    lines.push('');
    lines.push(`- recommendationId: ${entry.recommendationId}`);
    lines.push(`- summary: ${entry.summary || 'none'}`);
    lines.push(`- executions: ${entry.executions.length}`);
    for (const execution of entry.executions) {
      lines.push(`  - executionId: ${execution.executionId}`);
      lines.push(`    - sourceExecutionId: ${execution.sourceExecutionId}`);
      lines.push(`    - partialRollbackAppliedAt: ${execution.partialRollbackAppliedAt ?? 'none'}`);
      for (const toolCall of execution.toolCalls) {
        lines.push(`    - ${key} -> ${toolCall.toolCallId}`);
        lines.push(`      - toolName: ${toolCall.toolName}`);
        lines.push(`      - evidenceIds: ${toolCall.evidenceIds.join(', ') || 'none'}`);
        lines.push(`      - targetIds: ${toolCall.targetIds.join(', ') || 'none'}`);
        for (const evidenceId of toolCall.evidenceIds) {
          lines.push(`      - chain: ${key} -> ${toolCall.toolCallId} -> ${evidenceId}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function createAgenticRecommendationMutationIndexReport(
  index: AgenticRecommendationMutationIndex,
  format: AgenticRecommendationMutationIndexReportFormat,
  generatedAt = new Date().toISOString()
) {
  if (format === 'json') {
    return JSON.stringify(
      createAgenticRecommendationMutationIndexReportObject(index, generatedAt),
      null,
      2
    );
  }
  return createMarkdownReport(index, generatedAt);
}

export function createAgenticRecommendationMutationIndexAuditReportObject(
  index: AgenticRecommendationMutationIndex,
  generatedAt = new Date().toISOString(),
  integrity = createAgenticRecommendationMutationIndexIntegrity(index, { requireStoredChecksum: true })
) {
  const recommendationCount = Object.keys(index.recommendations).length;
  return {
    reportVersion: 1,
    kind: 'agentic_recommendation_mutation_index_audit',
    generatedAt,
    recommendationCount,
    index: {
      version: index.version,
      projectKey: index.projectKey,
      slot: index.slot,
      updatedAt: index.updatedAt,
      recommendationCount,
      checksumValid: integrity.valid,
      checksumStatus: integrity.status,
      storedChecksum: integrity.stored,
      computedChecksum: integrity.computed,
    },
    integrityAuditCount: index.integrityAuditTrail?.length ?? 0,
    integrityAuditTrail: index.integrityAuditTrail ?? [],
  };
}

function createAuditMarkdownReport(
  index: AgenticRecommendationMutationIndex,
  generatedAt: string,
  integrity = createAgenticRecommendationMutationIndexIntegrity(index, { requireStoredChecksum: true })
) {
  const recommendationCount = Object.keys(index.recommendations).length;
  const lines = [
    '# Agentic Recommendation Mutation Index Audit',
    '',
    `Generated: ${generatedAt}`,
    `Project: ${index.projectKey}`,
    `Slot: ${index.slot}`,
    `Updated: ${index.updatedAt}`,
    `Recommendation Count: ${recommendationCount}`,
    `Checksum Valid: ${integrity.valid ? 'yes' : 'no'} (${integrity.status})`,
    `Stored Checksum: ${integrity.stored ? `${integrity.stored.algorithm}:${integrity.stored.value}` : 'none'}`,
    `Computed Checksum: ${integrity.computed.algorithm}:${integrity.computed.value}`,
    `Recommendations Indexed: ${recommendationCount}`,
    '',
    '## Integrity Audit Trail',
    '',
  ];

  const auditTrail = index.integrityAuditTrail ?? [];
  if (!auditTrail.length) {
    lines.push('- No integrity repair events recorded.');
    return lines.join('\n');
  }

  for (const entry of auditTrail) {
    lines.push(`- ${entry.id}`);
    lines.push(`  - action: ${entry.action}`);
    lines.push(`  - actor: ${entry.actor}`);
    lines.push(`  - requestedBy: ${entry.requestedBy}`);
    lines.push(`  - repairedAt: ${entry.repairedAt}`);
    lines.push(`  - reason: ${entry.reason}`);
    lines.push(`  - previousIntegrityStatus: ${entry.previousIntegrityStatus}`);
    lines.push(`  - previousChecksum: ${entry.previousChecksum ? `${entry.previousChecksum.algorithm}:${entry.previousChecksum.value}` : 'none'}`);
    lines.push(`  - previousComputedChecksum: ${entry.previousComputedChecksum.algorithm}:${entry.previousComputedChecksum.value}`);
  }

  return lines.join('\n');
}

export function createAgenticRecommendationMutationIndexAuditReport(
  index: AgenticRecommendationMutationIndex,
  format: AgenticRecommendationMutationIndexAuditReportFormat,
  generatedAt = new Date().toISOString(),
  integrity = createAgenticRecommendationMutationIndexIntegrity(index, { requireStoredChecksum: true })
) {
  if (format === 'json') {
    return JSON.stringify(
      createAgenticRecommendationMutationIndexAuditReportObject(index, generatedAt, integrity),
      null,
      2
    );
  }
  return createAuditMarkdownReport(index, generatedAt, integrity);
}

export function createAgenticRecommendationMutationIndexReportFilename(
  index: AgenticRecommendationMutationIndex,
  format: AgenticRecommendationMutationIndexReportFormat
) {
  const extension = format === 'json' ? 'json' : 'md';
  return `${sanitizeFilenameSegment(index.projectKey)}-${sanitizeFilenameSegment(index.slot)}-recommendation-mutation-index.${extension}`;
}

export function createAgenticRecommendationMutationIndexAuditReportFilename(
  index: AgenticRecommendationMutationIndex,
  format: AgenticRecommendationMutationIndexAuditReportFormat
) {
  const extension = format === 'json' ? 'json' : 'md';
  return `${sanitizeFilenameSegment(index.projectKey)}-${sanitizeFilenameSegment(index.slot)}-recommendation-mutation-index-audit.${extension}`;
}
