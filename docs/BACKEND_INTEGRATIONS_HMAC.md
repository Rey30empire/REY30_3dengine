# Integraciones Backend (Sin Origin)

## Objetivo
Permitir llamadas `server-to-server` hacia:

- `POST /api/integrations/events`

sin depender del header `Origin`, pero con autenticación fuerte:

- `Authorization: Bearer <token>`
- `x-rey30-integration-id`
- `x-rey30-timestamp`
- `x-rey30-nonce`
- `x-rey30-signature`

## Configuración del servidor

Define credenciales con alcance por `scope`:

```env
REY30_INTEGRATION_CREDENTIALS=[{"id":"svc_backend","token":"TOKEN_LARGO","secret":"SECRET_LARGO","scopes":["events:write"]}]
REY30_INTEGRATION_MAX_SKEW_SEC=300
```

Alternativa de credencial única:

```env
REY30_INTEGRATION_ID=svc_backend
REY30_INTEGRATION_TOKEN=TOKEN_LARGO
REY30_INTEGRATION_SECRET=SECRET_LARGO
REY30_INTEGRATION_SCOPES=events:write
```

## Script cliente Node

Archivo:

- `scripts/integration-send-event.mjs`

Comando base:

```bash
pnpm run integration:send -- \
  --base-url https://api.tu-dominio.com \
  --integration-id svc_backend \
  --token "$REY30_INTEGRATION_TOKEN" \
  --secret "$REY30_INTEGRATION_SECRET" \
  --event-type build.completed \
  --source ci \
  --payload-json '{"jobId":"job_123","status":"ok"}'
```

Dry run:

```bash
pnpm run integration:send -- \
  --base-url https://api.tu-dominio.com \
  --integration-id svc_backend \
  --token "$REY30_INTEGRATION_TOKEN" \
  --secret "$REY30_INTEGRATION_SECRET" \
  --event-type integration.ping \
  --dry-run true
```

## Script cliente PowerShell

Archivo:

- `scripts/integration-send-event.ps1`

Ejemplo:

```powershell
pwsh -File .\scripts\integration-send-event.ps1 `
  -BaseUrl "https://api.tu-dominio.com" `
  -IntegrationId "svc_backend" `
  -Token $env:REY30_INTEGRATION_TOKEN `
  -Secret $env:REY30_INTEGRATION_SECRET `
  -EventType "build.completed" `
  -Source "ci" `
  -PayloadJson '{"jobId":"job_123","status":"ok"}'
```

## Firma HMAC (referencia)

Payload canónico firmado:

```text
POST
/api/integrations/events
<TIMESTAMP_SECONDS>
<NONCE>
<SHA256_HEX_BODY>
```

`x-rey30-signature` usa `HMAC-SHA256` en hex, opcionalmente prefijado con `sha256=`.

## Errores esperados

- `401 invalid_token`: bearer inválido.
- `401 invalid_signature`: firma inválida.
- `401 replay_detected`: nonce reutilizado.
- `401 timestamp_skew`: timestamp fuera de ventana.
- `403 missing_scope`: scope insuficiente.

## Recomendaciones operativas

1. Rotar `token` y `secret` por integración.
2. Un `id` por sistema externo (ERP, CI, billing, etc).
3. Usar `idempotencyKey` cuando el evento pueda reintentarse.
4. Revisar `SecurityAuditLog` ante cualquier `401/403`.
