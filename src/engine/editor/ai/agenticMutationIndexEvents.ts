import type { AgenticMutationIndexAuditSummary } from './requestClient';

export const AGENTIC_SERVER_EXECUTION_PREFERENCE_EVENT =
  'rey30:agentic-server-execution-preference';
export const AGENTIC_MUTATION_INDEX_AUDIT_EVENT = 'rey30:agentic-mutation-index-audit';

export type AgenticServerExecutionPreferenceEvent = CustomEvent<{
  enabled: boolean;
}>;

export type AgenticMutationIndexAuditEvent = CustomEvent<{
  summary: AgenticMutationIndexAuditSummary | null;
}>;

export function notifyAgenticServerExecutionPreference(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(AGENTIC_SERVER_EXECUTION_PREFERENCE_EVENT, {
      detail: { enabled },
    })
  );
}

export function notifyAgenticMutationIndexAudit(
  summary: AgenticMutationIndexAuditSummary | null
) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(AGENTIC_MUTATION_INDEX_AUDIT_EVENT, {
      detail: { summary },
    })
  );
}
