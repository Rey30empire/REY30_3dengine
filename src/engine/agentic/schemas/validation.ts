import type { IntentObjective } from './intent';

export interface RequirementSet {
  explicitRequirements: IntentObjective[];
  implicitRequirements: string[];
  constraints: string[];
  criticalRequirements: string[];
}

export interface ValidationReport {
  id: string;
  approved: boolean;
  confidence: number;
  matchedRequirements: string[];
  missingRequirements: string[];
  incorrectOutputs: string[];
  warnings: string[];
  retryInstructions: string[];
  evidenceReviewed: string[];
  createdAt: string;
}

export interface DeliveryDecision {
  approved: boolean;
  reportId: string;
  reason: string;
  nextPlanRequired: boolean;
  retryInstructions: string[];
}

export interface ValidationTrace {
  reportId: string;
  requirement: string;
  status: 'matched' | 'missing' | 'incorrect';
  evidenceIds: string[];
  message: string;
}
