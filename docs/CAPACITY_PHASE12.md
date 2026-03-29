# Fase 12 - Carga/Capacidad + Límites por Modo y Usuario

## Objetivo
Cerrar la fase de capacidad con:

- Límites reales de tráfico para `/api/ai-chat` por modo de motor.
- Segmentación por usuario/sesión para evitar abuso cruzado.
- Endpoint operativo para consultar política activa.
- Script de carga reutilizable y workflow programado.

## Límites implementados

Archivo base:

- `src/proxy.ts`

Reglas:

1. Limiter global por IP+path (ya existente).
2. Limiter específico para `POST /api/ai-chat` por:
   - sesión (`rey30_session`) si existe, si no IP,
   - modo (`MODE_MANUAL`, `MODE_HYBRID`, `MODE_AI_FIRST`).

Cuando se excede límite de chat:

- HTTP `429`
- payload incluye `mode`, `limit`, `windowMs`, `retryAfterSeconds`.

## Política configurable

Archivo:

- `src/lib/security/capacity-policy.ts`

Variables:

- `REY30_RATE_LIMIT_WINDOW_MS`
- `REY30_RATE_LIMIT_MAX_REQUESTS`
- `REY30_LIMIT_AI_CHAT_MANUAL_PER_WINDOW`
- `REY30_LIMIT_AI_CHAT_HYBRID_PER_WINDOW`
- `REY30_LIMIT_AI_CHAT_AI_FIRST_PER_WINDOW`

## Endpoint operacional

- `GET /api/ops/capacity`

Retorna política activa de capacidad/rate-limits.

Autorización:

- sesión `OWNER`, o
- token de operaciones (`x-rey30-ops-token`).

## Cliente/UI

`AIChatPanel` ahora envía:

- header `x-rey30-engine-mode` en llamadas a `/api/ai-chat`.

Además muestra mensaje dedicado cuando recibe `429`.

## Pruebas de carga

Script:

- `scripts/load-capacity.mjs`

Uso ejemplo:

```bash
node scripts/load-capacity.mjs \
  --base-url https://tu-app.example.com \
  --endpoint /api/health/live \
  --requests 600 \
  --concurrency 40 \
  --accepted-statuses 200
```

Valida rate-limit AI First:

```bash
node scripts/load-capacity.mjs \
  --base-url https://tu-app.example.com \
  --endpoint /api/ai-chat \
  --method POST \
  --engine-mode MODE_AI_FIRST \
  --body '{"prompt":"capacity probe"}' \
  --requests 120 \
  --concurrency 20 \
  --accepted-statuses 200,401,429 \
  --require-status 429
```

## Workflow programado

- `.github/workflows/capacity-load-test.yml`

Pasos:

1. test de throughput en `/api/health/live`.
2. test de límite en `/api/ai-chat` AI First (espera al menos un `429`).
3. subida de artifacts JSON.
4. webhook de alerta opcional si falla.

## Cobertura de tests

- `tests/integration/capacity-limits.test.ts`
  - endpoint `/api/ops/capacity` con token.
  - verificación de `429` en AI First con límites bajos.
  - aislamiento de límites por modo.

