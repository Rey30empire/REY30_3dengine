# Fase 8 - Release Hardening

## Objetivo
Cerrar el motor para publicación controlada con:

- Suite de pruebas por niveles (`unit`, `integration`, `e2e`).
- Telemetría operativa de runtime/composer/orquestador.
- Performance budgets explícitos.
- Checklist de release y rollback.

## Test Suite

### Unit
- `tests/unit/scrib-core.test.ts`
- `tests/unit/telemetry.test.ts`

Cobertura:
- `ScribRegistry`, `AssignSystem`, `Composer`.
- Agregación de métricas de telemetría.

### Integration
- `tests/integration/auth-api.test.ts`

Cobertura:
- Bloqueos de rutas cuando no hay sesión.
- Endpoints cloud en modo anónimo (`configured: false`).
- Protección de telemetría por rol.

### E2E
- `tests/e2e/workflow-modes.e2e.test.ts`

Cobertura:
- Mapeo `engineMode -> aiMode`.
- Compilación de escena en `MODE_MANUAL`, `MODE_HYBRID`, `MODE_AI_FIRST` usando el mismo core.

## Scripts de ejecución

- `pnpm run test:unit`
- `pnpm run test:integration`
- `pnpm run test:e2e`
- `pnpm run test:release`
- `pnpm run release:check`
- `pnpm run security:release`
- `pnpm run integration:send` (cliente Node para `server-to-server` firmado)

## Telemetría

Módulo: `src/engine/telemetry/engineTelemetry.ts`

Métricas:
- `compose_duration_ms`
- `prompt_to_scene_ms`
- `scrib_runtime_error`

API:
- `GET /api/telemetry` (requiere rol `EDITOR` o superior)

## Performance Budgets

Variables opcionales:
- `REY30_BUDGET_COMPOSE_MS` (default: `40`)
- `REY30_BUDGET_COMPOSE_MS_WARN` (default: `60`)
- `REY30_BUDGET_PROMPT_TO_SCENE_MS` (default: `8000`)
- `REY30_BUDGET_PROMPT_TO_SCENE_MS_WARN` (default: `12000`)
- `REY30_BUDGET_SCRIB_ERROR_RATE` (default: `0.03`)
- `REY30_BUDGET_SCRIB_ERROR_RATE_WARN` (default: `0.08`)

## Release Checklist

1. Ejecutar `pnpm run db:push`.
2. Ejecutar `pnpm run release:check`.
3. Ejecutar `pnpm run security:release` contra staging/producción.
4. Verificar login + BYOK por usuario (`Config APIs -> Usuario`).
5. Probar flujo Manual/Hybrid/AI First con una escena real.
6. Validar integración backend firmada (`/api/integrations/events`) con `scripts/integration-send-event.mjs` o `scripts/integration-send-event.ps1`.
7. Revisar `GET /api/telemetry` en staging.
8. Publicar a producción.

## Rollback Checklist

1. Detener despliegue actual.
2. Restaurar versión anterior de app.
3. Mantener base de datos (no destructivo) y revisar `SecurityAuditLog`.
4. Deshabilitar temporalmente rutas cloud si hay fallo proveedor.
5. Reintentar deploy tras corregir regresión y pasar `release:check`.
