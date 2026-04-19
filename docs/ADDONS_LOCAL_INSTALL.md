# Addons del motor

## Qué hace hoy

El motor ya soporta un registro local de addons instalables.

Cada addon puede:

- instalarse desde un paquete existente del motor o desde un manifest manual
- quedar persistido en storage local o Netlify Blobs si en el futuro se usa deploy
- activarse o desactivarse
- declarar permisos
- declarar workspaces sugeridos
- guardar metadata como autor, versión, entry point y paquete de origen

Plantillas listas hoy:

- Tooling base
  - `Animation Toolkit Starter`
  - `Material Studio Essentials`
- Content packs
  - `Materials Core Pack`
  - `VFX Core Pack`
  - `Animation Starter Pack`
  - `Ambient FX Pack`
  - `Boss Arena Pack`
  - `Horror Fog Scene Pack`
  - `Sci-Fi Material Lab Pack`
  - `Animation Demo Stage Pack`

## Qué no hace todavía

Todavía no carga código arbitrario en caliente dentro del bundle del editor.

Hoy el sistema resuelve:

- instalación
- registro
- activación
- desactivación
- borrado
- trazabilidad de origen

Eso deja lista la base para una futura capa de ejecución más profunda sin bloquear el uso local.

## Cómo usarlo

1. Crear un paquete reutilizable desde `Galería` si quieres usar assets ya existentes.
2. Abrir `Project -> Open Addon Manager`.
3. Elegir una de estas rutas:
   - `Manifest manual`
   - un paquete existente
4. Completar nombre, versión, categoría, descripción y workspaces sugeridos.
5. Instalar el addon.
6. Activarlo o desactivarlo desde la lista de addons instalados.

## Workspaces sugeridos

- `animation`
- `modeling`
- `materials`
- `scripting`
- `scene`

## API

- `GET /api/addons`
- `POST /api/addons`
- `PATCH /api/addons`
- `DELETE /api/addons?id=<addonId>`

## Storage

Por defecto local:

- `download/addons`

Variables futuras de deploy:

- `REY30_ADDON_STORAGE_BACKEND`
- `REY30_ADDON_ROOT`
- `REY30_ADDON_BLOB_STORE`
