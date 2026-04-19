import type { EngineWorkflowMode } from '@/types/engine';

export type ModeGuide = {
  title: string;
  objective: string;
  steps: string[];
  copilotTips: string[];
};

export const MODE_AUTO_GUIDE: Record<EngineWorkflowMode, ModeGuide> = {
  MODE_MANUAL: {
    title: 'Manual: construcción controlada',
    objective: 'Crear escena/entidades/scripts sin depender de generación automática.',
    steps: [
      '1) Crea la escena base en Viewport + Hierarchy.',
      '2) Define entidades clave (player, terreno, enemigo, checkpoints).',
      '3) Abre Scrib Studio -> Create/Assign y agrega capacidades por entidad.',
      '4) Edita código en tab Edit y compila para validar errores.',
      '5) Ejecuta Render All + Play para prueba rápida del loop.',
    ],
    copilotTips: [
      'Si falla un script, corrige primero los avisos de revisión antes de agregar más lógica.',
      'Usa nombres claros por rol (Player_Main, Wolf_Enemy_01) para reducir confusiones.',
    ],
  },
  MODE_HYBRID: {
    title: 'Híbrido: IA + control humano',
    objective: 'Generar base con IA y refinar comportamiento en Scrib Studio.',
    steps: [
      '1) Genera base desde Hybrid/AI Chat (escena + entidades).',
      '2) Abre Scrib Studio y aplica Scribs por target (entity o scene).',
      '3) Ajusta config JSON para comportamiento fino (speed, jumpForce, patrolRadius).',
      '4) Reescribe el código del scrib abierto cuando necesites lógica exacta.',
      '5) Compila y prueba en Play para cerrar ciclo rápido.',
    ],
    copilotTips: [
      'Para gameplay, usa `.scrib.ts` en `scribs/` y no mezcles lógica de escena con scripts de arma.',
      'Cuando el target sea enemigo, prioriza `enemyBasic` y luego agrega daño/movimiento.',
    ],
  },
  MODE_AI_FIRST: {
    title: 'AI First: creación guiada por intención',
    objective: 'Construir una primera versión completa desde una sola instrucción.',
    steps: [
      '1) Escribe un prompt claro con objetivo y mecánicas.',
      '2) Espera mientras preparo la primera versión.',
      '3) Revisa el resultado en viewport y prueba la escena.',
      '4) Itera con ajustes cortos de tono, balance o layout.',
      '5) Si quieres control fino, cambia a Hybrid para editar detalles.',
    ],
    copilotTips: [
      'Incluye tipo de juego + enemigo + mecánica clave: “plataformas + lobo + salto”.',
      'Pide cambios en bloques pequeños para mantener consistencia entre iteraciones.',
    ],
  },
};

export type ScribGuideRow = {
  target: string;
  path: string;
  language: string;
  suggestedType: string;
  useCase: string;
};

export const SCRIB_HYBRID_GUIDE: ScribGuideRow[] = [
  {
    target: 'Player',
    path: 'scribs/player.movement.scrib.ts',
    language: 'TypeScript',
    suggestedType: 'characterBasic / movement',
    useCase: 'Movimiento, salto, cámara y entrada de usuario.',
  },
  {
    target: 'Enemy (Lobo)',
    path: 'scribs/wolf.enemy.scrib.ts',
    language: 'TypeScript',
    suggestedType: 'enemyBasic',
    useCase: 'Patrulla, persecución, daño y rango de ataque.',
  },
  {
    target: 'Weapon',
    path: 'scribs/weapon.logic.scrib.ts',
    language: 'TypeScript',
    suggestedType: 'weaponBasic / damage',
    useCase: 'Daño, cooldown, hitbox y feedback.',
  },
  {
    target: 'Terrain / Platform',
    path: 'scribs/terrain.rules.scrib.ts',
    language: 'TypeScript',
    suggestedType: 'terrainBasic',
    useCase: 'Checkpoints, zonas especiales y reglas del nivel.',
  },
  {
    target: 'Scene',
    path: 'scribs/scene.loop.scrib.ts',
    language: 'TypeScript',
    suggestedType: 'loop / lifecycle',
    useCase: 'Objetivos, victoria/derrota y estado global del juego.',
  },
];

export type SqlMigrationPlan = {
  level: 'bajo' | 'medio' | 'alto';
  estimate: string;
  notes: string[];
  phases: string[];
};

export const SQLITE_TO_SQL_PLAN: SqlMigrationPlan = {
  level: 'medio',
  estimate: '3 a 7 días si se migra a PostgreSQL con Prisma y pruebas completas.',
  notes: [
    'El proyecto ya usa Prisma, eso reduce el riesgo de cambio de motor.',
    'El mayor impacto está en datos existentes, índices, backups y rollout sin downtime.',
    'Cambiar a SQL Server/MySQL puede requerir ajustes de tipos y queries específicas.',
  ],
  phases: [
    'Fase 1: inventario de tablas, constraints y datos activos.',
    'Fase 2: levantar nueva BD SQL (PostgreSQL recomendado) + variables de entorno.',
    'Fase 3: generar/aplicar migraciones Prisma y validar integridad.',
    'Fase 4: migrar datos (dump/import) y ejecutar suite de pruebas completa.',
    'Fase 5: cutover controlado con plan de rollback y monitoreo de errores.',
  ],
};

export type ImplementationRoadmapItem = {
  id: string;
  area: string;
  status: '100%' | 'en progreso' | 'pendiente';
  progress: number;
  done: string[];
  remaining: string[];
};

export const REY30_IMPLEMENTATION_ROADMAP: ImplementationRoadmapItem[] = [
  {
    id: 'runtime-scribs',
    area: 'Scrib Runtime + Render All',
    status: '100%',
    progress: 100,
    done: [
      'ScribRuntime ejecuta scene/global/entity scribs reales.',
      'Baseline movement/collider/cameraFollow con compile/review.',
      'Render All conectado a composeRuntimePlan y runtime start/update.',
    ],
    remaining: ['Ampliar librería de scribs base con más géneros de juego.'],
  },
  {
    id: 'fault-ledger',
    area: 'Runtime Fault Ledger',
    status: '100%',
    progress: 100,
    done: [
      'Ledger compacto por severidad P0/P1/P2.',
      'Snapshots forenses por sesión runtime.',
      'Diff histórico, timeline por target y export CSV/JSON.',
    ],
    remaining: ['Añadir búsqueda full-text si el volumen de snapshots crece mucho.'],
  },
  {
    id: 'admin-forensics',
    area: 'Admin Runtime Forensics',
    status: '100%',
    progress: 100,
    done: [
      'Página admin separada.',
      'Audit prune, notifications, timeline unificado y filtros.',
      'Retención/prune configurable para snapshots, notifications y webhook history.',
    ],
    remaining: ['Pulir visualizaciones de largo plazo con gráficas agregadas.'],
  },
  {
    id: 'webhook-prometheus',
    area: 'Webhook + Prometheus/SLO',
    status: '100%',
    progress: 100,
    done: [
      'Webhook configurable con allowlist, retry/backoff e historial.',
      'Export CSV/JSON de delivery history y prune audit.',
      'Métrica Prometheus de webhook failure rate.',
      'SLO de scrape missing duration y admin notifications históricas.',
      'Endpoint dedicado /webhook/prune-audit.',
      'Auto-resolve de incidentes Prometheus missing cuando el scrape vuelve a OK.',
      'Probe externo Prometheus/Alertmanager con publicación al Overview.',
    ],
    remaining: ['Mantener endpoints reales configurados por entorno.'],
  },
  {
    id: 'editor-core',
    area: 'Editor 3D / escena / assets',
    status: 'en progreso',
    progress: 86,
    done: [
      'Shell de workspaces, Scene View, hierarchy, inspector y paneles principales.',
      'AI Chat, generación de escena base y acciones directas de escena.',
      'Materiales, animación, pintura, character builder y build center integrados.',
    ],
    remaining: [
      'Reducir deuda visual en paneles densos.',
      'Completar más tests E2E de flujos creativos largos.',
    ],
  },
  {
    id: 'onboarding-guide',
    area: 'Guía de uso + Copilot tour',
    status: '100%',
    progress: 100,
    done: [
      'Guía Markdown en repo.',
      'Botón Guía de uso en Configuración.',
      'Panel copilot con mapa, tour, referencia de áreas y creación de escena demo.',
      'E2E específico del botón Guía de uso y Crear escena demo guiada.',
      'Capturas del tour enlazadas desde la guía Markdown.',
      'Video corto del tour generado desde capturas oficiales.',
    ],
    remaining: ['Agregar narración opcional cuando el diseño final quede congelado.'],
  },
  {
    id: 'production-hardening',
    area: 'Hardening producción',
    status: 'en progreso',
    progress: 90,
    done: [
      'Auth/RBAC, BYOK, audit logs y protecciones de endpoints críticos.',
      'Suites typecheck, unit, integration y E2E para zonas forenses.',
      'Drill unificado de carga + backup verify + restore dry-run.',
      'Runner staging protegido para carga 1000+/50+, restore real RESTORE_NOW y probe externo.',
    ],
    remaining: [
      'Revisión de secretos/env en deploy remoto final.',
      'Ejecutar workflow staging con secrets reales y guardar artifacts de restore real.',
    ],
  },
];

export type UsageTourStep = {
  id: string;
  title: string;
  target: string;
  action: string;
  confirms: string;
};

export const REY30_USAGE_TOUR: UsageTourStep[] = [
  {
    id: 'settings',
    title: 'Configura la base',
    target: 'Configuración > Usuario / Config APIs',
    action: 'Inicia sesión o usa modo local owner, revisa claves y guarda la configuración.',
    confirms: 'El header muestra sesión activa y los providers aparecen con estado actualizado.',
  },
  {
    id: 'scene',
    title: 'Crea o abre una escena',
    target: 'Workspace Scene',
    action: 'Usa la jerarquía o el botón de esta guía para crear terreno, player, cámara, luz y plataformas.',
    confirms: 'La escena activa muestra entidades nuevas en Hierarchy y objetos visibles en el viewport.',
  },
  {
    id: 'ai',
    title: 'Pide ayuda al copiloto',
    target: 'AI Chat',
    action: 'Pide cambios concretos: agregar enemigo, crear plataforma, mejorar iluminación o preparar gameplay.',
    confirms: 'El chat responde con acciones aplicadas y el editor marca cambios pendientes.',
  },
  {
    id: 'scrib',
    title: 'Añade comportamiento',
    target: 'Workspace Scripting > Scrib Studio',
    action: 'Usa Baseline, asigna movement/collider/cameraFollow y pulsa Render All.',
    confirms: 'El runtime informa nodos cargados/fallidos y el ledger separa scrib nodes de legacy scripts.',
  },
  {
    id: 'play',
    title: 'Prueba el runtime',
    target: 'Header > Play',
    action: 'Pulsa Play, revisa Console/Build y corrige P0 antes de seguir agregando contenido.',
    confirms: 'El status bar cambia a PLAYING y no aparecen P0 nuevos en Runtime Fault Ledger.',
  },
  {
    id: 'forensics',
    title: 'Cierra el ciclo forense',
    target: 'Admin Runtime Forensics',
    action: 'Revisa snapshots, notifications, webhook, Prometheus/SLO y exporta CSV/JSON si necesitas auditoría.',
    confirms: 'El overview muestra SLO, incidentes y sesiones sin zonas grises.',
  },
];

export type FeatureReferenceItem = {
  area: string;
  does: string;
  useWhen: string;
};

export const REY30_FEATURE_REFERENCE: FeatureReferenceItem[] = [
  {
    area: 'Scene',
    does: 'Construye y revisa entidades 3D, cámara, luces, terreno y jerarquía.',
    useWhen: 'Quieres ver o colocar objetos directamente en el mundo.',
  },
  {
    area: 'AI Chat',
    does: 'Actúa como copiloto para crear escena, assets, scripts y cambios guiados.',
    useWhen: 'Quieres avanzar por intención natural sin tocar cada panel manualmente.',
  },
  {
    area: 'Scrib Studio',
    does: 'Crea, revisa, compila y asigna scripts .scrib.ts al runtime real.',
    useWhen: 'Quieres gameplay, movimiento, colisiones, cámara o reglas globales.',
  },
  {
    area: 'Build / Console',
    does: 'Muestra compile, runtime, errores, warnings y resumen de Render All.',
    useWhen: 'Algo falla o quieres confirmar que la escena está lista para probar.',
  },
  {
    area: 'Admin Runtime Forensics',
    does: 'Audita P0/P1/P2, snapshots, notifications, webhook, prune y Prometheus/SLO.',
    useWhen: 'Necesitas evidencia, diagnóstico histórico o export CSV/JSON.',
  },
  {
    area: 'Configuración',
    does: 'Administra sesión, API keys BYOK, routing, permisos IA, atajos, costos y guía de uso.',
    useWhen: 'Estás aprendiendo la app o preparando un entorno de trabajo seguro.',
  },
];
