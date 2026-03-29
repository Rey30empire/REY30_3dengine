export const ApiProvider = {
  OPENAI: 'OPENAI',
  MESHY: 'MESHY',
  RUNWAY: 'RUNWAY',
  OLLAMA: 'OLLAMA',
  VLLM: 'VLLM',
  LLAMACPP: 'LLAMACPP',
} as const;

export type AppApiProvider = (typeof ApiProvider)[keyof typeof ApiProvider];

export const BudgetApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELED: 'CANCELED',
} as const;

export type AppBudgetApprovalStatus =
  (typeof BudgetApprovalStatus)[keyof typeof BudgetApprovalStatus];

export const FinOpsRemediationStatus = {
  PROPOSED: 'PROPOSED',
  APPLIED: 'APPLIED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
} as const;

export type AppFinOpsRemediationStatus =
  (typeof FinOpsRemediationStatus)[keyof typeof FinOpsRemediationStatus];
