# Fase 11 - Backup/Restore Programado y Validado

## Objetivo
Garantizar continuidad operativa con respaldo y recuperación verificables:

- Crear backups de datos críticos.
- Verificar integridad (SHA-256).
- Probar restauración (dry-run y restore confirmado).
- Automatizar ciclo en workflow programado.

## Cobertura de backup

Targets respaldados:

1. Base de datos local (`DATABASE_URL` tipo `file:`) o dump SQL externo (`REY30_DATABASE_BACKUP_PATH`).
2. Carpeta de scripts (`REY30_SCRIPT_ROOT` o `<source>/scripts`).
3. Carpeta de galería (`REY30_GALLERY_ROOT` o `%LOCALAPPDATA%/REY30_gallery_store`).

Si `DATABASE_URL` apunta a PostgreSQL/MySQL/SQL Server remoto, el backup de base de datos ya no intenta copiar un `.db` inexistente.
En ese caso debe definirse `REY30_DATABASE_BACKUP_PATH` apuntando a un dump generado por la estrategia operativa elegida.

Root de backup:

- `REY30_BACKUP_ROOT` o `%LOCALAPPDATA%/REY30_backups`

## Servicio central

Archivo:

- `src/lib/ops/backup-service.ts`

Funciones:

- `createBackup(note?)`
- `listBackups(limit?)`
- `verifyBackup(backupId)`
- `restoreBackup({ backupId, dryRun, confirm, skipVerify })`

Notas de seguridad:

- `restore` real exige `confirm=RESTORE_NOW`.
- Antes de restaurar, copia estado actual a `_restore_history`.

## APIs operativas

- `GET /api/ops/backups` (listar)
- `POST /api/ops/backups` (crear)
- `POST /api/ops/backups/verify` (integridad)
- `POST /api/ops/backups/restore` (dry-run o restore real)

Autorización:

- Sesión `OWNER`, o
- token de operaciones (`x-rey30-ops-token` / `Authorization: Bearer ...`).

## Cliente remoto

Script:

- `scripts/ops-backup-client.mjs`

Comandos:

- `create`
- `list`
- `verify --backup-id ...`
- `restore-dry-run --backup-id ...`

NPM scripts:

- `backup:create:remote`
- `backup:list:remote`
- `backup:verify:remote`
- `backup:restore:dryrun:remote`

Restore real controlado en staging:

```bash
node scripts/ops-backup-client.mjs restore-real \
  --base-url "$STAGING_BASE_URL" \
  --ops-token "$REY30_OPS_TOKEN" \
  --backup-id "<backup_id>" \
  --confirm RESTORE_NOW \
  --report-path output/staging-restore-real.json
```

## Automatización programada

Workflow:

- `.github/workflows/backup-restore-drill.yml`

Flujo:

1. Crear backup.
2. Verificar integridad.
3. Ejecutar restore dry-run.
4. Subir artifacts JSON.
5. Si falla, disparar webhook de alerta (si existe `ALERT_WEBHOOK_URL`).

Variables/secrets recomendados:

- `PRODUCTION_BASE_URL`
- `REY30_OPS_TOKEN`
- `ALERT_WEBHOOK_URL` (opcional)

## Validación de la fase

Incluye pruebas de integración:

- `tests/integration/ops-backup.test.ts`
  - Crea backup real en ruta temporal.
  - Verifica integridad.
  - Ejecuta dry-run.
  - Ejecuta restore confirmado.
  - Comprueba recuperación de archivo.
