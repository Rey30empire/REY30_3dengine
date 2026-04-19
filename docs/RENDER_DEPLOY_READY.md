# Render Deployment Ready

This repo is now prepared for a manual Render Blueprint deploy without launching the deploy yet.

## What was prepared

- [render.yaml](/C:/Users/rey30/REY30_3dengine/render.yaml) defines:
  - one Node web service
  - one Render Postgres database
  - one persistent disk mounted at `/var/data/rey30`
- The web service uses:
  - `buildCommand`: install dependencies and build standalone output
  - `preDeployCommand`: `pnpm run db:deploy`
  - `startCommand`: `pnpm run start`
- Auto deploy is intentionally disabled with `autoDeployTrigger: off`
- Health checks point to `/api/health/ready`

## Persistent storage mapping

These app paths are pinned to the Render disk:

- `REY30_ASSET_ROOT=/var/data/rey30/assets`
- `REY30_GALLERY_ROOT=/var/data/rey30/gallery`
- `REY30_INPUT_GALLERY_ROOT=/var/data/rey30/input-gallery`
- `REY30_PACKAGE_ROOT=/var/data/rey30/packages`
- `REY30_EXPORT_ROOT=/var/data/rey30/exports`
- `REY30_SCRIPT_ROOT=/var/data/rey30/scripts`
- `REY30_SOURCE_PROJECT_DIR=/var/data/rey30/source`
- `REY30_BACKUP_ROOT=/var/data/rey30/backups`

This is required because the app persists assets, gallery files, generated scripts, packages, exports, and backups to disk.

## Secrets you still fill in Render

These stay `sync: false` in the Blueprint and must be provided in the Dashboard before deploy:

- `REY30_ENCRYPTION_KEY`
- `REY30_REGISTRATION_INVITE_TOKEN`
- `REY30_BOOTSTRAP_OWNER_TOKEN`
- `REY30_ALLOWED_ORIGINS`
- `REY30_REMOTE_FETCH_ALLOWLIST_ASSETS`
- `REY30_UPSTASH_REDIS_REST_URL`
- `REY30_UPSTASH_REDIS_REST_TOKEN`
- `REY30_OPS_TOKEN`

These do not belong in the Render web service. Keep them in GitHub Actions secrets instead:

- `SMOKE_USER_EMAIL`
- `SMOKE_USER_PASSWORD`
- `ROLLBACK_WEBHOOK_URL`

## Important behavior choices

- `REY30_TRUST_PROXY=true`
  - Recommended on Render so IP-based security and rate limiting use Render's forwarded client IP.
  - Only safe when the hosting proxy sanitizes forwarded IP headers before they reach the app.
- `HOSTNAME=0.0.0.0`
  - Required so the standalone Next.js server binds to Render's public interface instead of loopback only.
- `REY30_ENABLE_TERMINAL_API=false`
- `REY30_ENABLE_TERMINAL_API_REMOTE=false`
- `REY30_ALLOW_OPEN_REGISTRATION_REMOTE=false`

## Before first real deploy

1. Push the current branch so Render can read [render.yaml](/C:/Users/rey30/REY30_3dengine/render.yaml).
2. In Render, create a new Blueprint from the repo.
3. Fill every `sync: false` variable.
4. Keep auto deploy off until you are ready.
5. After the first successful deploy, set GitHub `PRODUCTION_BASE_URL`, `SMOKE_USER_EMAIL`, `SMOKE_USER_PASSWORD`, and `ROLLBACK_WEBHOOK_URL` so `Promotion Gate` can target the live app.

## Validation status

- Local repo validation completed:
  - `pnpm run seal:final`
- Render Blueprint CLI validation was not run here because the Render CLI is not installed in this workspace.
