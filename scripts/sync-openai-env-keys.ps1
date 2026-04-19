param(
  [string] $EnvPath = ".env.local",
  [switch] $Verify
)

if (-not (Test-Path -LiteralPath $EnvPath)) {
  Write-Output "[openai-env] .env.local no existe. Se omite sincronizacion."
  exit 0
}

$lines = Get-Content -LiteralPath $EnvPath
$primaryKey = $null

foreach ($line in $lines) {
  if ($line -match "^OPENAI_API_KEY=(.+)$") {
    $primaryKey = $Matches[1].Trim()
    break
  }
}

if ([string]::IsNullOrWhiteSpace($primaryKey)) {
  Write-Output "[openai-env] OPENAI_API_KEY vacia. Se omite sincronizacion."
  exit 0
}

$updatedCount = 0
$changed = $false
$nextLines = foreach ($line in $lines) {
  if ($line -match "^(?<key>[A-Za-z0-9_]*OPENAI[A-Za-z0-9_]*API_KEY)=(?<value>.*)$") {
    $updatedCount += 1
    $nextLine = "$($Matches.key)=$primaryKey"
    if ($line -ne $nextLine) {
      $changed = $true
    }
    $nextLine
  } else {
    $line
  }
}

if ($changed) {
  Set-Content -LiteralPath $EnvPath -Value $nextLines -Encoding UTF8
  Write-Output "[openai-env] Claves OpenAI sincronizadas: $updatedCount"
} else {
  Write-Output "[openai-env] Claves OpenAI ya estaban sincronizadas: $updatedCount"
}

if (-not $Verify) {
  exit 0
}

try {
  $headers = @{ Authorization = "Bearer $primaryKey" }
  $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/models" -Method Get -Headers $headers -TimeoutSec 30
  $modelCount = @($response.data).Count
  Write-Output "[openai-env] Verificacion OpenAI OK. Modelos visibles: $modelCount"
  exit 0
} catch {
  $status = $null
  try {
    $status = [int]$_.Exception.Response.StatusCode
  } catch {
    $status = $null
  }

  if ($status) {
    Write-Output "[openai-env] Verificacion OpenAI fallo. HTTP $status"
  } else {
    Write-Output "[openai-env] Verificacion OpenAI fallo."
  }
  exit 1
}
