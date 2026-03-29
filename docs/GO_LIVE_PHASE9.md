# Fase 9 - Go Live (CI/CD + Observabilidad + Rollback)

## Objetivo
Operar el app en producción con controles automáticos:

- Quality gate continuo (lint, typecheck, tests, build).
- Health checks de liveness/readiness.
- Smoke tests post-deploy.
- Rollback automático por webhook al detectar regresión.

## Implementación técnica

## 1) Endpoints de salud

- `GET /api/health/live`
  - Verifica proceso vivo (`status: live`).
  - Retorna metadata de release (`service`, `version`, `commit`, `environment`, `uptimeSeconds`).

- `GET /api/health/ready`
  - Verifica disponibilidad real (`status: ready`) incluyendo base de datos (`SELECT 1`).
  - Si falla DB retorna `503` con `status: not_ready`.

Archivos:
- `src/app/api/health/live/route.ts`
- `src/app/api/health/ready/route.ts`
- `src/lib/ops/release-info.ts`

## 2) Smoke post-deploy

Script:
- `scripts/postdeploy-smoke.mjs`

Checks:
- `/`
- `/api/health/live`
- `/api/health/ready`
- `/api/auth/session`
- `/api/openai`
- `/api/meshy`
- `/api/runway`

Características:
- retries configurables
- timeout configurable
- reporte JSON (`output/smoke-report.json`)

Comando:
- `pnpm run smoke:postdeploy`

Variables:
- `SMOKE_BASE_URL` (requerida si no se pasa `--base-url`)
- `SMOKE_TIMEOUT_MS` (opcional)
- `SMOKE_RETRIES` (opcional)
- `SMOKE_RETRY_WAIT_MS` (opcional)
- `SMOKE_REPORT_PATH` (opcional)

## 3) Rollback automático

Script:
- `scripts/trigger-rollback.mjs`

Comando:
- `pnpm run rollback:trigger`

Variable requerida:
- `ROLLBACK_WEBHOOK_URL`

Payload enviado:
- `action`, `reason`, `releaseVersion`, `environment`, `triggeredAt`, `source`.

## 4) Workflows CI/CD

- `.github/workflows/ci-quality-gate.yml`
  - Trigger: push/pull_request/workflow_dispatch
  - Ejecuta: `db:deploy` + `release:full`

- `.github/workflows/postdeploy-smoke-rollback.yml`
  - Trigger: `workflow_dispatch` y `workflow_call`
  - Ejecuta smoke post-deploy.
  - Si smoke falla y existe `ROLLBACK_WEBHOOK_URL`, dispara rollback automático.

- `.github/workflows/promotion-gate.yml`
  - Trigger: `workflow_dispatch`
  - Encadena `CI Quality Gate` reusable + `Post-Deploy Smoke + Rollback`
  - Usa `base_url` como input o `PRODUCTION_BASE_URL` desde vars/secrets

## Configuración recomendada antes de publicar

1. Definir secret `ROLLBACK_WEBHOOK_URL` en GitHub Actions.
2. Confirmar endpoint de rollback en plataforma de deploy (Vercel/Netlify/infra propia).
3. Ejecutar workflow `CI Quality Gate`.
4. Desplegar versión.
5. Ejecutar workflow `Promotion Gate` con `base_url` real, o configurar `PRODUCTION_BASE_URL`.

## Checklist de salida

1. `CI Quality Gate` en verde.
2. `GET /api/health/live` retorna `200`.
3. `GET /api/health/ready` retorna `200`.
4. Smoke post-deploy en verde.
5. Rollback webhook validado al menos una vez en staging.
