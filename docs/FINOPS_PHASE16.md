# Fase 16 - FinOps Operativo Avanzado

## Objetivo
Extender FinOps para operación diaria con 3 capacidades:

- Alertas personalizadas por usuario.
- Exportación CSV de uso/costos.
- Objetivos y trazabilidad de costos por proyecto.

## Cambios de datos

Se agregaron modelos Prisma:

- `ProjectUsageLedger`
  - Consumo por `user + project + provider + period`.
- `UserUsageAlertProfile`
  - Umbrales personalizados y toggles de alertas.
- `ProjectUsageGoal`
  - Objetivo mensual por proyecto (`monthlyBudgetUsd`, `warningRatio`).

También se extendió `User` con relaciones a esos modelos.

## Servicio FinOps

Archivo:

- `src/lib/security/usage-finops.ts`

Capacidades:

- `normalizeProjectKey`
- `recordProjectUsage`
- `getProjectUsageSummary`
- `getUserUsageAlertProfile` / `saveUserUsageAlertProfile`
- `getProjectUsageGoals` / `saveProjectUsageGoals`
- `getPersonalizedUsageAlerts`
- `getFinOpsSnapshot`
- `getUsageExportCsv`

## APIs nuevas

- `GET/PUT /api/user/usage-finops`
  - Snapshot completo FinOps y guardado de perfil/objetivos.
- `GET /api/user/usage-export?format=csv&months=6&period=YYYY-MM`
  - Export CSV (o JSON con `format=json`).

## Tracking por proyecto en proveedores

Rutas actualizadas para registrar consumo por proyecto (header `x-rey30-project`):

- `POST /api/ai-chat`
- `POST /api/openai`
- `POST /api/meshy`
- `POST /api/runway`

Se mantiene la gobernanza de fase 14 y se añade ledger por proyecto sin romper compatibilidad.

## UI

Panel:

- `src/engine/editor/UsageFinOpsPanel.tsx`

Incluye:

- Guardado conjunto de política + perfil FinOps.
- Exportación CSV.
- Resumen/proyección.
- Alertas personalizadas activas.
- Costos por proyecto y recomendaciones.

## Pruebas

- Integración:
  - `tests/integration/usage-routes.test.ts` valida bloqueo anónimo para:
    - `/api/user/usage-finops`
    - `/api/user/usage-export`
- Unit:
  - `tests/unit/usage-finops.test.ts` (normalización de project key).

## Resultado

Fase 16 deja FinOps listo para operación continua:

- Cada usuario define sus alertas.
- Puede exportar costos para auditoría externa.
- Puede controlar metas por proyecto con visibilidad de consumo real.

