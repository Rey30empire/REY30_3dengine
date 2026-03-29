// ============================================
// Agent Levels Registry
// ============================================

export type AgentLevelId = 'level1_copilot' | 'level2_basemesh' | 'level3_full_character';

export type AgentStageId =
  | 'prompt_interpretation'
  | 'concept_views'
  | 'base_mesh'
  | 'retopology'
  | 'uv_unwrap'
  | 'texturing'
  | 'auto_rig'
  | 'validation'
  | 'export';

export interface AgentUnit {
  id: string;
  name: string;
  description: string;
  tools: string[];
  skillTags: string[];
}

export interface AgentLevelSpec {
  id: AgentLevelId;
  name: string;
  goal: string;
  inputs: string[];
  outputs: string[];
  agents: AgentUnit[];
}

export interface PipelineStage {
  id: AgentStageId;
  title: string;
  owner: string;
  validationRules: string[];
}

export const AGENT_LEVELS: AgentLevelSpec[] = [
  {
    id: 'level1_copilot',
    name: 'Nivel 1 - Asistente de Modelado',
    goal: 'Copiloto que delega acciones y sugiere correcciones para trabajo manual/hibrido.',
    inputs: ['prompt', 'seleccion actual', 'referencias visuales opcionales'],
    outputs: ['concepto', 'hojas de referencia', 'sugerencias tecnicas', 'lista de tareas'],
    agents: [
      {
        id: 'agent_prompt_to_concept',
        name: 'Prompt to Concept Agent',
        description: 'Convierte texto a briefing tecnico de personaje.',
        tools: ['nlp.parse_prompt', 'style.profile_builder'],
        skillTags: ['concept', 'brief'],
      },
      {
        id: 'agent_reference_sheet',
        name: 'Reference Sheet Agent',
        description: 'Genera frente/lado/espalda y variantes visuales.',
        tools: ['image.generate_reference', 'palette.suggest'],
        skillTags: ['reference', 'design'],
      },
      {
        id: 'agent_anatomy',
        name: 'Anatomy Proportion Agent',
        description: 'Sugiere proporciones y escala para rig/animacion.',
        tools: ['anatomy.profile', 'ratio.validator'],
        skillTags: ['anatomy', 'proportions'],
      },
      {
        id: 'agent_topology',
        name: 'Topology Suggestion Agent',
        description: 'Propone flujo de loops y zonas de deformacion.',
        tools: ['mesh.topology_hint', 'deform.hotspots'],
        skillTags: ['topology', 'retopo'],
      },
      {
        id: 'agent_rig_validator',
        name: 'Rig Error Agent',
        description: 'Detecta errores de rig, nombres de huesos y pesos.',
        tools: ['rig.detect_issues', 'rig.auto_rename_bones'],
        skillTags: ['rig', 'weights'],
      },
      {
        id: 'agent_materials',
        name: 'Material Suggestion Agent',
        description: 'Sugiere materiales PBR y mapa de texturas.',
        tools: ['material.pbr_suggest', 'texture.map_plan'],
        skillTags: ['materials', 'texturing'],
      },
      {
        id: 'agent_orchestrator',
        name: 'Copilot Orchestrator Agent',
        description: 'Coordina subagentes y arma plan ejecutable.',
        tools: ['pipeline.plan', 'tasks.dispatch'],
        skillTags: ['orchestration'],
      },
    ],
  },
  {
    id: 'level2_basemesh',
    name: 'Nivel 2 - IA Generadora de Malla Base',
    goal: 'Generar malla base aproximada desde multiples tipos de entrada y preparar correccion.',
    inputs: ['texto', 'imagen', 'boceto', 'vista frontal/lateral', 'foto', 'modelo referencia'],
    outputs: ['base mesh', 'reporte de calidad', 'lista de correcciones'],
    agents: [
      {
        id: 'agent_mesh_generator',
        name: 'Base Mesh Generator Agent',
        description: 'Genera la malla base inicial segun estilo y uso.',
        tools: ['mesh.generate_base', 'mesh.scale_to_target'],
        skillTags: ['mesh', 'generation'],
      },
      {
        id: 'agent_mesh_corrector',
        name: 'Mesh Corrector Agent',
        description: 'Rellena huecos, corrige normales y prepara para retopo.',
        tools: ['mesh.fill_holes', 'mesh.fix_normals', 'mesh.smooth_regions'],
        skillTags: ['repair', 'cleanup'],
      },
      {
        id: 'agent_hybrid_review',
        name: 'Hybrid Review Agent',
        description: 'Marca zonas para correccion manual del usuario.',
        tools: ['mesh.annotate_regions', 'review.generate_checklist'],
        skillTags: ['hybrid', 'review'],
      },
    ],
  },
  {
    id: 'level3_full_character',
    name: 'Nivel 3 - IA Completa de Personaje',
    goal: 'Pipeline completo a personaje jugable/listo para integracion.',
    inputs: [
      'prompt',
      'estilo',
      'proporciones',
      'edad',
      'ropa',
      'raza',
      'accesorios',
      'LOD',
      'destino',
    ],
    outputs: ['mesh', 'uvs', 'texturas', 'rig', 'blendshapes', 'animaciones base'],
    agents: [
      {
        id: 'agent_character_pipeline_orchestrator',
        name: 'Character Pipeline Orchestrator',
        description: 'Coordina todos los stages del pipeline de personaje.',
        tools: ['pipeline.execute', 'pipeline.validate', 'pipeline.retry'],
        skillTags: ['orchestration', 'character'],
      },
      {
        id: 'agent_auto_retopo',
        name: 'Auto Retopo Agent',
        description: 'Limpia topologia para produccion.',
        tools: ['retopo.auto', 'retopo.preserve_silhouette'],
        skillTags: ['retopology'],
      },
      {
        id: 'agent_uv_texture',
        name: 'UV and Texturing Agent',
        description: 'Genera UVs y texturas por canal.',
        tools: ['uv.unwrap', 'texture.bake', 'texture.generate_pbr'],
        skillTags: ['uv', 'textures'],
      },
      {
        id: 'agent_rig_anim',
        name: 'Rig and Animation Agent',
        description: 'Genera rig, pesos y animaciones base.',
        tools: ['rig.auto', 'weights.auto', 'anim.generate_base_set'],
        skillTags: ['rig', 'animation'],
      },
      {
        id: 'agent_export',
        name: 'Export Agent',
        description: 'Prepara salida para engines y DCC.',
        tools: ['export.gltf', 'export.fbx', 'export.unity', 'export.unreal'],
        skillTags: ['export'],
      },
    ],
  },
];

export const CHARACTER_PIPELINE: PipelineStage[] = [
  {
    id: 'prompt_interpretation',
    title: 'Interpretacion del Prompt',
    owner: 'Copilot Orchestrator Agent',
    validationRules: ['tipo_personaje', 'estilo', 'uso_final', 'restricciones_tecnicas'],
  },
  {
    id: 'concept_views',
    title: 'Concept Art y Vistas',
    owner: 'Reference Sheet Agent',
    validationRules: ['frente_lado_espalda', 'paleta', 'variantes'],
  },
  {
    id: 'base_mesh',
    title: 'Base Mesh',
    owner: 'Base Mesh Generator Agent',
    validationRules: ['escala', 'silueta', 'proporciones'],
  },
  {
    id: 'retopology',
    title: 'Retopologia',
    owner: 'Auto Retopo Agent',
    validationRules: ['edge_flow', 'deform_zones', 'poly_budget'],
  },
  {
    id: 'uv_unwrap',
    title: 'UV Unwrap',
    owner: 'UV and Texturing Agent',
    validationRules: ['uv_overlap_ok', 'texel_density', 'seam_quality'],
  },
  {
    id: 'texturing',
    title: 'Texturizado',
    owner: 'UV and Texturing Agent',
    validationRules: ['pbr_maps', 'material_slots', 'resolution_target'],
  },
  {
    id: 'auto_rig',
    title: 'Rig Automatico',
    owner: 'Rig and Animation Agent',
    validationRules: ['bone_naming', 'weights', 'deformation_smoke_test'],
  },
  {
    id: 'validation',
    title: 'Validacion',
    owner: 'Rig Error Agent',
    validationRules: ['polycount', 'uv_errors', 'flipped_faces', 'unassigned_bones'],
  },
  {
    id: 'export',
    title: 'Exportacion',
    owner: 'Export Agent',
    validationRules: ['target_format', 'engine_compatibility', 'package_integrity'],
  },
];

export interface PipelinePlanInput {
  prompt: string;
  level: AgentLevelId;
  style?: string;
  target?: string;
  rigRequired?: boolean;
}

export interface PipelinePlanOutput {
  summary: string;
  selectedLevel: AgentLevelId;
  stages: Array<{
    stageId: AgentStageId;
    title: string;
    owner: string;
    status: 'pending';
  }>;
  checkpoints: string[];
}

export function createPipelinePlan(input: PipelinePlanInput): PipelinePlanOutput {
  const level = AGENT_LEVELS.find((entry) => entry.id === input.level) || AGENT_LEVELS[0];
  const style = input.style || 'auto';
  const target = input.target || 'game';
  const rig = input.rigRequired === false ? 'sin rig automatico' : 'con rig automatico';

  return {
    summary: `Plan ${level.name}: ${input.prompt}. Estilo=${style}, destino=${target}, ${rig}.`,
    selectedLevel: level.id,
    stages: CHARACTER_PIPELINE.map((stage) => ({
      stageId: stage.id,
      title: stage.title,
      owner: stage.owner,
      status: 'pending',
    })),
    checkpoints: [
      'No avanzar de etapa sin validacion de salida.',
      'Permitir override manual en cada etapa.',
      'Registrar diagnosticos para autocorreccion.',
    ],
  };
}
