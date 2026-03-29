# Netlify + Neon setup

Fecha de referencia: 28 de marzo de 2026.

## Que ya queda preparado en el repo

- `@netlify/neon` ya esta agregado al proyecto.
- `@netlify/blobs` ya esta agregado al proyecto.
- `netlify.toml` ya fija el build a `pnpm run build`.
- El runtime y los scripts ahora aceptan `NETLIFY_DATABASE_URL` y lo mapean a `DATABASE_URL` cuando Netlify es quien inyecta la conexion.
- Script Workspace ahora detecta Netlify automaticamente y persiste scripts en Netlify Blobs. En local sigue usando filesystem.
- Gallery ahora detecta Netlify automaticamente y persiste archivos en Netlify Blobs. En local sigue usando filesystem.
- Prisma sigue siendo la capa ORM principal.

## Flujo recomendado

### 1. Requisitos

- Tener Netlify CLI instalado.
- Haber hecho login:

```powershell
netlify login
```

- Tener el repo enlazado a un sitio:

```powershell
netlify link
```

## 2. Provisionar la base Neon desde Netlify

Segun la integracion de Netlify DB, con `@netlify/neon` instalado basta ejecutar uno de estos flujos:

```powershell
netlify dev
```

o

```powershell
netlify build
```

Eso hace que Netlify prepare la base y exponga `NETLIFY_DATABASE_URL` al sitio enlazado.

En el flujo de Netlify DB no necesitas abrir una cuenta aparte en Neon para empezar; la base la provisiona Netlify para el sitio enlazado.

## 3. Aplicar migraciones Prisma

Cuando la base ya fue provisionada, usa:

```powershell
pnpm run db:deploy:netlify
```

Ese comando:

- toma `DATABASE_URL` si ya existe
- si no existe, pide `NETLIFY_DATABASE_URL` al sitio enlazado con Netlify CLI
- ejecuta `prisma migrate deploy`

Si quieres hacerlo manualmente en PowerShell:

```powershell
$env:DATABASE_URL = (netlify env:get NETLIFY_DATABASE_URL).Trim()
pnpm run db:deploy
```

## 4. Variables de entorno de produccion

En Netlify no necesitas definir `DATABASE_URL` a mano si `NETLIFY_DATABASE_URL` ya fue provisionada por la plataforma.

Para scripts persistidos, normalmente no necesitas configurar nada extra en Netlify porque el repo cambia solo a Netlify Blobs cuando detecta runtime Netlify. Si quieres forzarlo fuera de ese contexto, puedes definir:

- `REY30_SCRIPT_STORAGE_BACKEND=netlify-blobs`
- `REY30_SCRIPT_BLOB_STORE=rey30-scripts`

Para gallery, normalmente tampoco necesitas configurar nada extra en Netlify porque el repo cambia solo a Netlify Blobs cuando detecta runtime Netlify. Si quieres forzarlo:

- `REY30_GALLERY_STORAGE_BACKEND=netlify-blobs`
- `REY30_GALLERY_BLOB_STORE=rey30-gallery`

Todavia si necesitas definir manualmente:

- `REY30_ENCRYPTION_KEY` o `NEXTAUTH_SECRET`
- `APP_ENCRYPTION_KEY` tambien sirve como alias si ya lo usas en hosting
- `REY30_REGISTRATION_MODE=invite_only`
- `REY30_REGISTRATION_INVITE_TOKEN`
- `REY30_BOOTSTRAP_OWNER_TOKEN`
- `REY30_ALLOWED_ORIGINS`
- `REY30_REMOTE_FETCH_ALLOWLIST_ASSETS`
- `REY30_REMOTE_FETCH_ALLOWLIST_OPENAI`
- `REY30_REMOTE_FETCH_ALLOWLIST_MESHY`
- `REY30_REMOTE_FETCH_ALLOWLIST_RUNWAY`
- `REY30_UPSTASH_REDIS_REST_URL`
- `REY30_UPSTASH_REDIS_REST_TOKEN`
- `REY30_OPS_TOKEN`
- `SMOKE_USER_EMAIL`
- `SMOKE_USER_PASSWORD`

Checklist completa: `docs/production-checklist.md`

## 5. Validacion recomendada

Antes de publicar:

```powershell
pnpm run preflight:production
pnpm run release:check
```

Despues de tener una URL real:

```powershell
pnpm run preflight:production -- --base-url https://tu-sitio.netlify.app
```

## 6. Limite importante de esta arquitectura

Netlify + Neon te resuelve la base relacional.

Netlify Blobs ya te resuelve Script Workspace.
Netlify Blobs ya te resuelve Gallery.

Pero este repo todavia usa rutas locales para:

- assets
- packages
- backups

Eso significa que, aunque la base quede lista en Netlify, la parte de almacenamiento persistente del motor todavia necesita una estrategia aparte antes de un go-live completo. La ruta natural seria mover esos datos a almacenamiento externo o a primitives persistentes compatibles con Netlify.

## 7. Orden sugerido

1. `netlify login`
2. `netlify link`
3. `pnpm install`
4. `netlify build`
5. `pnpm run db:deploy:netlify`
6. cargar secretos de produccion en Netlify
7. `pnpm run preflight:production`
8. deploy
9. `pnpm run preflight:production -- --base-url https://tu-sitio.netlify.app`
