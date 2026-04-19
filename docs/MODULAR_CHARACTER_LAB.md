# Modular Character Lab

Fecha: 28 de marzo de 2026.

## Objetivo

Agregar al editor un modulo profesional para gestion y fragmentacion de personajes 3D modulares sin romper el `Character Builder` existente.

El MVP implementado ya cubre:

- subida de `.fbx`, `.obj`, `.glb` y `.gltf`
- analisis real de meshes, materiales, rig y animaciones
- visor 3D con orbit, zoom, fondo, wireframe, huesos y pivotes
- fragmentacion automatica por heuristicas
- fragmentacion manual por seleccion de meshes
- guardado persistente de original, partes, metadata y manifiesto Unity Ready
- descarga de parte individual
- descarga del original
- descarga de ZIP completo o ZIP parcial por seleccion de partes

## Integracion actual

- UI principal:
  - [src/engine/editor/CharacterWorkspacePanel.tsx](/C:/Users/rey30/REY30_3dengine/src/engine/editor/CharacterWorkspacePanel.tsx)
  - [src/engine/editor/ModularCharacterLabPanel.tsx](/C:/Users/rey30/REY30_3dengine/src/engine/editor/ModularCharacterLabPanel.tsx)
- Builder existente sin romper:
  - [src/engine/editor/CharacterBuilderPanel.tsx](/C:/Users/rey30/REY30_3dengine/src/engine/editor/CharacterBuilderPanel.tsx)
- Registro del tab en editor:
  - [src/engine/editor/EditorLayout.tsx](/C:/Users/rey30/REY30_3dengine/src/engine/editor/EditorLayout.tsx)

El workspace ahora expone una superficie comun de catalogo via:

- [src/app/api/character/catalog/route.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/character/catalog/route.ts)
- [src/lib/server/character-catalog.ts](/C:/Users/rey30/REY30_3dengine/src/lib/server/character-catalog.ts)
- [src/app/api/character/package/route.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/character/package/route.ts)

## Arquitectura

### Frontend

- Analisis y carga:
  - [src/engine/modular-character/analysis.ts](/C:/Users/rey30/REY30_3dengine/src/engine/modular-character/analysis.ts)
- Catalogo de partes:
  - [src/engine/modular-character/catalog.ts](/C:/Users/rey30/REY30_3dengine/src/engine/modular-character/catalog.ts)
- Heuristicas y compatibilidad:
  - [src/engine/modular-character/heuristics.ts](/C:/Users/rey30/REY30_3dengine/src/engine/modular-character/heuristics.ts)
- Exportacion GLB por parte:
  - [src/engine/modular-character/export.ts](/C:/Users/rey30/REY30_3dengine/src/engine/modular-character/export.ts)
- Tipos y contratos:
  - [src/engine/modular-character/types.ts](/C:/Users/rey30/REY30_3dengine/src/engine/modular-character/types.ts)

### Backend

- API raiz:
  - [src/app/api/modular-characters/route.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/modular-characters/route.ts)
- detalle:
  - [src/app/api/modular-characters/[characterId]/route.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/modular-characters/[characterId]/route.ts)
- ZIP:
  - [src/app/api/modular-characters/[characterId]/download/route.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/modular-characters/[characterId]/download/route.ts)
- original:
  - [src/app/api/modular-characters/[characterId]/original/route.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/modular-characters/[characterId]/original/route.ts)
- parte individual:
  - [src/app/api/modular-characters/[characterId]/parts/[partId]/download/route.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/modular-characters/[characterId]/parts/[partId]/download/route.ts)
- reglas de storage y validacion:
  - [src/app/api/modular-characters/shared.ts](/C:/Users/rey30/REY30_3dengine/src/app/api/modular-characters/shared.ts)
- servicio de dominio:
  - [src/lib/server/modular-character-service.ts](/C:/Users/rey30/REY30_3dengine/src/lib/server/modular-character-service.ts)
- storage hibrido filesystem / Netlify Blobs:
  - [src/lib/server/modular-character-storage.ts](/C:/Users/rey30/REY30_3dengine/src/lib/server/modular-character-storage.ts)

### Base de datos

- schema:
  - [prisma/schema.prisma](/C:/Users/rey30/REY30_3dengine/prisma/schema.prisma)
- migracion:
  - [prisma/migrations/20260328194500_modular_character_lab/migration.sql](/C:/Users/rey30/REY30_3dengine/prisma/migrations/20260328194500_modular_character_lab/migration.sql)

Tablas agregadas:

- `ModularCharacterProject`
- `ModularCharacter`
- `ModularCharacterPart`
- `ModularCharacterUpload`
- `ModularCharacterExport`

## Estructura logica de almacenamiento

```text
project-slug/
  character-slug_character-id/
    metadata.json
    preview/
      preview.png
    full_model/
      hero.glb
      hero.bin
      hero_diffuse.png
    parts/
      head/
        head.glb
        metadata_head.json
      torso/
        torso.glb
        metadata_torso.json
    unity-ready/
      assembly.json
    exports/
      hero-full.zip
      hero-selected-parts.zip
```

## API

### `GET /api/modular-characters`

Lista la biblioteca modular guardada para el usuario autenticado.

### `POST /api/modular-characters`

Guarda un personaje modular nuevo.

`FormData` esperado:

- `payload`: JSON serializado con analisis y asignaciones
- `sourceFiles`: uno o varios archivos fuente
- `partFiles`: uno o varios `.glb` exportados por parte
- `previewFile`: captura PNG opcional

### `GET /api/modular-characters/:characterId`

Devuelve detalle completo del personaje modular.

### `GET /api/modular-characters/:characterId/parts/:partId/download`

Descarga una parte individual ya fragmentada.

### `GET /api/modular-characters/:characterId/download`

Descarga ZIP completo. Soporta `?partIds=id1,id2` para ZIP parcial.

### `GET /api/modular-characters/:characterId/original`

Descarga el original. Si el original fue un bundle multifile, devuelve ZIP.

## Flujo funcional

### Subida

1. El usuario sube uno o varios archivos.
2. El frontend detecta el archivo principal.
3. `analysis.ts` carga escena y recursos relacionados.
4. Se generan metadatos de meshes, materiales, huesos, bbox y animaciones.

### Fragmentacion

1. `suggestPartAssignments` intenta clasificar meshes por nombre, huesos y ubicacion.
2. El usuario puede corregir manualmente seleccionando meshes.
3. `buildAssignmentDraft` consolida metadata por parte.
4. `exportAssignmentsToGlb` genera modulos `.glb` listos para guardarse.

### Descarga

1. El backend lee metadata y archivos desde storage.
2. `buildModularCharacterZip` empaqueta original, partes y metadata.
3. Se registra export en base de datos.

## Unity Ready

La exportacion actual deja:

- nombres de parte estandarizados
- metadata de `connectionPoints`
- `pivot`
- `boundingBox`
- `boneNames`
- orientacion documentada como `Y up / Z forward`
- `unity-ready/assembly.json`

## Variables de entorno

Nuevas variables relevantes:

- `REY30_MODULAR_CHARACTER_STORAGE_BACKEND`
- `REY30_MODULAR_CHARACTER_BLOB_STORE`
- `REY30_MODULAR_CHARACTER_ROOT`
- `REY30_MODULAR_MAX_SOURCE_FILE_MB`
- `REY30_MODULAR_MAX_SOURCE_BUNDLE_MB`

Referencia:

- [.env.production.example](/C:/Users/rey30/REY30_3dengine/.env.production.example)

## Ejecutar

```bash
pnpm install
pnpm run db:generate
pnpm run dev
```

Verificaciones ya corridas para este modulo:

- `pnpm run db:generate`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm exec eslint src/engine/modular-character src/lib/server/modular-character-service.ts src/lib/server/modular-character-storage.ts src/app/api/modular-characters src/engine/editor/ModularCharacterLabPanel.tsx src/engine/editor/CharacterWorkspacePanel.tsx src/engine/editor/EditorLayout.tsx tests/unit/modular-character-foundation.test.ts`
- `node scripts/vitest-safe.mjs run tests/unit/modular-character-foundation.test.ts`

## Plan de construccion a produccion

### Fase 1

- activar el modulo en staging con Neon + Netlify Blobs
- probar subida real de `.glb`, `.fbx`, `.obj`
- definir limites de upload por plan

### Fase 2

- mover preview y miniaturas a una cola o background task si crecen los archivos
- agregar versionado por personaje y colecciones
- agregar buscador por tags y categoria

### Fase 3

- implementar exportadores especializados por formato:
  - FBX real
  - GLTF multifile
  - conversion por pipeline server-side
- integrar validacion avanzada de rig y pesos
- mejorar `snap points` con deteccion de huesos reales y sockets persistidos

### Fase 4

- crear plugin Unity que lea `assembly.json`
- soportar drag & drop de partes sobre un avatar base dentro de Unity
- cerrar pipeline marketplace de piezas 3D

## Logica especializada pendiente

La base ya funciona, pero estas partes quedan preparadas para una segunda iteracion:

- preservacion perfecta de rigs complejos FBX con constraints propietarios
- reconstruccion server-side de `.gltf` con recursos externos muy complejos
- generacion de thumbnails en worker o funcion aparte
- deteccion semantica mas fina de ropa multicapa, guantes y accesorios anidados

## Ejemplos JSON

- personaje:
  - [docs/examples/modular-character.metadata.example.json](/C:/Users/rey30/REY30_3dengine/docs/examples/modular-character.metadata.example.json)
- parte:
  - [docs/examples/modular-character.part.example.json](/C:/Users/rey30/REY30_3dengine/docs/examples/modular-character.part.example.json)
