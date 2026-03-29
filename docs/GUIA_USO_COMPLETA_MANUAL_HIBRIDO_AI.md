# GUIA COMPLETA DE USO - REY30 Editor (Manual, Hibrido, AI Puro)

## 1) Antes de empezar: prueba tecnica con el BAT

El script `start-clean-app.bat` ahora ejecuta **preflight completo por default** antes de abrir la app:

Politica del repo:

- `start-clean-app.bat` es el unico `.bat` mantenido.
- Si se necesita otro modo, se agrega como flag en ese mismo archivo.

- `lint`
- `typecheck`
- `test:unit`
- `test:integration`
- `test:e2e`
- `build`
- `smoke:postdeploy` (solo si hay URL configurada)

Comandos recomendados:

```bat
:: Solo validar calidad y salir (ideal CI/local antes de tocar la app)
start-clean-app.bat --preflight-only

:: Validar incluyendo smoke remoto
start-clean-app.bat --preflight-only --smoke-url https://tu-dominio.com

:: Flujo normal (preflight + levantar editor)
start-clean-app.bat --current-window
```

Opciones utiles:

- `--no-preflight`: omite preflight completo.
- `--preflight-non-strict`: permite iniciar aunque falle preflight.
- `--no-browser`: no abre navegador automaticamente.

---

## 2) Configuracion inicial de cuenta y APIs (BYOK)

1. Abre el editor.
2. En cualquier modo, abre tab `Config APIs`.
3. En `Usuario`, inicia sesion o crea cuenta.
4. En `Cloud`, configura tus providers (OpenAI/Meshy/Runway) con tus claves.
5. Pulsa `Guardar`.
6. Pulsa `Probar` para validar conectividad.

Importante:

- El modelo es **BYOK por cuenta**: cada usuario paga y administra sus propias APIs.
- Si no hay API cloud, puedes trabajar en manual/local para prototipos.

---

## 3) Flujo 100% Manual (sin AI)

Objetivo: crear personaje + mundo + loop basico sin usar IA.

### Paso A - Crear mundo base

1. Cambia a modo `Manual`.
2. En `Viewport`, usa botones:
   - `+ Cubo`
   - `+ Esfera`
   - `+ Luz`
   - `+ Camara`
3. En `Hierarchy`, usa `+` para crear `Plane` (suelo) y objetos extra.
4. Renombra entidades clave (ej: `WorldFloor`, `MainLight`, `MainCamera`).
5. En `Inspector`, ajusta `Transform` (posicion/rotacion/escala) y `MeshRenderer`.

### Paso B - Crear personaje jugable manual

1. Crea un objeto para jugador (por ejemplo `Cube`) y renombralo a `Player`.
2. Ajusta su `Transform` en `Inspector`.
3. Abre tab `Scrib Studio`.
4. En tab `Create`:
   - `Paso 1`: target `entity`
   - `Paso 2`: capability tipo `movement` o `characterBasic`
   - `Paso 3`: configura JSON (velocidad/salto basico)
   - `Paso 4`: `Save`
5. En tab `Edit`:
   - abre el archivo `.scrib.ts`
   - edita logica manualmente
   - pulsa `save` y `compile`
   - pulsa `usar en entidad` o `vincular script`

### Paso B.1 - Modelado manual rapido del mesh

1. Abre tab `Model`.
2. Cambia entre `Vertex`, `Edge` y `Face` segun la operacion.
3. En `Face`, usa:
   - `Select normal` para seleccionar caras con la misma orientacion.
   - `Project UV`, `Fit UV`, `Move UV`, `Scale UV`, `Rotate UV` para el primer bloque de UV manual.
4. En `Edge`, usa `Mark seam` para cortar islas UV; luego vuelve a `Face` y usa `UV island` + `Pack islands`.
5. Activa `Checker on` y ajusta `Checker scale` para revisar stretching en viewport.
6. En `Operations`, usa `Material ID` para probar variantes del mesh directamente en viewport.

### Paso C - Crear loop de juego manual

1. En `Scrib Studio`, crea/edita scripts para:
   - objetivo de escena
   - estado de victoria/derrota
   - spawn simple de enemigo/collectibles
2. Asigna scripts a escena o entidades (`usar en escena` / `usar en entidad`).
3. Pulsa `Render All` en cabecera.
4. Pulsa `Play` para probar runtime.
5. Itera con `Pause` / `Stop` y consola.

Atajos en viewport:

- `W/E/R` para mover/rotar/escalar
- `Shift + Drag` para box selection
- `Del` para borrar seleccion

---

## 4) Flujo Hibrido (AI + ajuste manual)

Objetivo: usar IA para acelerar base del juego, pero con control fino manual.

### Paso A - Base estructural rapida

1. Cambia a modo `Hybrid`.
2. En panel derecho, tab `Hybrid`.
3. En `Sistema de escenas cargables`, elige plantilla y pulsa `Crear escena cargable`.
4. En `Bloques del juego`, agrega:
   - `Terreno`
   - `Player`
   - `Enemigo`
   - `Arma` (opcional)
5. Si necesitas libreria, pulsa `Biblioteca`.

### Paso B - Comportamientos hibridos

1. En `Scrib workflow`, selecciona target (`player`, `enemy`, `weapon`, etc).
2. Escribe prompt de logica.
3. Usa:
   - `Manual` para crear script editable directo.
   - `Scrib IA` para generar base automaticamente y luego refinar.
4. Ajusta en `Scrib Studio` (tab `Edit`) y recompila.

### Paso C - IA conversacional puntual

1. En tab `AI Chat` (modo Hybrid), manda comandos concretos, por ejemplo:
   - `crea una escena base con terreno, jugador y camara`
   - `genera un personaje guerrero fantasy para juego`
   - `genera una espada medieval con detalles`
2. Revisa resultados en `Hierarchy`, `Assets` y `Console`.
3. Pulsa `Compilar flujo HB` y luego `Probar escena (PLAY)`.

---

## 5) Flujo AI Puro (AI First)

Objetivo: generar juego casi completo desde prompt unico y luego iterar por comandos.

### Paso A - Preparar

1. Cambia a modo `AI`.
2. Verifica `Config APIs` (chat/imagen/video/3D routing listo).
3. Abre `AI Chat`.

### Paso B - Prompt unico de arranque

Usa un prompt de alto nivel, por ejemplo:

```text
crea un juego de plataformas con un personaje principal, enemigos lobo,
terreno montanoso, checkpoints y objetivo final
```

El orquestador en AI First arma pipeline completo sobre escena/entidades/scribs.

### Paso C - Iteracion por objetivos

Envia cambios por bloques:

- `agrega doble salto al jugador`
- `haz el terreno mas corto y con rampas`
- `agrega una espada y enemigo elite`
- `optimiza para 60fps en escena inicial`

Luego ejecuta:

1. `Render All`
2. `Play`
3. revisa `Runtime Console`

---

## 6) Receta rapida (personaje + mundo + juego) por modo

- Manual: todo por `Hierarchy + SceneView + Inspector + Scrib Studio`.
- Hibrido: base con `Hybrid` panel, luego refinamiento manual y chat puntual.
- AI puro: prompt unico en `AI Chat`, luego correcciones por prompts cortos.

---

## 7) Checklist de salida (listo para produccion tecnica)

1. `start-clean-app.bat --preflight-only` en local sin errores.
2. Si hay entorno deploy, correr smoke con URL:
   - `start-clean-app.bat --preflight-only --smoke-url https://tu-dominio.com`
3. Validar login/registro y guardado de claves por usuario.
4. Validar `Render All` sin errores criticos.
5. Probar `Play/Pause/Stop` y revisar consola.

Con eso tienes un flujo completo para construir juego sin AI, hibrido o AI-first en la misma base del editor.

---

## 8) Auto-guia por entorno (nuevo)

En `Config APIs -> Guia IA` existe una guia contextual que cambia segun el modo activo:

- `MODE_MANUAL`: foco en creacion manual, asignacion de scrib y compilacion controlada.
- `MODE_HYBRID`: base por IA + refinamiento en Scrib Studio.
- `MODE_AI_FIRST`: prompt unico + pipeline completo con iteracion posterior.

Tambien se incluye bloque `Copilot tips` para reducir errores comunes por modo.

---

## 9) Guía de Scrib en Hibrido (donde poner cada script)

Referencia rapida incluida en `Config APIs -> Guia IA -> Guia Scrib`:

- Player:
  - Path sugerido: `scribs/player.movement.scrib.ts`
  - Tipo sugerido: `characterBasic` o `movement`
  - Uso: movimiento, salto, camara.
- Enemy (Lobo):
  - Path sugerido: `scribs/wolf.enemy.scrib.ts`
  - Tipo sugerido: `enemyBasic`
  - Uso: patrulla, persecucion, ataque.
- Weapon:
  - Path sugerido: `scribs/weapon.logic.scrib.ts`
  - Tipo sugerido: `weaponBasic` o `damage`
  - Uso: daño, cooldown, hitbox.
- Terrain/Platform:
  - Path sugerido: `scribs/terrain.rules.scrib.ts`
  - Tipo sugerido: `terrainBasic`
  - Uso: reglas de nivel/checkpoints.
- Scene:
  - Path sugerido: `scribs/scene.loop.scrib.ts`
  - Tipo sugerido: `loop/lifecycle`
  - Uso: victoria, derrota, estado global.

---

## 10) Configuracion de idioma con cuestionario

Ahora hay cuestionario de localizacion en `Config APIs -> Guia IA -> Idioma y cuestionario`.

Opciones:

1. Idioma objetivo:
   - Espanol
   - English
   - Auto (segun navegador)
2. Alcance de traduccion:
   - Todo
   - Solo botones y acciones
   - Solo nombres
   - Solo etiquetas descriptivas
3. Toggles finos:
   - Traducir botones
   - Traducir acciones
   - Traducir nombres
   - Traducir terminos tecnicos

Nota:

- El cambio se guarda localmente y actualiza UI principal (header/modos/controles principales) segun el alcance elegido.

---

## 11) Evaluacion de migracion SQLite -> SQL (plan si te decides)

Estimado actual:

- Nivel de complejidad: `medio`.
- Esfuerzo base: `3 a 7 dias` para migrar a PostgreSQL con Prisma y pruebas.

Por que no es bajo:

- Hay que migrar datos existentes sin perder sesiones/configs.
- Se deben validar indices, constraints y rutas criticas de auth/scripts.
- Requiere plan de rollback por si algo falla en cutover.

Plan sugerido:

1. Inventario:
   - Tablas, volumen y datos sensibles.
2. Preparar SQL destino:
   - DB administrada + secretos + conexión segura.
3. Migraciones Prisma:
   - Generar/aplicar y verificar integridad.
4. Migracion de datos:
   - Exportar SQLite, transformar y cargar a SQL.
5. Validacion:
   - Correr `lint`, `typecheck`, `test:integration`, `build`, smoke UI.
6. Cutover:
   - Cambiar `DATABASE_URL`, monitorear errores, rollback listo.

---

## 12) Scroll y barra de movimiento

Se reforzo scroll en chat/consola/terminal:

- Scrollbar visible siempre (vertical y horizontal).
- Barra de progreso de movimiento en Chat, Console y Terminal.
- Autoscroll inteligente con boton `Ir al final` cuando te alejas del ultimo log/mensaje.

Tambien se sumo el mismo criterio al `ModelerPanel`:

- Barra de movimiento para listas largas de vertices/aristas/caras.
- Botones rapidos `Inicio`, `Seleccion`, `Ayuda`, `Final`.
- Scroll con rueda validado en smoke del modelador.
- Seleccion topologica nueva con `Path select`, `Island`, `Grow region` y `Shrink region`.
- `Slide` ya puede restringirse por `Path` o por `Axis X/Y/Z`.

Referencia dedicada:

- `docs/MODELER_MANUAL_WORKFLOW.md`
