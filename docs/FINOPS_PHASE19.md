# Fase 19 - FinOps Closed-Loop Automation

## Objetivo
Cerrar el ciclo de gobernanza con remediación automática segura:

- detección de incidentes priorizados,
- ejecución de acciones correctivas sobre límites/policies,
- ventana horaria de seguridad,
- cooldown anti-flapping,
- auditoría de cada acción (propuesta, aplicada, omitida o fallida).

## Modelo de datos

Nuevos elementos Prisma:

- `FinOpsAutomationControl`
  - control global de automatización (`enabled`, ventana UTC, `minSeverity`, `cooldownMinutes`, `maxActionsPerRun`, toggles de mutación).
- `FinOpsRemediationLog`
  - bitácora de remediaciones (`PROPOSED`, `APPLIED`, `SKIPPED`, `FAILED`) con metadata de acción.
- enum `FinOpsRemediationStatus`.

## Servicio central

Archivo:

- `src/lib/security/usage-finops.ts`

Nuevas capacidades:

- `get/saveFinOpsAutomationControl`
- `getFinOpsRemediationLogs`
- `runFinOpsClosedLoop`

Acciones automáticas implementadas:

- `enforce_hard_stop`
- `tighten_provider_budget`
- `create_project_guardrail`
- `harden_approval_policy`

Guardrails:

- filtro por severidad mínima (`critical/high/medium/low`),
- ejecución solo dentro de ventana UTC (salvo `force`),
- cooldown por `user + actionType`,
- límite de acciones por corrida.

## APIs nuevas

Operación (`OWNER` o `REY30_OPS_TOKEN`):

- `GET/PUT /api/ops/usage/automation-control`
- `POST /api/ops/usage/closed-loop`
- `GET /api/ops/usage/closed-loop/logs`

## Automatización y CI

Script nuevo:

- `scripts/run-finops-closed-loop.mjs`

Scripts npm:

- `usage:closed-loop:dry`
- `usage:closed-loop:apply`

Workflow nuevo:

- `.github/workflows/finops-closed-loop.yml`
  - ejecución programada con dry-run por defecto,
  - opción manual para aplicar cambios,
  - webhook de incidente en fallos.

## UI

Componente:

- `src/engine/editor/UsageFinOpsPanel.tsx`

Secciones owner agregadas:

- **Closed-Loop Control** (configuración de ventana/cooldown/severidad/toggles).
- **Run Closed-Loop** (dry-run/aplicar).
- **Closed-Loop Logs** (últimas remediaciones).

## Pruebas

Actualización de integración:

- `tests/integration/usage-routes.test.ts`
  - cobertura de:
    - automation-control GET/PUT,
    - ejecución closed-loop POST (dry-run),
    - logs closed-loop GET.

## Resultado

Fase 19 deja FinOps en ciclo cerrado real:

- incidentes -> decisión automática -> acción controlada -> evidencia persistida,
- con límites operativos para evitar cambios agresivos fuera de ventana o en ráfaga.
