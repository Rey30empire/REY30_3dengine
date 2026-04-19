# Production Hardening Drills

Este documento deja ejecutable el bloque de pruebas de carga y restore drills.

## Drill unico

```bash
pnpm run hardening:drill -- \
  --base-url https://app.example.com \
  --ops-token "$REY30_OPS_TOKEN" \
  --requests 120 \
  --concurrency 12 \
  --timeout-ms 30000 \
  --report-path output/production-hardening-drill/report.json
```

El drill ejecuta:

1. Load probe contra `/api/health/live`.
2. Backup remoto por `/api/ops/backups`.
3. Verify del backup creado.
4. Restore dry-run del backup creado.

## Runner staging protegido

Workflow listo:

- `.github/workflows/staging-hardening-restore-probe.yml`

Configura estos valores en el environment/repo de GitHub:

| Nombre | Tipo | Uso |
| --- | --- | --- |
| `STAGING_BASE_URL` | variable o secret | URL de staging. |
| `REY30_OPS_TOKEN` | secret | Token ops para `/api/ops/*` y publish del probe. |
| `REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL` | variable o secret | URL externa de `/api/ops/metrics`. |
| `REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL` | variable o secret | URL de Alertmanager. Puede quedar vacia si no aplica. |
| `REY30_RUNTIME_FORENSICS_PROBE_PUBLISH_URL` | variable o secret | URL base del app donde publicar el resultado. Si falta, usa staging. |

Carga segura desde tu shell local:

```bash
export STAGING_BASE_URL="https://staging.example.com"
export REY30_OPS_TOKEN="..."
export REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL="https://staging.example.com/api/ops/metrics"
export REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL="https://alertmanager.example.com"
export REY30_RUNTIME_FORENSICS_PROBE_PUBLISH_URL="https://staging.example.com"
pnpm run github:staging:configure
```

Ejecuta manualmente:

```bash
gh workflow run staging-hardening-restore-probe.yml \
  -f requests=1000 \
  -f concurrency=50 \
  -f timeout_ms=30000 \
  -f confirm_restore=RESTORE_NOW
```

El workflow:

1. Corre `production-hardening-drill.mjs` contra staging con la carga indicada.
2. Usa el backup creado por el drill, salvo que pases `backup_id`.
3. Verifica el backup.
4. Ejecuta restore dry-run.
5. Ejecuta restore real con `confirm=RESTORE_NOW`.
6. Corre el probe externo Prometheus/Alertmanager y publica el resultado al Overview.
7. Sube todos los reportes JSON como artifact.

Resultado esperado:

```json
{
  "ok": true,
  "load": {
    "ok": true
  },
  "backup": {
    "ok": true,
    "restoreDryRun": {
      "ok": true
    }
  }
}
```

## Carga aislada

```bash
pnpm run capacity:load -- \
  --base-url https://app.example.com \
  --endpoint /api/health/live \
  --requests 500 \
  --concurrency 25 \
  --accepted-statuses 200 \
  --report-path output/capacity-report.json
```

## Restore drill aislado

```bash
pnpm run backup:create:remote -- --base-url https://app.example.com --ops-token "$REY30_OPS_TOKEN"
pnpm run backup:verify:remote -- --base-url https://app.example.com --ops-token "$REY30_OPS_TOKEN" --backup-id "<backup_id>"
pnpm run backup:restore:dryrun:remote -- --base-url https://app.example.com --ops-token "$REY30_OPS_TOKEN" --backup-id "<backup_id>"
```

Regla de cierre:

- `create` devuelve `backup.backupId`.
- `verify.ok` es `true`.
- `restore dry-run` devuelve `dryRun: true` y lista operaciones sin modificar datos.
- El reporte queda en `output/production-hardening-drill/report.json`.
