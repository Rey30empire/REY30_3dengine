# Batch Script Policy

## Regla del repo

Este proyecto mantiene **un solo launcher `.bat` propio**:

- `start-clean-app.bat`

No se deben crear `.bat` duplicados para variantes como desarrollo, produccion local o semi-produccion.

## Como extender el launcher

Si aparece una nueva necesidad:

1. Edita `start-clean-app.bat`.
2. Agrega un flag o modo nuevo.
3. Reutiliza el mismo entrypoint en lugar de crear otro `.bat`.

Ejemplos actuales:

- `start-clean-app.bat`
- `start-clean-app.bat --production-local`
- `start-clean-app.bat --semi-production-local`
- `start-clean-app.bat --preflight-only`

## Regla para cualquier agente

- Antes de crear un `.bat`, busca si ya existe `start-clean-app.bat`.
- Si el flujo ya existe, edita ese archivo.
- Si el flujo no existe, agrégalo al mismo archivo como bandera nueva.
- Si encuentras `.bat` redundantes, elimínalos y unifica su comportamiento en `start-clean-app.bat`.

## Excepcion

Solo se permitiría otro `.bat` si fuera un wrapper externo indispensable y no pudiera integrarse por flags. Aun en ese caso, primero se debe intentar unificar el comportamiento en `start-clean-app.bat`.
