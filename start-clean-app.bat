@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem REY30 clean launcher
rem Mata puertos del proyecto, limpia residuos y arranca dev limpio.

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "OPEN_NEW_WINDOW=1"
set "AUTO_OPEN_BROWSER=1"
set "SKIP_INSTALL=0"
set "AUTO_CHARACTER_BACKEND=1"
set "LAUNCH_PROFILE=dev"
set "RUN_VERIFY=0"
set "VERIFY_FULL=0"
set "VERIFY_TARGET=0"
set "VERIFY_ONLY=0"
set "PREPARE_DB=1"
set "SKIP_BUILD=0"
set "SKIP_DOCKER=0"
set "SKIP_SMOKE=0"
set "VERIFY_OPENAI=0"
set "DEV_PORT=3000"
set "APP_HOSTNAME=127.0.0.1"
set "HTTPS_HOST=localhost"
set "HTTPS_PORT=8443"
set "CERT_DIR=output/local-certs"
set "REPORT_PATH=output/semi-prod-smoke-report.json"
set "CHARACTER_BACKEND_HOST=127.0.0.1"
set "CHARACTER_BACKEND_PORT=8010"
set "EXIT_CODE=0"

:ParseArgs
if "%~1"=="" goto :ArgsDone
if /I "%~1"=="--child" set "OPEN_NEW_WINDOW=0"
if /I "%~1"=="--current-window" set "OPEN_NEW_WINDOW=0"
if /I "%~1"=="--dev" set "LAUNCH_PROFILE=dev"
if /I "%~1"=="--production-local" set "LAUNCH_PROFILE=production_local"
if /I "%~1"=="--semi-production-local" set "LAUNCH_PROFILE=semi_production_local"
if /I "%~1"=="--no-browser" set "AUTO_OPEN_BROWSER=0"
if /I "%~1"=="--skip-install" set "SKIP_INSTALL=1"
if /I "%~1"=="--character-backend" set "AUTO_CHARACTER_BACKEND=1"
if /I "%~1"=="--no-character-backend" set "AUTO_CHARACTER_BACKEND=0"
if /I "%~1"=="--allow-remote-owner" set "REY30_LOCAL_OWNER_ALLOW_REMOTE=true"
if /I "%~1"=="--local-only-owner" set "REY30_LOCAL_OWNER_ALLOW_REMOTE=false"
if /I "%~1"=="--skip-build" set "SKIP_BUILD=1"
if /I "%~1"=="--skip-docker" set "SKIP_DOCKER=1"
if /I "%~1"=="--skip-smoke" set "SKIP_SMOKE=1"
if /I "%~1"=="--verify-openai" set "VERIFY_OPENAI=1"
if /I "%~1"=="--verify" set "RUN_VERIFY=1"
if /I "%~1"=="--verify-full" (
  set "RUN_VERIFY=1"
  set "VERIFY_FULL=1"
)
if /I "%~1"=="--verify-all" (
  set "RUN_VERIFY=1"
  set "VERIFY_FULL=1"
)
if /I "%~1"=="--verify-only" (
  set "RUN_VERIFY=1"
  set "VERIFY_ONLY=1"
)
if /I "%~1"=="--verify-target" (
  set "RUN_VERIFY=1"
  set "VERIFY_TARGET=1"
)
if /I "%~1"=="--verify-target-only" (
  set "RUN_VERIFY=1"
  set "VERIFY_TARGET=1"
  set "VERIFY_ONLY=1"
)
if /I "%~1"=="--verify-full-only" (
  set "RUN_VERIFY=1"
  set "VERIFY_FULL=1"
  set "VERIFY_ONLY=1"
)
if /I "%~1"=="--skip-db" set "PREPARE_DB=0"
if /I "%~1"=="--port" (
  if not "%~2"=="" (
    set "DEV_PORT=%~2"
    shift
  )
)
if /I "%~1"=="--hostname" (
  if not "%~2"=="" (
    set "APP_HOSTNAME=%~2"
    shift
  )
)
if /I "%~1"=="--https-host" (
  if not "%~2"=="" (
    set "HTTPS_HOST=%~2"
    shift
  )
)
if /I "%~1"=="--https-port" (
  if not "%~2"=="" (
    set "HTTPS_PORT=%~2"
    shift
  )
)
if /I "%~1"=="--cert-dir" (
  if not "%~2"=="" (
    set "CERT_DIR=%~2"
    shift
  )
)
if /I "%~1"=="--report-path" (
  if not "%~2"=="" (
    set "REPORT_PATH=%~2"
    shift
  )
)
if /I "%~1"=="--character-port" (
  if not "%~2"=="" (
    set "CHARACTER_BACKEND_PORT=%~2"
    shift
  )
)
if /I "%~1"=="--help" goto :ShowHelp
if /I "%~1"=="-h" goto :ShowHelp
shift
goto :ParseArgs

:ArgsDone

if "%OPEN_NEW_WINDOW%"=="1" (
  echo Abriendo REY30 en una ventana limpia...
  start "REY30 Clean Dev" cmd /k ""%~f0" --child %*"
  endlocal & exit /b 0
)

pushd "%PROJECT_DIR%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: No se pudo entrar a "%PROJECT_DIR%".
  endlocal & exit /b 1
)

echo.
echo ==================================================
echo REY30 clean startup
echo Repo: %PROJECT_DIR%
echo Mode: %LAUNCH_PROFILE%
echo App port: %DEV_PORT%
echo Character backend port: %CHARACTER_BACKEND_PORT%
echo ==================================================

call :StopProjectProcesses
call :CleanResidue "%PROJECT_DIR%"

if "%SKIP_INSTALL%"=="0" (
  call :InstallDependencies
  if errorlevel 1 (
    echo ERROR: No se pudieron preparar dependencias.
    set "EXIT_CODE=1"
    goto :Cleanup
  )
)

call :SyncOpenAiEnvKeys
if errorlevel 1 (
  echo ERROR: No se pudieron sincronizar/verificar las claves OpenAI.
  set "EXIT_CODE=1"
  goto :Cleanup
)

if not "%LAUNCH_PROFILE%"=="dev" (
  if "%AUTO_CHARACTER_BACKEND%"=="1" (
    call :LaunchCharacterBackend
  )
  if "%AUTO_OPEN_BROWSER%"=="1" (
    call :QueueProfileBrowser
  )
  call :RunLaunchProfile
  set "EXIT_CODE=%ERRORLEVEL%"
  goto :Cleanup
)

call :LoadEnvLocal
call :ResolveLocalPostgresEnv
call :ConfigureLocalOwnerMode

if "%PREPARE_DB%"=="1" (
  call :PrepareDatabase
  if errorlevel 1 (
    echo ERROR: No se pudo preparar la base de datos local.
    set "EXIT_CODE=1"
    goto :Cleanup
  )
) else (
  echo [db] Preparacion de base omitida por --skip-db.
)

if "%AUTO_CHARACTER_BACKEND%"=="1" (
  call :LaunchCharacterBackend
)

if "%RUN_VERIFY%"=="1" (
  if "%VERIFY_TARGET%"=="1" (
    echo [verify-target] Ejecutando seal de target real...
    call pnpm run seal:target
    if errorlevel 1 (
      echo ERROR: La verificacion local fallo.
      set "EXIT_CODE=1"
      goto :Cleanup
    )
    echo [verify-target] Seal target completado.
  ) else (
    if "%VERIFY_FULL%"=="1" (
      echo [verify-full] Ejecutando rehearsal amplio de cierre...
      echo [verify-full] Ejecutando seal:final...
      call pnpm run seal:final
      if errorlevel 1 (
        echo ERROR: La verificacion local fallo.
        set "EXIT_CODE=1"
        goto :Cleanup
      )
      echo [verify-full] Ejecutando smoke AI flow...
      call pnpm run smoke:ai-flow
      if errorlevel 1 (
        echo ERROR: La verificacion local fallo.
        set "EXIT_CODE=1"
        goto :Cleanup
      )
      echo [verify-full] Ejecutando smoke authenticated editor...
      call pnpm run smoke:editor-authenticated-user
      if errorlevel 1 (
        echo ERROR: La verificacion local fallo.
        set "EXIT_CODE=1"
        goto :Cleanup
      )
      echo [verify-full] Verificacion total completada.
    ) else (
      echo [verify] Ejecutando lint...
      call pnpm run lint
      if errorlevel 1 (
        echo ERROR: La verificacion local fallo.
        set "EXIT_CODE=1"
        goto :Cleanup
      )

      echo [verify] Ejecutando typecheck...
      call pnpm run typecheck
      if errorlevel 1 (
        echo ERROR: La verificacion local fallo.
        set "EXIT_CODE=1"
        goto :Cleanup
      )

      echo [verify] Ejecutando pruebas criticas de editor y superficie del asistente...
      call node scripts/vitest-safe.mjs run ^
        tests/unit/asset-pipeline-lexury.test.ts ^
        tests/integration/security-hardening.test.ts ^
        tests/unit/editor-shortcuts.test.ts ^
        tests/unit/ai-agents-route.test.ts ^
        tests/unit/ai-chat-route.test.ts ^
        tests/unit/editor-session-route.test.ts ^
        tests/unit/mcp-route.test.ts ^
        tests/unit/simple-mcp-route.test.ts ^
        tests/unit/reyplay-build-pipeline.test.ts ^
        tests/unit/render-lighting-quality.test.ts ^
        tests/unit/world-pipeline.test.ts ^
        tests/unit/scripts-compile-route.test.ts ^
        tests/unit/scripts-route.test.ts ^
        tests/unit/scripts-health-route.test.ts ^
        tests/unit/assistant-surface.test.ts ^
        tests/unit/assistant-generate-route.test.ts ^
        tests/unit/character-base-mesh-route.test.ts ^
        tests/unit/character-full-route.test.ts ^
        tests/unit/internal-ai-route-surfaces.test.ts ^
        tests/unit/assistant-status-route.test.ts ^
        tests/unit/user-api-config-route.test.ts ^
        tests/unit/shared-access.test.ts
        if errorlevel 1 (
          echo ERROR: La verificacion local fallo.
          set "EXIT_CODE=1"
          goto :Cleanup
        )

      if exist "mini-services\\character-backend\\tests\\test_pipeline.py" (
        where python >nul 2>nul
        if errorlevel 1 (
          echo [verify] Python no disponible. Se omiten pruebas del backend de personaje.
        ) else (
          echo [verify] Ejecutando pruebas del backend de personaje...
          call python -m unittest discover -s mini-services\character-backend\tests -v
          if errorlevel 1 (
            echo ERROR: La verificacion local fallo.
            set "EXIT_CODE=1"
            goto :Cleanup
          )
        )
      )

      if "%PREPARE_DB%"=="1" (
        echo [verify] Ejecutando integraciones con persistencia real...
        call node scripts/vitest-safe.mjs run tests/integration/assets-upload-api.test.ts
        if errorlevel 1 (
          echo ERROR: La verificacion local fallo.
          set "EXIT_CODE=1"
          goto :Cleanup
        )
      ) else (
        echo [verify] Se omiten integraciones con base de datos por --skip-db.
      )

      echo [verify] Ejecutando build...
      call pnpm run build
      if errorlevel 1 (
        echo ERROR: La verificacion local fallo.
        set "EXIT_CODE=1"
        goto :Cleanup
      )
    )
  )
)

if "%VERIFY_ONLY%"=="1" (
  echo [verify] Verificacion completa. No se inicia dev por --verify-only.
  set "EXIT_CODE=0"
  goto :Cleanup
)

if "%AUTO_OPEN_BROWSER%"=="1" (
  call :QueueBrowser 3 "http://localhost:%DEV_PORT%/"
)

call :RunNextDev
set "EXIT_CODE=%ERRORLEVEL%"
goto :Cleanup

:StopProjectProcesses
echo [clean] Cerrando procesos y puertos del proyecto...

call :KillPort %DEV_PORT%
call :KillPort 3001
call :KillPort 3015
call :KillPort %CHARACTER_BACKEND_PORT%

set "REY30_KILL_PROJECT=%PROJECT_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$project = $env:REY30_KILL_PROJECT.ToLowerInvariant(); " ^
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|bun)(\\.exe)?$' -and $_.CommandLine } | ForEach-Object { $cmd = $_.CommandLine.ToLowerInvariant(); if ($cmd -like ('*' + $project + '*')) { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} } }" >nul 2>&1

  call :StopCharacterBackend
exit /b 0

:StopCharacterBackend
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(python|pythonw)(\\.exe)?$' -and $_.CommandLine } | Where-Object { $_.CommandLine -like '*uvicorn*app.main:app*' -and $_.CommandLine -like '*character-backend*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }" >nul 2>&1
exit /b 0

:KillPort
set "TARGET_PORT=%~1"
if not defined TARGET_PORT exit /b 0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%TARGET_PORT%" ^| findstr LISTENING') do (
  taskkill /F /PID %%P >nul 2>&1
)
exit /b 0

:CleanResidue
set "TARGET_DIR=%~1"
if not defined TARGET_DIR exit /b 0
if not exist "%TARGET_DIR%" exit /b 0

echo [clean] Limpiando residuos de build, cache y logs...
pushd "%TARGET_DIR%" >nul 2>&1
if errorlevel 1 exit /b 0

if exist ".next" rmdir /s /q ".next"
if exist ".next-typecheck" rmdir /s /q ".next-typecheck"
if exist ".turbo" rmdir /s /q ".turbo"
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache"
if exist "tsconfig.tsbuildinfo" del /f /q "tsconfig.tsbuildinfo" >nul 2>&1
if exist "tsconfig.typecheck-safe.generated.tsbuildinfo" del /f /q "tsconfig.typecheck-safe.generated.tsbuildinfo" >nul 2>&1

for %%F in (*.log *.err *.out *.tmp) do (
  if exist "%%~fF" del /f /q "%%~fF" >nul 2>&1
)

if exist "output" (
  for /r "output" %%F in (*.log *.err *.out *.tmp) do del /f /q "%%~fF" >nul 2>&1
)

popd >nul 2>&1
exit /b 0

:InstallDependencies
if exist "pnpm-lock.yaml" (
  where pnpm >nul 2>nul
  if not errorlevel 1 (
    echo [deps] pnpm install...
    call pnpm install --frozen-lockfile
    if errorlevel 1 call pnpm install --no-frozen-lockfile
    exit /b %ERRORLEVEL%
  )
)

if exist "bun.lock" (
  where bun >nul 2>nul
  if not errorlevel 1 (
    echo [deps] bun install...
    call bun install --frozen-lockfile
    exit /b %ERRORLEVEL%
  )
)

where npm >nul 2>nul
if not errorlevel 1 (
  echo [deps] npm install...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  exit /b %ERRORLEVEL%
)

echo ERROR: No se encontro pnpm, bun ni npm.
exit /b 1

:LoadEnvLocal
if not exist ".env.local" exit /b 0
echo [env] Cargando .env.local y priorizando la configuracion del proyecto...
for %%K in (
  OPENAI_API_KEY
  INVITE_PROFILE_OPENAI_API_KEY
  OPENAI_BASE_URL
  OPENAI_ORGANIZATION
  OPENAI_PROJECT
  OPENAI_TEXT_MODEL
  OPENAI_MULTIMODAL_MODEL
  OPENAI_IMAGE_MODEL
  OPENAI_VIDEO_MODEL
  MESHY_API_KEY
  RUNWAY_API_KEY
  REY30_SHARED_ACCESS_TOKEN
  REY30_SHARED_ACCESS_EMAIL
  REY30_SHARED_ACCESS_NAME
  REY30_SHARED_ACCESS_ROLE
) do (
  findstr /b /c:"%%K=" ".env.local" >nul 2>&1 && set "%%K="
)
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.local") do (
  if not "%%~A"=="" (
    set "ENV_KEY=%%~A"
    set "ENV_VALUE=%%~B"
    if defined ENV_KEY (
      set "!ENV_KEY!=!ENV_VALUE!"
    )
  )
)
exit /b 0

:PrepareDatabase
if not defined DATABASE_URL (
  if not defined NETLIFY_DATABASE_URL (
    echo [db] No hay DATABASE_URL ni NETLIFY_DATABASE_URL. Se omite preparacion de base.
    exit /b 0
  )
)

echo [db] Preparando base de datos local con Docker/Postgres y Prisma...

set "REY30_DB_IS_LOCAL=0"
where node >nul 2>nul
if not errorlevel 1 (
  call node --input-type=module -e "import { isRepoManagedLocalPostgresUrl } from './scripts/local-postgres.mjs'; const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || ''; process.exit(isRepoManagedLocalPostgresUrl(url) ? 0 : 1);" >nul 2>nul
  if not errorlevel 1 set "REY30_DB_IS_LOCAL=1"
)

if "%REY30_DB_IS_LOCAL%"=="1" (
  if exist "docker-compose.postgres.yml" (
    where docker >nul 2>nul
    if errorlevel 1 (
      echo ERROR: Docker no esta disponible y la base local apunta a Postgres en localhost:5432.
      exit /b 1
    )
    if "%SKIP_DOCKER%"=="1" (
      echo [db] --skip-docker activo. No se levanta Postgres automaticamente.
    ) else (
      echo [db] Levantando/verificando Postgres local...
      call pnpm run db:postgres:up
      if errorlevel 1 exit /b 1
    )
  )
)

if "%REY30_DB_IS_LOCAL%"=="1" (
  echo [db] Sincronizando esquema Prisma con la base local...
  call pnpm run db:push
  if errorlevel 1 exit /b 1
) else (
  echo [db] Base no gestionada por Docker local. Aplicando migraciones Prisma...
  call pnpm run db:deploy
  if errorlevel 1 exit /b 1
)

echo [db] Regenerando cliente Prisma...
call pnpm run db:generate
if errorlevel 1 exit /b 1
exit /b 0

:ResolveLocalPostgresEnv
where node >nul 2>nul
if errorlevel 1 exit /b 0
if not exist "scripts\print-local-postgres-env.mjs" exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in (`node scripts\print-local-postgres-env.mjs`) do (
  if not "%%~A"=="" set "%%~A=%%~B"
)
exit /b 0

:SyncOpenAiEnvKeys
if not exist "scripts\sync-openai-env-keys.ps1" exit /b 0
if "%VERIFY_OPENAI%"=="1" (
  call powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\sync-openai-env-keys.ps1" -Verify
) else (
  call powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\sync-openai-env-keys.ps1"
)
exit /b %ERRORLEVEL%

:ConfigureLocalOwnerMode
if not defined REY30_LOCAL_OWNER_MODE set "REY30_LOCAL_OWNER_MODE=true"
if not defined REY30_LOCAL_OWNER_ALLOW_REMOTE set "REY30_LOCAL_OWNER_ALLOW_REMOTE=false"
if not defined REY30_LOCAL_OWNER_EMAIL set "REY30_LOCAL_OWNER_EMAIL=owner@rey30.local"
if not defined REY30_LOCAL_OWNER_NAME set "REY30_LOCAL_OWNER_NAME=REY30 Local Owner"
if "%VERIFY_TARGET%"=="1" (
  set "REY30_PERFORMANCE_BUDGET_PROFILE=strict"
) else (
  if not defined REY30_PERFORMANCE_BUDGET_PROFILE (
    if /I "%REY30_LOCAL_OWNER_MODE%"=="true" (
      set "REY30_PERFORMANCE_BUDGET_PROFILE=local-single-user"
    ) else (
      set "REY30_PERFORMANCE_BUDGET_PROFILE=strict"
    )
  )
)
echo [local] Perfil single-user: REY30_LOCAL_OWNER_MODE=%REY30_LOCAL_OWNER_MODE% ^| remote=%REY30_LOCAL_OWNER_ALLOW_REMOTE% ^| perf=%REY30_PERFORMANCE_BUDGET_PROFILE%
exit /b 0

:RunVerification
if "%VERIFY_TARGET%"=="1" goto :RunTargetVerification
if "%VERIFY_FULL%"=="1" goto :RunFullVerification

echo [verify] Ejecutando lint...
call pnpm run lint
if errorlevel 1 exit /b 1

echo [verify] Ejecutando typecheck...
call pnpm run typecheck
if errorlevel 1 exit /b 1

echo [verify] Ejecutando pruebas criticas de editor y superficie del asistente...
call node scripts/vitest-safe.mjs run ^
  tests/unit/asset-pipeline-lexury.test.ts ^
  tests/integration/security-hardening.test.ts ^
  tests/unit/editor-shortcuts.test.ts ^
  tests/unit/ai-agents-route.test.ts ^
  tests/unit/ai-chat-route.test.ts ^
  tests/unit/editor-session-route.test.ts ^
  tests/unit/mcp-route.test.ts ^
  tests/unit/simple-mcp-route.test.ts ^
  tests/unit/reyplay-build-pipeline.test.ts ^
  tests/unit/render-lighting-quality.test.ts ^
  tests/unit/world-pipeline.test.ts ^
  tests/unit/scripts-compile-route.test.ts ^
  tests/unit/scripts-route.test.ts ^
  tests/unit/scripts-health-route.test.ts ^
  tests/unit/assistant-surface.test.ts ^
  tests/unit/assistant-generate-route.test.ts ^
  tests/unit/character-base-mesh-route.test.ts ^
  tests/unit/character-full-route.test.ts ^
  tests/unit/internal-ai-route-surfaces.test.ts ^
  tests/unit/assistant-status-route.test.ts ^
  tests/unit/user-api-config-route.test.ts ^
  tests/unit/shared-access.test.ts
if errorlevel 1 exit /b 1

if exist "mini-services\character-backend\tests\test_pipeline.py" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo [verify] Python no disponible. Se omiten pruebas del backend de personaje.
  ) else (
    echo [verify] Ejecutando pruebas del backend de personaje...
    call python -m unittest discover -s mini-services\character-backend\tests -v
    if errorlevel 1 exit /b 1
  )
)

if "%PREPARE_DB%"=="1" (
  echo [verify] Ejecutando integraciones con persistencia real...
  call node scripts/vitest-safe.mjs run tests/integration/assets-upload-api.test.ts
  if errorlevel 1 exit /b 1
) else (
  echo [verify] Se omiten integraciones con base de datos por --skip-db.
)

echo [verify] Ejecutando build...
call pnpm run build
if errorlevel 1 exit /b 1
exit /b 0

:RunFullVerification
echo [verify-full] Ejecutando rehearsal amplio de cierre...

echo [verify-full] Ejecutando seal:final...
call pnpm run seal:final
if errorlevel 1 exit /b 1

echo [verify-full] Ejecutando smoke AI flow...
call pnpm run smoke:ai-flow
if errorlevel 1 exit /b 1

echo [verify-full] Ejecutando smoke authenticated editor...
call pnpm run smoke:editor-authenticated-user
if errorlevel 1 exit /b 1

echo [verify-full] Verificacion total completada.
exit /b 0

:RunTargetVerification
echo [verify-target] Ejecutando seal de target real...
call pnpm run seal:target
if errorlevel 1 exit /b 1

echo [verify-target] Seal target completado.
exit /b 0

:LaunchCharacterBackend
set "CHARACTER_BACKEND_DIR=%PROJECT_DIR%\mini-services\character-backend"
if not exist "%CHARACTER_BACKEND_DIR%\app\main.py" (
  echo [backend] No se encontro mini-services\character-backend. Se omite.
  exit /b 0
)

set "CB_PY=%CHARACTER_BACKEND_DIR%\.venv\Scripts\python.exe"
if not exist "%CB_PY%" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo [backend] Python no disponible. Se omite backend.
    exit /b 0
  )
  pushd "%CHARACTER_BACKEND_DIR%" >nul 2>&1
  echo [backend] Creando .venv...
  call python -m venv .venv
  if errorlevel 1 (
    popd >nul 2>&1
    echo [backend] No se pudo crear .venv.
    exit /b 0
  )
  set "CB_PY=%CHARACTER_BACKEND_DIR%\.venv\Scripts\python.exe"
  echo [backend] Instalando requirements-profile-a.txt...
  call "%CB_PY%" -m pip install --disable-pip-version-check -r requirements-profile-a.txt
  popd >nul 2>&1
)

if exist "%CB_PY%" (
  echo [backend] Iniciando en http://%CHARACTER_BACKEND_HOST%:%CHARACTER_BACKEND_PORT% ...
  start "REY30 Character Backend" /min cmd /c """%CB_PY%"" -m uvicorn app.main:app --app-dir ""%CHARACTER_BACKEND_DIR%"" --host %CHARACTER_BACKEND_HOST% --port %CHARACTER_BACKEND_PORT%"
)
exit /b 0

:RunNextDev
echo [dev] Iniciando Next.js limpio en http://localhost:%DEV_PORT%/

if exist "node_modules\.bin\next.cmd" (
  call node_modules\.bin\next.cmd dev --webpack -p %DEV_PORT%
  exit /b %ERRORLEVEL%
)

where pnpm >nul 2>nul
if not errorlevel 1 (
  call pnpm exec next dev --webpack -p %DEV_PORT%
  exit /b %ERRORLEVEL%
)

where bun >nul 2>nul
if not errorlevel 1 (
  call bunx next dev --webpack -p %DEV_PORT%
  exit /b %ERRORLEVEL%
)

where npx >nul 2>nul
if not errorlevel 1 (
  call npx next dev --webpack -p %DEV_PORT%
  exit /b %ERRORLEVEL%
)

echo ERROR: No se encontro next para iniciar dev.
exit /b 1

:QueueBrowser
set "REY30_BROWSER_DELAY_SECONDS=%~1"
set "REY30_BROWSER_URL=%~2"
if not defined REY30_BROWSER_DELAY_SECONDS set "REY30_BROWSER_DELAY_SECONDS=3"
if not defined REY30_BROWSER_URL exit /b 0
echo [browser] Abriendo %REY30_BROWSER_URL% en %REY30_BROWSER_DELAY_SECONDS%s...
start "REY30 Browser Launcher" /min powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\open-browser-after-delay.ps1" "%REY30_BROWSER_DELAY_SECONDS%" "%REY30_BROWSER_URL%"
exit /b 0

:QueueProfileBrowser
if /I "%LAUNCH_PROFILE%"=="production_local" (
  call :QueueBrowser 9 "http://%APP_HOSTNAME%:%DEV_PORT%/"
  exit /b 0
)
if /I "%LAUNCH_PROFILE%"=="semi_production_local" (
  call :QueueBrowser 11 "https://%HTTPS_HOST%:%HTTPS_PORT%/"
  exit /b 0
)
exit /b 0

:RunLaunchProfile
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node no esta disponible para iniciar el perfil seleccionado.
  exit /b 1
)

if /I "%LAUNCH_PROFILE%"=="production_local" goto :RunProductionLocal
if /I "%LAUNCH_PROFILE%"=="semi_production_local" goto :RunSemiProductionLocal

echo ERROR: Perfil desconocido: %LAUNCH_PROFILE%
exit /b 1

:RunProductionLocal
echo [launcher] Iniciando produccion local en http://%APP_HOSTNAME%:%DEV_PORT%/
set "NODE_ENV=production"
set "HOSTNAME=%APP_HOSTNAME%"
set "PORT=%DEV_PORT%"
if "%RUN_VERIFY%"=="1" (
  echo [launcher] Nota: --verify y variantes no se aplican en perfiles production-local/semi-production-local.
)

set "PRODUCTION_ARGS=scripts/start-production-local.mjs"
if "%PREPARE_DB%"=="0" set "PRODUCTION_ARGS=%PRODUCTION_ARGS% --skip-db"
if "%SKIP_BUILD%"=="1" set "PRODUCTION_ARGS=%PRODUCTION_ARGS% --skip-build"
if "%SKIP_DOCKER%"=="1" set "PRODUCTION_ARGS=%PRODUCTION_ARGS% --skip-docker"

call node %PRODUCTION_ARGS%
exit /b %ERRORLEVEL%

:RunSemiProductionLocal
echo [launcher] Iniciando semi-produccion local en https://%HTTPS_HOST%:%HTTPS_PORT%/
set "SEMI_ARGS=scripts/start-semi-production-local.mjs --hostname ""%APP_HOSTNAME%"" --port ""%DEV_PORT%"" --https-host ""%HTTPS_HOST%"" --https-port ""%HTTPS_PORT%"" --cert-dir ""%CERT_DIR%"" --report-path ""%REPORT_PATH%"""
if "%PREPARE_DB%"=="0" set "SEMI_ARGS=%SEMI_ARGS% --skip-db"
if "%SKIP_BUILD%"=="1" set "SEMI_ARGS=%SEMI_ARGS% --skip-build"
if "%SKIP_DOCKER%"=="1" set "SEMI_ARGS=%SEMI_ARGS% --skip-docker"
if "%SKIP_SMOKE%"=="1" set "SEMI_ARGS=%SEMI_ARGS% --skip-smoke"
call node %SEMI_ARGS%
exit /b %ERRORLEVEL%

:Cleanup
popd >nul 2>&1
endlocal & exit /b %EXIT_CODE%

:ShowHelp
echo.
echo Uso: start-clean-app.bat [opciones]
echo.
echo Opciones:
echo   --current-window         Ejecuta en la ventana actual
echo   --dev                    Arranca el perfil limpio de desarrollo ^(default^)
echo   --production-local       Arranca el perfil local de produccion
echo   --semi-production-local  Arranca el perfil local semi-productivo con HTTPS
echo   --no-browser             No abre navegador
echo   --skip-install           No reinstala dependencias
echo   --character-backend      Inicia backend local de personajes ^(default^)
echo   --no-character-backend   No inicia backend local de personajes
echo   --local-only-owner       Fuerza owner local sin acceso remoto ^(default^)
echo   --allow-remote-owner     Permite owner remoto para una instancia separada/tunel
echo   --verify                 Ejecuta lint + typecheck + tests criticos + build antes de iniciar
echo   --verify-full            Ejecuta seal final + smoke AI + smoke authenticated editor antes de iniciar
echo   --verify-all             Alias de --verify-full
echo   --verify-target          Ejecuta seal target-real antes de iniciar ^(requiere PRODUCTION_BASE_URL y credenciales reales^)
echo   --verify-only            Ejecuta la verificacion y termina sin abrir dev
echo   --verify-full-only       Ejecuta la verificacion total y termina sin abrir dev
echo   --verify-target-only     Ejecuta el seal target-real y termina sin abrir dev
echo   --skip-db                Omite preparar base local antes de arrancar/verificar
echo   --skip-build             Reutiliza build existente si el perfil local de produccion lo permite
echo   --skip-docker            No levanta Docker automaticamente para la base/perfiles locales
echo   --skip-smoke             Omite el smoke HTTPS automatico en semi-produccion local
echo   --verify-openai          Verifica OPENAI_API_KEY contra OpenAI antes de iniciar
echo.
echo Perfil local por defecto:
echo   REY30_LOCAL_OWNER_MODE=true
echo   REY30_LOCAL_OWNER_ALLOW_REMOTE=false
echo   REY30_PERFORMANCE_BUDGET_PROFILE=local-single-user
echo   Para compartir una instancia por Docker/tunel en el futuro, puedes encender:
echo   REY30_LOCAL_OWNER_ALLOW_REMOTE=true
echo   Para pruebas target-real, el bat fuerza REY30_PERFORMANCE_BUDGET_PROFILE=strict
echo   --port ^<numero^>         Cambia puerto HTTP de la app ^(default: 3000^)
echo   --hostname ^<host^>       Host HTTP para perfiles production-local/semi-production-local ^(default: 127.0.0.1^)
echo   --https-host ^<host^>     Host HTTPS de semi-produccion local ^(default: localhost^)
echo   --https-port ^<num^>      Puerto HTTPS de semi-produccion local ^(default: 8443^)
echo   --cert-dir ^<ruta^>       Directorio para certificados locales de semi-produccion
echo   --report-path ^<ruta^>    Ruta del reporte smoke en semi-produccion
echo   --character-port ^<num^>  Cambia puerto del backend ^(default: 8010^)
echo.
endlocal & exit /b 0
