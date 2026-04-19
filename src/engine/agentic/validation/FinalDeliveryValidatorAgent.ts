import {
  createAgenticId,
  type DeliveryDecision,
  type PipelineExecutionState,
  type RequirementSet,
  type ToolResult,
  type UserIntent,
  type ValidationReport,
  type WorldState,
} from '../schemas';

export interface ArtifactVerification {
  checked: boolean;
  exists: boolean;
  size?: number;
  resolvedPath?: string;
  error?: string;
}

export type ArtifactVerifier = (artifactPath: string) => ArtifactVerification;

const MUTATING_TOOL_EVIDENCE_CONTRACT_FAILED = 'MUTATING_TOOL_EVIDENCE_CONTRACT_FAILED';

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function hasSuccessfulTool(state: PipelineExecutionState, toolName: string): boolean {
  return state.toolResults.some((result) => result.success && result.toolName === toolName);
}

function hasSuccessfulWorldMutation(state: PipelineExecutionState): boolean {
  return state.toolResults.some((result) => result.success && result.mutatesWorld === true);
}

function activeScene(world: WorldState) {
  return world.activeSceneId ? world.scenes[world.activeSceneId] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function artifactRecords(result: ToolResult): Record<string, unknown>[] {
  const artifacts = result.output?.artifacts;
  if (!Array.isArray(artifacts)) {
    return [];
  }
  return artifacts.reduce<Record<string, unknown>[]>((records, artifact) => {
    if (isRecord(artifact)) {
      records.push(artifact);
    }
    return records;
  }, []);
}

function artifactPath(result: ToolResult): string {
  return typeof result.output?.artifactPath === 'string' ? result.output.artifactPath.trim() : '';
}

type ArtifactEvidenceStatus = 'valid' | 'metadata_missing' | 'file_missing';

function artifactEvidenceStatus(
  result: ToolResult,
  artifactVerifier?: ArtifactVerifier
): ArtifactEvidenceStatus {
  const path = artifactPath(result);
  const missingDeps = stringArray(result.output?.missingDeps);
  const primaryArtifacts = artifactRecords(result).filter((artifact) => {
    const kind = artifact.kind;
    const artifactFile = artifact.path;
    const size = artifact.size;
    return (
      (kind === 'bundle' || kind === 'installer' || kind === 'manifest') &&
      typeof artifactFile === 'string' &&
      artifactFile.trim().length > 0 &&
      typeof size === 'number' &&
      size > 0
    );
  });

  if (path.length === 0 || primaryArtifacts.length === 0 || missingDeps.length > 0) {
    return 'metadata_missing';
  }

  if (!artifactVerifier) {
    return 'valid';
  }

  const candidatePaths = unique([
    path,
    ...primaryArtifacts
      .map((artifact) => artifact.path)
      .filter((artifactFile): artifactFile is string => typeof artifactFile === 'string' && artifactFile.trim().length > 0),
  ]);
  const verified = candidatePaths.some((candidatePath) => {
    const verification = artifactVerifier(candidatePath);
    return verification.exists && (verification.size ?? 0) > 0;
  });

  return verified ? 'valid' : 'file_missing';
}

function successfulBuildExports(state: PipelineExecutionState): ToolResult[] {
  return state.toolResults.filter((result) => result.success && result.toolName === 'build.export');
}

export class FinalDeliveryValidatorAgent {
  constructor(private readonly artifactVerifier?: ArtifactVerifier) {}

  analyzeOriginalRequest(intent: UserIntent): RequirementSet {
    const explicitRequirements = intent.objectives;
    const implicitRequirements: string[] = [];
    const constraints = intent.constraints.map((constraint) => constraint.description);

    if (intent.objectives.some((objective) => objective.requiredEvidence.includes('script.create'))) {
      implicitRequirements.push('Gameplay scripts must be attached to an entity, not only created.');
    }
    if (intent.objectives.some((objective) => objective.requiredEvidence.includes('physics.addCollider'))) {
      implicitRequirements.push('Physics changes must leave a collider and rigidbody on the target entity.');
    }
    if (intent.objectives.some((objective) => objective.requiredEvidence.includes('build.export'))) {
      implicitRequirements.push('Build export must emit physical artifact metadata, not only a validation report.');
    }

    return {
      explicitRequirements,
      implicitRequirements,
      constraints,
      criticalRequirements: unique(
        explicitRequirements
          .filter((objective) => objective.priority === 'critical')
          .flatMap((objective) => objective.requiredEvidence)
      ),
    };
  }

  compareAgainstFinalState(
    requirements: RequirementSet,
    state: PipelineExecutionState,
    world: WorldState
  ): Pick<
    ValidationReport,
    'matchedRequirements' | 'missingRequirements' | 'incorrectOutputs' | 'warnings' | 'evidenceReviewed'
  > {
    const matchedRequirements: string[] = [];
    const missingRequirements: string[] = [];
    const incorrectOutputs: string[] = [];
    const warnings: string[] = [];
    const scene = activeScene(world);

    for (const objective of requirements.explicitRequirements) {
      for (const requiredEvidence of objective.requiredEvidence) {
        if (hasSuccessfulTool(state, requiredEvidence)) {
          matchedRequirements.push(requiredEvidence);
        } else if (
          requiredEvidence === 'scene.modify' &&
          (state.intent?.ambiguities.length ?? 0) > 0 &&
          hasSuccessfulWorldMutation(state)
        ) {
          matchedRequirements.push('scene.modify.via_approved_recommendation');
        } else {
          missingRequirements.push(requiredEvidence);
        }
      }
    }

    if (requirements.criticalRequirements.includes('environment.configureFog')) {
      if (scene?.environment.fog?.enabled) {
        matchedRequirements.push('world.fog.enabled');
      } else {
        missingRequirements.push('world.fog.enabled');
      }
    }

    if (requirements.criticalRequirements.includes('entity.create')) {
      const requiresNpc = requirements.explicitRequirements.some((objective) => {
        const description = objective.description.toLowerCase();
        return description.includes('npc') || description.includes('patrol') || description.includes('patrulla');
      });
      const hasRequiredEntity = requiresNpc
        ? Object.values(world.entities).some((entity) => entity.type === 'npc')
        : Object.values(world.entities).length > 0;
      if (hasRequiredEntity) {
        matchedRequirements.push(requiresNpc ? 'world.entity.npc' : 'world.entity.created');
      } else {
        missingRequirements.push(requiresNpc ? 'world.entity.npc' : 'world.entity.created');
      }
    }

    if (requirements.criticalRequirements.includes('script.attach')) {
      const npcWithScript = Object.values(world.entities).some(
        (entity) =>
          entity.type === 'npc' &&
          Object.values(entity.components).some((component) => component.type === 'Script')
      );
      if (npcWithScript) {
        matchedRequirements.push('world.npc.script_attached');
      } else {
        missingRequirements.push('world.npc.script_attached');
      }
    }

    if (
      requirements.criticalRequirements.includes('physics.addCollider') ||
      requirements.criticalRequirements.includes('physics.applyPreset')
    ) {
      const npcWithPhysics = Object.values(world.entities).some((entity) => {
        const componentTypes = Object.values(entity.components).map((component) => component.type);
        return entity.type === 'npc' && componentTypes.includes('Collider') && componentTypes.includes('Rigidbody');
      });
      if (npcWithPhysics) {
        matchedRequirements.push('world.npc.physics_ready');
      } else {
        missingRequirements.push('world.npc.physics_ready');
      }
    }

    if (requirements.criticalRequirements.includes('scene.groupObjects')) {
      if (scene && scene.layoutGroups.length > 0) {
        matchedRequirements.push('world.scene.layout_group');
      } else {
        missingRequirements.push('world.scene.layout_group');
      }
    }

    const requiresBuildExport = requirements.explicitRequirements.some((objective) =>
      objective.requiredEvidence.includes('build.export')
    );
    if (requiresBuildExport) {
      const exports = successfulBuildExports(state);
      const exportWithArtifacts = exports.find(
        (result) => artifactEvidenceStatus(result, this.artifactVerifier) === 'valid'
      );
      if (exportWithArtifacts) {
        matchedRequirements.push('build.artifact.physical');
        const exportedReport = Object.values(world.buildReports).find(
          (report) =>
            report.status === 'exported' &&
            report.artifactPath &&
            report.artifactPath === artifactPath(exportWithArtifacts)
        );
        if (exportedReport) {
          matchedRequirements.push('world.build_report.exported_artifact');
        } else {
          missingRequirements.push('world.build_report.exported_artifact');
        }
      } else if (exports.some((result) => artifactEvidenceStatus(result, this.artifactVerifier) === 'file_missing')) {
        incorrectOutputs.push('build.export.artifact_missing_on_disk');
      } else if (exports.length > 0) {
        incorrectOutputs.push('build.export.no_physical_artifacts');
      } else {
        missingRequirements.push('build.artifact.physical');
      }
    }

    const requiresDark = requirements.constraints.some((constraint) => constraint.includes('dark'));
    if (requiresDark && scene) {
      const tooBright = scene.environment.ambientIntensity > 0.35 || scene.environment.directionalLightIntensity > 0.65;
      if (tooBright || scene.environment.mood !== 'dark') {
        incorrectOutputs.push('world.environment.too_bright_for_dark_request');
      } else {
        matchedRequirements.push('world.environment.dark_mood');
      }
    }

    if (!state.stepResults.length) {
      incorrectOutputs.push('pipeline.no_steps_executed');
    }

    if (state.stepResults.some((step) => step.status === 'failed')) {
      warnings.push('Some pipeline steps failed before final validation.');
    }

    const evidenceContractFailures = state.toolResults.filter(
      (result) => result.error?.code === MUTATING_TOOL_EVIDENCE_CONTRACT_FAILED
    );
    if (evidenceContractFailures.length > 0) {
      incorrectOutputs.push(
        ...evidenceContractFailures.map((result) => `tool.evidence_contract_failed:${result.toolName}`)
      );
      warnings.push(
        ...evidenceContractFailures.map(
          (result) => `${result.toolName} failed the mutating tool before/after evidence contract.`
        )
      );
    }

    return {
      matchedRequirements: unique(matchedRequirements),
      missingRequirements: unique(missingRequirements),
      incorrectOutputs: unique(incorrectOutputs),
      warnings,
      evidenceReviewed: unique([
        ...state.toolResults.flatMap((result) => result.evidence.map((item) => item.id)),
        ...successfulBuildExports(state)
          .map((result) => artifactPath(result))
          .filter(Boolean)
          .map((path) => `artifact:${path}`),
      ]),
    };
  }

  generateValidationReport(
    requirements: RequirementSet,
    state: PipelineExecutionState,
    world: WorldState
  ): ValidationReport {
    const comparison = this.compareAgainstFinalState(requirements, state, world);
    const missingCritical = requirements.criticalRequirements.filter((requirement) =>
      comparison.missingRequirements.includes(requirement)
    );
    const approved = missingCritical.length === 0 && comparison.missingRequirements.length === 0 && comparison.incorrectOutputs.length === 0;
    const total =
      comparison.matchedRequirements.length +
      comparison.missingRequirements.length +
      comparison.incorrectOutputs.length;
    const confidence = total === 0 ? 0 : comparison.matchedRequirements.length / total;

    return {
      id: createAgenticId('validation'),
      approved,
      confidence: Number(confidence.toFixed(2)),
      ...comparison,
      retryInstructions: this.emitRetryInstructions(comparison.missingRequirements, comparison.incorrectOutputs),
      createdAt: new Date().toISOString(),
    };
  }

  approveOrReject(report: ValidationReport): DeliveryDecision {
    return {
      approved: report.approved,
      reportId: report.id,
      reason: report.approved
        ? 'Final state matches the requested requirements.'
        : 'Final state does not match the requested requirements.',
      nextPlanRequired: !report.approved,
      retryInstructions: report.retryInstructions,
    };
  }

  emitRetryInstructions(missingRequirements: string[], incorrectOutputs: string[]): string[] {
    const instructions = missingRequirements.map((requirement) => `Execute missing requirement: ${requirement}.`);
    if (incorrectOutputs.includes('world.environment.too_bright_for_dark_request')) {
      instructions.push('Lower ambient/directional light and set environment mood to dark.');
    }
    if (incorrectOutputs.includes('build.export.no_physical_artifacts')) {
      instructions.push('Run build.export again and require a bundle, installer, or manifest artifact with size metadata.');
    }
    if (incorrectOutputs.includes('build.export.artifact_missing_on_disk')) {
      instructions.push('Run build.export again because the reported artifact is missing or empty on disk.');
    }
    for (const output of incorrectOutputs) {
      if (output.startsWith('tool.evidence_contract_failed:')) {
        const toolName = output.slice('tool.evidence_contract_failed:'.length) || 'unknown tool';
        instructions.push(`Fix ${toolName} to emit before/after evidence before retrying.`);
      }
    }
    if (!instructions.length) {
      return [];
    }
    return unique(instructions);
  }
}
