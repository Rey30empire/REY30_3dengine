# Script Workspace (Fase Implementada)

## Objetivo
Habilitar flujo real de scripts dentro del motor:
- crear archivos `.ts/.js/.lua`
- abrir/editar/guardar desde panel integrado
- compilar por script con diagnostico
- vincular script a la entidad seleccionada

## Backend

### `GET /api/scripts`
- Lista scripts persistidos en `scripts/` del proyecto fuente.
- Si recibe `?path=...`, devuelve contenido del archivo.

### `POST /api/scripts`
- Crea script nuevo.
- Body: `{ name, directory?, content?, overwrite? }`
- Si no se manda `content`, usa plantilla base.

### `PUT /api/scripts`
- Guarda script existente.
- Body: `{ path, content }`

### `DELETE /api/scripts?path=...`
- Borra un script por ruta relativa.

### `POST /api/scripts/compile`
- Compila un script (archivo o contenido en memoria).
- Body: `{ path?, content? }`
- Respuesta: `ok`, `diagnostics`, tamaños de entrada/salida.

## Seguridad de rutas
- Todas las rutas se normalizan y validan contra root permitido.
- Se bloquea path traversal (`../`).

## Frontend

### Panel nuevo: `ScriptWorkspacePanel`
- Listado con búsqueda y refresco.
- Editor con estado de cambios (`sin guardar`).
- Acciones: crear, guardar, compilar, borrar.
- Diagnóstico visual (error/warning/suggestion).
- Botón `Vincular` para setear componente `Script` en entidad seleccionada.

## Persistencia en entorno shadow-copy
- Se usa `REY30_SOURCE_PROJECT_DIR` como raíz fuente cuando existe.
- `start-clean-app.bat` ahora exporta esa variable para que los scripts queden en el proyecto real.

## Estado actual
- Implementado y conectado al layout como tab `Scr`.
- Falta tramo siguiente: ejecución runtime automática del script en loop de juego (actualmente se vincula metadata/componente).

