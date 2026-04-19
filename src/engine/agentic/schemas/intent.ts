import type { RiskLevel } from './common';

export type UserIntentAction =
  | 'create'
  | 'modify'
  | 'fix'
  | 'optimize'
  | 'validate'
  | 'export'
  | 'unknown';

export type UserIntentDomain =
  | 'scene'
  | 'layout'
  | 'entity'
  | 'modeling'
  | 'material'
  | 'lighting'
  | 'environment'
  | 'physics'
  | 'animation'
  | 'gameplay'
  | 'asset'
  | 'build'
  | 'maintenance';

export interface IntentObjective {
  id: string;
  domain: UserIntentDomain;
  description: string;
  priority: 'critical' | 'normal' | 'optional';
  requiredEvidence: string[];
}

export interface IntentConstraint {
  id: string;
  description: string;
  severity: 'hard' | 'soft';
}

export interface IntentAmbiguity {
  id: string;
  question: string;
  fallbackDecision: string;
}

export interface UserIntent {
  id: string;
  originalInput: string;
  normalizedInput: string;
  actions: UserIntentAction[];
  domains: UserIntentDomain[];
  objectives: IntentObjective[];
  constraints: IntentConstraint[];
  ambiguities: IntentAmbiguity[];
  riskLevel: RiskLevel;
  createdAt: string;
}
