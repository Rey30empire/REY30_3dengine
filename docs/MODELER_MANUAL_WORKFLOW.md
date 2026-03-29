# Modeler Manual Workflow

Guia compacta del modelador manual avanzado dentro del editor.

## Estado actual

El modelador ya cubre cuatro niveles de trabajo:

- `Object`: primitivas base, `Mirror X`, `Unwrap planar`, `Solidify`.
- `Vertex`: mover, `Path select`, `Slide +/-`, `Relax`, `Merge`, `Weld`, `Fill`, `Grid Fill`, `Delete`.
- `Edge`: `Subdivide`, `Loop select`, `Ring select`, `Path select`, `Bevel`, `Bridge`, `Bridge loops`, `Collapse`, `Fill`, `Grid Fill`, `Delete`.
- `Face`: `Island`, `Select normal`, `Grow region`, `Shrink region`, `Extrude` por region, `Inset` por region, `Duplicate normal`, `Subdivide`, `Knife`, `Rip`, `Separate`, `Delete`.

Y ahora suma un bloque inicial de `UV/materiales`:

- `Material ID`: aplica `materialId` sobre `MeshRenderer` de la entidad seleccionada.
- `Project UV`, `Fit UV`, `Move UV`, `Scale UV`, `Rotate UV`: operan sobre las caras seleccionadas.

Y en esta fase ya entra UV avanzado utilizable:

- `Mark seam` y `Clear seam` sobre `Edge`.
- `UV island` y `Pack islands` sobre `Face`.
- `Checker preview` en viewport con escala configurable.

## Comportamiento clave

- La sub-seleccion `vertex / edge / face` se comparte entre panel y viewport.
- El viewport permite click directo sobre helpers 3D y `Shift` para sumar o quitar elementos.
- El sub-gizmo ya tiene clamp de `scale` para evitar deformaciones extremas.
- `Loop select` y `Ring select` usan continuidad topologica sobre strips triangulados.
- `Bridge loops` ya soporta pairing por cercania entre grupos y loops cerrados.

## Nueva fase: Slide, Relax, Collapse

- `Slide +/-`: desplaza vertices seleccionados siguiendo su conectividad local. El signo cambia la direccion del deslizamiento.
- `Relax`: suaviza vertices seleccionados hacia el promedio de sus vecinos. Usa `Relax` como intensidad y `Relax it` como numero de pasadas.
- `Collapse`: colapsa aristas seleccionadas hacia centroides comunes y recompone la malla compactando vertices/caras degeneradas.

## Fase actual: Paths y regiones topologicas

- `Path select` en `Vertex` resuelve el camino mas corto entre el primer y el ultimo vertice seleccionados.
- `Path select` en `Edge` resuelve una cadena de aristas conectadas entre la arista inicial y la final.
- `Island` en `Face` selecciona toda la isla conectada del seed actual.
- `Grow region` y `Shrink region` expanden o contraen la seleccion de caras segun vecindad topologica.
- `Slide` puede trabajar en modo `Free`, `Path` o restringido por `Axis X/Y/Z`.
- `Relax` preserva fronteras duras por defecto para no derretir el silhouette del mesh.

## Fase actual: UV y materiales basicos

- `Select normal` selecciona caras coplanares o casi coplanares con tolerancia angular configurable.
- `Project UV` crea UVs sobre la seleccion actual usando proyeccion automatica.
- `Move/Scale/Rotate UV` ajustan la isla seleccionada sin salir del panel.
- `Fit UV` normaliza la seleccion a `0..1` respetando padding.
- El viewport ahora cambia la firma visual del mesh cuando cambia `materialId`, asi que la variante se ve de inmediato.

## Fase actual: UV seams, islands y checker

- `Mark seam` corta la conectividad UV por arista seleccionada.
- `UV island` selecciona la isla UV conectada respetando los seams actuales.
- `Pack islands` distribuye las islas UV en `0..1` usando celdas con padding.
- `Checker preview` activa una textura procedural repetida para revisar stretching y densidad visual.
- El viewport dibuja overlay de seams para localizar rapido donde se hizo el corte.

Nota:

- Este modelador guarda una sola `uv` por vertice, asi que al empaquetar islas con seams puede duplicar vertices sobre esos bordes para materializar la separacion UV. Es una decision practica de esta fase.

## Scroll roll del panel

`ModelerPanel` ahora incluye:

- barra de progreso de scroll visible siempre
- botones rapidos `Inicio`, `Seleccion`, `Ayuda`, `Final`
- soporte validado con rueda sobre el viewport real del `ScrollArea`

Esto evita perder contexto cuando la lista de vertices/aristas/caras crece bastante.

## Persistencia

- `manualMesh` vive dentro del `MeshRenderer` de la entidad seleccionada.
- `Guardar` persiste a `/api/modeler/persist`.
- `Crear editable` crea una entidad nueva con `MeshRenderer` custom si no hay una seleccionada o si quieres separar variantes.

## Validacion recomendada

Comandos de esta linea del modelador:

```bash
pnpm exec vitest run tests/unit/modeler-mesh.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run smoke:modeler-phase14
```

## Evidencia esperada

- `output/phase14-modeler-smoke/report.json`
- `output/phase14-modeler-smoke/fullpage.png`
- `output/phase14-modeler-smoke/checker-islands.png`

## Siguiente paso sugerido

- grupos/material slots mas finos o por cara
- preview de textura custom, no solo checker
- editor visual 2D de UVs
- seleccion semantica por material o por UV island con filtros mas avanzados

## Hardening del pipeline

- `typecheck-safe.mjs` ya no reutiliza `.next`; genera tipos en `.next-typecheck`.
- `next.config.ts` acepta `REY30_NEXT_DIST_DIR` para aislar `typegen` de `build`.
- Esto evita el falso `TS6053` cuando `build` y `typecheck` corren al mismo tiempo.
