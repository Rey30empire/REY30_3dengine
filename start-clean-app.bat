@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem REPO POLICY:
rem   - Este es el unico launcher .bat mantenido por el proyecto.
rem   - No crear .bat duplicados para otros perfiles.
rem   - Si hace falta un flujo nuevo, se agrega aqui como flag/modo.
rem   - Si algun agente encuentra otro .bat del proyecto, debe unificarlo aqui.

set "OPEN_NEW_WINDOW=1"
set "RUN_BASELINE=1"
set "BASELINE_STRICT=0"
set "RUN_PREFLIGHT=1"
set "PREFLIGHT_STRICT=1"
set "PREFLIGHT_ONLY=0"
set "PREFLIGHT_SMOKE_URL="
set "AUTO_OPEN_BROWSER=1"
set "DEV_PORT=3000"
set "LAUNCH_PROFILE=dev"
set "AUTO_API_BOOTSTRAP=1"
set "API_BOOTSTRAP_PROFILE=auto"
set "API_BOOTSTRAP_USER="
set "API_BOOTSTRAP_PASS="
set "API_BOOTSTRAP_NAME="
set "API_BOOTSTRAP_WAIT_SEC=120"
set "AUTO_CHARACTER_BACKEND=1"
set "CHARACTER_BACKEND_HOST=127.0.0.1"
set "CHARACTER_BACKEND_PORT=8010"

:ParseArgs
if "%~1"=="" goto :ArgsDone
if /I "%~1"=="--child" set "OPEN_NEW_WINDOW=0"
if /I "%~1"=="--current-window" set "OPEN_NEW_WINDOW=0"
if /I "%~1"=="--help" goto :ShowHelp
if /I "%~1"=="-h" goto :ShowHelp
if /I "%~1"=="--dev" set "LAUNCH_PROFILE=dev"
if /I "%~1"=="--production-local" set "LAUNCH_PROFILE=production_local"
if /I "%~1"=="--semi-production-local" set "LAUNCH_PROFILE=semi_production_local"
if /I "%~1"=="--no-baseline" set "RUN_BASELINE=0"
if /I "%~1"=="--baseline-strict" (
  set "RUN_BASELINE=1"
  set "BASELINE_STRICT=1"
)
if /I "%~1"=="--preflight" set "RUN_PREFLIGHT=1"
if /I "%~1"=="--no-preflight" set "RUN_PREFLIGHT=0"
if /I "%~1"=="--preflight-only" (
  set "RUN_PREFLIGHT=1"
  set "PREFLIGHT_ONLY=1"
  set "OPEN_NEW_WINDOW=0"
)
if /I "%~1"=="--preflight-strict" set "PREFLIGHT_STRICT=1"
if /I "%~1"=="--preflight-non-strict" set "PREFLIGHT_STRICT=0"
if /I "%~1"=="--no-browser" set "AUTO_OPEN_BROWSER=0"
if /I "%~1"=="--api-bootstrap" set "AUTO_API_BOOTSTRAP=1"
if /I "%~1"=="--no-api-bootstrap" set "AUTO_API_BOOTSTRAP=0"
if /I "%~1"=="--character-backend" set "AUTO_CHARACTER_BACKEND=1"
if /I "%~1"=="--no-character-backend" set "AUTO_CHARACTER_BACKEND=0"
if /I "%~1"=="--port" (
  if not "%~2"=="" (
    set "DEV_PORT=%~2"
    shift
  )
)
if /I "%~1"=="--character-port" (
  if not "%~2"=="" (
    set "CHARACTER_BACKEND_PORT=%~2"
    shift
  )
)
if /I "%~1"=="--api-profile" (
  if not "%~2"=="" (
    set "API_BOOTSTRAP_PROFILE=%~2"
    shift
  )
)
if /I "%~1"=="--api-user" (
  if not "%~2"=="" (
    set "API_BOOTSTRAP_USER=%~2"
    shift
  )
)
if /I "%~1"=="--api-pass" (
  if not "%~2"=="" (
    set "API_BOOTSTRAP_PASS=%~2"
    shift
  )
)
if /I "%~1"=="--api-name" (
  if not "%~2"=="" (
    set "API_BOOTSTRAP_NAME=%~2"
    shift
  )
)
if /I "%~1"=="--api-wait-sec" (
  if not "%~2"=="" (
    set "API_BOOTSTRAP_WAIT_SEC=%~2"
    shift
  )
)
if /I "%~1"=="--smoke-url" (
  if not "%~2"=="" (
    set "PREFLIGHT_SMOKE_URL=%~2"
    shift
  )
)
shift
goto :ParseArgs

:ArgsDone

if "%RUN_PREFLIGHT%"=="1" (
  rem Evita repetir lint/typecheck/test:unit cuando ya hay preflight completo.
  set "RUN_BASELINE=0"
)

if not defined PREFLIGHT_SMOKE_URL if defined REY30_SMOKE_BASE_URL set "PREFLIGHT_SMOKE_URL=%REY30_SMOKE_BASE_URL%"
if not defined PREFLIGHT_SMOKE_URL if defined SMOKE_BASE_URL set "PREFLIGHT_SMOKE_URL=%SMOKE_BASE_URL%"
if not defined PREFLIGHT_SMOKE_URL if defined DEPLOY_BASE_URL set "PREFLIGHT_SMOKE_URL=%DEPLOY_BASE_URL%"
if not defined PREFLIGHT_SMOKE_URL if defined VERCEL_URL set "PREFLIGHT_SMOKE_URL=%VERCEL_URL%"

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "REY30_SOURCE_PROJECT_DIR=%PROJECT_DIR%"
if not defined REY30_INPUT_GALLERY_ROOT set "REY30_INPUT_GALLERY_ROOT=%PROJECT_DIR%\input_Galeria_Rey30"
if not defined REY30_GALLERY_ROOT set "REY30_GALLERY_ROOT=%PROJECT_DIR%\output_Rey30\gallery"
set "RUN_DIR=%PROJECT_DIR%"
set "SYNC_SCRIPT=%PROJECT_DIR%\.zscripts\sync-shadow.ps1"
set "SYNC_PID_FILE="
set "NEXT_ARGS=dev --webpack -p %DEV_PORT%"
set "APP_URL=http://localhost:%DEV_PORT%/"
set "EXIT_CODE=0"
set "USE_SHADOW_COPY="
set "PATH_WITHOUT_HASH=%PROJECT_DIR:#=%"
set "BOOTSTRAP_SCRIPT=%PROJECT_DIR%\scripts\bootstrap-api-config.ps1"
set "API_BOOTSTRAP_LOG=%PROJECT_DIR%\output\api-bootstrap.log"
set "API_BOOTSTRAP_ERR=%PROJECT_DIR%\output\api-bootstrap.err.log"
set "CHARACTER_BACKEND_DIR=%RUN_DIR%\mini-services\character-backend"
set "CHARACTER_BACKEND_LOG=%PROJECT_DIR%\output\character-backend.log"
set "CHARACTER_BACKEND_ERR=%PROJECT_DIR%\output\character-backend.err.log"

if not "%LAUNCH_PROFILE%"=="dev" goto :RunUnifiedLaunchProfile

rem Si la ruta contiene '#', desde el inicio fijar ruta segura para matar/limpiar instancias viejas.
if not "%PATH_WITHOUT_HASH%"=="%PROJECT_DIR%" (
  for %%I in ("%PROJECT_DIR%") do set "PROJECT_NAME=%%~nxI"
  set "SAFE_NAME=!PROJECT_NAME:#=_!"
  set "SAFE_NAME=!SAFE_NAME: =_!"
  set "RUN_DIR=%LOCALAPPDATA%\REY30_shadow_workspaces\!SAFE_NAME!"
  set "USE_SHADOW_COPY=1"
)
set "CHARACTER_BACKEND_DIR=%RUN_DIR%\mini-services\character-backend"

if not defined REY30_CHARACTER_BACKEND_URL set "REY30_CHARACTER_BACKEND_URL=http://%CHARACTER_BACKEND_HOST%:%CHARACTER_BACKEND_PORT%"
if not defined REY30_CHARACTER_BACKEND_TIMEOUT_MS set "REY30_CHARACTER_BACKEND_TIMEOUT_MS=120000"
if not defined REY30_CHARACTER_BACKEND_POLL_MS set "REY30_CHARACTER_BACKEND_POLL_MS=1000"

if "%OPEN_NEW_WINDOW%"=="1" (
  echo Abriendo una ventana nueva y limpia de REY30...
  start "REY30 Clean Dev" cmd /k ""%~f0" --child %*"
  endlocal & exit /b 0
)

rem Asegurar carpetas de entrada para la galeria local
if not exist "%REY30_INPUT_GALLERY_ROOT%" mkdir "%REY30_INPUT_GALLERY_ROOT%"
for %%F in (personajes_3d escenas animaciones armas texturas audio video scripts otros) do (
  if not exist "%REY30_INPUT_GALLERY_ROOT%\\%%F" mkdir "%REY30_INPUT_GALLERY_ROOT%\\%%F"
)

rem 1) Cerrar instancias viejas y limpiar residuos locales
call :StopStaleInstances
call :CleanResidue "%PROJECT_DIR%"
if defined USE_SHADOW_COPY call :CleanResidue "%RUN_DIR%"

rem 2) Si la ruta tiene '#', usar una copia segura real sin ese caracter
if defined USE_SHADOW_COPY (
  set "SYNC_PID_FILE=!RUN_DIR!\.shadow-sync.pid"

  if not exist "%SYNC_SCRIPT%" (
    echo ERROR: No se encontro el script de sincronizacion "%SYNC_SCRIPT%".
    set "EXIT_CODE=1"
    goto :Cleanup
  )

  echo Ruta actual contiene '#'. Ejecutando desde copia segura:
  echo   !RUN_DIR!

  if exist "!SYNC_PID_FILE!" (
    set /p OLD_SYNC_PID=<"!SYNC_PID_FILE!"
    if defined OLD_SYNC_PID taskkill /F /PID !OLD_SYNC_PID! >nul 2>&1
    del /f /q "!SYNC_PID_FILE!" >nul 2>&1
    set "OLD_SYNC_PID="
  )

  powershell -NoProfile -ExecutionPolicy Bypass -File "%SYNC_SCRIPT%" -Source "%PROJECT_DIR%" -Destination "!RUN_DIR!"
  if errorlevel 1 (
    echo ERROR: No se pudo sincronizar la copia segura.
    set "EXIT_CODE=1"
    goto :Cleanup
  )

  call :CleanResidue "!RUN_DIR!"

  call :InstallDependencies
  if errorlevel 1 (
    echo ERROR: No se pudieron preparar las dependencias en la copia segura.
    set "EXIT_CODE=1"
    goto :Cleanup
  )

  start "" powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%SYNC_SCRIPT%" -Source "%PROJECT_DIR%" -Destination "!RUN_DIR!" -Loop -IntervalMs 1500 -PidFile "!SYNC_PID_FILE!"
) else (
  cd /d "%RUN_DIR%"
  if not exist "node_modules\\.bin\\next.cmd" (
    call :InstallDependencies
    if errorlevel 1 (
      echo ERROR: No se pudieron instalar las dependencias del proyecto.
      set "EXIT_CODE=1"
      goto :Cleanup
    )
  )
)

pushd "%RUN_DIR%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: No se pudo entrar a la ruta de trabajo "%RUN_DIR%".
  set "EXIT_CODE=1"
  goto :Cleanup
)

if exist "prisma\\schema.prisma" (
  echo Verificando cliente Prisma para el workspace activo...
  call node scripts\prisma-refresh-safe.mjs
  if errorlevel 1 (
    echo ERROR: No se pudo refrescar el cliente Prisma del workspace activo.
    set "EXIT_CODE=1"
    goto :Cleanup
  )
)

if "%AUTO_API_BOOTSTRAP%"=="1" (
  rem Local startup default: allow onboarding without invite token.
  if not defined REY30_REGISTRATION_MODE set "REY30_REGISTRATION_MODE=open"
  if not defined REY30_ALLOW_OPEN_REGISTRATION_REMOTE set "REY30_ALLOW_OPEN_REGISTRATION_REMOTE=false"
)

if "%RUN_PREFLIGHT%"=="1" (
  echo.
  echo ==================================================
  echo Ejecutando preflight antes de iniciar la app...
  echo ^(lint + typecheck + test:unit + test:integration + test:e2e + build + smoke opcional^)
  if defined PREFLIGHT_SMOKE_URL (
    echo smoke:postdeploy target: %PREFLIGHT_SMOKE_URL%
  ) else (
    echo smoke:postdeploy omitido ^(define --smoke-url o SMOKE_BASE_URL^)
  )
  echo Usa --no-preflight para omitir esta fase.
  echo ==================================================
  call :RunPreflightChecks
  set "PREFLIGHT_EXIT=!ERRORLEVEL!"
  if not "!PREFLIGHT_EXIT!"=="0" (
    if "%PREFLIGHT_STRICT%"=="1" (
      echo ERROR: Preflight fallo con codigo !PREFLIGHT_EXIT!.
      echo Sugerencia: corrige los errores mostrados arriba o usa --preflight-non-strict para iniciar igual.
      set "EXIT_CODE=!PREFLIGHT_EXIT!"
      goto :Cleanup
    )
    echo ADVERTENCIA: Preflight fallo con codigo !PREFLIGHT_EXIT!, iniciando igual...
  ) else (
    echo Preflight OK.
  )
  if "%PREFLIGHT_ONLY%"=="1" (
    echo Preflight-only completado. No se iniciara el servidor.
    set "EXIT_CODE=!PREFLIGHT_EXIT!"
    goto :Cleanup
  )
)

if "%RUN_BASELINE%"=="1" (
  echo.
  echo ==================================================
  echo Ejecutando baseline antes de iniciar la app...
  echo ^(lint + typecheck + test:unit^)
  echo Usa --no-baseline para omitir esta fase.
  echo ==================================================
  call :RunBaselineChecks
  set "BASELINE_EXIT=!ERRORLEVEL!"
  if not "!BASELINE_EXIT!"=="0" (
    if "%BASELINE_STRICT%"=="1" (
      echo ERROR: Baseline fallo con codigo !BASELINE_EXIT!.
      echo Sugerencia: corrige los errores mostrados arriba o usa --no-baseline para iniciar igual.
      set "EXIT_CODE=!BASELINE_EXIT!"
      goto :Cleanup
    )
    echo ADVERTENCIA: Baseline fallo con codigo !BASELINE_EXIT!, iniciando igual...
  ) else (
    echo Baseline OK.
  )
)

if "%AUTO_OPEN_BROWSER%"=="1" (
  echo Abriendo navegador en %APP_URL%
  start "" "%APP_URL%"
)

if "%AUTO_API_BOOTSTRAP%"=="1" (
  call :LaunchApiBootstrap
)

if "%AUTO_CHARACTER_BACKEND%"=="1" (
  call :LaunchCharacterBackend
)

rem 4) Levantar app (Next.js) en modo desarrollo
if exist "node_modules\\.bin\\next.cmd" (
  echo Iniciando con node_modules\\.bin\\next.cmd !NEXT_ARGS!...
  call node_modules\\.bin\\next.cmd !NEXT_ARGS!
  set "EXIT_CODE=%ERRORLEVEL%"
  goto :Cleanup
)

where bun >nul 2>nul
if not errorlevel 1 (
  echo Iniciando con bunx next !NEXT_ARGS!...
  call bunx next !NEXT_ARGS!
  set "EXIT_CODE=%ERRORLEVEL%"
  goto :Cleanup
)

where npx >nul 2>nul
if not errorlevel 1 (
  echo Iniciando con npx next !NEXT_ARGS!...
  call npx next !NEXT_ARGS!
  set "EXIT_CODE=%ERRORLEVEL%"
  goto :Cleanup
)

echo ERROR: No se encontro bun ni npx/next para iniciar la app.
set "EXIT_CODE=1"
goto :Cleanup

:RunUnifiedLaunchProfile
if /I "%LAUNCH_PROFILE%"=="production_local" (
  set "PROFILE_SCRIPT=start:production:local"
  set "PROFILE_LABEL=produccion local"
) else (
  set "PROFILE_SCRIPT=start:semi-production:local"
  set "PROFILE_LABEL=semi-produccion local"
)

if "%OPEN_NEW_WINDOW%"=="1" (
  echo Abriendo una ventana nueva para REY30 en !PROFILE_LABEL!...
  start "REY30 !PROFILE_LABEL!" cmd /k ""%~f0" --child %*"
  endlocal & exit /b 0
)

pushd "%PROJECT_DIR%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: No se pudo entrar a "%PROJECT_DIR%".
  set "EXIT_CODE=1"
  goto :Cleanup
)

set "PROFILE_PM="
call :ResolveScriptRunner PROFILE_PM
if errorlevel 1 (
  echo ERROR: No se encontro pnpm, bun o npm para iniciar !PROFILE_LABEL!.
  set "EXIT_CODE=1"
  goto :Cleanup
)

echo Iniciando REY30 en !PROFILE_LABEL!...
call :RunScriptStep "!PROFILE_PM!" "!PROFILE_SCRIPT!" "[launcher] !PROFILE_SCRIPT!"
set "EXIT_CODE=!ERRORLEVEL!"
goto :Cleanup

:LaunchApiBootstrap
if not exist "%BOOTSTRAP_SCRIPT%" (
  echo ADVERTENCIA: No se encontro "%BOOTSTRAP_SCRIPT%". Se omite bootstrap de APIs.
  exit /b 0
)

if not exist "%PROJECT_DIR%\output" mkdir "%PROJECT_DIR%\output"
if exist "%API_BOOTSTRAP_LOG%" del /f /q "%API_BOOTSTRAP_LOG%" >nul 2>&1
if exist "%API_BOOTSTRAP_ERR%" del /f /q "%API_BOOTSTRAP_ERR%" >nul 2>&1

set "BOOTSTRAP_ARGS=-NoProfile -ExecutionPolicy Bypass -File ""%BOOTSTRAP_SCRIPT%"" -BaseUrl ""%APP_URL%"" -WaitTimeoutSec %API_BOOTSTRAP_WAIT_SEC%"
if defined API_BOOTSTRAP_PROFILE set "BOOTSTRAP_ARGS=!BOOTSTRAP_ARGS! -ProviderProfile ""%API_BOOTSTRAP_PROFILE%"""
if defined API_BOOTSTRAP_USER set "BOOTSTRAP_ARGS=!BOOTSTRAP_ARGS! -Email ""%API_BOOTSTRAP_USER%"""
if defined API_BOOTSTRAP_PASS set "BOOTSTRAP_ARGS=!BOOTSTRAP_ARGS! -Password ""%API_BOOTSTRAP_PASS%"""
if defined API_BOOTSTRAP_NAME set "BOOTSTRAP_ARGS=!BOOTSTRAP_ARGS! -DisplayName ""%API_BOOTSTRAP_NAME%"""

echo.
echo ==================================================
echo Bootstrap API activo: perfil %API_BOOTSTRAP_PROFILE%
if defined API_BOOTSTRAP_USER echo Usuario bootstrap: %API_BOOTSTRAP_USER%
echo Logs bootstrap:
echo   %API_BOOTSTRAP_LOG%
echo   %API_BOOTSTRAP_ERR%
echo ==================================================

start "REY30 API Bootstrap" /min cmd /c "powershell !BOOTSTRAP_ARGS! 1>""%API_BOOTSTRAP_LOG%"" 2>""%API_BOOTSTRAP_ERR%"""
exit /b 0

:LaunchCharacterBackend
if not exist "%CHARACTER_BACKEND_DIR%\app\main.py" (
  echo ADVERTENCIA: No se encontro backend de personajes en "%CHARACTER_BACKEND_DIR%".
  exit /b 0
)

if not exist "%PROJECT_DIR%\output" mkdir "%PROJECT_DIR%\output"
if exist "%CHARACTER_BACKEND_LOG%" del /f /q "%CHARACTER_BACKEND_LOG%" >nul 2>&1
if exist "%CHARACTER_BACKEND_ERR%" del /f /q "%CHARACTER_BACKEND_ERR%" >nul 2>&1

set "CB_PY=%CHARACTER_BACKEND_DIR%\.venv\Scripts\python.exe"
if not exist "%CB_PY%" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo ADVERTENCIA: Python no encontrado; se omite backend de personajes.
    exit /b 0
  )
  echo Preparando backend de personajes ^(Profile A^)...
  pushd "%CHARACTER_BACKEND_DIR%" >nul 2>&1
  call python -m venv .venv
  if errorlevel 1 (
    popd >nul 2>&1
    echo ADVERTENCIA: No se pudo crear el entorno virtual del backend de personajes.
    exit /b 0
  )
  set "CB_PY=%CHARACTER_BACKEND_DIR%\.venv\Scripts\python.exe"
  call "%CB_PY%" -m pip install --disable-pip-version-check -r requirements-profile-a.txt
  if errorlevel 1 (
    popd >nul 2>&1
    echo ADVERTENCIA: No se pudieron instalar dependencias del backend de personajes.
    exit /b 0
  )
  popd >nul 2>&1
) else (
  call "%CB_PY%" -c "import fastapi, uvicorn" >nul 2>&1
  if errorlevel 1 (
    echo Reparando dependencias del backend de personajes...
    pushd "%CHARACTER_BACKEND_DIR%" >nul 2>&1
    call "%CB_PY%" -m pip install --disable-pip-version-check -r requirements-profile-a.txt
    popd >nul 2>&1
  )
)

echo Iniciando backend de personajes en http://%CHARACTER_BACKEND_HOST%:%CHARACTER_BACKEND_PORT% ...
echo Logs backend:
echo   %CHARACTER_BACKEND_LOG%
echo   %CHARACTER_BACKEND_ERR%
start "REY30 Character Backend" /min cmd /c """%CB_PY%"" -m uvicorn app.main:app --app-dir ""%CHARACTER_BACKEND_DIR%"" --host %CHARACTER_BACKEND_HOST% --port %CHARACTER_BACKEND_PORT% --reload 1>""%CHARACTER_BACKEND_LOG%"" 2>""%CHARACTER_BACKEND_ERR%"""
exit /b 0

:StopStaleInstances
rem Cerrar watcher de sincronizacion viejo (si existe PID previo)
if defined RUN_DIR (
  if exist "%RUN_DIR%\.shadow-sync.pid" (
    set /p OLD_SYNC_PID=<"%RUN_DIR%\.shadow-sync.pid"
    if defined OLD_SYNC_PID taskkill /F /PID !OLD_SYNC_PID! >nul 2>&1
    del /f /q "%RUN_DIR%\.shadow-sync.pid" >nul 2>&1
    set "OLD_SYNC_PID="
  )
)

rem Cerrar procesos de sync-shadow colgados para esta ruta
set "REY30_SYNC_SCRIPT=%SYNC_SCRIPT%"
set "REY30_SYNC_RUN_DIR=%RUN_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$syncScript = $env:REY30_SYNC_SCRIPT; $runDir = $env:REY30_SYNC_RUN_DIR; " ^
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(powershell|pwsh)(\\.exe)?$' -and $_.CommandLine -and $_.CommandLine -like ('*' + $syncScript + '*') -and $_.CommandLine -like ('*' + $runDir + '*') } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }" >nul 2>&1

call :StopCharacterBackend

rem Liberar puertos comunes del editor local
call :KillPort 3000
call :KillPort 3001
call :KillPort 3015

rem Cerrar procesos Node/Bun asociados a este proyecto para evitar instancias viejas
set "REY30_KILL_PROJECT=%PROJECT_DIR%"
set "REY30_KILL_RUN=%RUN_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$paths = @($env:REY30_KILL_PROJECT, $env:REY30_KILL_RUN) | Where-Object { $_ }; " ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|bun)(\\.exe)?$' -and $_.CommandLine }; " ^
  "foreach ($p in $procs) { $cmd = $p.CommandLine.ToLowerInvariant(); foreach ($path in $paths) { if ($cmd -like ('*' + $path.ToLowerInvariant() + '*')) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {} ; break } } }" >nul 2>&1

exit /b 0

:StopCharacterBackend
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(python|pythonw)(\\.exe)?$' -and $_.CommandLine }; " ^
  "$procs | Where-Object { $_.CommandLine -like '*uvicorn*app.main:app*' -and $_.CommandLine -like '*character-backend*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }" >nul 2>&1
exit /b 0

:KillPort
set "TARGET_PORT=%~1"
if not defined TARGET_PORT exit /b 0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%TARGET_PORT%" ^| findstr LISTENING') do (
  taskkill /F /PID %%p >nul 2>&1
)
exit /b 0

:CleanResidue
set "TARGET_DIR=%~1"
if not defined TARGET_DIR exit /b 0
if not exist "%TARGET_DIR%" exit /b 0
pushd "%TARGET_DIR%" >nul 2>&1
if errorlevel 1 exit /b 0
if exist dev.log del /f /q dev.log
if exist server.log del /f /q server.log
if exist next.log del /f /q next.log
if exist .next rmdir /s /q .next
if exist .turbo rmdir /s /q .turbo
if exist "node_modules\\.cache" rmdir /s /q "node_modules\\.cache"
popd >nul 2>&1
exit /b 0

:InstallDependencies
if exist "pnpm-lock.yaml" (
  where pnpm >nul 2>nul
  if not errorlevel 1 (
    echo Sincronizando dependencias con pnpm...
    call pnpm install --frozen-lockfile
    if errorlevel 1 (
      echo pnpm-lock.yaml desactualizado. Reintentando sin --frozen-lockfile...
      call pnpm install --no-frozen-lockfile
    )
    exit /b %ERRORLEVEL%
  )
)

if exist "bun.lock" (
  where bun >nul 2>nul
  if not errorlevel 1 (
    echo Sincronizando dependencias con bun...
    call bun install --frozen-lockfile
    exit /b %ERRORLEVEL%
  )
)

where npm >nul 2>nul
if not errorlevel 1 (
  echo Sincronizando dependencias con npm...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  exit /b %ERRORLEVEL%
)

echo ERROR: No se encontro pnpm, bun ni npm para instalar dependencias.
exit /b 1

:ResolveScriptRunner
set "RESOLVED_PM="
if exist "pnpm-lock.yaml" (
  where pnpm >nul 2>nul
  if not errorlevel 1 set "RESOLVED_PM=pnpm"
)

if not defined RESOLVED_PM if exist "bun.lock" (
  where bun >nul 2>nul
  if not errorlevel 1 set "RESOLVED_PM=bun"
)

if not defined RESOLVED_PM (
  where npm >nul 2>nul
  if not errorlevel 1 set "RESOLVED_PM=npm"
)

if not defined RESOLVED_PM exit /b 1
set "%~1=%RESOLVED_PM%"
exit /b 0

:RunScriptStep
set "STEP_PM=%~1"
set "STEP_SCRIPT=%~2"
set "STEP_LABEL=%~3"
if not defined STEP_LABEL set "STEP_LABEL=%STEP_SCRIPT%"
echo %STEP_LABEL% con %STEP_PM%...
call %STEP_PM% run %STEP_SCRIPT%
exit /b %ERRORLEVEL%

:RunPreflightChecks
set "PREFLIGHT_PM="
call :ResolveScriptRunner PREFLIGHT_PM
if errorlevel 1 (
  echo ERROR: No se encontro pnpm, bun o npm para ejecutar preflight.
  exit /b 1
)

call :RunScriptStep "%PREFLIGHT_PM%" "lint" "[preflight] lint"
if errorlevel 1 exit /b %ERRORLEVEL%

call :RunScriptStep "%PREFLIGHT_PM%" "typecheck" "[preflight] typecheck"
if errorlevel 1 exit /b %ERRORLEVEL%

call :RunScriptStep "%PREFLIGHT_PM%" "test:unit" "[preflight] test:unit"
if errorlevel 1 exit /b %ERRORLEVEL%

call :RunScriptStep "%PREFLIGHT_PM%" "test:integration" "[preflight] test:integration"
if errorlevel 1 exit /b %ERRORLEVEL%

call :RunScriptStep "%PREFLIGHT_PM%" "test:e2e" "[preflight] test:e2e"
if errorlevel 1 exit /b %ERRORLEVEL%

call :RunScriptStep "%PREFLIGHT_PM%" "build" "[preflight] build"
if errorlevel 1 exit /b %ERRORLEVEL%

if defined PREFLIGHT_SMOKE_URL (
  echo [preflight] smoke:postdeploy con base URL !PREFLIGHT_SMOKE_URL!...
  set "SMOKE_BASE_URL=!PREFLIGHT_SMOKE_URL!"
  call %PREFLIGHT_PM% run smoke:postdeploy
  if errorlevel 1 exit /b %ERRORLEVEL%
) else (
  echo [preflight] smoke:postdeploy omitido ^(sin URL configurada^).
)

exit /b 0

:RunBaselineChecks
set "BASELINE_PM="
call :ResolveScriptRunner BASELINE_PM
if errorlevel 1 (
  echo ERROR: No se encontro pnpm, bun o npm para ejecutar baseline.
  exit /b 1
)

call :RunScriptStep "%BASELINE_PM%" "lint" "[baseline] lint"
if errorlevel 1 exit /b %ERRORLEVEL%

call :RunScriptStep "%BASELINE_PM%" "typecheck" "[baseline] typecheck"
if errorlevel 1 exit /b %ERRORLEVEL%

call :RunScriptStep "%BASELINE_PM%" "test:unit" "[baseline] test:unit"
if errorlevel 1 exit /b %ERRORLEVEL%

exit /b 0

:Cleanup
popd >nul 2>&1
if defined SYNC_PID_FILE (
  if exist "!SYNC_PID_FILE!" (
    set /p SYNC_PID=<"!SYNC_PID_FILE!"
    if defined SYNC_PID taskkill /F /PID !SYNC_PID! >nul 2>&1
    del /f /q "!SYNC_PID_FILE!" >nul 2>&1
  )
)

endlocal & exit /b %EXIT_CODE%

:ShowHelp
echo.
echo Uso: start-clean-app.bat [opciones]
echo.
echo Opciones principales:
echo   --dev                     Inicia el flujo limpio de desarrollo ^(default^)
echo   --production-local        Inicia el perfil de produccion local unificado
echo   --semi-production-local   Inicia el perfil semi-productivo local unificado
echo   --current-window          Ejecuta en la ventana actual
echo   --no-baseline             Omite lint/typecheck/test:unit al inicio
echo   --baseline-strict         Falla si baseline no pasa
echo   --preflight               Ejecuta preflight completo antes de iniciar ^(default^)
echo   --no-preflight            Omite preflight completo
echo   --preflight-only          Solo ejecuta preflight y termina
echo   --preflight-strict        Falla y no inicia si preflight falla ^(default^)
echo   --preflight-non-strict    Permite iniciar aun con fallas de preflight
echo   --smoke-url ^<url^>        URL para smoke:postdeploy durante preflight
echo   --no-browser              No abre navegador automaticamente
echo   --port ^<numero^>          Cambia puerto de desarrollo
echo   --character-backend       Habilita backend local Profile A ^(default^)
echo   --no-character-backend    Desactiva backend local Profile A
echo   --character-port ^<numero^> Cambia puerto del backend de personajes ^(default: 8010^)
echo.
echo Bootstrap API (BYOK local):
echo   --api-bootstrap           Fuerza bootstrap de APIs
echo   --no-api-bootstrap        Desactiva bootstrap de APIs
echo   --api-profile ^<auto^|openai^|glm5^|meshy^|all^>
echo   --api-user ^<email^>
echo   --api-pass ^<password^>
echo   --api-name ^<nombre^>
echo   --api-wait-sec ^<segundos^>
echo.
echo Ejemplo:
echo   start-clean-app.bat --api-profile glm5 --api-user api-tester@localhost --api-pass ApiTest123
echo   start-clean-app.bat --preflight-only --smoke-url https://tu-dominio.com
echo   start-clean-app.bat --production-local --current-window
echo   start-clean-app.bat --semi-production-local --current-window
echo.
endlocal & exit /b 0
