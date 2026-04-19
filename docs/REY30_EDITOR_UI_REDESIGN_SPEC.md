# REY30 Editor UI Redesign Spec

Fecha de referencia: 29 de marzo de 2026.

## 1. Diagnostico de la UI actual

La UI actual no esta vacia. El problema es que comunica demasiadas cosas al mismo tiempo.

Lectura honesta desde el codigo actual:

- `EditorLayout.tsx` mezcla shell, modos, navegacion y panel routing
- `SceneView.tsx` mezcla viewport, toolbar, overlays, acciones rapidas y HUD
- `HierarchyPanel.tsx` ya es potente, pero comparte foco con demasiados paneles hermanos
- `InspectorPanel.tsx` tiene profundidad funcional, pero visualmente esta comprimido
- `AssetBrowserPanel.tsx` ya tiene tree, resultados y preview, pero aun se siente como subsistema suelto
- `AnimationEditor.tsx` ya tiene timeline y rigging, pero vive como tab lateral y no como workspace real

Veredicto visual:

- no parece una demo vacia
- tampoco parece una herramienta cerrada de produccion
- hoy se ve como un editor ambicioso todavia sin jerarquia fuerte

## 2. Errores visuales graves

### Error A. Demasiados centros de atencion

Compiten:

- header superior
- selector de modos
- viewport toolbar
- overlays del viewport
- tab strip lateral
- inspector
- footer

Resultado:

- el usuario no sabe que zona manda

### Error B. El viewport no domina de verdad

El viewport ocupa espacio, pero esta invadido por overlays y acciones.

Resultado:

- se siente como tablero experimental
- no como ventana principal de produccion

### Error C. Neon usado como ambiente, no como jerarquia

El look oscuro funciona, pero los acentos deberian señalar:

- seleccion
- foco
- peligro
- estado activo
- CTA principal

No deberian colorear demasiadas superficies secundarias.

### Error D. Inspector denso y cansado

Hay mucho valor funcional, pero:

- poca separacion vertical
- tarjetas muy parecidas
- baja diferenciacion entre secciones

### Error E. Bottom area subrepresentada

La consola existe, pero el shell no la trata como centro operativo persistente.

Resultado:

- el sistema parece mas grande de arriba que profundo abajo

## 3. Propuesta visual nueva

### Direccion visual

No abandonar la estetica futurista.
Hay que volverla sobria, controlada y orientada a trabajo largo.

Principios:

- oscuro grafito como base
- acento neon solo para foco y estados
- paneles mas mates, menos brillo
- bordes mas finos
- tipografia mas legible
- densidad media, no maximalista

### Personalidad deseada

- mas "herramienta de produccion"
- menos "demo cyber"
- mas "precision console"
- menos "todo quiere llamar la atencion"

## 4. Distribucion del layout

### Parte superior

Solo 2 niveles:

1. App bar
   - logo
   - proyecto
   - estado
   - guardar
   - undo/redo
   - play/pause/stop
   - build/export
   - search / command palette
2. Workspace bar
   - Scene
   - Modeling
   - Materials
   - Animation
   - Scripting
   - Build
   - Debug

No mas botones de modo grandotes en cards.

### Lado izquierdo

Tabs verticales fijas:

- Scene
- Assets
- Project

Contenido por tab:

- `Scene`: hierarchy y colecciones
- `Assets`: asset tree + filtros rapidos
- `Project`: escenas, configuracion de proyecto, targets

### Centro

Viewport dominante.

Dentro del viewport:

- toolbar contextual horizontal compacta
- HUD minimo
- stats discretas
- overlays solo bajo demanda

### Lado derecho

Inspector puro.

Tabs:

- Object
- Components
- Material
- Physics
- Animation
- Metadata

### Parte inferior

Bottom dock tabulado:

- Console
- Timeline
- Build
- Profiler
- Assistant

Esta zona ya no es opcional. Es critica.

## 5. Reglas de diseno

### Regla 1. Un solo protagonista por zona

- izquierda = estructura
- centro = trabajo visual
- derecha = edicion contextual
- abajo = salida y tiempo

### Regla 2. El color acento no decora

Usarlo para:

- activo
- hover fuerte
- foco
- progreso
- warning/error segun color semantico

### Regla 3. Las cards no deben competir

Las secciones deben diferenciarse por:

- espaciado
- labels
- foldouts
- subtitulos

No por meterles mas color.

### Regla 4. Toolbars cortas

La topbar del producto y la toolbar del viewport no deben duplicarse.

### Regla 5. El estado activo debe ser obvio

Siempre debe verse:

- workspace activo
- panel activo
- entidad activa
- modo de transform activo
- estado runtime
- estado build

## 6. Componentes UI necesarios

### Shell

- `EditorTopBar`
- `WorkspaceTabs`
- `LeftDock`
- `RightInspectorDock`
- `BottomDock`
- `StatusBar`

### Navegacion

- `ProjectBreadcrumb`
- `SceneTabs`
- `PanelTabs`
- `CommandPalette`

### Viewport

- `ViewportToolbar`
- `ViewportHud`
- `ViewportStats`
- `SelectionBadge`
- `CameraBadge`
- `SnapBadge`

### Inspector

- `InspectorSection`
- `InspectorFieldRow`
- `InspectorFoldout`
- `ComponentBadge`
- `AddComponentMenu`

### Assets

- `AssetTree`
- `AssetFilterBar`
- `AssetGrid`
- `AssetList`
- `AssetPreviewCard`
- `AssetStatusBadge`

### Bottom dock

- `ConsolePane`
- `TimelinePane`
- `BuildPane`
- `ProfilerPane`
- `AssistantPane`

## 7. Sistema de colores y jerarquia

### Base

- `bg-app`: grafito casi negro
- `bg-panel`: gris grafito medio
- `bg-subpanel`: gris oscuro con poco contraste
- `bg-hover`: gris frio controlado

### Acentos

- `accent-primary`: cyan/azul electrico solo para foco
- `accent-secondary`: verde para ok
- `accent-warning`: ambar
- `accent-danger`: rojo controlado

### Texto

- `text-primary`: casi blanco
- `text-secondary`: gris claro
- `text-muted`: gris medio
- `text-disabled`: gris bajo contraste

### Jerarquia de grosor

- bordes 1px
- separadores mas suaves que los paneles
- sombras casi invisibles

## 8. Cosas que debes simplificar

- el selector de modos tipo cards del header
- los labels flotantes del viewport
- el exceso de tabs en el panel derecho
- botones de crear primitivas pegados dentro del viewport
- texto tecnico siempre visible cuando podria ir a HUD contextual
- footer convertido en cinta de indicadores plana

## 9. Cosas que debes esconder hasta que maduren

- nombres como `AI Engine` si no van a accion concreta
- `QA Demo` o paneles experimentales no esenciales
- modulos con valor parcial que no esten integrados al flujo principal
- estados visuales heroicos para features que aun no tienen workflow serio

Regla:

si una funcion no aguanta una demo de 30 segundos de principio a fin, no debe ocupar espacio premium.

## 10. Wireframe textual por zonas

```text
+--------------------------------------------------------------------------------------+
| REY30 | Proyecto | Dirty/Save | Undo Redo | Play Pause Stop | Build | Search/Cmd K |
+--------------------------------------------------------------------------------------+
| Scene | Modeling | Materials | Animation | Scripting | Build | Debug              |
+----------------------+------------------------------------------------+--------------+
| LEFT DOCK            | VIEWPORT                                       | INSPECTOR    |
|----------------------|------------------------------------------------|--------------|
| [Scene]              | Viewport toolbar compacta                      | Object       |
| Search               | Move Rotate Scale | World/Local | Snap | Cam   | Components   |
| Collections          |------------------------------------------------| Material     |
| Hierarchy Tree       |                                                | Physics      |
|                      |                                                | Animation    |
| [Assets]             |   escena real / gizmos / seleccion / camera    | Metadata     |
| folders              |                                                |--------------|
| filters              |                                                | secciones    |
| asset tree           |                                                | foldouts     |
|                      |                                                | campos       |
+----------------------+------------------------------------------------+--------------+
| Console | Timeline | Build | Profiler | Assistant                                    |
|--------------------------------------------------------------------------------------|
| logs / dope sheet / artifacts / fps / assistant operativo                            |
+--------------------------------------------------------------------------------------+
| scene state | selection | camera | snap | build status | errors | storage/backend   |
+--------------------------------------------------------------------------------------+
```

## 11. Estados visuales que si deben existir

### Seleccion activa

- borde visible en hierarchy
- header de inspector con nombre y tipo
- badge en viewport
- highlight tecnico, no glow exagerado

### Botones primarios

Solo para:

- guardar
- build/export
- run/play
- accion principal del panel

### Botones secundarios

Para:

- filtros
- toggles
- utilidades
- acciones contextuales

### Estado de proyecto

Deben existir chips claros para:

- `dirty`
- `saving`
- `building`
- `ready`
- `errors`

## 12. Tipografia, espaciado y agrupacion

### Tipografia

- una sans principal para shell
- mono solo en consola, logs y datos tecnicos
- labels pequenos pero legibles

### Espaciado

- grid base de 4 px
- panel sections: 12 a 16 px
- rows compactas pero respirables

### Agrupacion

Agrupar controles por tarea, no por tecnicismo.

Ejemplo correcto en inspector:

- Transform
- Rendering
- Physics
- Animation
- Scripting
- Metadata

No mezclar controles de dominios distintos en una misma tarjeta.

## Veredicto UX/UI

La UI actual ya tiene energia, pero no tiene disciplina.

La mejora mas transformadora no es "hacerla mas bonita".
Es darle autoridad a cada zona, quitar ruido, y convertir workspaces, bottom dock e inspector en herramientas de produccion reales.
