# Propuesta de paquetes de release

Fecha: 28 de marzo de 2026.

## Objetivo

Separar el estado actual del repo en entregas mas faciles de validar, revertir y publicar.

La regla base es esta:

- primero publicar estabilidad operativa
- despues publicar funcionalidades del producto
- despues publicar biblioteca pesada de assets
- dejar fuera lo experimental o local

## Paquete 0. No subir

Esto no deberia entrar a un release ni a un PR de producto:

- `.playwright-cli/`
- `.rey30-shadow-meta.json`
- archivos de entorno reales del operador
- salidas locales o temporales si aparecen en `output*`, `tmp`, caches o snapshots locales

## Paquete 1. Base de produccion y release gating

Este paquete debe salir primero. Si algo falla aqui, no tiene sentido empujar assets ni features encima.

### Incluye

- configuracion y calidad:
  - `package.json`
  - `pnpm-lock.yaml`
  - `next.config.ts`
  - `tsconfig.json`
  - `eslint.config.mjs`
  - `.gitignore`
- pipelines y checks:
  - `.github/workflows/ci-quality-gate.yml`
  - `.github/workflows/postdeploy-smoke-rollback.yml`
  - `.github/workflows/promotion-gate.yml`
  - `vitest.prod-critical.config.ts`
- runtime y arranque:
  - `scripts/build-safe.mjs`
  - `scripts/typecheck-safe.mjs`
  - `scripts/vitest-safe.mjs`
  - `scripts/env-utils.mjs`
  - `scripts/production-env.mjs`
  - `scripts/production-preflight.mjs`
  - `scripts/start-production-local.mjs`
  - `scripts/start-semi-production-local.mjs`
  - `scripts/start-standalone.mjs`
  - `scripts/prepare-standalone.mjs`
  - `scripts/final-seal-check.mjs`
  - `scripts/prisma-db-safe.mjs`
  - `scripts/prisma-refresh-safe.mjs`
  - `docker-compose.postgres.yml`
  - `render.yaml`
- persistencia y seguridad base:
  - `prisma/schema.prisma`
  - `prisma/migrations/`
  - `src/lib/db.ts`
  - `src/proxy.ts`
  - `src/lib/security/`
  - `src/lib/ops/backup-service.ts`
  - `src/app/api/auth/**`
  - `src/app/api/health/**`
  - `src/app/api/ops/**`
  - `src/app/api/user/usage-finops/route.ts`
- validacion:
  - `tests/integration/auth-api.test.ts`
  - `tests/integration/capacity-limits.test.ts`
  - `tests/integration/csrf-proxy.test.ts`
  - `tests/integration/health-api.test.ts`
  - `tests/integration/ops-backup.test.ts`
  - `tests/integration/security-hardening.test.ts`
  - `tests/integration/usage-routes.test.ts`
  - `tests/e2e/production-http-workflows.e2e.test.ts`
  - `tests/unit/production-env.test.ts`
  - `tests/unit/production-preflight.test.ts`
  - `tests/unit/mock-upstash-runtime.test.ts`
  - `tests/unit/remote-fetch-security.test.ts`

### Criterio de salida

- `pnpm run preflight:production` en verde
- `pnpm run release:check` en verde
- secrets y variables de produccion confirmadas

## Paquete 2. Producto principal y flujo de editor

Este paquete mete valor visible al usuario, pero deberia viajar ya sobre una base de produccion estable.

### Incluye

- APIs funcionales:
  - `src/app/api/assets/**`
  - `src/app/api/scripts/**`
  - `src/app/api/compositor/**`
  - `src/app/api/materials/**`
  - `src/app/api/modifier-presets/**`
  - `src/app/api/texture-paint/**`
  - `src/app/api/character/full/route.ts`
  - `src/app/api/character/jobs/**`
- motor y pipeline:
  - `src/engine/assets/pipeline.ts`
  - `src/engine/ai/**`
  - `src/engine/character-builder/**`
  - `src/engine/gameplay/ScriptRuntime.ts`
  - `src/engine/mcp/MCPGateway.ts`
  - `src/engine/reyplay/build/compile.ts`
  - `src/engine/systems/**`
- editor y UX:
  - `src/engine/editor/**`
  - `src/components/ui/button.tsx`
  - `src/components/ui/scroll-area.tsx`
  - `src/store/**`
  - `src/types/engine.ts`
  - `src/lib/server/**`
  - `src/lib/ui-language-config.ts`
- pruebas del flujo:
  - `tests/integration/compositor-persist-api.test.ts`
  - `tests/integration/project-library-api.test.ts`
  - `tests/integration/scripts-api.test.ts`
  - `tests/integration/texture-paint-api.test.ts`
  - `tests/unit/asset-pipeline-lexury.test.ts`
  - `tests/unit/character-builder-scene-sync.test.ts`
  - `tests/unit/character-library-builder.test.ts`
  - `tests/unit/compositor-assets.test.ts`
  - `tests/unit/compositor-video-pipeline.test.ts`
  - `tests/unit/editor-materials.test.ts`
  - `tests/unit/geometry-nodes-lite.test.ts`
  - `tests/unit/mesh-modifiers.test.ts`
  - `tests/unit/modeler-mesh.test.ts`
  - `tests/unit/modeler-topology-bridge.test.ts`
  - `tests/unit/paint-mesh.test.ts`
  - `tests/unit/pivot-tools.test.ts`
  - `tests/unit/retopo-mesh.test.ts`
  - `tests/unit/sculpt-advanced.test.ts`
  - `tests/unit/sculpt-mesh.test.ts`
  - `tests/unit/sculpt-retopo-visibility.test.ts`
  - `tests/unit/topology-authoring-foundation.test.ts`
  - `tests/unit/transform-snap.test.ts`
  - `tests/unit/viewport-camera.test.ts`
  - `tests/unit/visual-thumbnails.test.ts`
  - `tests/unit/world-pipeline.test.ts`
  - `tests/unit/animation-authoring-foundation.test.ts`
  - `tests/unit/animation-editor-state.test.ts`
  - `tests/unit/conversion-pipeline-foundation.test.ts`
  - `tests/unit/poly-build.test.ts`
  - `tests/unit/scene-graph.test.ts`

### Criterio de salida

- assets compartidos visibles desde `/api/assets`
- editor abre sin errores
- smokes del editor pasan en los flujos prioritarios

## Paquete 3. Biblioteca liviana que si acompana al producto

Este paquete es el puente entre codigo y biblioteca pesada. Si sube junto al producto, debe ser solo lo minimo necesario para que el flujo principal funcione.

### Incluye

- `public/library/character-builder-library.json`
- `public/library/*.metadata.json`
- `public/library/*.glb`
- `public/library/*.preview.png`
- `assets/registro_motor.json`
- `assets/README.md`
- `assets/personajes/README.md`
- `assets/entornos/README.md`
- `assets/props/README.md`
- `assets/animaciones/README.md`
- `assets/documentacion/README.md`
- `assets/escenas_threejs/README.md`
- `assets/por_clasificar/README.md`
- `assets/tools/README.md`

### Criterio de salida

- el browser de assets muestra al menos un personaje, un entorno, un prop y una animacion
- no se dispara el peso del repo de forma incontrolada

## Paquete 4. Biblioteca canonica pesada

Este paquete conviene sacarlo separado porque tiene mayor peso, mayor costo de revision y mayor riesgo de conflicto.

### Incluye

- `assets/Modelos_3D_Comentados_Lexury/**`

### Recomendacion

- si el peso sigue creciendo, mover este paquete a Git LFS o almacenamiento externo con versionado
- mantener `assets/registro_motor.json` como entrada oficial aun si la fuente pesada vive aparte

### Criterio de salida

- estructura estable
- registro consistente
- estrategia de almacenamiento definida

## Paquete 5. Laboratorio o experimental

Esto no deberia bloquear el go-live del producto principal. Puede ir en rama aparte o en PR separado.

### Candidatos a separar

- `mini-services/character-backend/`
- `modules/`
- `scripts/*.generated.ts`
- `scripts/scribs/`
- escenas Three.js si no se incorporan aun al editor principal
- documentos muy extensos de manuales o exploraciones si no son necesarios para operar el release

## Orden recomendado de publicacion

1. Paquete 1: base de produccion y release gating
2. Paquete 2: producto principal y flujo de editor
3. Paquete 3: biblioteca liviana y registro compartido
4. Paquete 4: biblioteca canonica pesada
5. Paquete 5: laboratorio, solo si aporta valor inmediato

## Propuesta de ramas o PRs

- `release/prod-foundation`
- `release/editor-core`
- `release/library-runtime`
- `release/library-canonical-assets`
- `release/lab-separate`

## Mi recomendacion final

Si hoy hubiera que limpiar este repo para sacar algo publicable sin arriesgar demasiado, yo haria esto:

- PR 1: Paquete 1
- PR 2: Paquete 2 + Paquete 3
- PR 3: Paquete 4
- dejar Paquete 5 fuera del primer release

Esa secuencia te da una ventaja clara:

- primero aseguras despliegue y seguridad
- luego entregas valor visible
- despues anexas los binarios pesados sin romper el flujo de aprobacion
