# REY30 Editor Brutal Rebuild Plan

Fecha de referencia: 29 de marzo de 2026.

## Documentos complementarios

- `docs/REY30_EDITOR_ARCHITECTURE_BLUEPRINT.md`
- `docs/REY30_EDITOR_UI_REDESIGN_SPEC.md`

## 1. Diagnóstico brutal

Sí hay base, pero hoy no intimida a la competencia.

La lectura honesta del producto es esta:

- visualmente parece un editor prometedor
- funcionalmente transmite mas amplitud que profundidad
- el shell general se siente como demo avanzada, no como herramienta de produccion cerrada
- el motor/editor aun no deja clara su ventaja brutal frente a Blender, Godot, Unity o Unreal

Lo mas peligroso no es la estetica. Lo mas peligroso es el enfoque:

- demasiadas areas visibles a la vez
- demasiadas promesas simultaneas
- poco flujo principal claramente orquestado
- poca demostracion de “músculo” en el viewport

En este estado, la lectura competitiva seria:

> “Tiene muchas piezas, pero todavia no muestra por que alguien deberia cambiar de herramienta.”

## 2. Problemas principales detectados

### UI visual

- La pantalla compite consigo misma.
- Hay demasiadas zonas activas al mismo tiempo.
- Falta una jerarquia fuerte de primer plano, segundo plano y contexto.
- Se siente “cargado” antes que “preciso”.

### UX y flujo de trabajo

- No se ve un recorrido natural de trabajo.
- No queda claro que se hace primero, despues y donde.
- El editor enseña modulos, pero no enseña pipeline.

### Arquitectura de producto

- El producto quiere ser motor, editor, suite 3D, entorno IA y pipeline de build a la vez.
- Esa ambicion solo gana si el flujo es mas rapido que herramientas separadas.
- Si no se prioriza, se vuelve una coleccion de subsistemas sin centro.

### Jerarquia de herramientas

- La topbar, la sidebar y el panel derecho compiten por rol.
- Falta una jerarquia tipo:
  - estructura
  - viewport
  - inspector
  - salida/contexto

### Viewport

- El viewport aun no vende poder tecnico.
- Con primitivas, grid y overlays, la sensacion es de sandbox temprano.
- Falta escena hero, materiales serios, sombras, luz y operacion precisa.

### Inspector de propiedades

- Tiene informacion, pero no transmite claridad operativa.
- Falta mejor agrupacion por componentes.
- Le falta mejor lectura para sesiones largas.

### Gestión de assets

- Ya existe navegador de assets y gallery, pero falta narrativa de “asset pipeline”.
- Falta claro registro, estado, origen, preview, dependencias y salud del asset.

### Pipeline de compilación/exportación

- Existe backend y build, pero el usuario no ve un centro claro de build/export.
- Eso debilita la sensacion de motor serio listo para ship.

### Diferenciación frente a Blender, Godot, Unity y Unreal

- Hoy compite por “cantidad de secciones”.
- Debe competir por “flujo integrado”.
- Si vende “todo-en-uno”, cada salto entre tarea debe sentirse mas corto, no mas confuso.

## 3. Qué eliminar

- Etiquetas o nombres grandilocuentes sin accion concreta visible.
- Navegacion duplicada entre topbar, sidebar y panel derecho.
- Botones de modos que no cambian el layout ni el set de herramientas.
- Elementos flotantes dentro del viewport que no ayuden a seleccionar, transformar o depurar.
- Areas del shell que solo decoran tamaño y no entregan informacion util.
- Modulos “vistosos” que no tengan caso de uso fuerte en el flujo principal.

## 4. Qué agregar

Prioridad alta:

- Scene Hierarchy de verdad, con filtros, parent-child y estados visibles.
- Asset Browser conectado a un registry real, no solo lista suelta.
- Console / Logs util permanente en zona inferior.
- Timeline / Animation panel anclado y legible.
- Build / Export center con estado, tareas y errores.
- Gizmos mas claros y legibles.
- Sistema de seleccion, multi-seleccion y snapping visible.
- Estados del proyecto: dirty, saving, building, play, paused, errors.
- Workspace modes reales.
- Onboarding visual de flujo.
- Shortcuts visibles y command palette.
- Inspector basado en componentes.

Prioridad media:

- Profiler basico.
- HUD de performance opcional.
- Health/status badges por modulo.
- Dock tabs persistentes.
- Layout presets por workspace.

## 5. Qué cambiar

### Barra superior

- Debe dejar de ser un inventario de modos y convertirse en control del workspace activo.
- Solo debe mostrar herramientas del contexto actual.
- Debe incluir estado de proyecto, play, build, search y command palette.

### Panel lateral izquierdo

- Debe concentrarse en Scene + Project + Assets.
- Menos “catalogo de marketing”, mas estructura de trabajo.
- Debe vivir ahi la jerarquia y accesos al proyecto.

### Panel derecho

- Debe ser inspector puro.
- Tabs claros: Transform, Components, Materials, Physics, Animation, Metadata.
- Debe priorizar lectura y edicion rapida.

### Zona inferior

- Debe ser critica.
- Console, Timeline, Profiler, Build Output y Assistant operan mejor aqui.
- No puede seguir medio vacia.

### Viewport

- Debe ganar foco.
- Menos overlays ornamentales.
- Mejor escena demo.
- Mejor lectura de seleccion activa, gizmos, camera state y stats.

### Organización por workspaces o modos

- Scene
- Modeling
- Materials
- Animation
- Scripting
- Build
- Debug

Cada uno con layout y herramientas propias.

### Lenguaje visual

- Menos ruido neon en elementos secundarios.
- El neon debe quedar para foco, seleccion, estados y CTA.
- Mas contraste funcional y menos brillo decorativo.

### Nombres vagos o grandilocuentes

- “AI Engine” debe bajar a acciones concretas.
- “Modular Lab” debe explicitar su resultado.
- “QA Demo” o similares deben esconderse si no son parte del flujo real del usuario final.

## 6. Rediseño propuesto

### Parte superior

- App bar compacta con:
  - selector de workspace
  - archivo/proyecto
  - undo/redo
  - play/pause/stop
  - build/export
  - command palette
  - estado global

### Lado izquierdo

- Tabs verticales:
  - Scene
  - Assets
  - Project

Dentro de `Scene`:

- jerarquia
- search
- filtros por tipo
- estados de visibilidad/lock/selectable

### Centro

- Viewport dominante
- toolbar contextual del viewport
- stats discretas
- overlays tecnicos bajo demanda

### Lado derecho

- Inspector dockable
- header con objeto seleccionado
- tabs por categoria
- componentes con foldouts claros

### Parte inferior

- sistema de tabs:
  - Console
  - Timeline
  - Build
  - Profiler
  - Assistant

### Ventanas acoplables

- Todas las zonas secundarias deben ser dockables.
- Layout persistente por workspace.

### Sistema de tabs

- Tabs sobrias y densidad controlada.
- Indicadores de estado en tab: error, dirty, running.

### Workspaces especializados

- Scene: viewport + hierarchy + inspector + console
- Modeling: viewport + tool shelf + topology/actions + inspector
- Materials: preview + node/material inspector + asset browser
- Animation: hierarchy + viewport + timeline + curves + inspector
- Scripting: scripts + console + docs + runtime output
- Build: export targets + logs + artifacts + validations
- Debug: profiler + logs + entity state + metrics

## 7. Roadmap realista

### Fase 1: impacto alto, implementación razonable

- Reordenar shell del editor por workspaces reales.
- Dar funcion critica a la zona inferior.
- Separar Scene Hierarchy / Asset Browser / Inspector.
- Hacer command palette y shortcuts visibles.
- Crear Build Center visible.
- Mejorar escena demo del viewport.

### Fase 2: consolidación

- Layout persistente.
- Component inspector unificado.
- Estados globales del proyecto.
- Profiler basico.
- Asset registry serio.
- Gizmos + snapping + selection refinement.

### Fase 3: músculo competitivo real

- pipeline unificado de crear-editar-probar-build
- tooling de IA aterrizado a acciones concretas
- escenas hero y demos verticales
- plugins/modulos desacoplados
- performance tooling y debugging mas fuerte

## 8. Diferenciación estratégica

REY30 no debe ganar por copiar todo. Debe ganar por unir.

Principios:

- una sola fuente de verdad para scene, assets y runtime
- cero friccion entre editar, probar y exportar
- IA como acelerador operativo, no como etiqueta
- menos ida y vuelta entre herramientas externas
- workflows opinionados para indies y equipos pequeños

La promesa no debe ser:

> “tambien tenemos esto”

Debe ser:

> “aqui haces el flujo completo mas rapido y con menos roturas.”

## 9. Propuesta técnica accionable

- Crear un `EditorShell` con slots estables: topbar, left, center, right, bottom.
- Separar layout por workspace en configuraciones serializables.
- Centralizar tabs inferiores en un `BottomDock`.
- Mover estado UI global a un store de shell del editor.
- Definir `SceneHierarchy`, `AssetBrowser`, `Inspector`, `Console`, `Timeline`, `BuildCenter`, `ProfilerPanel`.
- Integrar `CommandPalette` y `ShortcutRegistry`.
- Reducir la topbar a comandos del modo actual.

## 10. Tareas exactas para programar

### Backlog

- Título: Workspace shell real
  - Objetivo: separar Scene, Modeling, Materials, Animation, Scripting, Build y Debug con layouts dedicados
  - Prioridad: P0
  - Impacto: muy alto
  - Dificultad: media
  - Dependencias: store de layout, tabs dockables

- Título: Bottom dock funcional
  - Objetivo: convertir la franja inferior en Console / Timeline / Build / Profiler / Assistant
  - Prioridad: P0
  - Impacto: muy alto
  - Dificultad: media
  - Dependencias: shell layout

- Título: Scene hierarchy seria
  - Objetivo: mostrar estructura, filtros, parentado y estados
  - Prioridad: P0
  - Impacto: alto
  - Dificultad: media
  - Dependencias: scene store y seleccion

- Título: Inspector por componentes
  - Objetivo: agrupar transform, render, physics, animation, scripts y metadata
  - Prioridad: P0
  - Impacto: alto
  - Dificultad: alta
  - Dependencias: schema de componentes y seleccion activa

- Título: Build center
  - Objetivo: exponer targets, validaciones, logs y artefactos
  - Prioridad: P0
  - Impacto: alto
  - Dificultad: media
  - Dependencias: build pipeline existente

- Título: Command palette
  - Objetivo: acceso rapido a acciones y navegacion
  - Prioridad: P1
  - Impacto: alto
  - Dificultad: media
  - Dependencias: registry de acciones

- Título: Asset registry
  - Objetivo: normalizar assets, previews, estados y origen
  - Prioridad: P1
  - Impacto: alto
  - Dificultad: alta
  - Dependencias: gallery/assets/packages

- Título: Profiler basico
  - Objetivo: mostrar fps, frame time, draw calls y memoria
  - Prioridad: P1
  - Impacto: medio-alto
  - Dificultad: media
  - Dependencias: hooks de runtime/render

- Título: Viewport hero scene
  - Objetivo: reemplazar primitivas por una escena que venda calidad tecnica
  - Prioridad: P1
  - Impacto: alto
  - Dificultad: media
  - Dependencias: materials, lighting, asset set curado

## 11. Entrega final

### Veredicto final brutal

Va por camino util, pero todavia no asusta.

### Debilidad mas grave hoy

Falta enfoque operativo. Se ve grande, pero no se siente profundo ni guiado por flujo.

### Mejora mas transformadora

Rediseñar el editor alrededor de workspaces reales con bottom dock funcional y pipeline visible.

### Ventaja competitiva real si se ejecuta bien

Un flujo unificado donde crear, editar, probar, automatizar y exportar ocurre dentro del mismo entorno sin romper el contexto del usuario.
