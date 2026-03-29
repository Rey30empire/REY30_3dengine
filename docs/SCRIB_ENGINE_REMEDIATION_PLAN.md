# REY30 3D Engine - Plan de Correccion e Implementacion (Fases Faltantes)

## 1) Objetivo
Implementar un `Scrib Engine Modular` unificado para `MODE_MANUAL`, `MODE_HYBRID` y `MODE_AI_FIRST`, donde:

- Todo se construye con `Scene + Entities + Scribs`.
- Cada scrib es editable en codigo (manifest + config + code).
- Existe un `Composer` unico para validar, resolver dependencias y renderizar.
- El mismo runtime ejecuta los 3 modos.
- El sistema es simple para el usuario, seguro para produccion y modular para crecer.

## 2) Estado actual (base ya cerrada)

- Fase 0 y Fase 1 tecnicas ya estan aplicadas y verificadas (`lint`, `typecheck`, `build` en verde).
- Ya existe store global, editor 3D, runtime de scripts por entidad y APIs base de scripts/assets.
- Falta converger toda la app al modelo `Scrib Engine` con UX limpia por modo y seguridad final multiusuario.

## 3) Reglas no negociables para las fases nuevas

1. Un solo runtime para los 3 modos.
2. Scrib siempre asignado a `entity` o `scene` (nunca a otro scrib).
3. Cualquier scrib editable por el usuario y recargable sin reiniciar escena.
4. Sin APIs globales compartidas: cada usuario configura sus propias APIs (BYOK) y asume costo/uso.
5. Sandbox obligatorio para ejecucion de scribs con aislamiento y kill-switch.
6. El editor abre directo al workspace principal con 3 botones: `Manual`, `Hybrid`, `AI`.

## 4) Arquitectura objetivo (6 sistemas)

1. `Scene System`: contenedor principal de entidades, scribs globales y settings.
2. `Entity System`: entidades tipadas (`character`, `terrain`, `object`, `weapon`, `enemy`, `camera`, `light`, `scene`, `ui`, `zone`).
3. `Scrib System`: contrato fijo de scrib (`id`, `type`, `target`, `config`, `code`, `requires`, `optional`, `provides`).
4. `Composer System`: `Render All` (collect -> validate -> resolve deps -> build runtime -> init -> loop -> render).
5. `Runtime System`: ejecuta scribs en orden resuelto por composer.
6. `Editor System`: Scene Explorer, Viewport, Inspector, Scrib Studio, Code Editor, Mode Switch, Library, Console.

## 5) Plan por fases faltantes

## Fase 2 - UX simplificada + Mode Router (base de producto)
Enfoque: ordenar la app para que inicie limpia y orientada al flujo real.

Entregables:
- Layout unico inicial con solo editor principal + barra superior de 3 botones:
  - `Manual`
  - `Hybrid`
  - `AI`
- `ModeRouter` en store para controlar capacidades por modo:
  - `MODE_MANUAL`: herramientas completas manuales.
  - `MODE_HYBRID`: AI genera base + usuario edita scribs.
  - `MODE_AI_FIRST`: AI opera pipeline completo, usuario corrige.
- Limpieza de paneles secundarios no esenciales de la vista inicial.

Definition of done:
- Al abrir la app solo se ve editor principal y selector de modo.
- Cambio de modo actualiza layout/acciones sin recargar la app.
- No regresiones en viewport, seleccion, inspector y guardado base.

---

## Fase 3 - Scrib Core (modelo, registry, recipes, assign)
Enfoque: establecer el nucleo modular.

Entregables:
- `ScribManifest` y `ScribInstance` tipados en `src/types`.
- `ScribRegistry` con:
  - `register()`
  - `get()`
  - `list()`
  - `validate()`
- Catalogo inicial atomic:
  - `transform`, `mesh`, `material`, `movement`, `collider`, `physics`, `animation`, `particles`, `audio`, `ui`, `ai`, `cameraFollow`, `damage`, `inventory`
- Catalogo composed (recipes):
  - `characterBasic`, `enemyBasic`, `terrainBasic`, `weaponBasic`, `doorBasic`, `vehicleBasic`
- `AssignSystem`: solo `entity` o `scene`.
- Persistencia en disco/API para `manifest`, `config`, `code`.

Definition of done:
- Se puede crear, listar, validar y asignar scribs.
- Recipes aplican multiples atomic en una accion.
- Validaciones bloquean scribs invalidos antes de runtime.

---

## Fase 4 - Composer + Runtime unificado + Hot Reload
Enfoque: convertir scribs en ejecucion estable.

Entregables:
- `Composer` con pipeline:
  1. Collect entities
  2. Collect scribs
  3. Validate
  4. Resolve dependencies
  5. Build runtime plan
  6. Init scene
  7. Start loop
  8. Render
- `DependencyResolver` para `requires/optional/provides`.
- Auto-add de dependencias faltantes (si existe recipe compatible).
- Runtime por orden de prioridad definido por composer.
- Hot reload de scrib al guardar (`reload scrib -> update runtime -> re-render`) sin reiniciar escena.

Definition of done:
- Boton `Render All` arma y ejecuta escena con scribs activos.
- Si un scrib falla, se desactiva solo ese scrib y el motor sigue vivo.
- Guardar un scrib refleja cambios en runtime en caliente.

---

## Fase 5 - Scrib Studio UI (Create/Assign/Edit/Library/Console)
Enfoque: UX completa para operar scribs facilmente.

Entregables:
- Panel `Scrib Studio` con tabs:
  - `Create`
  - `Assign`
  - `Edit`
  - `Library`
  - `Console`
- `Create`: target type -> capability -> config form -> save.
- `Assign`: panel doble (scene tree + capabilities), click entity + click capability.
- `Edit`: editor real de archivo (Monaco o CodeMirror) con:
  - open, edit, save, duplicate, delete, reload
- `Library`: listado y asignacion rapida de scribs y recipes.
- `Console`: comandos avanzados tipo:
  - `createScrib({ target: "player_01", type: "movement", config: { speed: 10 } })`

Definition of done:
- Usuario no tecnico puede crear/asignar scrib sin tocar JSON manual.
- Usuario tecnico puede editar codigo directo y ver efecto live.
- Todas las acciones quedan auditadas (quien, cuando, que scrib).

---

## Fase 6 - Pipelines por modo (Manual / Hybrid / AI First)
Enfoque: comportamiento distinto, mismo core.

Entregables:
- `MODE_MANUAL`:
  - Flujo completo manual para entities + scribs + composer.
- `MODE_HYBRID`:
  - AI crea base de escena/entidades/scribs.
  - Usuario corrige manifest/config/code y re-renderiza.
- `MODE_AI_FIRST`:
  - Input de prompt unico.
  - Orquestador asigna agentes y ejecuta pipeline automaticamente.
  - Usuario solo valida/corrige lo final.
- `AI Generation Contract`:
  - La AI siempre devuelve scene/entities/scribs/configs validables.

Definition of done:
- Los 3 modos crean una escena jugable usando el mismo Composer/Runtime.
- Hybrid y AI First no duplican logica del modo Manual.

---

## Fase 7 - Seguridad de produccion + cuentas + API BYOK por usuario
Enfoque: multiusuario seguro, sin claves globales.

Entregables:
- Autenticacion de usuarios (NextAuth o equivalente).
- Seccion `Usuario -> Config APIs` para que cada usuario cargue sus propias claves.
- Almacenamiento cifrado de API keys por usuario.
- Eliminacion de dependencia de keys globales en `.env` para proveedores de IA.
- Politica de costos/uso por usuario (responsabilidad individual).
- Sandbox de ejecucion de scrib:
  - wrapper `try/catch`
  - limites de tiempo/memoria
  - disable automatico al fallo
  - bloqueo de acceso peligroso (filesystem/network) salvo permisos.
- RBAC minimo (`owner`, `editor`, `viewer`) y logs de seguridad.

Definition of done:
- Ningun usuario usa APIs de otro usuario.
- Fallas en scrib no rompen el engine completo.
- Auditoria permite rastrear uso y errores por cuenta.

---

## Fase 8 - Cierre de publicacion (release hardening)
Enfoque: calidad y operacion real.

Entregables:
- Suite de pruebas:
  - unit (registry/composer/resolver/runtime)
  - integration (api scrib + hot reload + modos)
  - e2e (flujo manual/hybrid/ai-first)
- Telemetria:
  - errores de scrib por tipo
  - tiempos de compose
  - tiempo prompt->escena jugable
- Performance budgets de editor/runtime.
- Checklist de release y rollback.
- Documentacion para usuario final y admin.

Definition of done:
- Build reproducible + smoke pass + e2e criticos en verde.
- App lista para publicacion controlada (staging -> prod).

## 6) Mapeo directo a tu codigo actual

- `src/store/editorStore.ts`:
  - agregar `engineMode` (`MODE_MANUAL|MODE_HYBRID|MODE_AI_FIRST`)
  - permisos por modo y estado del composer.
- `src/engine/gameplay/ScriptRuntime.ts`:
  - migrar a `ScribRuntime` con plan precompuesto por composer.
- `src/engine/editor/EditorLayout.tsx`:
  - reemplazar layout sobrecargado por shell principal y `Scrib Studio`.
- `src/engine/editor/ScriptWorkspacePanel.tsx`:
  - evolucionar a `ScribStudioPanel` (Create/Assign/Edit/Library/Console).
- `src/app/api/scripts/*`:
  - evolucionar a `/api/scribs/*` (manifest/config/code + validate + assign + reload).
- `src/engine/ai/*` y `src/engine/agents/*`:
  - integrar contrato de generacion para Hybrid/AI First.

## 7) Riesgos y mitigacion

- Riesgo: sobrecarga de UI.
  - Mitigacion: fase 2 primero, shell limpio obligatorio.
- Riesgo: scrib inseguro rompe runtime.
  - Mitigacion: sandbox + timeouts + disable por scrib.
- Riesgo: duplicar logica por modo.
  - Mitigacion: un solo core (Scene/Entity/Scrib/Composer/Runtime), solo cambia orquestacion.
- Riesgo: deuda tecnica por migracion gradual.
  - Mitigacion: feature flags y adaptadores Script->Scrib temporales.

## 8) Orden recomendado de ejecucion inmediata

1. Fase 2 (UX + Mode Router).
2. Fase 3 (Scrib Core).
3. Fase 4 (Composer + Runtime + Hot Reload).
4. Fase 5 (Scrib Studio UI).
5. Fase 6 (Hybrid + AI First sobre core estable).
6. Fase 7 (Auth + BYOK + Sandbox + seguridad).
7. Fase 8 (QA final y release).

