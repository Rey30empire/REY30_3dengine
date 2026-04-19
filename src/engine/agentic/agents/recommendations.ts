import type { ActionableRecommendation, AgentContext, JsonObject } from '../schemas';

function rankedRecommendations(context?: AgentContext): ActionableRecommendation[] {
  const recommendations = context?.sharedMemory.actionableRecommendations ?? [];
  const usable = recommendations.filter((recommendation) => recommendation.approvalStatus !== 'rejected');
  const approved = usable.filter((recommendation) => recommendation.approvalStatus === 'approved');
  const source = approved.length ? approved : usable;
  const priorityScore: Record<ActionableRecommendation['priority'], number> = {
    critical: 3,
    normal: 2,
    optional: 1,
  };

  return [...source].sort(
    (left, right) =>
      priorityScore[right.priority] - priorityScore[left.priority] ||
      right.confidence - left.confidence
  );
}

export function findRecommendationForTool(
  context: AgentContext | undefined,
  toolName: string
): ActionableRecommendation | null {
  return (
    rankedRecommendations(context).find((recommendation) =>
      recommendation.suggestedToolNames.includes(toolName) ||
      recommendation.suggestedCapabilities.includes(toolName)
    ) ?? null
  );
}

export function recommendationInputForTool(
  context: AgentContext | undefined,
  toolName: string
): JsonObject | null {
  return findRecommendationForTool(context, toolName)?.input ?? null;
}
