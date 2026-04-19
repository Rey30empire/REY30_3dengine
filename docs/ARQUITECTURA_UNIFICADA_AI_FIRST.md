# Arquitectura objetivo de unificacion AI-first

Fecha: 2026-04-18  
Estado: diseno rector previo a refactor profundo

## 1. Diagnostico de fragmentacion actual

El proyecto ya tiene piezas maduras, pero no tiene una sola verdad operacional. Hoy conviven estas rutas:

- `command tools`: buen contrato de comandos, pero snapshots y algunas tools son parciales.
- `MCP tools`: superficie curada para servidor, no cobertura completa.
- `agentic tools`: mejor contrato de evidencia/permiso, pero vive en paralelo al Command Bus.
- `editor store`: fuente practica del editor visual, con mutaciones directas.
- `scrib runtime`: ejecuta Scrib y scripts legacy, pero no gobierna todo comportamiento.
- `build/runtime`: valida y empaqueta un snapshot, pero no es la fuente de verdad de ejecucion.

Contradiccion central: la idea original exige que todo cambio pase por tools reales, con evidencia, undo/redo y validacion final. El estado actual permite que el editor, agentes, MCP y runtime cambien estado por caminos distintos.

## 2. Arquitectura objetivo

La arquitectura final debe tener una cadena unica:

`User Intent -> Orchestrator -> EngineToolRegistry -> ProjectWorldState -> Evidence Log -> Scrib Composer -> Scrib Runtime -> FinalDeliveryValidator -> Retry/Approve`

### Fuente de verdad para tools

Sistema oficial: `EngineToolRegistry`.

Responsabilidades:

- Registrar todas las tools ejecutables.
- Validar input con schema fuerte.
- Autorizar por `ToolPermissionSystem`.
- Ejecutar accion real o adaptador real.
- Emitir `ToolResult` tipado.
- Emitir evidencia before/after.
- Emitir `undoData` o diff reversible.
- Exponer la misma tool a agentes, MCP, UI avanzada y automatizacion.

Regla: no se agregan nuevas mutaciones importantes fuera de `EngineToolRegistry`.

### Fuente de verdad para world state

Sistema oficial: `ProjectWorldState`.

Debe unificar:

- escenas
- entidades
- componentes
- assets
- materiales
- scripts/scribs
- settings de proyecto
- build metadata
- runtime-safe snapshot

Implementacion recomendada:

- Reutilizar `editorStore` como backing store visual mientras se migra.
- Reutilizar `WorldStateManager` agentic como modelo de evidencia y diffs.
- Crear un adapter oficial bidireccional: `EditorStoreWorldAdapter`.
- Prohibir adapters paralelos nuevos.

### Fuente de verdad para scrib execution

Sistema oficial: `Scrib Composer + Scrib Runtime`.

Responsabilidades:

- Registry define capacidades.
- Assign system solo asigna scribs a entity/scene.
- Composer resuelve dependencias y orden.
- Runtime ejecuta handlers en orden.
- Hot reload invalida artefacto y recompone.
- Built-ins solo se invocan con `builtin:<type>`.
- Rutas `scribs/*.scrib.ts` significan codigo de usuario revisado por sandbox.

### Fuente de verdad para validacion final

Sistema oficial: `FinalDeliveryValidatorAgent`.

Debe ser puerta de salida:

- Analiza pedido original.
- Compara contra estado final y evidencia.
- Produce `ValidationReport`.
- Emite `DeliveryDecision`.
- Si rechaza, genera `retryInstructions`.
- El orchestrator replanifica hasta aprobar o agotar iteraciones.

## 3. Mapa de integracion

| Capa | Rol objetivo | Accion |
|---|---|---|
| Editor UI | Interfaz humana | Llama tools o adapters oficiales; no muta features nuevas directo. |
| MCP | Superficie remota | Expone `EngineToolRegistry` filtrado por permisos. |
| Agents | Planeacion/ejecucion | Solo ejecutan tools registradas y autorizadas. |
| Command Bus | Transaccion/undo | Se convierte en executor transaccional del registry o queda legacy. |
| Agentic Tool Registry | Evidencia/contrato | Se fusiona dentro de `EngineToolRegistry`. |
| Editor Store | Backing visual | Estado reactivo, sincronizado por `ProjectWorldState`. |
| Scrib Engine | Comportamiento | Columna vertebral runtime de gameplay. |
| ReyPlay Build | Delivery | Consume snapshot validado, no inventa estado. |

## 4. Legacy boundaries

### Legacy congelado

- `src/engine/ai/AIOrchestrator.ts`: mantener solo como referencia hasta migrar capacidades utiles.
- `src/engine/command/tools/*` que devuelven exito superficial: no crecer sin evidence/undo real.
- `/api/simple-mcp`: mantener como read-only/minimo o deprecate.
- Legacy `Script` component directo: mantener compatibilidad, pero Scrib debe ser la ruta principal nueva.

### Reutilizar

- `src/engine/agentic/tools/ToolPermissionSystem.ts`: base de permisos.
- `src/engine/agentic/tools/ToolRegistry.ts`: base de contrato de evidencia.
- `src/engine/agentic/memory/WorldStateManager.ts`: base de diffs/evidencia.
- `src/engine/scrib/*`: base del Scrib Engine.
- `src/engine/gameplay/ScriptRuntime.ts`: base del runtime, corrigiendo resolucion de scribs.
- `src/engine/reyplay/build/*`: base de build/export.
- `src/engine/editor/modelerMesh.ts` y `animationEditorState.ts`: subsistemas reales reutilizables.

### Eliminar o no expandir

- Nuevas tools fuera del registry unificado.
- Nuevos agentes sin tools reales.
- Mutaciones agentic que no emitan evidencia reversible.
- Promesas de personaje completo AAA antes de cerrar vertical slice.

## 5. Secuencia exacta de refactor por fases

### Fase 1: Scrib runtime honesto

1. Cambiar `ScriptRuntime` para que `scribs/*.scrib.ts` cargue artefactos reales.
2. Reservar `builtin:<type>` para handlers internos.
3. Ejecutar scene/global scribs o documentar su bloqueo hasta implementarlo.
4. Test: `scribs/movement.scrib.ts` llama `/api/scripts/runtime`.

### Fase 2: EngineToolRegistry

1. Crear contrato unico `EngineToolDefinition`.
2. Migrar permisos y evidence contract de agentic.
3. Envolver command tools existentes.
4. Marcar cada tool como `real`, `partial` o `stub`.
5. MCP y agentes consumen ese registry.

### Fase 3: ProjectWorldState

1. Definir snapshot canonico serializable.
2. Crear `EditorStoreWorldAdapter`.
3. Crear `WorldDiff` reversible.
4. Hacer que cada tool mutadora emita before/after/diff.

### Fase 4: Transacciones reales

1. Reemplazar snapshot placeholder del Command Bus.
2. Checkpoints por snapshot/diff.
3. Rollback total y parcial.
4. Undo/redo sobre tool executions.

### Fase 5: Tools MVP reales

1. Contexto/selection/viewport.
2. Scene/entity/component.
3. Asset/material/render.
4. Physics real: raycast y apply_force sobre engine fisico.
5. Build validate/export/report.

### Fase 6: Orchestrator obligatorio

1. `parseUserIntent`.
2. `buildExecutionPlan`.
3. `assignAgentsToSteps`.
4. `grantToolsForStep`.
5. `executePlan`.
6. `submitForValidation`.

### Fase 7: Final validator + retry

1. `analyzeOriginalRequest`.
2. `compareAgainstFinalState`.
3. `generateValidationReport`.
4. `approveOrReject`.
5. `emitRetryInstructions`.
6. `replanIfNeeded`.

### Fase 8: Vertical slice central

Pedido demostrable:

`crea un player con movement y collider`

Resultado obligatorio:

- escena activa
- entidad player
- scrib movement
- scrib collider
- composer sin errores
- runtime ejecutando movement
- evidencia de tools
- validator aprobado
- hot reload funcional

## 6. Riesgos tecnicos

1. Migrar todo al registry unico puede romper flujos UI existentes si se hace de golpe.
2. El editor store tiene mucho comportamiento implicito; hay que envolverlo con adapters, no reemplazarlo en frio.
3. El runtime de scripts depende de artefactos revisados; si no hay flujo de compile claro, Scrib parecera roto.
4. Las tools actuales mezclan nombres y dominios: `phys.*`, `physics.*`, `script.*`, `game.*`.
5. El build puede validar un estado distinto al que vio el agente si no se sincroniza snapshot canonico.
6. El retry loop puede repetir errores si el validator no produce instrucciones accionables.
7. Los built-ins de Scrib son utiles como fallback, pero deben ser explicitos para no ocultar codigo de usuario.

## Decision rectora

El motor debe crecer desde una sola columna vertebral:

`EngineToolRegistry + ProjectWorldState + Scrib Composer/Runtime + FinalDeliveryValidator`.

Todo lo demas debe adaptarse a esa columna o quedar congelado como legacy.
