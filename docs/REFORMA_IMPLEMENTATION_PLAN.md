# REY30 - Plan De Implementacion De Reforma

## 1. Objetivo
Estandarizar el producto para modo SaaS BYOK por usuario:
- Cada usuario crea su cuenta.
- Cada usuario configura sus propias API keys.
- El servidor no provee claves de proveedores.
- Seguridad, observabilidad y costos quedan bajo control operativo.

## 2. Principios
- Seguridad primero: sin secretos de cifrado en produccion, el sistema no debe declararse `ready`.
- BYOK estricto: no usar llaves globales compartidas.
- Fallas visibles: errores con correlacion y trazabilidad.
- Entregas cortas: cambios pequenos, testeables y reversibles.

## 3. Fases

### Fase A - Baseline Tecnico (1-2 dias)
- Corregir `lint`, `typecheck` y tests de integracion.
- Alinear health readiness con reglas de seguridad reales.
- Verificar pipeline local: `lint`, `typecheck`, `test:*`, `build`.

### Fase B - Seguridad BYOK (2-4 dias)
- Mantener cifrado de secretos por usuario (`REY30_ENCRYPTION_KEY` o `NEXTAUTH_SECRET`).
- Endpoints de credenciales solo autenticados y con CSRF.
- Auditoria de acciones sensibles (alta/edicion/eliminacion de credenciales).
- Endurecer allowlists de `remote-fetch` por proveedor y entorno.

### Fase C - UX De Configuracion De Usuario (2-3 dias)
- Flujo claro en panel `Config APIs`:
  - Estado por proveedor (habilitado, key cargada, ultimo uso).
  - Validacion de conexion (ping de proveedor).
  - Mensajes accionables para errores de configuracion.
- Mejorar feedback de limites/costos por usuario.

### Fase D - Gobernanza Operativa (3-5 dias)
- Consolidar alertas de uso y costos por usuario/proyecto.
- Automatizacion cerrada (closed-loop) con politicas auditables.
- Backups y restore verificados en ventana operativa.
- Dashboard de SLO y capacidad por modo (`MANUAL/HYBRID/AI_FIRST`).

### Fase E - Release Y Produccion (1-2 dias)
- Checklist de go-live:
  - `REY30_ENCRYPTION_KEY`/`NEXTAUTH_SECRET` definidos.
  - `REY30_ALLOWED_ORIGINS` y allowlists remotos validados.
  - terminal API deshabilitada en remoto salvo necesidad explicita.
- Pruebas smoke post-deploy y rollback automatizado.

## 4. Definition Of Done
- CI verde (`release:check`) en rama de release.
- `health/ready` falla correctamente cuando hay riesgo real de seguridad.
- Registro de auditoria en eventos de seguridad y gobierno.
- Documento de operacion actualizado para equipo y soporte.

## 5. Riesgos Y Mitigaciones
- Riesgo: usuarios cargan keys invalidas.
  - Mitigacion: validacion activa por proveedor + mensajes guiados.
- Riesgo: falta secreto de cifrado en produccion.
  - Mitigacion: readiness `503` + checklist obligatorio.
- Riesgo: sobrecostos por abuso.
  - Mitigacion: rate limits, politicas por usuario/proyecto y alertas.

## 6. Orden De Ejecucion Recomendado
1. Fase A
2. Fase B
3. Fase C
4. Fase D
5. Fase E
