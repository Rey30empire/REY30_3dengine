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
      'Si falla un script, corrige primero compile diagnostics antes de agregar más lógica.',
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
    title: 'AI First: prompt único + orquestación',
    objective: 'Construir pipeline completo (escena, entidades, scripts) desde instrucciones de alto nivel.',
    steps: [
      '1) Escribe un prompt completo con objetivo y mecánicas.',
      '2) Ejecuta y revisa el pipeline por etapas en chat.',
      '3) Valida resultados en viewport y consola de runtime.',
      '4) Itera con prompts cortos de ajuste (balance, dificultad, layout).',
      '5) Si algo queda ambiguo, baja a Hybrid para corrección puntual en Scrib.',
    ],
    copilotTips: [
      'Incluye tipo de juego + enemigo + mecánica clave: “plataformas + lobo + salto”.',
      'Pide cambios en bloques pequeños para mantener trazabilidad del pipeline.',
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
