# Fase 10 - Observabilidad Avanzada (SLO + Alertas + Monitor)

## Objetivo
Agregar observabilidad operativa continua sobre producción:

- SLO calculados desde telemetría real del engine.
- Alertas activas por degradación (`warn`/`error`).
- Export de métricas en formato Prometheus.
- Monitor programado en GitHub Actions con webhook de incidente.

## Nuevos endpoints operativos

- `GET /api/ops/slo`
  - Retorna `slo.overallStatus`, indicadores, alertas y resumen.
  - Acceso por:
    - sesión `EDITOR+`, o
    - token `x-rey30-ops-token` (`REY30_OPS_TOKEN`).

- `GET /api/ops/alerts`
  - Retorna alertas activas y conteos (`critical`, `warning`).
  - Acceso por:
    - sesión `OWNER`, o
    - token `x-rey30-ops-token`.

- `GET /api/ops/metrics`
  - Exporta métricas texto `text/plain` (Prometheus format).
  - Acceso por:
    - sesión `OWNER`, o
    - token `x-rey30-ops-token`.

## SLO implementados

Indicadores:

1. `compose_latency`
2. `prompt_to_scene_latency`
3. `scrib_runtime_error_rate`

Estados:

- `ok`: dentro de objetivo
- `warn`: cerca del límite
- `error`: fuera de objetivo

Campos clave:

- `burnRate` por indicador.
- `errorBudget` para tasa de error de scrib.

## Métricas Prometheus

Ejemplos de series:

- `rey30_compose_duration_ms_avg`
- `rey30_prompt_to_scene_ms_avg`
- `rey30_scrib_runtime_errors_total`
- `rey30_slo_indicator_status{indicator="..."}`
- `rey30_slo_indicator_burn_rate{indicator="..."}`
- `rey30_slo_alerts_active`

## Monitor continuo

Workflow:

- `.github/workflows/slo-monitor.yml`
  - Schedule: cada hora.
  - También manual (`workflow_dispatch`).
  - Ejecuta `scripts/monitor-slo.mjs`.
  - Publica artifact `output/slo-monitor.json`.
  - Si falla y existe `ALERT_WEBHOOK_URL`, dispara alerta.

## Scripts nuevos

- `pnpm run monitor:slo`
  - Monitor puntual de estado SLO remoto.

- `pnpm run alert:trigger`
  - Envío manual de alerta a webhook.

## Variables y secretos recomendados

- `REY30_OPS_TOKEN` (secret)
  - Token de lectura para `/api/ops/*`.
- `PRODUCTION_BASE_URL` (var o secret)
  - URL base del entorno monitoreado.
- `ALERT_WEBHOOK_URL` (secret)
  - Endpoint de notificación de incidentes.

## Checklist de cierre fase

1. `release:check` en verde.
2. Endpoint `/api/ops/slo` responde con token.
3. Endpoint `/api/ops/metrics` exporta métricas texto.
4. `slo-monitor.yml` ejecutado manualmente en verde.
5. Alerta webhook validada en staging (simulando fallo).

