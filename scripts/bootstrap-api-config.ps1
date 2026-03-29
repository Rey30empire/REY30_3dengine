param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Email = $env:REY30_API_TEST_EMAIL,
  [string]$Password = $env:REY30_API_TEST_PASSWORD,
  [string]$DisplayName = $env:REY30_API_TEST_NAME,
  [string]$ProviderProfile = $env:REY30_API_TEST_PROFILE,
  [int]$WaitTimeoutSec = 120
)

$ErrorActionPreference = "Stop"
$script:SupportsSkipHttpErrorCheck = (Get-Command Invoke-WebRequest).Parameters.ContainsKey("SkipHttpErrorCheck")

function First-NonEmpty {
  param([string[]]$Values)
  foreach ($value in $Values) {
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
  }
  return ""
}

function First-Env {
  param([string[]]$Names, [string]$Fallback = "")
  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
  }
  return $Fallback
}

function To-Bool {
  param([string]$Value, [bool]$Default = $false)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Default
  }
  switch ($Value.Trim().ToLowerInvariant()) {
    "1" { return $true }
    "true" { return $true }
    "yes" { return $true }
    "on" { return $true }
    "0" { return $false }
    "false" { return $false }
    "no" { return $false }
    "off" { return $false }
    default { return $Default }
  }
}

function Ensure-BaseUrl {
  param([string]$Raw)
  if ([string]::IsNullOrWhiteSpace($Raw)) {
    return "http://localhost:3000"
  }
  $value = $Raw.Trim()
  if ($value.StartsWith("http://") -or $value.StartsWith("https://")) {
    return $value.TrimEnd("/")
  }
  return ("http://" + $value).TrimEnd("/")
}

function Read-JsonSafely {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }
  try {
    return $Text | ConvertFrom-Json -Depth 100
  } catch {
    return $null
  }
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body,
    [hashtable]$Headers,
    [object]$WebSession,
    [int]$TimeoutSec = 20
  )

  $uri = "$script:ResolvedBaseUrl$Path"
  $requestHeaders = @{}
  if ($Headers) {
    foreach ($key in $Headers.Keys) {
      $requestHeaders[$key] = $Headers[$key]
    }
  }
  if ($Method -notin @("GET", "HEAD", "OPTIONS") -and -not $requestHeaders.ContainsKey("Origin")) {
    $requestHeaders["Origin"] = $script:ResolvedBaseUrl
  }

  $jsonBody = $null
  if ($null -ne $Body) {
    if ($Body -is [string]) {
      $jsonBody = $Body
    } else {
      $jsonBody = $Body | ConvertTo-Json -Depth 100 -Compress
    }
  }

  $params = @{
    Method      = $Method
    Uri         = $uri
    WebSession  = $WebSession
    Headers     = $requestHeaders
    TimeoutSec  = $TimeoutSec
    ErrorAction = "Stop"
  }

  if ($null -ne $jsonBody) {
    $params["Body"] = $jsonBody
    if (-not $requestHeaders.ContainsKey("Content-Type")) {
      $params["ContentType"] = "application/json"
    }
  }

  if ($script:SupportsSkipHttpErrorCheck) {
    $params["SkipHttpErrorCheck"] = $true
  }

  try {
    $response = Invoke-WebRequest @params
    $statusCode = [int]$response.StatusCode
    $text = [string]$response.Content
    $json = Read-JsonSafely -Text $text
    return [pscustomobject]@{
      StatusCode = $statusCode
      Text       = $text
      Json       = $json
      Uri        = $uri
    }
  } catch {
    $statusCode = 0
    $text = ""
    $response = $_.Exception.Response

    if ($null -ne $response) {
      try {
        $statusCode = [int]$response.StatusCode
      } catch {
        $statusCode = 0
      }

      try {
        $stream = $response.GetResponseStream()
        if ($null -ne $stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          try {
            $text = $reader.ReadToEnd()
          } finally {
            $reader.Dispose()
            $stream.Dispose()
          }
        }
      } catch {
        if ($_.ErrorDetails.Message) {
          $text = [string]$_.ErrorDetails.Message
        }
      }
    }

    if ([string]::IsNullOrWhiteSpace($text)) {
      $text = [string]$_.Exception.Message
    }

    $json = Read-JsonSafely -Text $text
    return [pscustomobject]@{
      StatusCode = $statusCode
      Text       = $text
      Json       = $json
      Uri        = $uri
    }
  }
}

function Wait-ForServer {
  param([object]$WebSession, [int]$TimeoutSec)
  $deadline = (Get-Date).AddSeconds([Math]::Max(5, $TimeoutSec))
  while ((Get-Date) -lt $deadline) {
    $probe = Invoke-JsonRequest -Method "GET" -Path "/api/health/live" -Body $null -Headers @{} -WebSession $WebSession -TimeoutSec 8
    if ($probe.StatusCode -eq 200) {
      return
    }
    Start-Sleep -Milliseconds 1200
  }

  throw "Timeout esperando que el servidor responda en $script:ResolvedBaseUrl"
}

function Get-CookieValue {
  param(
    [object]$WebSession,
    [Uri]$BaseUri,
    [string]$Name
  )
  $cookies = $WebSession.Cookies.GetCookies($BaseUri)
  foreach ($cookie in $cookies) {
    if ($cookie.Name -eq $Name) {
      return [string]$cookie.Value
    }
  }
  return ""
}

function Mask-Secret {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return "(vacío)"
  }
  if ($Value.Length -le 8) {
    return "********"
  }
  return ($Value.Substring(0, 4) + "..." + $Value.Substring($Value.Length - 4))
}

try {
  $script:ResolvedBaseUrl = Ensure-BaseUrl -Raw $BaseUrl
  $baseUri = [Uri]$script:ResolvedBaseUrl

  $resolvedEmail = First-NonEmpty @($Email, "api-tester@localhost")
  $resolvedPassword = First-NonEmpty @($Password, "ApiTest123")
  $resolvedDisplayName = First-NonEmpty @($DisplayName, "API Tester")
  $requestedProfile = First-NonEmpty @($ProviderProfile, "auto").ToLowerInvariant()

  $validProfiles = @("auto", "openai", "glm5", "meshy", "all")
  if ($requestedProfile -notin $validProfiles) {
    throw "ProviderProfile invalido '$requestedProfile'. Usa: auto, openai, glm5, meshy, all."
  }

  $openaiApiKey = First-Env @("OPENAI_API_KEY")
  $openaiBaseUrl = First-Env @("OPENAI_BASE_URL")
  $openaiOrg = First-Env @("OPENAI_ORGANIZATION")
  $openaiProject = First-Env @("OPENAI_PROJECT")
  $openaiTextModel = First-Env @("OPENAI_TEXT_MODEL", "OPENAI_CHAT_MODEL")
  $openaiMultimodalModel = First-Env @("OPENAI_MULTIMODAL_MODEL", "OPENAI_VISION_MODEL")
  $openaiImageModel = First-Env @("OPENAI_IMAGE_MODEL")
  $openaiVideoModel = First-Env @("OPENAI_VIDEO_MODEL")
  $openaiImageSize = First-Env @("OPENAI_IMAGE_SIZE")
  $openaiVideoSize = First-Env @("OPENAI_VIDEO_SIZE")

  $glmApiKey = First-Env @("GLM_API_KEY", "GLM5_API_KEY", "GLM_5_API_KEY", "ZAI_API_KEY")
  $glmBaseUrl = First-Env @("GLM_BASE_URL", "GLM5_BASE_URL", "GLM_OPENAI_BASE_URL")
  $glmTextModel = First-Env @("GLM_5_MODEL", "GLM5_MODEL", "GLM_MODEL", "GLM_CHAT_MODEL")
  $glmMultimodalModel = First-Env @("GLM_5_MULTIMODAL_MODEL", "GLM5_MULTIMODAL_MODEL", "GLM_MULTIMODAL_MODEL")
  $glmImageModel = First-Env @("GLM_IMAGE_MODEL")
  $glmVideoModel = First-Env @("GLM_VIDEO_MODEL")

  $meshyApiKey = First-Env @("MESHY_API_KEY")
  $meshyBaseUrl = First-Env @("MESHY_BASE_URL")
  $meshyStyle = First-Env @("MESHY_DEFAULT_ART_STYLE")
  $meshyTopology = First-Env @("MESHY_DEFAULT_TOPOLOGY")
  $meshyTargetFaceCount = First-Env @("MESHY_TARGET_FACE_COUNT")
  $meshyEnablePbr = First-Env @("MESHY_ENABLE_PBR")

  $effectiveProfile = $requestedProfile
  if ($requestedProfile -eq "auto") {
    if (-not [string]::IsNullOrWhiteSpace($glmApiKey) -and -not [string]::IsNullOrWhiteSpace($meshyApiKey)) {
      $effectiveProfile = "all"
    } elseif (-not [string]::IsNullOrWhiteSpace($glmApiKey)) {
      $effectiveProfile = "glm5"
    } elseif (-not [string]::IsNullOrWhiteSpace($openaiApiKey) -and -not [string]::IsNullOrWhiteSpace($meshyApiKey)) {
      $effectiveProfile = "all"
    } elseif (-not [string]::IsNullOrWhiteSpace($openaiApiKey)) {
      $effectiveProfile = "openai"
    } elseif (-not [string]::IsNullOrWhiteSpace($meshyApiKey)) {
      $effectiveProfile = "meshy"
    } else {
      $effectiveProfile = "none"
    }
  }

  $applyOpenai = $false
  $applyMeshy = $false
  $useGlmCompat = $false

  switch ($effectiveProfile) {
    "openai" {
      $applyOpenai = -not [string]::IsNullOrWhiteSpace($openaiApiKey)
    }
    "glm5" {
      $applyOpenai = -not [string]::IsNullOrWhiteSpace((First-NonEmpty @($glmApiKey, $openaiApiKey)))
      $useGlmCompat = $applyOpenai
    }
    "meshy" {
      $applyMeshy = -not [string]::IsNullOrWhiteSpace($meshyApiKey)
    }
    "all" {
      if (-not [string]::IsNullOrWhiteSpace($glmApiKey)) {
        $applyOpenai = $true
        $useGlmCompat = $true
      } elseif (-not [string]::IsNullOrWhiteSpace($openaiApiKey)) {
        $applyOpenai = $true
      }
      $applyMeshy = -not [string]::IsNullOrWhiteSpace($meshyApiKey)
    }
    default {
      $applyOpenai = $false
      $applyMeshy = $false
    }
  }

  if (-not $applyOpenai -and -not $applyMeshy) {
    Write-Host "[api-bootstrap] No hay claves detectadas para OpenAI/GLM/Meshy. Se omite bootstrap."
    exit 0
  }

  Write-Host "[api-bootstrap] Esperando servidor en $script:ResolvedBaseUrl ..."
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Wait-ForServer -WebSession $session -TimeoutSec $WaitTimeoutSec

  $registerBody = @{
    email    = $resolvedEmail
    password = $resolvedPassword
    name     = $resolvedDisplayName
  }

  $bootstrapOwnerToken = First-Env @("REY30_BOOTSTRAP_OWNER_TOKEN")
  if (-not [string]::IsNullOrWhiteSpace($bootstrapOwnerToken)) {
    $registerBody["bootstrapOwnerToken"] = $bootstrapOwnerToken
  }

  $inviteToken = First-Env @("REY30_REGISTRATION_INVITE_TOKEN")
  if (-not [string]::IsNullOrWhiteSpace($inviteToken)) {
    $registerBody["inviteToken"] = $inviteToken
  }

  $register = Invoke-JsonRequest -Method "POST" -Path "/api/auth/register" -Body $registerBody -Headers @{} -WebSession $session
  if ($register.StatusCode -eq 200) {
    Write-Host "[api-bootstrap] Registro OK para $resolvedEmail"
  } elseif ($register.StatusCode -eq 409) {
    Write-Host "[api-bootstrap] Usuario ya existe, se reutiliza cuenta local: $resolvedEmail"
  } elseif ($register.StatusCode -eq 403) {
    Write-Host "[api-bootstrap] Registro bloqueado por politica, se intentara login con la cuenta existente."
  } elseif ($register.StatusCode -ne 0) {
    Write-Host "[api-bootstrap] Registro devolvio status $($register.StatusCode): $($register.Text)"
  }

  $login = Invoke-JsonRequest -Method "POST" -Path "/api/auth/login" -Body @{
    email    = $resolvedEmail
    password = $resolvedPassword
  } -Headers @{} -WebSession $session

  if ($login.StatusCode -ne 200) {
    throw "No se pudo iniciar sesion con '$resolvedEmail' (status $($login.StatusCode)). Revisa usuario/password."
  }

  $sessionCheck = Invoke-JsonRequest -Method "GET" -Path "/api/auth/session" -Body $null -Headers @{} -WebSession $session
  if ($sessionCheck.StatusCode -ne 200 -or -not $sessionCheck.Json.authenticated) {
    throw "Sesion no autenticada despues de login."
  }

  $csrfToken = Get-CookieValue -WebSession $session -BaseUri $baseUri -Name "rey30_csrf"
  if ([string]::IsNullOrWhiteSpace($csrfToken)) {
    throw "No se obtuvo cookie CSRF (rey30_csrf)."
  }

  $currentConfigResponse = Invoke-JsonRequest -Method "GET" -Path "/api/user/api-config" -Body $null -Headers @{} -WebSession $session
  if ($currentConfigResponse.StatusCode -ne 200) {
    throw "No se pudo leer /api/user/api-config (status $($currentConfigResponse.StatusCode))."
  }

  $apiConfig = $currentConfigResponse.Json.apiConfig
  $localConfig = $currentConfigResponse.Json.localConfig
  if ($null -eq $apiConfig -or $null -eq $localConfig) {
    throw "La respuesta de /api/user/api-config no contiene apiConfig/localConfig."
  }

  if ($applyOpenai) {
    $resolvedOpenaiKey = if ($useGlmCompat) {
      First-NonEmpty @($glmApiKey, $openaiApiKey)
    } else {
      $openaiApiKey
    }

    $resolvedOpenaiBase = if ($useGlmCompat) {
      First-NonEmpty @($glmBaseUrl, $openaiBaseUrl, "https://open.bigmodel.cn/api/paas/v4")
    } else {
      First-NonEmpty @($openaiBaseUrl, "https://api.openai.com/v1")
    }

    $resolvedTextModel = if ($useGlmCompat) {
      First-NonEmpty @($glmTextModel, $openaiTextModel, "glm-5")
    } else {
      First-NonEmpty @($openaiTextModel, "gpt-4.1-mini")
    }

    $resolvedMultimodalModel = if ($useGlmCompat) {
      First-NonEmpty @($glmMultimodalModel, $openaiMultimodalModel, $resolvedTextModel)
    } else {
      First-NonEmpty @($openaiMultimodalModel, $resolvedTextModel)
    }

    $resolvedImageModel = if ($useGlmCompat) {
      First-NonEmpty @($glmImageModel, $openaiImageModel)
    } else {
      First-NonEmpty @($openaiImageModel, "gpt-image-1")
    }

    $resolvedVideoModel = if ($useGlmCompat) {
      First-NonEmpty @($glmVideoModel, $openaiVideoModel)
    } else {
      First-NonEmpty @($openaiVideoModel, "sora-2")
    }

    $apiConfig.openai.enabled = $true
    $apiConfig.openai.apiKey = $resolvedOpenaiKey
    $apiConfig.openai.baseUrl = $resolvedOpenaiBase
    $apiConfig.openai.organization = $openaiOrg
    $apiConfig.openai.project = $openaiProject
    $apiConfig.openai.textModel = $resolvedTextModel
    $apiConfig.openai.multimodalModel = $resolvedMultimodalModel
    if (-not [string]::IsNullOrWhiteSpace($resolvedImageModel)) {
      $apiConfig.openai.imageModel = $resolvedImageModel
    }
    if (-not [string]::IsNullOrWhiteSpace($resolvedVideoModel)) {
      $apiConfig.openai.videoModel = $resolvedVideoModel
    }
    if (-not [string]::IsNullOrWhiteSpace($openaiImageSize)) {
      $apiConfig.openai.imageSize = $openaiImageSize
    }
    if (-not [string]::IsNullOrWhiteSpace($openaiVideoSize)) {
      $apiConfig.openai.videoSize = $openaiVideoSize
    }

    $apiConfig.openai.capabilities.chat = $true
    $apiConfig.openai.capabilities.multimodal = $true
    if ($useGlmCompat) {
      $apiConfig.openai.capabilities.image = $false
      $apiConfig.openai.capabilities.video = $false
    }
    $apiConfig.routing.chat = "openai"
  }

  if ($applyMeshy) {
    $apiConfig.meshy.enabled = $true
    $apiConfig.meshy.apiKey = $meshyApiKey
    if (-not [string]::IsNullOrWhiteSpace($meshyBaseUrl)) {
      $apiConfig.meshy.baseUrl = $meshyBaseUrl
    }
    if (-not [string]::IsNullOrWhiteSpace($meshyStyle)) {
      $apiConfig.meshy.defaultArtStyle = $meshyStyle.ToLowerInvariant()
    }
    if (-not [string]::IsNullOrWhiteSpace($meshyTopology)) {
      $apiConfig.meshy.defaultTopology = $meshyTopology.ToLowerInvariant()
    }
    $faceCountValue = 0
    if ([int]::TryParse($meshyTargetFaceCount, [ref]$faceCountValue) -and $faceCountValue -gt 0) {
      $apiConfig.meshy.targetFaceCount = $faceCountValue
    }
    if (-not [string]::IsNullOrWhiteSpace($meshyEnablePbr)) {
      $apiConfig.meshy.enablePbr = To-Bool -Value $meshyEnablePbr -Default $true
    }
    $apiConfig.meshy.capabilities.threeD = $true
    $apiConfig.routing.threeD = "meshy"
  }

  $saveResponse = Invoke-JsonRequest -Method "PUT" -Path "/api/user/api-config" -Body @{
    apiConfig   = $apiConfig
    localConfig = $localConfig
  } -Headers @{
    "x-rey30-csrf" = $csrfToken
  } -WebSession $session

  if ($saveResponse.StatusCode -ne 200) {
    throw "No se pudo guardar la configuracion API (status $($saveResponse.StatusCode)): $($saveResponse.Text)"
  }

  Write-Host "[api-bootstrap] Perfil aplicado: $effectiveProfile"
  if ($applyOpenai) {
    $openaiState = Invoke-JsonRequest -Method "GET" -Path "/api/openai" -Body $null -Headers @{} -WebSession $session
    $openaiConfigured = if ($openaiState.Json) { [bool]$openaiState.Json.configured } else { $false }
    $openaiProviderName = if ($useGlmCompat) { "GLM-5 (OpenAI-compatible)" } else { "OpenAI" }
    Write-Host ("[api-bootstrap] " + $openaiProviderName + " key: " + (Mask-Secret -Value $apiConfig.openai.apiKey))
    Write-Host ("[api-bootstrap] OpenAI endpoint configurado: " + $apiConfig.openai.baseUrl)
    Write-Host ("[api-bootstrap] OpenAI model chat: " + $apiConfig.openai.textModel)
    Write-Host ("[api-bootstrap] Probe /api/openai configured: " + $openaiConfigured)
  }
  if ($applyMeshy) {
    $meshyState = Invoke-JsonRequest -Method "GET" -Path "/api/meshy" -Body $null -Headers @{} -WebSession $session
    $meshyConfigured = if ($meshyState.Json) { [bool]$meshyState.Json.configured } else { $false }
    Write-Host ("[api-bootstrap] Meshy key: " + (Mask-Secret -Value $apiConfig.meshy.apiKey))
    Write-Host ("[api-bootstrap] Meshy endpoint configurado: " + $apiConfig.meshy.baseUrl)
    Write-Host ("[api-bootstrap] Probe /api/meshy configured: " + $meshyConfigured)
  }

  Write-Host "[api-bootstrap] Listo. En la app abre 'Usuario / Config APIs' y pulsa 'Probar'."
  exit 0
} catch {
  Write-Error ("[api-bootstrap] Error: " + $_.Exception.Message)
  exit 1
}
