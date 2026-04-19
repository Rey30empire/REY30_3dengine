# Local Single-User Mode

Este perfil cierra la app para uso local sin pedir email ni password, pero sin borrar el camino de deploy remoto.

## Variables

- `REY30_LOCAL_OWNER_MODE=true`
- `REY30_LOCAL_OWNER_ALLOW_REMOTE=false`
- `REY30_LOCAL_OWNER_EMAIL=owner@rey30.local`
- `REY30_LOCAL_OWNER_NAME=REY30 Local Owner`
- `REY30_PERFORMANCE_BUDGET_PROFILE=local-single-user`
- Opcional para puertos locales no default:
  - `REY30_LOCAL_PROVIDER_ALLOWLIST_OLLAMA`
  - `REY30_LOCAL_PROVIDER_ALLOWLIST_VLLM`
  - `REY30_LOCAL_PROVIDER_ALLOWLIST_LLAMACPP`

## Comportamiento

- Si el modo local esta activo, `/api/auth/session` crea o reutiliza un usuario local `OWNER`.
- La app emite una sesion real con cookie para que el resto del sistema siga funcionando con ownership, auditoria y permisos.
- El flujo clasico de `login/register/token` no se elimina; simplemente deja de ser necesario para la maquina local.
- Los proveedores locales (`ollama`, `vllm`, `llamacpp`) solo aceptan loopback del servidor y, por defecto, solo en sus puertos esperados.
- Si necesitas otro puerto local, agregalo de forma explicita al allowlist del proveedor correspondiente.

## Perfil recomendado

Para uso solo en tu PC:

- `REY30_LOCAL_OWNER_MODE=true`
- `REY30_LOCAL_OWNER_ALLOW_REMOTE=false`
- `REY30_PERFORMANCE_BUDGET_PROFILE=local-single-user`

Para una instancia aislada que quieras compartir con tu hermano por Docker + tunel:

- `REY30_LOCAL_OWNER_MODE=true`
- `REY30_LOCAL_OWNER_ALLOW_REMOTE=true`
- `REY30_PERFORMANCE_BUDGET_PROFILE=local-single-user`

Hazlo solo en una instancia separada y controlada. Ese modo entrega acceso completo a cualquiera que tenga el link.

## Gate correcto

Si el objetivo es `local-only`, usa:

- `pnpm run seal:final`
- `start-clean-app.bat --verify-full-only`

En ese perfil, el reporte final ahora separa dos cosas:

- `localSingleUserEligible=true`: la app quedo cerrada para uso local/single-user.
- `finalSealTrueEligible=true`: solo aplica cuando exista un target real de deploy.

Reserva `pnpm run seal:target` para cuando de verdad vayas a probar infraestructura remota.
`pnpm run release:freeze` queda reservado para reportes con `finalSealTrueEligible=true`; un sello local no debe producir freeze de deploy.
`seal:target` falla temprano si intenta usar HTTP, localhost, storage `filesystem`, rate-limit mock/in-memory o secretos generados.

Notas:

- `local-single-user` aplica un waiver local-only a los stalls de renderer headless (`editor_fps_min`, `editor_frame_time_ms`, `editor_cpu_time_ms`). El perfil remoto/estricto sigue fallando esos budgets.
- El smoke de performance tambien toma muestras manuales de render desde el viewport para que las pausas del scheduler headless no se confundan con costo real de la escena.
- No cambia `seal:target`; el perfil estricto sigue intacto para pruebas contra infraestructura real.
