import {
  createAgenticId,
  type IntentAmbiguity,
  type IntentConstraint,
  type IntentObjective,
  type UserIntent,
  type UserIntentAction,
  type UserIntentDomain,
} from '../schemas';
import { RequestNormalizer } from './RequestNormalizer';

interface ObjectiveRule {
  id: string;
  domain: UserIntentDomain;
  patterns: string[];
  description: string;
  priority: IntentObjective['priority'];
  requiredEvidence: string[];
}

const OBJECTIVE_RULES: ObjectiveRule[] = [
  {
    id: 'scene.create',
    domain: 'scene',
    patterns: ['crea una escena', 'crear escena', 'nueva escena', 'ciudad futurista'],
    description: 'Create or prepare a scene for the requested content.',
    priority: 'critical',
    requiredEvidence: ['scene.create'],
  },
  {
    id: 'scene.modify',
    domain: 'scene',
    patterns: ['modifica esta escena', 'modificar escena', 'modify this scene', 'ajusta esta escena'],
    description: 'Modify the active scene without creating unrelated content.',
    priority: 'critical',
    requiredEvidence: ['scene.modify'],
  },
  {
    id: 'modeling.city',
    domain: 'modeling',
    patterns: ['ciudad futurista', 'futuristic city', 'ciudad', 'city'],
    description: 'Create a simple futuristic city block with editable scene entities.',
    priority: 'critical',
    requiredEvidence: ['entity.create'],
  },
  {
    id: 'scene.layout',
    domain: 'layout',
    patterns: ['reorganiza', 'layout', 'organiza la escena', 'reordena'],
    description: 'Reorganize the scene layout and hierarchy.',
    priority: 'critical',
    requiredEvidence: ['scene.groupObjects'],
  },
  {
    id: 'environment.fog',
    domain: 'environment',
    patterns: ['niebla', 'fog', 'bruma'],
    description: 'Configure visible fog in the active scene.',
    priority: 'critical',
    requiredEvidence: ['environment.configureFog'],
  },
  {
    id: 'lighting.adjust',
    domain: 'lighting',
    patterns: ['iluminacion', 'luces', 'luz', 'demasiado iluminada', 'oscuro', 'dark'],
    description: 'Adjust scene lighting so it matches the requested mood.',
    priority: 'critical',
    requiredEvidence: ['lighting.adjustLight'],
  },
  {
    id: 'environment.dark',
    domain: 'environment',
    patterns: ['ambiente oscuro', 'oscuro', 'dark', 'demasiado iluminada'],
    description: 'Set the scene to a dark environment mood.',
    priority: 'critical',
    requiredEvidence: ['environment.changeSky', 'lighting.adjustLight'],
  },
  {
    id: 'entity.npc',
    domain: 'entity',
    patterns: ['npc', 'enemigo', 'personaje no jugador'],
    description: 'Create or update an NPC entity.',
    priority: 'critical',
    requiredEvidence: ['entity.create'],
  },
  {
    id: 'gameplay.patrol',
    domain: 'gameplay',
    patterns: ['patrulla', 'patrol'],
    description: 'Add a simple patrol behavior.',
    priority: 'critical',
    requiredEvidence: ['script.create', 'script.attach'],
  },
  {
    id: 'physics.collider',
    domain: 'physics',
    patterns: ['colision', 'colisiones', 'collider', 'rigidbody', 'fisica'],
    description: 'Ensure physical collision components are present and coherent.',
    priority: 'critical',
    requiredEvidence: ['physics.addCollider', 'physics.applyPreset'],
  },
  {
    id: 'animation.entrance',
    domain: 'animation',
    patterns: ['animacion de entrada', 'entrada animada', 'animation entrance'],
    description: 'Create and assign an entrance animation.',
    priority: 'normal',
    requiredEvidence: ['animation.createClip', 'animation.attachClip'],
  },
  {
    id: 'asset.optimize',
    domain: 'maintenance',
    patterns: ['optimiza', 'optimizar', 'corrige', 'repara'],
    description: 'Run a maintenance pass for consistency and repair.',
    priority: 'normal',
    requiredEvidence: ['asset.reindex'],
  },
  {
    id: 'build.export',
    domain: 'build',
    patterns: ['exporta', 'export', 'build', 'compila', 'empaqueta', 'package', 'validar export'],
    description: 'Validate and export the current scene.',
    priority: 'normal',
    requiredEvidence: ['build.validateScene', 'build.export'],
  },
];

const ACTION_RULES: Array<{ action: UserIntentAction; patterns: string[] }> = [
  { action: 'create', patterns: ['crea', 'crear', 'anade', 'añade', 'agrega', 'genera'] },
  { action: 'modify', patterns: ['modifica', 'cambia', 'mejora', 'ajusta', 'reorganiza'] },
  { action: 'fix', patterns: ['corrige', 'repara', 'arregla', 'fix'] },
  { action: 'optimize', patterns: ['optimiza', 'reduce', 'mejora rendimiento'] },
  { action: 'validate', patterns: ['valida', 'verifica', 'comprueba'] },
  { action: 'export', patterns: ['exporta', 'export', 'build', 'compila', 'empaqueta', 'package'] },
];

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function hasObjectiveWithEvidence(objectives: IntentObjective[], evidence: string): boolean {
  return objectives.some((objective) => objective.requiredEvidence.includes(evidence));
}

export class IntentAnalyzer {
  constructor(private readonly normalizer = new RequestNormalizer()) {}

  parseUserIntent(input: string): UserIntent {
    const normalizedInput = this.normalizer.normalize(input);
    const actions = unique(
      ACTION_RULES.filter((rule) => includesAny(normalizedInput, rule.patterns)).map((rule) => rule.action)
    );
    const objectives = OBJECTIVE_RULES.filter((rule) => includesAny(normalizedInput, rule.patterns)).map(
      (rule): IntentObjective => ({
        id: createAgenticId('objective'),
        domain: rule.domain,
        description: rule.description,
        priority: rule.priority,
        requiredEvidence: rule.requiredEvidence,
      })
    );
    const domains = unique(objectives.map((objective) => objective.domain));
    const constraints = this.extractConstraints(normalizedInput);
    const ambiguities = this.extractAmbiguities(normalizedInput, objectives);

    return {
      id: createAgenticId('intent'),
      originalInput: input,
      normalizedInput,
      actions: actions.length ? actions : ['unknown'],
      domains,
      objectives,
      constraints,
      ambiguities,
      riskLevel: this.resolveRiskLevel(objectives, ambiguities),
      createdAt: new Date().toISOString(),
    };
  }

  private extractConstraints(normalizedInput: string): IntentConstraint[] {
    const constraints: IntentConstraint[] = [];
    if (normalizedInput.includes('sin borrar') || normalizedInput.includes('no borres')) {
      constraints.push({
        id: createAgenticId('constraint'),
        description: 'Do not delete existing content.',
        severity: 'hard',
      });
    }
    if (normalizedInput.includes('oscuro') || normalizedInput.includes('dark')) {
      constraints.push({
        id: createAgenticId('constraint'),
        description: 'Final environment must remain dark and not over-lit.',
        severity: 'hard',
      });
    }
    if (normalizedInput.includes('simple')) {
      constraints.push({
        id: createAgenticId('constraint'),
        description: 'Prefer simple implementation over complex generated systems.',
        severity: 'soft',
      });
    }
    return constraints;
  }

  private extractAmbiguities(
    normalizedInput: string,
    objectives: IntentObjective[]
  ): IntentAmbiguity[] {
    const ambiguities: IntentAmbiguity[] = [];

    if (
      hasObjectiveWithEvidence(objectives, 'scene.modify') &&
      objectives.length === 1 &&
      includesAny(normalizedInput, ['modifica esta escena', 'modificar escena', 'ajusta esta escena'])
    ) {
      ambiguities.push({
        id: createAgenticId('ambiguity'),
        question: 'The request asks to modify the scene but does not specify what property, object, or layout should change.',
        fallbackDecision: 'Analyze the active scene first, then apply the smallest scene metadata mutation if validation still requires a change.',
      });
    }

    if (!objectives.length) {
      ambiguities.push({
        id: createAgenticId('ambiguity'),
        question: `The request "${normalizedInput}" does not map to a known agentic operation.`,
        fallbackDecision: 'Analyze the active scene without mutating the scene.',
      });
    }

    return ambiguities;
  }

  private resolveRiskLevel(
    objectives: IntentObjective[],
    ambiguities: IntentAmbiguity[]
  ): UserIntent['riskLevel'] {
    if (ambiguities.length) {
      return 'high';
    }
    if (objectives.some((objective) => objective.domain === 'build' || objective.domain === 'maintenance')) {
      return 'medium';
    }
    return 'low';
  }
}
