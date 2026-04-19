param(
  [int] $DelaySeconds = 3,
  [string] $Url,
  [switch] $DryRun
)

if ([string]::IsNullOrWhiteSpace($Url)) {
  exit 0
}

$safeDelaySeconds = [Math]::Max(0, $DelaySeconds)
if ($safeDelaySeconds -gt 0) {
  Start-Sleep -Seconds $safeDelaySeconds
}

if ($DryRun) {
  Write-Output "browser-launch-ok:$Url"
  exit 0
}

Start-Process -FilePath $Url
