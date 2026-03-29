param(
  [Parameter(Mandatory = $true)]
  [string]$Source,

  [Parameter(Mandatory = $true)]
  [string]$Destination,

  [switch]$Loop,

  [int]$IntervalMs = 1500,

  [string]$PidFile = ""
)

$ErrorActionPreference = "Stop"

$sourcePath = (Resolve-Path $Source).Path
$destinationPath = $Destination

$excludedDirs = @(
  ".git",
  ".next",
  ".turbo",
  "node_modules"
)

$excludedFiles = @(
  "dev.log",
  "server.log",
  "next.log"
)

function Invoke-ShadowSync {
  New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null

  $args = @(
    $sourcePath,
    $destinationPath,
    "/MIR",
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  )

  if ($excludedDirs.Count -gt 0) {
    $args += "/XD"
    $args += $excludedDirs
  }

  if ($excludedFiles.Count -gt 0) {
    $args += "/XF"
    $args += $excludedFiles
  }

  & robocopy @args | Out-Null
  $exitCode = $LASTEXITCODE

  if ($exitCode -ge 8) {
    throw "robocopy failed with exit code $exitCode"
  }
}

function Write-PidFile {
  if ([string]::IsNullOrWhiteSpace($PidFile)) {
    return
  }

  $pidDir = Split-Path -Parent $PidFile
  if (-not [string]::IsNullOrWhiteSpace($pidDir)) {
    New-Item -ItemType Directory -Force -Path $pidDir | Out-Null
  }

  Set-Content -Path $PidFile -Value $PID -Encoding ascii
}

function Remove-PidFile {
  if ([string]::IsNullOrWhiteSpace($PidFile) -or -not (Test-Path $PidFile)) {
    return
  }

  $existingPid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($existingPid -eq "$PID") {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
}

Invoke-ShadowSync

if (-not $Loop) {
  exit 0
}

Write-PidFile

try {
  while ($true) {
    Start-Sleep -Milliseconds $IntervalMs
    Invoke-ShadowSync
  }
} finally {
  Remove-PidFile
}
