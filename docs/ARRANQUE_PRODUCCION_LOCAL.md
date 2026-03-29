# Arranque de Produccion Local

Este flujo deja la app corriendo como produccion en tu propia maquina, sin publicarla.

## Requisitos

- Docker Desktop activo.
- `pnpm` disponible.
- Archivo `.env.production` o `.env.production.local` con `DATABASE_URL` PostgreSQL.

## Perfil local recomendado

Valores base:

- `HOSTNAME=127.0.0.1`
- `PORT=3000`
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public`
- `REY30_REGISTRATION_MODE=invite_only`
- `REY30_REGISTRATION_INVITE_TOKEN=<token>`
- `REY30_BOOTSTRAP_OWNER_TOKEN=<token>`
- `REY30_ENCRYPTION_KEY=<base64-32-bytes>` o `NEXTAUTH_SECRET=<secret>`
- `REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true` para este perfil local de nodo unico, o credenciales reales de Upstash si quieres validar el backend distribuido
- `REY30_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000,https://127.0.0.1:8443,https://localhost:8443`
- `REY30_HTTPS_HOST=localhost`
- `REY30_HTTPS_PORT=8443`

## Comandos

Levantar base local:

```bash
pnpm run db:postgres:up
```

Aplicar migraciones productivas:

```bash
pnpm run db:deploy
```

Iniciar la app en modo produccion local:

```bash
pnpm run start:production:local
```

Iniciar el perfil semi-productivo local con HTTPS y smoke automatico:

```bash
pnpm run start:semi-production:local
```

En Windows usa el launcher batch unificado:

```bat
start-clean-app.bat --production-local
start-clean-app.bat --semi-production-local
```

## Que hace el script

`start:production:local`:

1. Carga `.env.production.local` y `.env.production`.
2. Falla temprano si la postura de producción está insegura (`open registration`, sin invite token, sin bootstrap owner token, sin secreto de cifrado o sin estrategia válida de rate limit).
3. Levanta PostgreSQL local si la URL apunta a `127.0.0.1:5432/rey30`.
4. Ejecuta `prisma migrate deploy`.
5. Ejecuta `next build`.
6. Arranca el servidor standalone.

`start:semi-production:local`:

1. Arranca `start:production:local`.
2. Espera `GET /api/health/live` por HTTP.
3. Levanta un proxy HTTPS local en `https://localhost:8443`.
4. Genera certificado local en `output/local-certs`.
5. Ejecuta `scripts/postdeploy-smoke.mjs` automaticamente contra la URL HTTPS.

## Variantes utiles

- `pnpm run start:production:local -- --skip-build`
- `pnpm run start:production:local -- --skip-db`
- `pnpm run start:production:local -- --skip-docker`
- `pnpm run start:semi-production:local -- --skip-smoke`
- `pnpm run start:semi-production:local -- --skip-build`

## Nota sobre HTTPS local

El certificado local es autofirmado. El navegador puede mostrar advertencia la primera vez; eso es normal en este perfil local.

## Nota de secretos

El repo puede traer valores de ejemplo para rehearsal local. Antes de cualquier despliegue remoto real, rota `REY30_REGISTRATION_INVITE_TOKEN`, `REY30_BOOTSTRAP_OWNER_TOKEN` y el secreto de cifrado en la plataforma de despliegue, y sustituye `REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true` por un backend distribuido real.
