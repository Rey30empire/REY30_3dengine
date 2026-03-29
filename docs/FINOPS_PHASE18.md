# Fase 18 - FinOps Autopilot (Triage + Seasonality + Policies)

## Objetivo
Cerrar el ciclo FinOps con capacidades automáticas de gobernanza:

- Auto-triage de incidentes (priorización operativa).
- Sugerencias de presupuesto por temporada (seasonality).
- Policies de aprobación por rol/proyecto con auto-approve controlado.

## Datos y modelo

Nuevos modelos Prisma:

- `UserFinOpsAutopilot`
  - configuración por usuario (`enabled`, `seasonalityEnabled`, `budgetBufferRatio`, `lookbackMonths`).
- `BudgetApprovalPolicy`
  - reglas por `role + projectKey`:
    - `autoApproveBelowUsd`
    - `requireManualForProviderChanges`
    - `requireReason`
    - `alwaysRequireManual`
    - `enabled`

`User` se amplía con relaciones para autopilot y creador de policies.

## Backend (servicio FinOps)

Archivo:

- `src/lib/security/usage-finops.ts`

Nuevas funciones principales:

- Policies:
  - `getBudgetApprovalPolicies`
  - `saveBudgetApprovalPolicies`
  - evaluación automática en `createBudgetApprovalRequest`
- Autopilot por usuario:
  - `getUserFinOpsAutopilotConfig`
  - `saveUserFinOpsAutopilotConfig`
  - `getUserFinOpsAutopilotSnapshot`
- Incidentes enterprise:
  - `getEnterpriseFinOpsIncidentReport`

Comportamiento nuevo:

- Al crear una solicitud de presupuesto, se evalúa la policy aplicable por rol/proyecto.
- Si la policy permite auto-approve, se aplican cambios de presupuesto/objetivos automáticamente.
- Se generan incidentes con severidad (`critical/high/medium/low`) para alertas, backlog de aprobaciones y concentración de gasto.

## APIs nuevas

- Usuario:
  - `GET/PUT /api/user/usage-autopilot`
- Operación (OWNER o `REY30_OPS_TOKEN`):
  - `GET/PUT /api/ops/usage/policies`
  - `GET /api/ops/usage/incidents`

## UI

Componente:

- `src/engine/editor/UsageFinOpsPanel.tsx`

Novedades:

- Sección **Autopilot Budget Advisor**:
  - factor estacional,
  - presupuesto sugerido,
  - toggles de autopilot/seasonality,
  - ajuste de `lookback` y `buffer`.
- Sección **Auto-Triage de Incidentes** (OWNER).
- Sección **Policies de aprobación (rol/proyecto)** editable (OWNER).

## Automatización operativa

Script actualizado:

- `scripts/monitor-finops-enterprise.mjs`
  - ahora consulta también `/api/ops/usage/incidents`.
  - soporta `--fail-on-high`.

Workflow actualizado:

- `.github/workflows/finops-enterprise-monitor.yml`
  - input `fail_on_high`.

Scripts npm:

- `usage:enterprise`
- `usage:incidents`

## Pruebas

Actualizado:

- `tests/integration/usage-routes.test.ts`
  - cobertura de:
    - `/api/user/usage-autopilot` (bloqueo anónimo)
    - `/api/ops/usage/incidents` (acceso ops token)
    - `/api/ops/usage/policies` GET/PUT (acceso ops token)

## Resultado

Fase 18 deja FinOps en modo autopilot controlado:

- cada solicitud se evalúa por policy (rol/proyecto),
- el presupuesto recomendado se ajusta por tendencia y temporada,
- y operación recibe incidentes priorizados para actuar antes de sobrecostos críticos.
