# Fase 17 - FinOps Governance Empresarial

## Objetivo
Extender FinOps de operación individual a gobernanza multiusuario con:

- Solicitudes de aprobación de presupuesto por usuario.
- Resolución centralizada (OWNER/ops token) con trazabilidad.
- Reporte enterprise consolidado (alertas + gasto + pendientes).
- Monitoreo programado para incidentes de costo y backlog de aprobaciones.

## Modelo de datos

Se agregaron en Prisma:

- `BudgetApprovalStatus` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELED`)
- `BudgetApprovalRequest`
  - cambios solicitados de presupuesto global/proveedor/proyectos
  - motivo y nota de decisión
  - actor resolutor y timestamp de resolución

`User` fue extendido con relaciones de solicitante y resolutor.

## Servicio de gobernanza

Archivo:

- `src/lib/security/usage-finops.ts`

Nuevas capacidades:

- `createBudgetApprovalRequest`
- `getUserBudgetApprovalRequests`
- `getBudgetApprovalRequests`
- `decideBudgetApprovalRequest`
- `getEnterpriseFinOpsReport`

Comportamiento clave:

- Al aprobar una solicitud, el sistema aplica automáticamente los cambios:
  - política de uso (`saveUserUsagePolicy`)
  - objetivos por proyecto (`saveProjectUsageGoals`)
- Se conserva auditoría de decisión y control por estado.

## APIs nuevas

- `GET/POST /api/user/budget-approvals`
  - historial del usuario y creación de solicitud.
- `GET /api/ops/usage/approvals`
  - cola enterprise por estado (`PENDING` por defecto, también `ALL`).
- `POST /api/ops/usage/approvals/[requestId]/decision`
  - resolver solicitud (`approve`, `reject`, `cancel`).
- `GET /api/ops/usage/enterprise`
  - reporte consolidado multiusuario para operación FinOps.

Autorización:

- Usuario autenticado (`VIEWER+`) en rutas de usuario.
- `OWNER` o `REY30_OPS_TOKEN` para rutas de operación enterprise.

## UI

Componente:

- `src/engine/editor/UsageFinOpsPanel.tsx`

Nuevas secciones:

- Solicitud de aprobación de presupuesto (autoservicio).
- Historial de solicitudes del usuario.
- Vista `OWNER` con resumen enterprise y cola pendiente para aprobar/rechazar.

## Monitoreo automatizado

Script:

- `scripts/monitor-finops-enterprise.mjs`

Flujo:

- consulta `/api/ops/usage/enterprise`
- evalúa políticas de falla (`critical`, `warning`, `pending`)
- genera reporte JSON
- dispara webhook opcional en incidentes

Workflow:

- `.github/workflows/finops-enterprise-monitor.yml`

Script npm:

- `pnpm run usage:enterprise`

## Pruebas

Integración actualizada:

- `tests/integration/usage-routes.test.ts`
  - disponibilidad de endpoints enterprise con ops token
  - bloqueo anónimo para `/api/user/budget-approvals`

## Resultado

Fase 17 deja FinOps con control empresarial real:

- cada usuario solicita cambios con responsabilidad individual,
- el owner/ops gobierna aprobaciones,
- y operaciones cuenta con monitoreo programado para incidentes y backlog de aprobaciones.
