import type { TaskPlan } from '../schemas';

export function collectPlanProblems(plan: TaskPlan): string[] {
  const problems: string[] = [];
  if (!plan.steps.length) {
    problems.push('Plan has no executable steps.');
  }
  for (const step of plan.steps) {
    if (!step.agentRole) {
      problems.push(`Step ${step.id} has no assigned agent.`);
    }
    if (!step.requiredCapabilities.length) {
      problems.push(`Step ${step.id} has no required capabilities.`);
    }
  }
  return problems;
}
