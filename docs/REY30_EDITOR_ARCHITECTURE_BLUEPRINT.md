# REY30 Editor Architecture Blueprint

Fecha de referencia: 29 de marzo de 2026.

## Contexto real del repo

Hoy el editor ya tiene piezas reales:

- shell principal en `src/engine/editor/EditorLayout.tsx`
- viewport y tooling en `src/engine/editor/SceneView.tsx`
- outliner en `src/engine/editor/HierarchyPanel.tsx`
- inspector en `src/engine/editor/InspectorPanel.tsx`
- asset browser en `src/engine/editor/AssetBrowserPanel.tsx`
- consola en `src/engine/editor/ConsolePanel.tsx`
- animacion en `src/engine/editor/AnimationEditor.tsx`
- estado global con Zustand en `src/store/editorStore.ts` y `src/store/slices/*`

La base existe. El problema no es falta de modulos. El problema es que el shell, el viewport, la navegacion y los workspaces estan demasiado mezclados.

Este documento no propone reescribir todo. Propone desacoplar por capas y reutilizar lo que ya sirve.

## 1. Arquitectura general

### Objetivo

Separar el producto en 5 capas claras:

1. `runtime/core`
   - ECS, escena, renderer, script runtime, build/runtime
2. `editor/shell`
   - layout, docks, workspaces, command palette, shortcuts, status bar
3. `editor/panels`
   - hierarchy, inspector, assets, console, build, profiler, timeline
4. `editor/viewport`
   - viewport, gizmos, seleccion, overlays, camara, herramientas contextuales
5. `editor/services`
   - registries, eventos internos, persistencia de layout, plugins, asset registry

### Regla central

El runtime no debe depender del shell del editor.

El editor si puede depender del runtime y de la data del proyecto, pero a traves de adaptadores claros.

### Estructura de carpetas recomendada

```text
src/
  engine/
    core/
      ECS.ts
      scene/
      runtime/
      rendering/
    editor/
      shell/
        EditorShell.tsx
        EditorTopBar.tsx
        EditorLeftDock.tsx
        EditorRightDock.tsx
        EditorBottomDock.tsx
        EditorStatusBar.tsx
        WorkspaceSwitcher.tsx
        layoutPersistence.ts
        workspaceDefinitions.ts
      viewport/
        SceneViewport.tsx
        ViewportToolbar.tsx
        ViewportHud.tsx
        ViewportOverlay.tsx
        viewportSession.ts
        selection/
        gizmos/
        camera/
        modeling/
      panels/
        hierarchy/
        inspector/
        assets/
        console/
        animation/
        build/
        profiler/
        assistant/
      workspaces/
        scene/
        modeling/
        materials/
        animation/
        scripting/
        build/
        debug/
      services/
        panel-registry/
        command-registry/
        shortcut-registry/
        asset-registry/
        build-center/
        plugin-host/
        editor-events/
  store/
    slices/
      editorShellSlice.ts
      selectionSlice.ts
      assetRegistrySlice.ts
      buildSlice.ts
      consoleSlice.ts
      workspaceSlice.ts
```

### Mapa de migracion desde el codigo actual

- `EditorLayout.tsx` -> `EditorShell.tsx` + `WorkspaceHost.tsx` + `EditorStatusBar.tsx`
- `SceneView.tsx` -> `SceneViewport.tsx` + `ViewportHud.tsx` + `ViewportSession`
- `EditorToolbar.tsx` -> `ViewportToolbar.tsx`
- `HierarchyPanel.tsx` -> se conserva, pero se extrae logica de colecciones y filtros
- `InspectorPanel.tsx` -> se parte en inspector shell + cards por componente
- `AssetBrowserPanel.tsx` -> se divide en tree, results, preview, actions
- `AnimationEditor.tsx` -> timeline shell + clip browser + rig tools + curve editor
- `ConsolePanel.tsx` -> console store + console panel + output badges

## 2. Modulos recomendados

### A. Editor Shell

Responsable de:

- layout general
- docks
- workspaces
- tabs inferiores
- estado visual global
- estado de proyecto y build

No debe contener:

- logica de escena
- logica de renderer
- logica de assets
- logica de animacion

### B. Workspace System

Responsable de:

- definir que paneles aparecen por workspace
- cargar layout persistente por modo
- decidir toolbar contextual

Workspaces base:

- `scene`
- `modeling`
- `materials`
- `animation`
- `scripting`
- `build`
- `debug`

### C. Viewport Domain

Responsable de:

- render
- camara
- gizmos
- seleccion
- snapping
- overlays
- herramientas de modelado y paint

No debe renderizar botones de shell ni decidir que paneles se ven fuera del viewport.

### D. Scene Hierarchy

Responsable de:

- arbol scene/entity
- parent-child
- colecciones
- filtros
- estados `visible`, `locked`, `active`, `selected`

### E. Inspector basado en componentes

Responsable de:

- renderizar el objeto seleccionado
- agrupar componentes por dominio
- exponer acciones sobre componentes

Debe trabajar con un `InspectorAdapter`, no leer logica de todos los sistemas directamente.

### F. Asset Registry

Responsable de:

- registro unificado de assets
- origen
- scope
- previews
- tags
- dependencias
- estado de importacion
- readiness para build

### G. Build Center

Responsable de:

- targets
- validaciones
- jobs
- logs
- artifacts
- historial de builds

### H. Plugin Host

Responsable de:

- registrar paneles
- registrar comandos
- registrar shortcuts
- registrar export targets

## 3. Responsabilidades por modulo

| Modulo | Responsabilidad | No debe hacer |
|---|---|---|
| `EditorShell` | Coordinar layout y estado de shell | mutar entidades |
| `WorkspaceHost` | Resolver configuracion del workspace actual | tocar Three.js |
| `SceneViewport` | Render y herramientas del viewport | decidir layout global |
| `HierarchyPanel` | Navegacion estructural de escena | editar materiales |
| `InspectorPanel` | Edicion contextual del seleccionado | controlar build |
| `AssetBrowserPanel` | Navegacion y acciones de assets | renderizar escena |
| `ConsolePanel` | Logs y eventos operativos | almacenar estado del proyecto |
| `AnimationWorkspace` | rig, timeline, dope sheet, curves | cargar shell completo |
| `BuildCenterPanel` | export, build, errores, artefactos | leer input directo del viewport |
| `ProfilerPanel` | telemetria | controlar seleccion |
| `CommandRegistry` | ejecutar acciones globales | conocer UI concreta |
| `ShortcutRegistry` | mapear teclado a comandos | mutar React state directo |
| `PanelRegistry` | conocer paneles disponibles | ejecutar logica de dominio |

## 4. Interfaces o contratos entre modulos

### WorkspaceDefinition

```ts
export type WorkspaceId =
  | 'scene'
  | 'modeling'
  | 'materials'
  | 'animation'
  | 'scripting'
  | 'build'
  | 'debug';

export interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  icon: string;
  defaultLayout: DockLayout;
  topbarTools: string[];
  leftPanels: string[];
  rightPanels: string[];
  bottomPanels: string[];
  centerView: 'viewport' | 'build-center' | 'script-workbench';
}
```

### DockLayout

```ts
export interface DockPanelRef {
  panelId: string;
  visible: boolean;
  pinned?: boolean;
}

export interface DockColumn {
  size: number;
  tabs: DockPanelRef[];
  activePanelId: string | null;
}

export interface DockLayout {
  left: DockColumn[];
  right: DockColumn[];
  bottom: DockColumn[];
}
```

### PanelDefinition

```ts
export interface PanelDefinition {
  id: string;
  title: string;
  zone: 'left' | 'right' | 'bottom' | 'floating';
  defaultSize: number;
  render: () => React.ReactNode;
  isAvailable?: (context: EditorContext) => boolean;
}
```

### CommandDefinition

```ts
export interface CommandDefinition {
  id: string;
  title: string;
  keywords: string[];
  category: 'scene' | 'assets' | 'animation' | 'build' | 'debug' | 'global';
  when?: (context: EditorContext) => boolean;
  run: (context: EditorContext) => void | Promise<void>;
}
```

### ShortcutDefinition

```ts
export interface ShortcutDefinition {
  id: string;
  combo: string;
  commandId: string;
  workspace?: WorkspaceId | 'global';
  preventDefault?: boolean;
}
```

### AssetRecord

```ts
export interface AssetRecord {
  id: string;
  name: string;
  type: 'model' | 'texture' | 'material' | 'script' | 'scene' | 'audio' | 'animation' | 'other';
  sourcePath: string;
  storageKey: string;
  previewUrl?: string;
  tags: string[];
  dependencies: string[];
  status: 'ready' | 'processing' | 'error' | 'missing';
  importWarnings: string[];
  metadata: Record<string, unknown>;
}
```

### BuildJob

```ts
export interface BuildJob {
  id: string;
  target: 'web' | 'desktop' | 'unity-package' | 'scene-archive';
  status: 'idle' | 'queued' | 'running' | 'failed' | 'succeeded';
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  artifactPaths: string[];
  diagnostics: BuildDiagnostic[];
}
```

### Editor events

```ts
export type EditorEvent =
  | { type: 'selection.changed'; entityIds: string[] }
  | { type: 'asset.imported'; assetId: string }
  | { type: 'build.started'; jobId: string }
  | { type: 'build.finished'; jobId: string; ok: boolean }
  | { type: 'viewport.mode.changed'; mode: string }
  | { type: 'workspace.changed'; workspace: WorkspaceId };
```

## 5. Pseudocodigo

### Boot del editor

```ts
function bootEditor() {
  const shellState = loadShellState();
  const workspace = resolveWorkspace(shellState.activeWorkspace);
  const layout = loadLayout(workspace.id) ?? workspace.defaultLayout;

  mountEditorShell({
    workspace,
    layout,
    panelRegistry,
    commandRegistry,
    shortcutRegistry,
  });
}
```

### Cambio de workspace

```ts
function switchWorkspace(nextWorkspace: WorkspaceId) {
  persistLayout(currentWorkspace, currentLayout);
  const workspace = workspaceRegistry.get(nextWorkspace);
  const restoredLayout = loadLayout(nextWorkspace) ?? workspace.defaultLayout;

  shellStore.setState({
    activeWorkspace: nextWorkspace,
    layout: restoredLayout,
    activeTopbarTools: workspace.topbarTools,
  });
}
```

### Seleccion -> inspector

```ts
function onSelectionChanged(entityIds: string[]) {
  selectionStore.set(entityIds);

  if (entityIds.length === 1) {
    inspectorStore.bindEntity(entityIds[0]);
  } else {
    inspectorStore.bindEntity(null);
  }

  editorEvents.emit({ type: 'selection.changed', entityIds });
}
```

### Command palette

```ts
function runCommand(commandId: string) {
  const command = commandRegistry.get(commandId);
  if (!command) return;
  if (command.when && !command.when(editorContext)) return;

  return command.run(editorContext);
}
```

### Build center

```ts
async function runBuild(target: BuildTarget) {
  const validation = await buildService.validate(target);
  if (!validation.ok) {
    buildStore.addDiagnostics(validation.diagnostics);
    return;
  }

  const job = buildStore.start(target);
  try {
    const result = await buildService.execute(job.id, target);
    buildStore.finish(job.id, result);
  } catch (error) {
    buildStore.fail(job.id, normalizeError(error));
  }
}
```

## 6. Lista de clases o archivos sugeridos

### Shell

- `src/engine/editor/shell/EditorShell.tsx`
- `src/engine/editor/shell/EditorTopBar.tsx`
- `src/engine/editor/shell/EditorStatusBar.tsx`
- `src/engine/editor/shell/BottomDock.tsx`
- `src/engine/editor/shell/WorkspaceSwitcher.tsx`
- `src/engine/editor/shell/layoutPersistence.ts`
- `src/engine/editor/shell/workspaceDefinitions.ts`

### Panels

- `src/engine/editor/panels/hierarchy/HierarchyPanel.tsx`
- `src/engine/editor/panels/hierarchy/useHierarchyTree.ts`
- `src/engine/editor/panels/inspector/InspectorPanel.tsx`
- `src/engine/editor/panels/inspector/InspectorSection.tsx`
- `src/engine/editor/panels/inspector/component-editors/TransformSection.tsx`
- `src/engine/editor/panels/assets/AssetBrowserPanel.tsx`
- `src/engine/editor/panels/assets/AssetTree.tsx`
- `src/engine/editor/panels/assets/AssetResults.tsx`
- `src/engine/editor/panels/assets/AssetPreview.tsx`
- `src/engine/editor/panels/console/ConsolePanel.tsx`
- `src/engine/editor/panels/build/BuildCenterPanel.tsx`
- `src/engine/editor/panels/profiler/ProfilerPanel.tsx`
- `src/engine/editor/panels/assistant/AssistantPanel.tsx`

### Viewport

- `src/engine/editor/viewport/SceneViewport.tsx`
- `src/engine/editor/viewport/ViewportToolbar.tsx`
- `src/engine/editor/viewport/ViewportHud.tsx`
- `src/engine/editor/viewport/useViewportSession.ts`
- `src/engine/editor/viewport/useViewportTelemetry.ts`
- `src/engine/editor/viewport/useViewportSelection.ts`

### Registries y servicios

- `src/engine/editor/services/command-registry.ts`
- `src/engine/editor/services/shortcut-registry.ts`
- `src/engine/editor/services/panel-registry.ts`
- `src/engine/editor/services/editor-events.ts`
- `src/engine/editor/services/asset-registry.ts`
- `src/engine/editor/services/build-center.ts`
- `src/engine/editor/services/plugin-host.ts`

### Estado

- `src/store/slices/editorShellSlice.ts`
- `src/store/slices/workspaceSlice.ts`
- `src/store/slices/selectionSlice.ts`
- `src/store/slices/buildSlice.ts`
- `src/store/slices/consoleSlice.ts`
- `src/store/slices/assetRegistrySlice.ts`

## 7. Orden recomendado de implementacion

### Paso 1. Separar shell de viewport

Objetivo:

- sacar la responsabilidad de layout de `EditorLayout.tsx`
- mover workspace + docks a un shell explicito

Entrega:

- `EditorShell`
- `WorkspaceSwitcher`
- `BottomDock`

### Paso 2. Introducir layouts persistentes

Objetivo:

- guardar layout por workspace
- permitir tabs inferiores reales

Entrega:

- `layoutPersistence.ts`
- `workspaceDefinitions.ts`

### Paso 3. Normalizar comandos y shortcuts

Objetivo:

- que toolbar, teclado y command palette apunten a la misma accion

Entrega:

- `command-registry.ts`
- `shortcut-registry.ts`
- `CommandPalette.tsx`

### Paso 4. Partir `SceneView.tsx`

Objetivo:

- extraer overlays, HUD y telemetria
- bajar complejidad del viewport

Entrega:

- `SceneViewport.tsx`
- `ViewportHud.tsx`
- `useViewportTelemetry.ts`

### Paso 5. Inspector por secciones

Objetivo:

- agrupar por componentes
- facilitar que nuevos sistemas agreguen editores sin inflar un archivo gigante

Entrega:

- `InspectorSection`
- `component-editors/*`

### Paso 6. Asset Registry de verdad

Objetivo:

- dejar de tratar assets como lista plana
- introducir readiness y dependencias

Entrega:

- `asset-registry.ts`
- `assetRegistrySlice.ts`
- build validation con assets

### Paso 7. Build Center visible

Objetivo:

- exponer build/export como modulo de primera clase

Entrega:

- `BuildCenterPanel.tsx`
- `buildSlice.ts`
- panel en workspace `build`

### Paso 8. Profiler y Debug Workspace

Objetivo:

- convertir el estado tecnico en herramienta util

Entrega:

- `ProfilerPanel.tsx`
- `DebugWorkspace.tsx`

### Paso 9. Plugin host base

Objetivo:

- permitir agregar paneles y comandos sin tocar el shell central

Entrega:

- `plugin-host.ts`
- `PanelRegistry`
- `CommandRegistry`

## 8. Errores de arquitectura que debes evitar

### Error 1. Un mega store para todo

El store actual ya aguanta mucho, pero si metes shell, assets, build, profiler, plugins y timeline en un solo blob va a explotar en complejidad.

Correccion:

- mantener slices separados
- usar selectores finos
- evitar rerenders masivos

### Error 2. Un mega `SceneView.tsx`

Hoy el viewport concentra demasiado.

Correccion:

- separar session, overlays, HUD, modelado, paint, camara, telemetry

### Error 3. Paneles que mutan entidades directo sin contrato

Eso vuelve imposible controlar undo/redo, validaciones y dirty state.

Correccion:

- pasar por comandos o adapters
- centralizar mutaciones en servicios o store actions

### Error 4. Workspaces solo cosmeticos

Si cambias de modo pero el layout y las herramientas no cambian de verdad, el workspace es humo.

Correccion:

- cada workspace debe cambiar layout, topbar, paneles y comandos visibles

### Error 5. Duplicar comandos en cada panel

El mismo comando no debe vivir en teclado, boton, menu contextual y command palette con implementaciones diferentes.

Correccion:

- un solo `commandId`
- multiples disparadores

### Error 6. Asset browser sin registry

Si assets, gallery, modular characters y runtime guardan su propia verdad, tarde o temprano el build se rompe.

Correccion:

- asset registry unificado
- estados `ready`, `processing`, `error`, `missing`

### Error 7. Mezclar editor y build pipeline

El build debe ser un dominio claro, no un boton perdido en el shell.

Correccion:

- `BuildCenterPanel`
- `buildSlice`
- jobs y artefactos visibles

## Veredicto tecnico

No necesitas otro motor.
Necesitas un shell serio encima del motor que ya estas levantando.

La prioridad no es meter mas modulos. La prioridad es que los modulos que ya existen queden ordenados por flujo, con contratos claros y sin duplicacion estructural.
