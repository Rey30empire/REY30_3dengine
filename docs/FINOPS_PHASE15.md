# Fase 15 - FinOps UX de Costos (Dashboard + Tendencias + Recomendaciones)

## Objetivo
Completar la capa de experiencia de costos por usuario para BYOK:

- Dashboard visual de gasto en `Usuario / Config APIs`.
- Tendencia mensual (histórico de períodos).
- Proyección de cierre de mes.
- Recomendaciones automáticas de ahorro.
- Edición directa de política de presupuesto/límites por proveedor.

## Backend de insights

Se extendió:

- `src/lib/security/usage-governance.ts`

Nuevas capacidades:

- Tipos nuevos:
  - `UsageTrendPoint`
  - `UsageRecommendation`
  - `UsageInsights`
- Función:
  - `getUsageInsights(userId, { months, period })`
- Motor de recomendaciones:
  - `generateUsageRecommendations(...)`

Lógica incluida:

- Historial de N meses (`2..12`).
- Cálculo de delta mensual (USD y porcentaje).
- Proyección de fin de mes según ritmo de consumo.
- Detección de riesgo por:
  - warning/bloqueo actual
  - proyección > presupuesto
  - concentración excesiva en un proveedor
  - aceleración de gasto mes vs promedio reciente

## API nueva

- `GET /api/user/usage-insights?months=6&period=YYYY-MM`

Respuesta:

- `insights.current` (resumen actual)
- `insights.trend` (serie mensual)
- `insights.projections` (proyección + top provider)
- `insights.recommendations` (acciones sugeridas)

Acceso:

- Requiere sesión (`VIEWER+`).

## UI (SettingsPanel)

Se agregó pestaña:

- `Uso/Costos`

Componente nuevo:

- `src/engine/editor/UsageFinOpsPanel.tsx`

Incluye:

- KPIs de gasto actual.
- Barra de consumo del presupuesto.
- Gráfico de tendencia mensual (barras).
- Breakdown por proveedor.
- Recomendaciones con severidad.
- Editor de política de gasto:
  - presupuesto mensual
  - umbral de warning
  - hard stop
  - límites por proveedor

## Pruebas

Actualizado:

- `tests/integration/usage-routes.test.ts`
  - valida que `GET /api/user/usage-insights` rechaza anónimo (`401`).
- `tests/unit/usage-governance.test.ts`
  - valida recomendaciones automáticas en escenario de riesgo.

## Resultado

Fase 15 habilita operación FinOps autoservicio para cada usuario BYOK:

- Visibilidad de gasto real y tendencia.
- Control directo de límites.
- Recomendaciones accionables para evitar sobrecostos antes de bloqueo.

