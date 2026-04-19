# Runtime Forensics Prometheus/Alertmanager Probe

Este probe cierra la verificacion externa del SLO Webhook + Prometheus.

## Variables

| Variable | Uso |
| --- | --- |
| `REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL` | URL externa que Prometheus debe poder scrapear, normalmente `https://app.example.com/api/ops/metrics`. |
| `REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TOKEN` | Token opcional enviado como `x-rey30-ops-token`. Si no existe usa `REY30_OPS_TOKEN`. |
| `REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL` | URL opcional de Alertmanager; acepta base URL o `/api/v2/status`. |
| `REY30_RUNTIME_FORENSICS_PROBE_PUBLISH_URL` | URL base del app para publicar el resultado en `/api/scripts/runtime/fault-ledger/prometheus-probe`. |
| `REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TIMEOUT_MS` | Timeout del probe. Default `8000`. |

## Ejecucion externa

```bash
pnpm run monitor:runtime-forensics:prometheus -- \
  --metrics-url https://app.example.com/api/ops/metrics \
  --ops-token "$REY30_OPS_TOKEN" \
  --alertmanager-url https://alertmanager.example.com \
  --publish-url https://app.example.com \
  --report-path output/runtime-forensics-prometheus-probe/report.json
```

Resultado esperado:

```json
{
  "ok": true,
  "status": "ok",
  "metricName": "rey30_runtime_forensics_webhook_delivery_failure_rate",
  "sample": "rey30_runtime_forensics_webhook_delivery_failure_rate 0",
  "alertmanager": {
    "status": "ok"
  },
  "publish": {
    "ok": true
  }
}
```

## API interna

Leer configuracion y ultimo resultado:

```bash
curl -H "x-rey30-ops-token: $REY30_OPS_TOKEN" \
  https://app.example.com/api/scripts/runtime/fault-ledger/prometheus-probe
```

Ejecutar probe desde el servidor:

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "x-rey30-ops-token: $REY30_OPS_TOKEN" \
  -d '{"action":"run"}' \
  https://app.example.com/api/scripts/runtime/fault-ledger/prometheus-probe
```

Publicar resultado desde un runner externo manual:

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "x-rey30-ops-token: $REY30_OPS_TOKEN" \
  -d '{"action":"publish","result":{"checkedAt":"2026-04-19T00:00:00.000Z","source":"external","ok":true,"status":"ok","metricName":"rey30_runtime_forensics_webhook_delivery_failure_rate","metricsUrl":"https://app.example.com/api/ops/metrics","statusCode":200,"durationMs":120,"value":0,"sample":"rey30_runtime_forensics_webhook_delivery_failure_rate 0","error":null,"alertmanager":{"configured":true,"url":"https://alertmanager.example.com/api/v2/status","status":"ok","statusCode":200,"version":"0.27.0","error":null}}}' \
  https://app.example.com/api/scripts/runtime/fault-ledger/prometheus-probe
```

El Forensics Overview muestra el ultimo probe en el bloque **Prometheus/SLO health**.
