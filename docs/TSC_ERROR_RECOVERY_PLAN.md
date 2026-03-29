# Plan de Correccion de Errores TypeScript (sin romper arquitectura ni UI)

## 1. Baseline real (2026-03-07)
Comando usado: `pnpm exec tsc --noEmit --pretty false`

- Errores totales: **497**
- Archivos afectados: **45**
- Modulos con mas errores:
  - `src/engine/rendering`: **195**
  - `src/engine/command`: **166**
  - `src/engine/input`: **64**
  - `src/engine/physics`: **29**

Codigos mas frecuentes:
- `TS18046` (params `unknown`): 145
- `TS2339` (propiedad inexistente): 95
- `TS2484` (export conflict): 60
- `TS2323` (redeclare export): 54
- `TS2345` (tipo de argumento): 29

## 2. Causas raiz (agrupadas)

### A. Sistema de tools tipado roto (Command)
Archivos principales:
- `SceneEntityTools.ts`, `PhysicsGameplayTools.ts`, `MVPTools.ts`, `GeneratorTools.ts`

Problema:
- `createTool()` no propaga bien tipos de `zod` y los `params` quedan `unknown`.
- Eso dispara `TS18046` en cadena y errores secundarios en `CommandResult`.

Impacto:
- Bloquea confiabilidad del orquestador IA/MCP.

### B. Drift de exports en Rendering (API interna inconsistente)
Archivos principales:
- `PostProcessing.ts`, `RenderPipeline.ts`, `CameraSystem.ts`, `rendering/index.ts`

Problema:
- Doble export del mismo simbolo (`TS2323` + `TS2484`).
- El barrel `rendering/index.ts` exporta nombres que no existen o cambiaron.

Impacto:
- Rompe contratos entre modulos de render sin necesidad de tocar UI.

### C. Drift de API en Input (hooks vs manager)
Archivos principales:
- `useInput.ts`, `RebindUI.tsx`, `InputManager.ts`

Problema:
- Hooks consumen API estatica (`InputManager.getAction`) pero manager actual es por instancia.
- `InputManager` tiene colisiones de nombres internos/getters.

Impacto:
- Gran volumen de `TS2339` y riesgo funcional en input runtime.

### D. Drift de API externa en Physics (cannon-es)
Archivos principales:
- `Joint.ts`, `physics/index.ts`

Problema:
- Se usan tipos/metodos no disponibles en `cannon-es` actual (ej. `SliderConstraint`).
- Export names no corresponden a tipos reales (`PhysicsConfig` vs `PhysicsEngineOptions`).

Impacto:
- Falla de compilacion y riesgo runtime en joints avanzados.

### E. Higiene de tipos/importes (baja complejidad, alto rendimiento)
Archivos:
- `audio/index.ts`, `compile.ts`, `CommandBus.ts`, `mcp/route.ts`, `simple-mcp/route.ts`

Problema:
- `export type` faltante.
- import `type` usado como valor.
- arreglos inferidos como `never[]`.
- ruta de import incorrecta (`./types` vs `../types`).

Impacto:
- Ruido innecesario y deuda acumulada.

## 3. Restriccion clave: mantener visual igual
Reglas de ejecucion:
- No tocar CSS, Tailwind tokens ni layout visual.
- No modificar JSX de pantallas salvo fixes estrictos de tipado sin cambio de markup final.
- Cambios concentrados en contratos TS, barrels y adapters.
- Verificacion visual por screenshot baseline antes/despues.

## 4. Plan por fases (orden de impacto real)

## Fase 0 - Guardrails y baseline estable (0.5 dia)
Objetivo:
- Congelar baseline y medir avances sin regresiones visuales.

Acciones:
- Script `scripts/tsc-report.ps1` para snapshot por codigo/archivo/modulo.
- Baseline de capturas editor (desktop + mobile) con Playwright.
- Regla: cada fase debe bajar errores netos.

Salida esperada:
- Panel de progreso por fase y evidencia visual.

## Fase 1 - Reparar sistema de tools (1.5 a 2 dias)
Objetivo:
- Eliminar bloque `TS18046` y `TS2345` asociado.

Acciones:
- Refactor de `ToolBuilder` para inferencia real:
  - `parameters<TNew>(schema: z.ZodType<TNew>): ToolBuilder<TNew, TResult>`
  - `returns<RNew>(schema: z.ZodType<RNew>): ToolBuilder<TParams, RNew>`
- Ajustar `ToolSchema`/`ToolDefinition` para conservar tipos en runtime/compile.
- Normalizar `sideEffects` para incluir `description` siempre.

Impacto esperado:
- Reducir ~160-180 errores.

## Fase 2 - Normalizar exports de rendering (1 a 1.5 dias)
Objetivo:
- Quitar redeclaraciones y alinear barrel con nombres reales.

Acciones:
- Eliminar bloques de re-export redundantes al final de:
  - `PostProcessing.ts`
  - `RenderPipeline.ts`
  - `CameraSystem.ts`
- En `rendering/index.ts`:
  - Exportar alias correctos (`SSAOPassEffect as SSAOPass`, etc.) o renombrar imports internos.
  - Remover exports inexistentes o mapearlos a equivalentes reales.
- No tocar shaders ni parametros visuales.

Impacto esperado:
- Reducir ~120-150 errores.

## Fase 3 - Adapter de input sin cambiar comportamiento (1 dia)
Objetivo:
- Resolver `useInput` y `RebindUI` sin reescribir UX.

Acciones:
- Agregar facade estatica en `InputManager` que delegue en singleton (`inputManager`).
- Renombrar campos internos conflictivos (`_mousePosition`, `_mouseDelta`, `_scrollDelta`).
- Mantener API actual consumida por hooks para no tocar componentes.

Impacto esperado:
- Reducir ~55-70 errores.

## Fase 4 - Compatibilidad physics/cannon-es (1 a 1.5 dias)
Objetivo:
- Alinear joints y exports con APIs existentes.

Acciones:
- Corregir `physics/index.ts` a nombres reales (`PhysicsEngineOptions`, etc.).
- En `Joint.ts`, encapsular constraints no soportados:
  - fallback controlado (ej. `PointToPointConstraint`) cuando clase no exista.
  - feature flags internas para preservar flujo sin romper runtime.
- Ajustar tipos de propiedades (`limit`, opciones de constructor) según cannon-es real.

Impacto esperado:
- Reducir ~20-35 errores.

## Fase 5 - Higiene final y errores sueltos (0.5 a 1 dia)
Objetivo:
- Limpiar errores estructurales restantes.

Acciones:
- `audio/index.ts`: separar `export` y `export type`.
- `compile.ts`: importar `REYPLAY_BUILD_SCHEMA` como valor.
- `CommandBus.ts`: fix import path.
- `mcp/route.ts` y `simple-mcp/route.ts`: tipar arrays (`MCPToolCall[]`, `MCPToolResult[]`) para evitar `never[]`.
- `examples/websocket`: o instalar deps opcionales o excluir examples de `tsconfig` principal.

Impacto esperado:
- Reducir ~15-25 errores.

## Fase 6 - Hardening y cierre (0.5 dia)
Objetivo:
- Cerrar con calidad y sin cambio visual.

Checklist:
- `pnpm exec tsc --noEmit` limpio o con remanente controlado/documentado.
- smoke de editor: abrir escena, crear entidad, usar AI panel, compilar ReyPlay.
- comparacion visual pixel-level contra baseline.

## 5. Estrategia anti-regresion de arquitectura
- No introducir bypass global (`any` masivo o `skipLibCheck` hacks extra).
- No mover responsabilidades entre modulos (solo contratos y adapters).
- Cada fase en commit separado + rollback facil.
- Mantener APIs publicas del editor; cambios internos con alias de compatibilidad.

## 6. Prioridad de ejecucion inmediata (siguiente sprint)
1. Fase 1 (tools typing)
2. Fase 2 (rendering exports)
3. Fase 3 (input adapter)

Con esas 3 fases deberia caer la mayoria del volumen sin tocar lo visual.

## 7. Estado de ejecucion
- 2026-03-07: **Fase 1 completada**.
- Resultado: `tsc` paso de **497** a **331** errores.
- Resultado por modulo: `src/engine/command` paso de **166** a **0** errores.
- 2026-03-07: **Fase 2 completada**.
- Resultado: `tsc` paso de **331** a **187** errores.
- Resultado por modulo:
  - Se eliminaron los conflictos masivos de exports en `CameraSystem.ts`, `PostProcessing.ts`, `RenderPipeline.ts` y `rendering/index.ts`.
  - Quedaron errores de compatibilidad de tipos de `three`/`@types/three` para la siguiente fase tecnica (sin impacto visual directo).
- 2026-03-07: **Fase 3 completada**.
- Resultado: `tsc` paso de **187** a **123** errores.
- Resultado por modulo:
  - `src/engine/input` quedo sin errores TS en `InputManager.ts`, `useInput.ts`, `RebindUI.tsx` y `VirtualJoystick.tsx`.
  - Se habilito facade estatica compatible (`InputManager.map`, `InputManager.events`, getters/metodos estaticos), manteniendo el flujo UI actual.
- 2026-03-07: **Fase 4 completada**.
- Resultado: `tsc` paso de **123** a **94** errores.
- Resultado por modulo:
  - `src/engine/physics` quedo sin errores TS.
  - Se aplico compatibilidad real con `cannon-es` actual:
    - `Joint.ts`: fallback seguro para `slider` (sin `SliderConstraint` nativo), firmas de constructores corregidas y control `enable/disable` via API de `Constraint`.
    - `physics/index.ts`: exports alineados con simbolos reales (`PhysicsEngineOptions`, `ColliderShapeType`, `Raycaster`).
    - `PhysicsEngine.ts`: eliminada dependencia de `event-target-shim` usando `CANNON.EventTarget`.
    - Fixes puntuales en `Collider.ts`, `Raycast.ts` y `RigidBody.ts` para API actual de `cannon-es`.
- 2026-03-07: **Fase 5 completada**.
- Resultado: `tsc` paso de **94** a **78** errores.
- Resultado por modulo:
  - Higiene de tipado/importes aplicada en `audio`, `reyplay/build`, `mcp` y `simple-mcp`.
  - `examples/websocket` excluido del `tsconfig` principal para evitar dependencias opcionales no instaladas.
  - Errores sueltos de bajo riesgo corregidos en `AgentSystem`, `ConsolePanel` y `TerrainGenerator`.
- 2026-03-07: **Fase 6 completada**.
- Resultado: `pnpm exec tsc --noEmit` en **0 errores**.
- Resultado por modulo:
  - Hardening final en `animation`, `core`, `editor` y `rendering` sin cambios de layout/estilo.
  - Compatibilidad ajustada con `three@0.183` (`WebGLRenderTarget` MRT con `count`, `Data3DTexture`, guards de sombras/luces y correcciones de tipos de shader/LOD).
