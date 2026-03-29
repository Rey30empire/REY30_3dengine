# Fase 14 - Gobernanza de Costos y Cuotas (BYOK)

## Objetivo
Aplicar control real de gasto por usuario para proveedores AI:

- Presupuesto mensual por cuenta.
- Cuotas opcionales por proveedor.
- Bloqueo automático (`429`) cuando se supera el límite.
- Monitor operativo diario con alertas.

## Esquema de datos

Nuevos modelos Prisma:

- `UserUsagePolicy`
  - `monthlyBudgetUsd`
  - `hardStopEnabled`
  - `warningThresholdRatio`
  - `perProviderBudgetJson`

- `ProviderUsageLedger`
  - `userId + provider + period (YYYY-MM)` único
  - `requestCount`
  - `estimatedCostUsd`
  - `estimatedUnits`
  - `blocked`
  - `lastAction`, `lastUsedAt`

## Capa de seguridad de uso

Archivo:

- `src/lib/security/usage-governance.ts`

Funciones clave:

- `getUserUsagePolicy`
- `saveUserUsagePolicy`
- `assertUsageAllowed`
- `recordUsage`
- `getUsageSummary`
- `getUsageAlerts`
- `estimateProviderCostUsd`

## Enforcement en rutas de proveedor

Integrado en:

- `POST /api/ai-chat`
- `POST /api/openai`
- `POST /api/meshy`
- `POST /api/runway`

Comportamiento:

1. Antes de llamar al proveedor: `assertUsageAllowed`.
2. Si supera límite y `hardStopEnabled=true`: responde `429` con `code=USAGE_LIMIT_EXCEEDED`.
3. Si la llamada al proveedor fue exitosa: `recordUsage` + `touchProviderUsage`.

## Endpoints nuevos

### Usuario

- `GET/PUT /api/user/usage-policy`
  - Leer y actualizar presupuesto/cuotas personales.
- `GET /api/user/usage-summary`
  - Resumen de consumo del período.

### Operaciones

- `GET /api/ops/usage/alerts`
  - Alertas de cuentas en warning/bloqueo.
  - Acceso por OWNER o `REY30_OPS_TOKEN`.

## Automatización

Script:

- `scripts/check-usage-alerts.mjs`

NPM:

- `pnpm run usage:alerts`

Workflow programado:

- `.github/workflows/usage-budget-monitor.yml`
  - Revisa alertas de gasto diario.
  - Sube artifact `usage-alerts.json`.
  - Opcionalmente dispara `ALERT_WEBHOOK_URL` cuando falla.

## Variables recomendadas

- `REY30_DEFAULT_MONTHLY_BUDGET_USD`
- `REY30_DEFAULT_WARNING_THRESHOLD_RATIO`
- `REY30_DEFAULT_HARD_STOP_ENABLED`
- `REY30_DEFAULT_BUDGET_OPENAI_USD`
- `REY30_DEFAULT_BUDGET_MESHY_USD`
- `REY30_DEFAULT_BUDGET_RUNWAY_USD`
- `REY30_OPS_TOKEN`

## Cobertura de pruebas

- `tests/unit/usage-governance.test.ts`
- `tests/integration/usage-routes.test.ts`

