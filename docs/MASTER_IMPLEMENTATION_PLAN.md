# REY30 3D Engine - Master Implementation Plan (Hybrid + AI First)

## Actualizacion 2026-03-08 (Scrib Engine Modular)
- Se agrega plan especifico de fases faltantes para arquitectura `Scrib Engine` en:
  - `docs/SCRIB_ENGINE_REMEDIATION_PLAN.md`
- Este documento maestro queda como vision global; el nuevo plan define ejecucion detallada por fase desde la Fase 2 en adelante.
- Cierre Fase 8 (release hardening) documentado en:
  - `docs/RELEASE_HARDENING_PHASE8.md`
- Cierre Fase 9 (go-live operacional) documentado en:
  - `docs/GO_LIVE_PHASE9.md`
- Cierre Fase 10 (observabilidad avanzada) documentado en:
  - `docs/OBSERVABILITY_PHASE10.md`
- Cierre Fase 11 (backup/restore programado) documentado en:
  - `docs/BACKUP_RESTORE_PHASE11.md`
- Cierre Fase 12 (capacidad y límites por modo/usuario) documentado en:
  - `docs/CAPACITY_PHASE12.md`
- Cierre Fase 14 (gobernanza de costos/cuotas por usuario) documentado en:
  - `docs/USAGE_GOVERNANCE_PHASE14.md`
- Cierre Fase 15 (FinOps UX: dashboard, tendencias y recomendaciones) documentado en:
  - `docs/FINOPS_PHASE15.md`
- Cierre Fase 16 (FinOps operativo avanzado: alertas personalizadas, CSV y costos por proyecto) documentado en:
  - `docs/FINOPS_PHASE16.md`
- Cierre Fase 17 (FinOps governance empresarial: aprobaciones, reportería multiusuario y monitoreo programado) documentado en:
  - `docs/FINOPS_PHASE17.md`
- Cierre Fase 18 (FinOps autopilot: triage de incidentes, seasonality budget y policies por rol/proyecto) documentado en:
  - `docs/FINOPS_PHASE18.md`
- Cierre Fase 19 (FinOps closed-loop automation: control, remediación automática y logs auditables) documentado en:
  - `docs/FINOPS_PHASE19.md`

## 0. Objetivo
Construir una app de creacion de juegos y personajes 3D con tres modos de trabajo:
- Manual: control total por el usuario.
- Hibrido: IA propone y el usuario corrige.
- AI-first: la IA orquesta flujo completo desde un mensaje.

El plan prioriza estabilidad tecnica, luego pipeline real, y despues automatizacion avanzada.

## 1. Prioridades de impacto (orden real)
1. Estabilizar base tecnica (`tsc`, runtime, rutas rotas, estado).
2. Corregir bug critico de plantillas (`recommendedObjects`).
3. Pipeline persistente de assets (no demo local).
4. Sistema real de scripts (archivo + editor + compilacion por script).
5. Orquestacion E2E de IA (crear -> validar -> corregir -> compilar).
6. MCP tools reales (sin `executed: true` simulado).
7. Build/export profesional (`.exe`, `.msi`, empaquetado y validaciones).
8. Terminal integrada real.
9. Modulos avanzados (paint 3D, adaptacion externa profunda, battle integration).

## 2. Arquitectura objetivo minima
### 2.1 Motores internos
1. Scene Engine: objetos, camara, luces, jerarquia, transform.
2. Mesh Engine: vertices, aristas, caras, normales, UV.
3. Material Engine: PBR y mapas de texturas.
4. Rigging Engine: huesos, pesos, skinning.
5. History Engine: undo/redo robusto por accion.
6. Asset Engine: import/export/persistencia/versionado.
7. AI Engine: prompts, generacion, validacion, autocorreccion.
8. Build Engine: exportadores, dependencias, paquetes destino.

### 2.2 Definicion de personaje 3D (modelo de datos)
Un personaje es una entidad compuesta por:
- Malla poligonal (vertices, aristas, caras).
- Normales y UVs.
- Materiales y texturas.
- Rig esqueletico (opcional).
- Pesos de deformacion.
- Animaciones base.

## 3. Niveles de agentes IA
## Nivel 1 - Asistente de modelado (copiloto)
Rol: no crea todo; delega acciones a agentes especializados.

Agentes:
1. Prompt to Character Concept Agent.
2. Reference Sheet Agent.
3. Anatomy Proportion Agent.
4. Topology Suggestion Agent.
5. Missing Parts Auto-complete Agent.
6. Rig Error Detection Agent.
7. Bone Auto-naming Agent.
8. Material Suggestion Agent.
9. Orchestrator Copilot Agent.

Salida: recomendaciones estructuradas + tareas ejecutables por modulo.

## Nivel 2 - Generador de malla base
Entradas aceptadas:
- Texto
- Imagen
- Boceto
- Vista frontal/lateral
- Fotografia
- Modelo de referencia

Salida:
- Base mesh o mesh aproximada
- Informe de calidad (topologia, agujeros, normales, escala)
- Propuesta de correccion manual/hibrida

## Nivel 3 - Generador completo de personaje
Entrada:
- Prompt
- Estilo
- Proporciones
- Edad
- Ropa
- Raza/fantasia
- Accesorios
- LOD objetivo
- Destino (juego/cine/movil)

Salida objetivo:
- Mesh
- UVs
- Texturas
- Rig
- Blendshapes
- Animaciones base

## 4. Pipeline IA de personajes (9 pasos)
1. Prompt interpretation (tipo, estilo, uso, restricciones).
2. Concept art / vistas (frente, lado, espalda, expresiones, paleta).
3. Base mesh generation.
4. Retopology.
5. UV unwrap.
6. Texturing/materials.
7. Auto rig + weights.
8. Validation (polycount, deformacion, UV, normales, huesos).
9. Export (Unity, Unreal, Blender, GLTF, FBX).

## 5. Diferencia de modos (manual vs IA)
### Manual
- Ventajas: control total, topologia limpia, produccion seria.
- Riesgos: mas tiempo.

### IA
- Ventajas: velocidad, ideacion, variaciones.
- Riesgos: topologia sucia, rig deficiente, mallas no listas.

### Hibrido
- Objetivo recomendado para V1/V2.
- IA acelera y usuario corrige calidad final.

## 6. Roadmap por fases
## Fase 0 - Estabilidad tecnica
Entregables:
- Reducir errores `tsc` por modulo hasta green por dominios.
- Guardrails de runtime en paneles criticos.
- Test de smoke en editor.

Definition of done:
- Build dev estable.
- Sin crash al crear escena, compilar, generar asset.

## Fase 1 - Editor de malla + import/export + visor
Entregables:
- Import OBJ/GLTF/FBX.
- Visor y operaciones base (move/scale/rotate, seleccion).
- Export OBJ/GLTF.

## Fase 2 - UVs + materiales + texturas
Entregables:
- UV unwrap basico.
- Material editor PBR minimo.
- Texturas base y preview de mapas.

## Fase 3 - IA base mesh + asistencia
Entregables:
- Nivel 1 y Nivel 2 operativos.
- Cadena prompt -> concepto -> base mesh -> validacion inicial.

## Fase 4 - Rigging + animacion
Entregables:
- Auto rig basico.
- Weight paint inicial.
- Animaciones base (idle/walk/run/attack).

## Fase 5 - IA avanzada personaje completo
Entregables:
- Nivel 3 parcial primero (mesh+uv+textura+rig).
- Luego blendshapes + animaciones adicionales.

## Fase 6 - Pipeline de juego E2E
Entregables:
- IA genera escena + scripts + validacion + compile.
- Ciclo autocorreccion por errores de compilacion.

## Fase 7 - Build y distribucion
Entregables:
- Exportador para web.
- Empaquetado desktop (`.exe`, `.msi`) con checks.
- Publicacion/compartir.

## Fase 8 - Pro features
Entregables:
- Pintado dinamico 3D.
- LOD manager.
- Libreria reusable (maniquies, torsos, cabezas, manos, ropa, accesorios).

## 7. Estado actual vs objetivo
### Actualizacion 2026-03-07
- Script Workspace real implementado:
  - API CRUD de scripts (`/api/scripts`).
  - Compilacion por script (`/api/scripts/compile`).
  - Panel de editor integrado (`Scr`) con vinculo a entidad.
- Persistencia compatible con shadow-copy:
  - `start-clean-app.bat` ahora exporta `REY30_SOURCE_PROJECT_DIR`.
- Correccion UX dev:
  - guard para ocultar indicador/watermark `N` de Next en desarrollo.

### Ya implementado
- Config de proveedores cloud/local con routing.
- Panel HB inicial con flujo manual/hibrido/AI-first.
- Chat con rutas OpenAI/Meshy/Runway/local.
- Build report + manifest de compilacion.

### Falta principal
- Persistencia real avanzada de assets (adaptacion externa completa + versionado).
- Ejecucion real de tools MCP.
- Ejecucion runtime por entidad de scripts ya compilados.
- Export desktop real.
- Terminal integrada real.

## 8. Plan de ejecucion inmediato (iteraciones cortas)
## Iteracion A (hardening)
1. Fix bug `recommendedObjects`.
2. Guardrails HB/ReyPlay para nulos y rutas.
3. Baseline de errores `tsc` por modulo.

## Iteracion B (pipeline real)
1. Galeria persistente con subida/listado/borrado.
2. Script workspace real con CRUD de `.ts`.
3. Asociacion script-entity con perfil de ejecucion.

## Iteracion C (agentes por nivel)
1. Catalogo de agentes nivel 1/2/3.
2. Orquestador por pipeline step.
3. Validacion automatica y reporte por etapa.

## Iteracion D (E2E)
1. Prompt unico -> plan -> ejecucion de herramientas.
2. Compilar, detectar errores, aplicar fix sugerido.
3. Exportar build de prueba.

## 9. KPIs de calidad
- Crash free sessions.
- Tiempo desde prompt a prototipo jugable.
- Errores de compilacion por 100 acciones.
- Porcentaje de assets importados correctamente.
- Tiempo de export por target.

## 10. Reglas de implementacion
- Nada de herramientas simuladas en rutas criticas.
- Cada modulo nuevo con logs, errores claros y fallback.
- Todo flujo IA debe permitir override manual.
- Ninguna accion destructiva sin confirmacion.
- Toda fase termina con checklist de verificacion.
