# Plan de trabajo para dejar el repo al 100 y listo para produccion

Fecha de ultima validacion: 28 de marzo de 2026.

## Estado real hoy

- `pnpm run lint` pasa.
- `pnpm run typecheck` pasa.
- `pnpm run test:unit` pasa.
- `pnpm run test:integration` pasa.
- `pnpm run test:e2e` pasa.
- `pnpm run build` pasa.
- `pnpm run release:check` pasa.
- `pnpm run preflight:production` pasa.
- La biblioteca Lexury ya esta organizada bajo `assets/Modelos_3D_Comentados_Lexury`.
- `assets/registro_motor.json` ya funciona como registro raiz promovido.
- Los assets `runtime_ready` de Lexury ya estan integrados al pipeline compartido de `/api/assets`.
- El nuevo `Modular Character Lab` ya existe dentro del workspace `Character` y cubre subida, visor 3D, fragmentacion modular, guardado y descargas.
- Prisma ya incluye tablas para proyectos, personajes modulares, partes, uploads y exports del laboratorio modular.

## Riesgos abiertos antes de publicar

- El arbol Git sigue muy cargado de cambios mezclados; hace falta separar release de codigo, release de assets y trabajo experimental.
- El preflight de produccion sigue dejando advertencias operativas:
  - falta `REY30_OPS_TOKEN`
  - faltan `SMOKE_USER_EMAIL` y `SMOKE_USER_PASSWORD`
  - el rate limit distribuido no esta configurado; hoy queda permitido solo el fallback en memoria para un nodo
  - no se ejecutaron checks live ni backup drill porque no se paso una `baseUrl`
- La biblioteca de assets ya esta ordenada, pero todavia hay que decidir estrategia de subida para binarios pesados: Git normal, Git LFS o almacenamiento externo.
- Queda una decision de producto pendiente sobre las escenas Three.js: integrarlas al flujo principal o mantenerlas como laboratorio separado.

## Que ya quedo cerrado

### Codigo y tooling

- El release gate ya no se rompe por la biblioteca de assets; `eslint` ahora ignora `assets/**` para no tratar escenas o scripts vendorizados como codigo fuente del producto.
- El script `preflight:production` ahora carga `.env`, `.env.local`, `.env.production` y `.env.production.local`, asi que refleja el entorno real del repo en vez de correr con variables vacias.
- La validacion completa `release:check` quedo en verde con lint, typecheck, tests criticos, tests unitarios, integracion, e2e y build.

### Assets

- La fuente canonica sigue siendo `assets/Modelos_3D_Comentados_Lexury`.
- El snapshot tecnico ya no contamina el registro raiz promovido.
- El registro raiz limpio es `assets/registro_motor.json`.
- La biblioteca tiene documentacion de navegacion en `assets/README.md` y en los `README.md` por categoria.

## Plan de cierre a produccion

### Fase 1. Orden de release

- Tomar como base la separacion propuesta en `docs/PROPUESTA_PAQUETES_RELEASE.md`.
- Separar en commits o ramas:
  - codigo del producto
  - biblioteca `assets/`
  - cambios auxiliares o experimentales
- Revisar `git status` completo y decidir que si va a release y que no.
- Confirmar si los assets pesados se suben con Git LFS o fuera del repo.

### Fase 2. Endurecimiento operativo

- Configurar `REY30_OPS_TOKEN`.
- Configurar `SMOKE_USER_EMAIL` y `SMOKE_USER_PASSWORD`.
- Elegir una de estas dos rutas para rate limit:
  - produccion real multi-nodo: configurar Upstash
  - despliegue single-node controlado: mantener `REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true`
- Confirmar `REY30_ALLOWED_ORIGINS` finales del dominio publico.
- Confirmar `REY30_REMOTE_FETCH_ALLOWLIST_ASSETS` y allowlists de proveedores segun los servicios que vayan a quedar activos.

### Fase 3. Verificacion sobre deploy

- Levantar entorno de produccion local con `pnpm run start:production:local`.
- Ejecutar preflight con URL real:
  - `pnpm run preflight:production -- --base-url http://127.0.0.1:3000`
- Validar:
  - `/api/health/live`
  - `/api/health/ready`
  - backup drill
  - login
  - carga de `/api/assets`
  - importacion de un asset `runtime_ready`
  - flujo end-to-end de `Modular Character Lab`:
    - subir `.glb`, `.gltf`, `.fbx` o `.obj`
    - fragmentar automatico
    - asignar manualmente al menos una parte
    - guardar personaje modular
    - descargar una parte individual
    - descargar ZIP completo

### Fase 4. Biblioteca lista para publicacion

- Clasificar visualmente lo que quede en `99_Por_Clasificar`.
- Priorizar conversion a `GLB` de los assets que aun no tengan entrada lista para runtime.
- Definir si las escenas Three.js se publican dentro del producto o como material de referencia.
- Generar una lista corta de assets prioritarios para smoke de editor:
  - 1 personaje
  - 1 entorno
  - 1 prop
  - 1 animacion

### Fase 5. Go-live

- Crear commit limpio de release.
- Publicar primero codigo y configuracion.
- Publicar despues los assets pesados si se manejan por canal separado.
- Ejecutar smoke autenticado y revisar logs.
- Cerrar con snapshot de version del registro de assets.

## Definicion de terminado

- `release:check` en verde.
- `preflight:production` en verde con `baseUrl` real y sin fallas.
- Health checks y backup drill verificados.
- Secrets y credenciales operativas configuradas.
- Arbol Git limpio o dividido por paquetes de entrega claros.
- Biblioteca de assets publicada con estrategia definida para binarios pesados.
