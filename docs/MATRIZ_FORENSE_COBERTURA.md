# Matriz forense de cobertura real

Fecha de auditoria: 2026-04-18  
Repositorio auditado: `C:\Users\rey30\Project\00_PRIORIDAD_MAXIMA\REY30_3dengine`

## Alcance

Este reporte compara el estado actual del proyecto contra tres fuentes de verdad:

1. Diagnostico forense actual del motor.
2. Catalogo ideal de tool-calling descrito en `tool_Caling.txt`.
3. Ideas de Scrib Engine, flujo de juego y pipeline de personajes descritas en `ideas para la funcionalidad del motor 3d.txt`.

Nota forense: el arbol de Git esta muy sucio. `git status --short` reporto 470 entradas modificadas, eliminadas o no trackeadas. La evidencia corresponde al estado local actual, no a una version estable confirmada.

## Leyenda

Clasificaciones permitidas:

- `IMPLEMENTADO_REAL`: existe comportamiento funcional verificable en codigo.
- `IMPLEMENTADO_PARCIAL`: existe una parte real, pero no cubre el contrato ideal.
- `STUB_O_FACHADA`: existe interfaz, nombre o retorno superficial sin accion completa.
- `NO_EXISTE`: no hay sistema equivalente localizable.
- `EXISTE_PERO_NO_UNIFICADO`: hay implementacion repartida en capas paralelas sin una sola verdad operacional.

Prioridad:

- `P0`: bloquea la vision central.
- `P1`: necesario para MVP serio.
- `P2`: importante, pero no bloquea el vertical slice central.
- `P3`: mejora posterior.

## Matriz principal

| Sistema | Requisito | Estado real | Clasificacion | Evidencia en archivo | Riesgo | Prioridad |
|---|---|---|---|---|---|---|
| Command Bus | Comandos con `validate/execute/undo/serialize/costEstimate` | El contrato base existe y es amplio. | IMPLEMENTADO_REAL | `src/engine/command/types.ts` | Medio | P1 |
| Command Bus | `submit`, batch, cancel, status, replay | Existe en memoria, pero no es la unica ruta de mutacion del motor. | EXISTE_PERO_NO_UNIFICADO | `src/engine/command/bus/CommandBus.ts` | Alto | P0 |
| Transactions / undo / redo / snapshots | Transacciones con rollback real | Rollback llama `undo`, pero el snapshot de estado solo guarda timestamp. | STUB_O_FACHADA | `src/engine/command/bus/CommandBus.ts` (`captureStateSnapshot`, `restoreStateSnapshot`) | Critico | P0 |
| Transactions / undo / redo / snapshots | Checkpoint y rollback parcial | Existe API interna, pero no restaura estado real completo. | IMPLEMENTADO_PARCIAL | `src/engine/command/bus/CommandBus.ts` | Alto | P0 |
| Transactions / undo / redo / snapshots | Undo/redo operacional | Existe, pero depende de comandos registrados y no cubre todas las mutaciones editor/agentic. | EXISTE_PERO_NO_UNIFICADO | `src/engine/command/bus/CommandBus.ts`, `src/app/api/agentic/route.ts` | Alto | P0 |
| Tool Registry | Registry con namespaces y schemas | Existe registry con Zod, metadata, permisos y executor. | IMPLEMENTADO_REAL | `src/engine/command/tools/ToolRegistry.ts` | Medio | P1 |
| Tool Registry | Una sola fuente de verdad para tools | Hay command tools, MCP tools, agentic tools y adapters separados. | EXISTE_PERO_NO_UNIFICADO | `src/engine/command/tools`, `src/engine/agentic/tools`, `src/lib/server/mcp-surface.ts` | Critico | P0 |
| Tool permissions | Permisos de tool por agente/capacidad | Agentic tiene contrato fuerte de permisos/evidencia; command tools tienen permisos simples. | IMPLEMENTADO_PARCIAL | `src/engine/agentic/tools/ToolPermissionSystem.ts`, `src/engine/command/tools/ToolRegistry.ts` | Alto | P0 |
| MCP bridge | Invocacion MCP de tools | Existe gateway y rutas HTTP protegidas. | IMPLEMENTADO_PARCIAL | `src/engine/mcp/MCPGateway.ts`, `src/app/api/mcp/route.ts` | Alto | P1 |
| MCP bridge | Cobertura completa del catalogo ideal | Solo expone/ejecuta un subconjunto curado; no cubre todo `tool_Caling.txt`. | IMPLEMENTADO_PARCIAL | `src/lib/server/mcp-surface.ts` | Alto | P1 |
| Scene tools | Crear/abrir/guardar escena | Existen herramientas basicas reales. | IMPLEMENTADO_PARCIAL | `src/engine/command/tools/SceneEntityTools.ts` | Medio | P1 |
| Scene tools | `save_as`, duplicate, close, world chunks/streaming | No aparecen como tool real equivalente. | NO_EXISTE | No hay tool `scene.save_as`, `scene.duplicate`, `scene.close`, streaming/chunks localizable | Alto | P2 |
| Entity tools | Crear, clonar, borrar, transformar, buscar | Existe parte importante. | IMPLEMENTADO_PARCIAL | `src/engine/command/tools/SceneEntityTools.ts` | Medio | P1 |
| Entity tools | Rename, parent/unparent, find_by_tag, get_transform | Hay capacidades en store/agentic, pero no como pack tool unificado completo. | EXISTE_PERO_NO_UNIFICADO | `src/engine/agentic/tools/adapters/sceneStoreAdapter.ts`, `src/engine/command/tools/SceneEntityTools.ts` | Alto | P1 |
| Component tools | Add component generico | Existe `entity.add_component`. | IMPLEMENTADO_PARCIAL | `src/engine/command/tools/SceneEntityTools.ts` | Medio | P1 |
| Component tools | Get/set/remove component generico | Falta en command MVP como contrato completo; existe parcialmente por adapters/store. | EXISTE_PERO_NO_UNIFICADO | `src/engine/agentic/tools/adapters/sceneStoreAdapter.ts`, `src/store/editorStore` | Alto | P1 |
| Asset pipeline | Asset registry, metadata, storage, import basico | Hay pipeline y storage real. | IMPLEMENTADO_PARCIAL | `src/engine/assets/pipeline.ts`, `src/app/api/assets/route.ts` | Medio | P1 |
| Asset pipeline | LOD, mesh optimize, texture compression, lightmaps, probes por tool | No hay cobertura tool-calling completa. | NO_EXISTE | Sin tools operativas equivalentes en `src/engine/command/tools` | Alto | P2 |
| Render / lighting / materials | Viewport Three.js y pipeline visual | Viewport y render pipeline existen. | IMPLEMENTADO_REAL | `src/engine/editor/SceneView.tsx`, `src/engine/rendering` | Medio | P1 |
| Render / lighting / materials | Crear luces y postprocess por tool | Existen tools basicas. | IMPLEMENTADO_PARCIAL | `src/engine/command/tools/PhysicsGameplayTools.ts` | Medio | P1 |
| Render / lighting / materials | Assign material, link texture, HDR/AA/shadows/GI/raytracing tool-calling | Hay UI/material systems, pero tool pack no cubre todo. | EXISTE_PERO_NO_UNIFICADO | `src/engine/editor/MaterialEditor.tsx`, `src/engine/rendering`, `src/engine/command/tools/PhysicsGameplayTools.ts` | Alto | P1 |
| Physics | Motor fisico y bridge runtime | Hay CANNON, rigid bodies, raycast real en sistema fisico. | IMPLEMENTADO_PARCIAL | `src/engine/physics/PhysicsEngine.ts`, `src/engine/physics/Raycast.ts`, `tests/unit/physics-runtime-bridge.test.ts` | Medio | P1 |
| Physics | Tools `raycast/apply_force/joints/overlap/character state` | `phys.raycast` de command devuelve hit falso simulado; faltan varias tools. | STUB_O_FACHADA | `src/engine/command/tools/PhysicsGameplayTools.ts` | Critico | P0 |
| Animation / rigging | Rig, clips, pose library, retarget, auto weights | Sistema de authoring real y probado. | IMPLEMENTADO_REAL | `src/engine/editor/animationEditorState.ts`, `tests/unit/animation-editor-state-editing.test.ts` | Medio | P1 |
| Animation / rigging | Animator state machine/IK/retarget/bake como tools agentic | Existe authoring, pero no tool-calling unificado completo. | EXISTE_PERO_NO_UNIFICADO | `src/engine/editor/animationEditorState.ts`, `src/engine/agentic/tools/editorBackedAnimationTools.ts` | Alto | P1 |
| Gameplay / weapons / inventory | Weapons, health, runtime combat | Hay componentes y runtime basico de combate. | IMPLEMENTADO_PARCIAL | `src/engine/gameplay/WeaponSystem.ts`, `tests/unit/script-runtime.test.ts` | Medio | P1 |
| Gameplay / weapons / inventory | Inventory, pickups, interactables, objectives/win condition | No hay pack completo equivalente al ideal. | NO_EXISTE | Sin tools completas en `src/engine/command/tools`; validacion gameplay hardcoded parcial | Alto | P1 |
| VFX / water | Particle presets y tool `vfx.create_particle_system` | Hay presets y tool basica. | IMPLEMENTADO_PARCIAL | `src/engine/rendering/particlePresetRegistry.ts`, `src/engine/command/tools/PhysicsGameplayTools.ts` | Medio | P2 |
| VFX / water | VFX graph, ocean/river/boat physics/buoyancy/caustics | La tool crea entidades/datos; no hay simulacion completa. | STUB_O_FACHADA | `src/engine/command/tools/PhysicsGameplayTools.ts` | Alto | P2 |
| AI / NPC | Agentes editoriales y orchestrator | Hay agentes por dominio, planificador, evidencia y memoria. | IMPLEMENTADO_REAL | `src/engine/agentic/agents`, `src/engine/agentic/execution/MasterOrchestrator.ts` | Medio | P1 |
| AI / NPC | NPC runtime con navmesh, BT, blackboard, perception | Hay scripts/patrol basico; no hay AI NPC completa. | IMPLEMENTADO_PARCIAL | `src/engine/agentic/tools/gameplayTools.ts`, `tests/unit/agentic-orchestrator.test.ts` | Alto | P1 |
| Networking | Namespace `net` multiplayer/sync/session | No se encontro sistema networking gameplay/tool equivalente. | NO_EXISTE | Sin `src/engine/networking` ni tools `net.*` en catalogos revisados | Medio | P3 |
| Build / export | Compile ReyPlay, manifest, web bundle | Existe pipeline real con diagnosticos y artefactos. | IMPLEMENTADO_REAL | `src/engine/reyplay/build/compile.ts`, `src/engine/reyplay/build/buildPipeline.ts` | Medio | P1 |
| Build / export | EXE/MSI ejecutable final | Existe condicionado a IExpress/WiX; no siempre produce artefacto nativo. | IMPLEMENTADO_PARCIAL | `src/engine/reyplay/build/buildPipeline.ts` | Medio | P2 |
| Build / export | Schema estable | Hay typo forense `reypaly-1.0` en schema. | IMPLEMENTADO_PARCIAL | `src/engine/reyplay/types.ts` | Medio | P1 |
| Scrib Engine | Schema fuerte id/type/target/config/code/requires/provides | Existe exactamente el contrato base. | IMPLEMENTADO_REAL | `src/engine/scrib/types.ts` | Bajo | P0 |
| Scrib Engine | Registry register/get/list/validate | Existe registry real con atomicos y compuestos. | IMPLEMENTADO_REAL | `src/engine/scrib/registry.ts` | Bajo | P0 |
| Scrib Engine | Assign solo a entity o scene | Existe y respeta target entity/scene, no scrib-to-scrib. | IMPLEMENTADO_REAL | `src/engine/scrib/assign.ts` | Bajo | P0 |
| Scrib Composer | Collect/validate/resolve/build plan | Existe composer con stages y dependencias. | IMPLEMENTADO_REAL | `src/engine/scrib/composer.ts` | Medio | P0 |
| Scrib Composer | `Render All` como flujo visible final | El Build Center compila; Scrib Studio tiene compose/runtime hooks, pero no queda una unica accion central oficial para composer. | IMPLEMENTADO_PARCIAL | `src/engine/editor/ScriptWorkspacePanel.tsx`, `src/engine/gameplay/ScriptRuntime.ts` | Alto | P0 |
| Scrib Runtime | Runtime loop comun | Runtime unificado existe y corre en `PLAYING`. | IMPLEMENTADO_PARCIAL | `src/engine/gameplay/ScriptRuntime.ts` | Alto | P0 |
| Scrib Runtime | Ejecutar scrib code real editado | Critico: rutas `scribs/*.scrib.ts` se tratan como built-in y no cargan artefacto editado. | STUB_O_FACHADA | `src/engine/gameplay/ScriptRuntime.ts` (`loadScribHandler`) | Critico | P0 |
| Scrib Runtime | Ejecutar scene/global scribs | Composer los recoge, runtime ignora nodos que no sean entity. | IMPLEMENTADO_PARCIAL | `src/engine/gameplay/ScriptRuntime.ts` (`if (node.target.scope !== 'entity') return`) | Critico | P0 |
| Scrib Runtime | Hot reload sin reiniciar escena | Hay eventos e invalidacion de cache; queda roto/parcial por el problema de rutas built-in. | IMPLEMENTADO_PARCIAL | `src/engine/gameplay/ScriptRuntime.ts`, `src/engine/editor/ScriptWorkspacePanel.tsx` | Alto | P0 |
| Scrib Studio UI | Create/Assign/Edit/Library/Console | Existe UI amplia. | IMPLEMENTADO_REAL | `src/engine/editor/ScriptWorkspacePanel.tsx` | Medio | P1 |
| Scrib Studio UI | Monaco/CodeMirror, manifest/config editor robusto | Usa `Textarea`, no Monaco/CodeMirror; manifest/config no es editor especializado completo. | IMPLEMENTADO_PARCIAL | `src/engine/editor/ScriptWorkspacePanel.tsx`, `package.json` | Medio | P2 |
| Manual / Hybrid / AI-first modes | Modos visibles `MODE_MANUAL/HYBRID/AI_FIRST` | Existen en UI/store. | IMPLEMENTADO_PARCIAL | `src/engine/editor/EditorLayout.tsx`, `src/types/engine.ts` | Medio | P1 |
| Manual / Hybrid / AI-first modes | Mismo runtime real y reglas diferenciadas | Comparten base, pero los modos son mas superficie/flujo que contrato operacional completo. | IMPLEMENTADO_PARCIAL | `src/engine/editor/EditorLayout.tsx`, `src/engine/gameplay/ScriptRuntime.ts` | Alto | P1 |
| Character AI pipeline | Niveles L1/L2/L3 y stages | Existe definicion clara de niveles/agentes/stages. | IMPLEMENTADO_PARCIAL | `src/engine/ai/agent-levels.ts` | Medio | P2 |
| Character AI pipeline | Base mesh/full character backend-first | Existe API y mini-servicio procedural honesto. | IMPLEMENTADO_PARCIAL | `src/app/api/character/base-mesh/route.ts`, `src/app/api/character/full/route.ts`, `mini-services/character-backend` | Medio | P2 |
| Character AI pipeline | Retopo/UV/rig/texturas AAA automaticas | No existe como promesa completa; hay fallback procedural y validators. | STUB_O_FACHADA | `src/app/api/character/full/route.ts`, `mini-services/character-backend/README.md` | Alto | P2 |
| Final validator / retry loop | Validador final compara pedido vs resultado | Existe agente/validator con tests y reportes. | IMPLEMENTADO_PARCIAL | `tests/unit/agentic-final-validator.test.ts`, `src/engine/agentic/execution/MasterOrchestrator.ts` | Alto | P0 |
| Final validator / retry loop | Retry loop real integrado hasta aprobacion final | Orchestrator replantea parcialmente, pero no todo flujo tool/editor queda obligado por validacion final. | IMPLEMENTADO_PARCIAL | `src/engine/agentic/execution/MasterOrchestrator.ts`, `src/app/api/agentic/route.ts` | Critico | P0 |

## Contradicciones explicitas contra la idea original

1. La idea original pide una sola verdad operacional; el proyecto tiene al menos seis capas: command tools, MCP surface, agentic tools, editor store, Scrib runtime y build/runtime.
2. La idea pide que todo cambio pase por tools reales; muchas mutaciones siguen pasando por store/adapters/UI directos.
3. La idea pide transacciones con snapshots reales; el Command Bus tiene snapshot placeholder.
4. La idea pide Scrib como centro del comportamiento; el runtime aun ejecuta legacy scripts y scribs en paralelo.
5. La idea pide que editar un scrib cambie ejecucion real; hoy `scribs/*.scrib.ts` cae en built-in handler.
6. La idea pide scene/global scribs; el runtime los ignora durante ejecucion.
7. La idea pide tools con brazos reales; varias tools devuelven exito sin accion completa.
8. La idea pide FinalDeliveryValidatorAgent como puerta final; existe validacion, pero no gobierna universalmente todos los flujos.
9. La idea pide AI-first serio; existe agentic pipeline, pero no todos los agentes tienen tools reales suficientes.
10. La idea pide pipeline de personaje por fases; hay contrato y backend procedural, no pipeline completo de produccion.

## Top 20 gaps mas peligrosos

1. `scribs/*.scrib.ts` no ejecuta codigo editado; se resuelve como built-in.
2. Scene/global scribs se componen pero no se ejecutan.
3. Snapshots de Command Bus son placeholders.
4. No hay una sola fuente de verdad para tools.
5. No hay una sola fuente de verdad para world state.
6. Undo/redo no cubre todas las rutas de mutacion.
7. MCP expone solo un subconjunto curado.
8. `gen.execute_plan` no ejecuta el grafo real.
9. `phys.raycast` command es simulado aunque existe raycast real en otro sistema.
10. Final validation no es puerta obligatoria universal.
11. Tool permissions estan repartidos entre command y agentic.
12. Build/runtime y editor store pueden divergir.
13. Modos manual/hybrid/AI-first no tienen contrato operacional fuerte.
14. Component get/set/remove no esta unificado como tool real.
15. Material assignment/render controls existen en UI/sistemas, no como tools completas.
16. Gameplay inventory/interactables/objectives incompleto.
17. NPC AI sin navmesh/BT/blackboard real.
18. Character pipeline puede parecer mas avanzado de lo que realmente es.
19. Networking esta fuera del MVP real actual.
20. Worktree con 470 cambios impide distinguir estable vs experimental.

## Top 10 piezas realmente solidas

1. Contrato base de Scrib Engine.
2. ScribRegistry con atomicos y compuestos.
3. Assign system entity/scene con dependencias.
4. Scrib Composer con stages y orden.
5. Editor visual con paneles reales.
6. Modeler mesh tools: extrude, inset, bevel, knife, UV, remesh, decimate.
7. Animation editor: rig, clips, retarget, poses, auto weights.
8. Agentic evidence contract before/after.
9. Build/export ReyPlay web bundle con diagnosticos.
10. Script sandbox con compile, policy, worker y guardias.

## Top 10 zonas duplicadas o fragmentadas

1. Tools: command registry vs agentic registry vs MCP surface.
2. Estado: editor store vs WorldStateManager agentic vs build manifest.
3. Scripts: legacy Script component vs Scrib runtime.
4. Runtime: editor play loop vs Scrib Composer plan vs ReyPlay build output.
5. Undo/rollback: CommandBus history vs agentic snapshots/history.
6. Build validation: ReyPlay compile vs agentic final validator.
7. Physics: runtime physics real vs command physics stubs.
8. Animation: editor authoring vs agentic animation tools vs runtime bridge.
9. Assets/materials: Asset pipeline vs MaterialEditor vs tool-calling.
10. AI: old `AIOrchestrator`, agent planner, agentic orchestrator y character agents.

## Recomendacion de secuencia de implementacion

### Fase 0: congelar rutas paralelas

1. Declarar oficialmente legacy: old `AIOrchestrator`, command tools no conectadas, MCP simple limitado, legacy Script runtime directo.
2. Documentar que toda feature nueva debe pasar por Tool Registry unificado.
3. No borrar todavia; congelar crecimiento.

### Fase 1: arreglar columna vertebral Scrib

1. Cambiar resolucion de codigo: `builtin:<type>` para built-ins y `scribs/*.scrib.ts` para artefacto real revisado.
2. Ejecutar scene/global scribs en runtime.
3. Agregar tests: movement editado cambia comportamiento sin reiniciar escena.
4. Exponer `Render All` como accion oficial del Composer.

### Fase 2: unificar tools y evidencia

1. Crear `EngineToolRegistry` unico.
2. Adaptar command tools y agentic tools al mismo contrato `ToolResult + evidence + undoData`.
3. Todo MCP debe invocar el registry unico.
4. El editor debe mutar mediante adapters/tools para operaciones agentic.

### Fase 3: snapshots y transacciones reales

1. Snapshot serializable del editor/project/world.
2. Checkpoints por diff.
3. Rollback total y rollback parcial probado.
4. Rehacer undo/redo sobre tools, no sobre rutas sueltas.

### Fase 4: MVP tools con brazos reales

1. Contexto, viewport y selection.
2. Scene/entity/component.
3. Asset/material/render.
4. Physics real: raycast y apply_force usando `PhysicsEngine`.
5. Build validate/export/report.

### Fase 5: validador final obligatorio

1. `FinalDeliveryValidatorAgent` como puerta de salida.
2. `DeliveryDecision` bloqueante.
3. `retryInstructions` estructuradas.
4. `replanIfNeeded` integrado al orchestrator.
5. Tests de rechazo y aprobacion.

### Fase 6: vertical slice demostrable

1. Pedido: "crea un player con movement y collider".
2. Orchestrator produce plan.
3. Tools crean escena/entidad/componentes/scribs.
4. Composer resuelve dependencias.
5. Runtime ejecuta movement.
6. Validator aprueba.
7. Hot reload modifica movement sin reiniciar.

### Fase 7: personajes V1 honesta

1. Mantenerlo como pipeline de fases, no promesa magica.
2. Prompt interpretation, base mesh/import, corrective report, material suggestion, rig naming assist, export validation.
3. Integrarlo al mismo Tool Registry solo cuando tenga acciones reales.

## Conclusion ejecutiva

El proyecto tiene piezas fuertes suficientes para convertirse en un editor/motor 3D agentic serio. El cuello de botella no es falta de codigo; es falta de una sola verdad operacional. La prioridad no debe ser agregar mas features, sino cerrar la columna vertebral:

`ToolRegistry unico -> WorldState unico -> Scrib Composer -> Scrib Runtime -> Evidence/Undo -> Final Validator -> Retry`.

Hasta que esa cadena sea obligatoria, el sistema seguira pareciendo mas completo de lo que realmente es.
