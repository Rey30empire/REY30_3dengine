import {
  createAgenticId,
  type ActionableRecommendation,
  type AgentRole,
  type IntentObjective,
  type TaskPlan,
  type TaskStep,
  type UserIntent,
  type UserIntentDomain,
} from '../schemas';

const DOMAIN_AGENT: Record<UserIntentDomain, AgentRole> = {
  scene: 'scene_architect',
  layout: 'scene_architect',
  entity: 'modeling',
  modeling: 'modeling',
  material: 'modeling',
  lighting: 'lighting_environment',
  environment: 'lighting_environment',
  physics: 'physics',
  animation: 'animation',
  gameplay: 'gameplay',
  asset: 'technical_integration',
  build: 'technical_integration',
  maintenance: 'maintenance',
};

function titleForObjective(objective: IntentObjective): string {
  const titles: Partial<Record<UserIntentDomain, string>> = {
    scene: 'Prepare scene',
    layout: 'Reorganize scene layout',
    environment: 'Configure environment',
    lighting: 'Adjust lighting',
    entity: 'Create entity content',
    gameplay: 'Add gameplay behavior',
    physics: 'Configure physics',
    animation: 'Create animation',
    build: 'Validate build',
    maintenance: 'Run maintenance pass',
  };
  return titles[objective.domain] ?? objective.description;
}

function createAmbiguityInspectionObjective(intent: UserIntent, scope: 'scene' | 'world'): IntentObjective {
  return {
    id: createAgenticId('objective'),
    domain: 'maintenance',
    description:
      scope === 'scene'
        ? `Analyze current scene before any mutation because the request is ambiguous. Original request: ${intent.normalizedInput}`
        : `Inspect global world state because the request does not map to a known agentic operation. Original request: ${intent.normalizedInput}`,
    priority: 'critical',
    requiredEvidence: [scope === 'scene' ? 'scene.analyze' : 'world.inspect'],
  };
}

export class TaskPlanner {
  buildExecutionPlan(intent: UserIntent, iteration = 1): TaskPlan {
    const timestamp = new Date().toISOString();
    const inspectionScope = intent.objectives.length ? 'scene' : 'world';
    const objectives = [
      ...(intent.ambiguities.length ? [createAmbiguityInspectionObjective(intent, inspectionScope)] : []),
      ...(intent.objectives.length ? intent.objectives : []),
    ];
    const executableObjectives = objectives.length ? objectives : [createAmbiguityInspectionObjective(intent, 'world')];

    const steps: TaskStep[] = [];
    for (const objective of executableObjectives) {
      const previousStepId = steps.at(-1)?.id;
      const stepId = createAgenticId('step');
      steps.push({
        id: stepId,
        title:
          objective.requiredEvidence.includes('scene.analyze')
            ? 'Analyze scene before mutation'
            : objective.requiredEvidence.includes('world.inspect')
              ? 'Inspect world before mutation'
            : titleForObjective(objective),
        description: `${objective.description} Original request: ${intent.normalizedInput}`,
        domain: objective.domain,
        requiredCapabilities: [...objective.requiredEvidence],
        acceptanceCriteria: [
          ...objective.requiredEvidence.map((evidence) => `Evidence from ${evidence} must exist.`),
          objective.description,
        ],
        dependsOn: previousStepId ? [previousStepId] : [],
        agentRole: DOMAIN_AGENT[objective.domain],
        status: 'pending',
      });
    }

    return {
      id: createAgenticId('plan'),
      intentId: intent.id,
      iteration,
      status: 'ready',
      steps,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  assignAgentsToSteps(plan: TaskPlan): TaskPlan {
    const steps = plan.steps.map((step) => ({
      ...step,
      agentRole: step.agentRole ?? DOMAIN_AGENT[step.domain],
    }));

    return {
      ...plan,
      steps,
      updatedAt: new Date().toISOString(),
    };
  }

  buildExecutionPlanFromRecommendations(
    intent: UserIntent,
    recommendations: ActionableRecommendation[],
    iteration = 1
  ): TaskPlan {
    const timestamp = new Date().toISOString();
    const hasApprovedRecommendations = recommendations.some(
      (recommendation) => recommendation.approvalStatus === 'approved'
    );
    const rankedRecommendations = [...recommendations]
      .filter((recommendation) => recommendation.approvalStatus !== 'rejected')
      .filter((recommendation) => !hasApprovedRecommendations || recommendation.approvalStatus === 'approved')
      .filter((recommendation) => recommendation.confidence >= 0.5)
      .sort((left, right) => {
        const priorityScore: Record<ActionableRecommendation['priority'], number> = {
          critical: 3,
          normal: 2,
          optional: 1,
        };
        return (
          priorityScore[right.priority] - priorityScore[left.priority] ||
          right.confidence - left.confidence
        );
      });

    const steps = rankedRecommendations.map((recommendation): TaskStep => ({
      id: createAgenticId('step'),
      title: `Apply recommendation: ${recommendation.summary}`,
      description: `${recommendation.rationale}. Original request: ${intent.normalizedInput}`,
      domain: recommendation.suggestedDomain,
      requiredCapabilities: recommendation.suggestedToolNames.length
        ? [...recommendation.suggestedToolNames]
        : [...recommendation.suggestedCapabilities],
      acceptanceCriteria: [
        `Recommendation ${recommendation.id} must be addressed.`,
        `Confidence ${recommendation.confidence.toFixed(2)} from ${recommendation.sourceToolName}.`,
      ],
      dependsOn: [],
      agentRole: DOMAIN_AGENT[recommendation.suggestedDomain],
      status: 'pending',
    }));

    return {
      id: createAgenticId('plan'),
      intentId: intent.id,
      iteration,
      status: 'ready',
      steps,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}
