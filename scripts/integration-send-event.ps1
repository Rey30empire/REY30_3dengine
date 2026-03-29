param(
  [string]$BaseUrl = $env:RELEASE_BASE_URL,
  [string]$EndpointPath = "/api/integrations/events",
  [string]$IntegrationId = $env:REY30_INTEGRATION_ID,
  [string]$Token = $env:REY30_INTEGRATION_TOKEN,
  [string]$Secret = $env:REY30_INTEGRATION_SECRET,
  [string]$EventType = "integration.ping",
  [string]$Source = "backend",
  [string]$PayloadJson = "{}",
  [string]$IdempotencyKey = "",
  [string]$Nonce = "",
  [string]$Timestamp = "",
  [switch]$DryRun,
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = "Stop"

function Require-Value {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing required value: $Name"
  }
  return $Value.Trim()
}

function Ensure-BaseUrl {
  param([string]$Raw)
  $value = Require-Value -Name "BaseUrl" -Value $Raw
  if ($value.StartsWith("http://") -or $value.StartsWith("https://")) {
    return $value.TrimEnd("/")
  }
  return ("https://" + $value).TrimEnd("/")
}

function Ensure-EndpointPath {
  param([string]$Raw)
  if ([string]::IsNullOrWhiteSpace($Raw)) {
    return "/api/integrations/events"
  }
  $value = $Raw.Trim()
  if ($value.StartsWith("/")) {
    return $value
  }
  return "/" + $value
}

function ConvertTo-Hex {
  param([byte[]]$Bytes)
  return ([System.BitConverter]::ToString($Bytes)).Replace("-", "").ToLowerInvariant()
}

function Get-Sha256Hex {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hash = $sha.ComputeHash($bytes)
    return ConvertTo-Hex -Bytes $hash
  } finally {
    $sha.Dispose()
  }
}

function Get-HmacSha256Hex {
  param([string]$Text, [string]$Key)
  $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($Key)
  $hmac = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hash = $hmac.ComputeHash($bytes)
    return ConvertTo-Hex -Bytes $hash
  } finally {
    $hmac.Dispose()
  }
}

function Mask-Secret {
  param([string]$Value)
  if ([string]::IsNullOrEmpty($Value)) {
    return ""
  }
  if ($Value.Length -le 8) {
    return "****"
  }
  return ($Value.Substring(0, 4) + "..." + $Value.Substring($Value.Length - 4))
}

$baseUrl = Ensure-BaseUrl -Raw $BaseUrl
$endpointPath = Ensure-EndpointPath -Raw $EndpointPath
$integrationId = Require-Value -Name "IntegrationId" -Value $IntegrationId
$token = Require-Value -Name "Token" -Value $Token
$secret = Require-Value -Name "Secret" -Value $Secret
$eventType = Require-Value -Name "EventType" -Value $EventType
$source = if ([string]::IsNullOrWhiteSpace($Source)) { "backend" } else { $Source.Trim() }
$nonceValue = if ([string]::IsNullOrWhiteSpace($Nonce)) { [Guid]::NewGuid().ToString() } else { $Nonce.Trim() }
$timestampValue = if ([string]::IsNullOrWhiteSpace($Timestamp)) { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString() } else { $Timestamp.Trim() }

$payload = $null
try {
  $payload = $PayloadJson | ConvertFrom-Json -Depth 100
} catch {
  throw "PayloadJson is not valid JSON."
}

$bodyObject = @{
  eventType = $eventType
  source = $source
  payload = $payload
}
if (-not [string]::IsNullOrWhiteSpace($IdempotencyKey)) {
  $bodyObject["idempotencyKey"] = $IdempotencyKey.Trim()
}

$body = $bodyObject | ConvertTo-Json -Depth 100 -Compress
$bodyHash = Get-Sha256Hex -Text $body
$canonical = "POST`n$endpointPath`n$timestampValue`n$nonceValue`n$bodyHash"
$signatureRaw = Get-HmacSha256Hex -Text $canonical -Key $secret
$signature = "sha256=$signatureRaw"

$summary = @{
  baseUrl = $baseUrl
  endpointPath = $endpointPath
  integrationId = $integrationId
  token = Mask-Secret -Value $token
  secret = Mask-Secret -Value $secret
  timestamp = $timestampValue
  nonce = $nonceValue
  bodyHash = $bodyHash
  signature = Mask-Secret -Value $signature
  dryRun = [bool]$DryRun
}

Write-Host "Integration request summary:"
Write-Host ($summary | ConvertTo-Json -Depth 10)
Write-Host "Request body:"
Write-Host $body

if ($DryRun) {
  Write-Host "Dry run enabled. Request was not sent."
  exit 0
}

$uri = "$baseUrl$endpointPath"
$headers = @{
  Authorization = "Bearer $token"
  "x-rey30-integration-id" = $integrationId
  "x-rey30-timestamp" = $timestampValue
  "x-rey30-nonce" = $nonceValue
  "x-rey30-signature" = $signature
}

try {
  $response = Invoke-WebRequest `
    -Method Post `
    -Uri $uri `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $body `
    -TimeoutSec $TimeoutSec

  Write-Host ("Response status: " + [int]$response.StatusCode)
  Write-Host "Response body:"
  Write-Host $response.Content

  if ([int]$response.StatusCode -ge 400) {
    exit 1
  }
} catch {
  if ($_.Exception.Response) {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Write-Error ("Request failed with status: " + $statusCode)
  } else {
    Write-Error ("Request failed: " + $_.Exception.Message)
  }
  throw
}
