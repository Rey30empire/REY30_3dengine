import type { AddonPermission } from '@/types/engine';

export type AddonTemplateCategory =
  | 'general'
  | 'animation'
  | 'modeling'
  | 'materials'
  | 'scripting'
  | 'ai'
  | 'workflow'
  | 'runtime';

export type AddonTemplateKind = 'tooling' | 'content-pack';

export interface AddonTemplateDefinition {
  id: string;
  name: string;
  version: string;
  author: string;
  kind: AddonTemplateKind;
  category: AddonTemplateCategory;
  description: string;
  summary: string;
  entryPoint: string;
  workspaceHints: string[];
  dependencies: string[];
  permissions: AddonPermission[];
  highlights: string[];
  coverage?: string[];
}

export const ADDON_INSTALL_TEMPLATES: AddonTemplateDefinition[] = [
  {
    id: 'animation_toolkit_starter',
    name: 'Animation Toolkit Starter',
    version: '1.0.0',
    author: 'REY30 Local Templates',
    kind: 'tooling',
    category: 'animation',
    description:
      'Addon base para flujos de animación. Sirve como punto de partida para rigs, clips, revisión de poses y herramientas de timeline.',
    summary: 'Plantilla para extender el workspace de animation con tooling reusable.',
    entryPoint: 'addon://templates/animation-toolkit-starter',
    workspaceHints: ['animation', 'scene'],
    dependencies: [],
    permissions: ['scene', 'assets', 'rendering'],
    highlights: [
      'pensado para clips, rig review y poses',
      'queda vinculado al workspace de animation',
      'base limpia para seguir creciendo sin tocar el shell',
    ],
    coverage: ['timeline tooling', 'rig review', 'pose workflows'],
  },
  {
    id: 'material_studio_essentials',
    name: 'Material Studio Essentials',
    version: '1.0.0',
    author: 'REY30 Local Templates',
    kind: 'tooling',
    category: 'materials',
    description:
      'Addon base para materiales, librerías y edición visual. Útil para organizar presets, colecciones de shaders y flujos de lookdev.',
    summary: 'Plantilla para ampliar el workspace de materiales y lookdev.',
    entryPoint: 'addon://templates/material-studio-essentials',
    workspaceHints: ['materials', 'scene'],
    dependencies: [],
    permissions: ['assets', 'rendering'],
    highlights: [
      'orientado a presets de material y lookdev',
      'encaja con asset browser y material editor',
      'sirve como base para colecciones grandes de materiales',
    ],
    coverage: ['lookdev tooling', 'material workflows', 'asset browser'],
  },
  {
    id: 'materials_core_pack',
    name: 'Materials Core Pack',
    version: '1.0.0',
    author: 'REY30 Content Packs',
    kind: 'content-pack',
    category: 'materials',
    description:
      'Pack base de materiales PBR para escenas y personajes. Organiza la librería grande de metales, superficies duras, orgánicos y materiales especiales en un addon instalable.',
    summary: 'Colección base de materiales para lookdev, scene dressing y characters.',
    entryPoint: 'addon://packs/materials-core',
    workspaceHints: ['materials', 'scene'],
    dependencies: [],
    permissions: ['assets', 'rendering'],
    highlights: [
      'pensado para la librería expandida de materiales del motor',
      'sirve como pack base para lookdev local sin setup extra',
      'encaja con el material picker y el asset browser',
    ],
    coverage: ['29 materiales base', 'metales', 'superficies duras', 'orgánicos', 'especiales'],
  },
  {
    id: 'vfx_core_pack',
    name: 'VFX Core Pack',
    version: '1.0.0',
    author: 'REY30 Content Packs',
    kind: 'content-pack',
    category: 'runtime',
    description:
      'Pack base de VFX para partículas, humo, fuego, clima, líquidos y efectos de combate. Resume la nueva librería de presets CPU/GPU del motor en un addon instalable.',
    summary: 'Colección base de presets de partículas y VFX para escena y gameplay.',
    entryPoint: 'addon://packs/vfx-core',
    workspaceHints: ['scene', 'materials'],
    dependencies: [],
    permissions: ['assets', 'rendering', 'scene'],
    highlights: [
      'aprovecha la librería extendida de partículas del editor',
      'pensado para escena, gameplay y ambientación rápida',
      'listo para crecer con presets GPU más pesados',
    ],
    coverage: ['40 presets VFX', 'fire/smoke', 'weather', 'liquids', 'shadow/frost/metal'],
  },
  {
    id: 'animation_starter_pack',
    name: 'Animation Starter Pack',
    version: '1.0.0',
    author: 'REY30 Content Packs',
    kind: 'content-pack',
    category: 'animation',
    description:
      'Pack de arranque para animación con foco en clips base, poses reutilizables y flujos de edición del timeline. Sirve para complementar el editor reforzado de animación.',
    summary: 'Punto de arranque para clips, poses y revisión rápida de rigs.',
    entryPoint: 'addon://packs/animation-starter',
    workspaceHints: ['animation', 'scene'],
    dependencies: [],
    permissions: ['assets', 'scene'],
    highlights: [
      'acompaña pose library, retarget y edición por bloques',
      'orientado a revisión rápida de rigs y clips',
      'útil como base para packs más especializados',
    ],
    coverage: ['starter clips', 'pose workflows', 'retarget review', 'timeline editing'],
  },
  {
    id: 'ambient_fx_pack',
    name: 'Ambient FX Pack',
    version: '1.0.0',
    author: 'REY30 Content Packs',
    kind: 'content-pack',
    category: 'workflow',
    description:
      'Pack de ambientación con foco en polvo, niebla, humo suave, nieve, chispas leves y partículas flotantes para poblar escenas sin montar VFX pesados a mano.',
    summary: 'Pack de ambiente para escenas, mood y motion dressing.',
    entryPoint: 'addon://packs/ambient-fx',
    workspaceHints: ['scene', 'materials'],
    dependencies: ['vfx_core_pack'],
    permissions: ['assets', 'rendering', 'scene'],
    highlights: [
      'orientado a dressing visual y atmosfera',
      'complementa materiales, lighting y world pipeline',
      'sirve para escenas locales y demos rápidas',
    ],
    coverage: ['ambient dust', 'mist', 'soft smoke', 'snow/floating motes', 'scene mood'],
  },
  {
    id: 'boss_arena_pack',
    name: 'Boss Arena Pack',
    version: '1.0.0',
    author: 'REY30 Scene Packs',
    kind: 'content-pack',
    category: 'runtime',
    description:
      'Pack tematico para montar arenas dramaticas con piso mineral, nucleo emissive/lava, humo oscuro, motes de sombra, luz de acento y camara de combate.',
    summary: 'Escena encadenada para boss fights, showcases dramaticos y demos de encounter.',
    entryPoint: 'addon://packs/boss-arena',
    workspaceHints: ['scene', 'materials', 'animation'],
    dependencies: ['materials_core_pack', 'vfx_core_pack'],
    permissions: ['assets', 'rendering', 'scene'],
    highlights: [
      'crea una arena lista para encounter o showcase',
      'combina materiales calientes con VFX oscuros',
      'sirve como base para demos de combate o bosses',
    ],
    coverage: ['arena floor', 'lava core', 'shadow fx', 'dramatic lighting', 'combat camera'],
  },
  {
    id: 'horror_fog_scene_pack',
    name: 'Horror Fog Scene Pack',
    version: '1.0.0',
    author: 'REY30 Scene Packs',
    kind: 'content-pack',
    category: 'workflow',
    description:
      'Pack tematico para escenas de horror con niebla densa, humo negro, motas oscuras, piso frio y luz ambiental inquietante.',
    summary: 'Escena encadenada para mood horror, suspense y demos atmosfericas.',
    entryPoint: 'addon://packs/horror-fog-scene',
    workspaceHints: ['scene', 'materials'],
    dependencies: ['ambient_fx_pack', 'vfx_core_pack'],
    permissions: ['assets', 'rendering', 'scene'],
    highlights: [
      'monta un set de horror sin armar VFX a mano',
      'ideal para cinematics, suspense y mood shots',
      'combina mist, black smoke y shadow motes',
    ],
    coverage: ['horror mist', 'black smoke', 'shadow ambience', 'cold floor', 'cinematic camera'],
  },
  {
    id: 'scifi_material_lab_pack',
    name: 'Sci-Fi Material Lab Pack',
    version: '1.0.0',
    author: 'REY30 Scene Packs',
    kind: 'content-pack',
    category: 'materials',
    description:
      'Pack tematico para lookdev sci-fi con laboratorio de materiales, props de mercurio, acrylic, aluminum y oro sobre una escena de presentacion.',
    summary: 'Escena encadenada para lookdev y revision de materiales sci-fi.',
    entryPoint: 'addon://packs/scifi-material-lab',
    workspaceHints: ['materials', 'scene'],
    dependencies: ['materials_core_pack'],
    permissions: ['assets', 'rendering', 'scene'],
    highlights: [
      'monta un lab de materiales listo para lookdev',
      'muestra superficies reflectivas, transparentes y premium',
      'sirve para screenshots y revision rapida de presets',
    ],
    coverage: ['mercury', 'acrylic', 'aluminum', 'gold accents', 'lookdev camera'],
  },
  {
    id: 'animation_demo_stage_pack',
    name: 'Animation Demo Stage Pack',
    version: '1.0.0',
    author: 'REY30 Scene Packs',
    kind: 'content-pack',
    category: 'animation',
    description:
      'Pack tematico para demos de animacion con stage, dos dummies con clips base, luz de presentacion y camara lista para revision.',
    summary: 'Escena encadenada para mostrar walk/run cycles y revisar rigs en contexto.',
    entryPoint: 'addon://packs/animation-demo-stage',
    workspaceHints: ['animation', 'scene'],
    dependencies: ['animation_starter_pack'],
    permissions: ['assets', 'scene', 'rendering'],
    highlights: [
      'crea un stage listo para demos de animacion',
      'monta dummies con walk y run cycles',
      'sirve para review visual de rigs y loops',
    ],
    coverage: ['walk demo', 'run demo', 'stage floor', 'presentation lighting', 'review camera'],
  },
];

export function findAddonTemplate(templateId: string): AddonTemplateDefinition | null {
  return ADDON_INSTALL_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function getAddonTemplatesByKind(kind: AddonTemplateKind): AddonTemplateDefinition[] {
  return ADDON_INSTALL_TEMPLATES.filter((template) => template.kind === kind);
}
