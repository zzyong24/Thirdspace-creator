$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$output = Join-Path $repo "output\windows-runtime-rat"
$work = Join-Path $env:RUNNER_TEMP "creatoros-t565-runtime-rat"
$project = Join-Path $PSScriptRoot "RuntimeRat\RuntimeRat.csproj"
$publish = Join-Path $work "publish"

Remove-Item $output,$work -Recurse -Force -ErrorAction SilentlyContinue
New-Item $output,$work,$publish -ItemType Directory -Force | Out-Null

function Invoke-Checked {
  param([string]$FilePath, [string[]]$ArgumentList)
  Write-Host ">> $FilePath $($ArgumentList -join ' ')"
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "command failed ($LASTEXITCODE): $FilePath"
  }
}

function Wait-File {
  param([string]$Path, [int]$Seconds = 20)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $Path -PathType Leaf) { return }
    Start-Sleep -Milliseconds 200
  }
  throw "timed out waiting for $Path"
}

function Wait-LogPattern {
  param([string]$Path, [string]$Pattern, [int]$Seconds = 60)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if ((Test-Path $Path -PathType Leaf) -and (Select-String -Path $Path -Pattern $Pattern -Quiet)) {
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw "timed out waiting for pattern '$Pattern' in $Path"
}

Invoke-Checked dotnet @(
  "publish", $project, "-c", "Release", "-r", "win-x64",
  "--self-contained", "true", "-p:PublishSingleFile=true",
  "-p:DebugType=None", "-p:DebugSymbols=false", "-o", $publish
)
$ratExe = Join-Path $publish "RuntimeRat.exe"
if (-not (Test-Path $ratExe -PathType Leaf)) { throw "missing RuntimeRat.exe" }

& $ratExe "state-suite" "--root" (Join-Path $work "state")
if ($LASTEXITCODE -ne 0) { throw "state-suite failed" }
& $ratExe "path-suite" "--root" (Join-Path $work "paths")
if ($LASTEXITCODE -ne 0) { throw "path-suite failed" }

# WiX 5 is intentionally pinned for this non-production feasibility RAT. WiX 6/7
# licensing is a separate production gate; this workflow does not accept that EULA.
Invoke-Checked dotnet @("tool", "install", "--tool-path", (Join-Path $work "dotnet-tools"), "wix", "--version", "5.0.2")
$wix = Join-Path $work "dotnet-tools\wix.exe"
Invoke-Checked $wix @("extension", "add", "-g", "WixToolset.BootstrapperApplications.wixext/5.0.2")

$payloadSource = Join-Path $work "payload-source"
$served = Join-Path $work "served"
New-Item $payloadSource,$served -ItemType Directory -Force | Out-Null
$payloadNames = @("shell.zip", "core.zip", "browser.zip", "media.zip", "local-ai.zip")
for ($index = 0; $index -lt $payloadNames.Count; $index++) {
  $layer = Join-Path $work "layer-$index"
  New-Item $layer -ItemType Directory -Force | Out-Null
  $bytes = New-Object byte[] (1MB + ($index * 131071))
  [Random]::new(56500 + $index).NextBytes($bytes)
  [IO.File]::WriteAllBytes((Join-Path $layer "payload.bin"), $bytes)
  [IO.File]::WriteAllText((Join-Path $layer "layer.json"), "{`"index`":$index}")
  [IO.Compression.ZipFile]::CreateFromDirectory($layer, (Join-Path $payloadSource $payloadNames[$index]), [IO.Compression.CompressionLevel]::Optimal, $false)
  Copy-Item (Join-Path $payloadSource $payloadNames[$index]) (Join-Path $served $payloadNames[$index])
}

$worker = Join-Path $work "RuntimeRat.exe"
Copy-Item $ratExe $worker
$upgradeCode = "5D9F1296-5475-4E6B-994B-346522706565"
$port = 45655

function New-BundleSource {
  param(
    [string]$Path,
    [string]$Name,
    [string]$Version,
    [ValidateSet("yes", "no")][string]$Compressed,
    [string]$DownloadBase,
    [string]$ResultPath,
    [string]$Mode,
    [string]$CacheId
  )
  $payloadXml = foreach ($payloadName in $payloadNames) {
    $download = if ($DownloadBase) { " DownloadUrl=`"$DownloadBase/$payloadName`"" } else { "" }
    "        <Payload SourceFile=`"$payloadSource\$payloadName`" Name=`"$payloadName`" Compressed=`"$Compressed`"$download />"
  }
  @"
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"
     xmlns:bal="http://wixtoolset.org/schemas/v4/wxs/bal">
  <Bundle Name="$Name" Version="$Version" Manufacturer="CreatorOS RAT" UpgradeCode="$upgradeCode">
    <BootstrapperApplication>
      <bal:WixStandardBootstrapperApplication Theme="hyperlinkLicense" LicenseUrl="" />
    </BootstrapperApplication>
    <Chain>
      <ExePackage Id="RuntimeRatPackage"
                  SourceFile="$worker"
                  Name="RuntimeRat.exe"
                  PerMachine="no"
                  Permanent="yes"
                  Vital="yes"
                  Cache="keep"
                  CacheId="$CacheId"
                  DetectCondition="0"
                  InstallArguments="package --mode $Mode --result &quot;$ResultPath&quot;">
$($payloadXml -join "`n")
      </ExePackage>
    </Chain>
  </Bundle>
</Wix>
"@ | Set-Content $Path -Encoding utf8
}

function Remove-ExternalPayloadCopies {
  foreach ($payloadName in $payloadNames) {
    $externalCopy = Join-Path $work $payloadName
    if (Test-Path $externalCopy -PathType Leaf) {
      Remove-Item $externalCopy -Force
    }
  }
}

$offlineResult = Join-Path $work "offline-result.json"
$offlineWxs = Join-Path $work "offline.wxs"
$offlineBundle = Join-Path $work "CreatorOS-RAT-offline.exe"
New-BundleSource $offlineWxs "CreatorOS T565 Offline RAT" "1.0.0.0" "yes" "" $offlineResult "offline" "creatoros-t565-offline"
Invoke-Checked $wix @("build", "-arch", "x64", "-ext", "WixToolset.BootstrapperApplications.wixext", $offlineWxs, "-o", $offlineBundle)
$offlineLog = Join-Path $output "burn-offline.log"
Invoke-Checked $offlineBundle @("-quiet", "-norestart", "-log", $offlineLog)
Wait-File $offlineResult
Copy-Item $offlineResult (Join-Path $output "burn-offline-result.json")

$serverLog = Join-Path $output "http-acquisition.log"
$serverStdout = Join-Path $output "http-server.stdout.log"
$serverStderr = Join-Path $output "http-server.stderr.log"
$server = Start-Process -FilePath $ratExe -ArgumentList @(
  "serve", "--root", $served, "--port", "$port", "--log", $serverLog,
  "--interrupt-once", "local-ai.zip"
) -RedirectStandardOutput $serverStdout -RedirectStandardError $serverStderr -PassThru
try {
  Start-Sleep -Seconds 1
  if ($server.HasExited) { throw "HTTP server exited early: $(Get-Content $serverStderr -Raw)" }
  $webResult = Join-Path $work "web-result.json"
  $webWxs = Join-Path $work "web.wxs"
  $webBundle = Join-Path $work "CreatorOS-RAT-web.exe"
  New-BundleSource $webWxs "CreatorOS T565 Web RAT" "2.0.0.0" "no" "http://127.0.0.1:$port" $webResult "web" "creatoros-t565-web"
  Invoke-Checked $wix @("build", "-arch", "x64", "-ext", "WixToolset.BootstrapperApplications.wixext", $webWxs, "-o", $webBundle)
  Remove-ExternalPayloadCopies
  $webLog = Join-Path $output "burn-web.log"

  # The first transfer is intentionally severed. Burn must either resume/retry in
  # this invocation or leave a safe cache that succeeds on an explicit retry.
  & $webBundle "-quiet" "-norestart" "-log" $webLog
  $firstExit = $LASTEXITCODE
  if ($firstExit -ne 0) {
    Add-Content $serverLog "FIRST_BUNDLE_EXIT=$firstExit; RETRYING"
    Invoke-Checked $webBundle @("-quiet", "-norestart", "-log", $webLog)
  }
  Wait-File $webResult
  Copy-Item $webResult (Join-Path $output "burn-web-result.json")
  if (-not (Select-String -Path $serverLog -Pattern "INTERRUPTED" -Quiet)) {
    throw "interruption path was not exercised"
  }

  # A related bundle using the same package CacheId must execute entirely from
  # verified cache. The server stays available only so any accidental request can
  # be counted and fail this assertion deterministically.
  $requestCountBeforeCache = (Get-Content $serverLog | Where-Object { $_ -match "`tORIGIN`t.*\.zip`t(?:HEAD|GET)`tRange=" }).Count
  $cacheResult = Join-Path $work "web-cache-result.json"
  $cacheWxs = Join-Path $work "web-cache.wxs"
  $cacheBundle = Join-Path $work "CreatorOS-RAT-web-cache.exe"
  New-BundleSource $cacheWxs "CreatorOS T565 Web Cache RAT" "2.0.0.1" "no" "http://127.0.0.1:$port" $cacheResult "web-cache" "creatoros-t565-web"
  Invoke-Checked $wix @("build", "-arch", "x64", "-ext", "WixToolset.BootstrapperApplications.wixext", $cacheWxs, "-o", $cacheBundle)
  Remove-ExternalPayloadCopies
  $cacheLog = Join-Path $output "burn-web-cache.log"
  Invoke-Checked $cacheBundle @("-quiet", "-norestart", "-log", $cacheLog)
  Wait-File $cacheResult
  Copy-Item $cacheResult (Join-Path $output "burn-web-cache-result.json")
  $requestCountAfterCache = (Get-Content $serverLog | Where-Object { $_ -match "`tORIGIN`t.*\.zip`t(?:HEAD|GET)`tRange=" }).Count
  if ($requestCountAfterCache -ne $requestCountBeforeCache) {
    throw "unchanged payload cache reuse made HTTP requests: before=$requestCountBeforeCache after=$requestCountAfterCache"
  }
  Add-Content $serverLog "CACHE_REUSE_NO_HTTP requests=$requestCountAfterCache"

  # System-proxy proof: the origin host deliberately has no DNS entry. The only
  # route to the payloads is the loopback proxy configured through Windows
  # Internet Settings + WinHTTP. The proxy serves the fixture and records every
  # request so environment-variable-only routing cannot masquerade as a pass.
  $proxyPort = 45656
  $proxyLog = Join-Path $output "http-system-proxy.log"
  $proxyStdout = Join-Path $output "http-proxy.stdout.log"
  $proxyStderr = Join-Path $output "http-proxy.stderr.log"
  $proxyProcess = Start-Process -FilePath $ratExe -ArgumentList @(
    "proxy", "--root", $served, "--port", "$proxyPort", "--log", $proxyLog
  ) -RedirectStandardOutput $proxyStdout -RedirectStandardError $proxyStderr -PassThru
  $proxyWxs = Join-Path $work "proxy.wxs"
  $proxyBundle = Join-Path $work "CreatorOS-RAT-proxy.exe"
  $proxyResult = Join-Path $work "proxy-result.json"
  New-BundleSource $proxyWxs "CreatorOS T565 Proxy RAT" "2.1.0.0" "no" "http://creatoros-rat.test:$port" $proxyResult "proxy" "creatoros-t565-proxy"
  Invoke-Checked $wix @("build", "-arch", "x64", "-ext", "WixToolset.BootstrapperApplications.wixext", $proxyWxs, "-o", $proxyBundle)
  Remove-ExternalPayloadCopies
  $internetSettings = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
  $oldInternet = Get-ItemProperty -Path $internetSettings
  $oldProxyEnable = if ($null -ne $oldInternet.PSObject.Properties["ProxyEnable"]) { [int]$oldInternet.PSObject.Properties["ProxyEnable"].Value } else { 0 }
  $oldProxyServer = if ($null -ne $oldInternet.PSObject.Properties["ProxyServer"]) { [string]$oldInternet.PSObject.Properties["ProxyServer"].Value } else { $null }
  $oldProxyOverride = if ($null -ne $oldInternet.PSObject.Properties["ProxyOverride"]) { [string]$oldInternet.PSObject.Properties["ProxyOverride"].Value } else { $null }
  try {
    Start-Sleep -Seconds 1
    if ($proxyProcess.HasExited) { throw "proxy exited early: $(Get-Content $proxyStderr -Raw)" }
    Set-ItemProperty -Path $internetSettings -Name ProxyEnable -Type DWord -Value 1
    Set-ItemProperty -Path $internetSettings -Name ProxyServer -Type String -Value "http=127.0.0.1:$proxyPort"
    Set-ItemProperty -Path $internetSettings -Name ProxyOverride -Type String -Value ""
    & netsh winhttp set proxy "127.0.0.1:$proxyPort"
    if ($LASTEXITCODE -ne 0) { throw "netsh winhttp set proxy failed: $LASTEXITCODE" }
    $proxyBurnLog = Join-Path $output "burn-system-proxy.log"
    & $proxyBundle "-quiet" "-norestart" "-log" $proxyBurnLog
    Wait-File $proxyResult 30
    Copy-Item $proxyResult (Join-Path $output "burn-system-proxy-result.json")
    if (-not (Select-String -Path $proxyLog -Pattern "`tPROXY`t.*\.zip`tGET`t" -Quiet)) {
      throw "Burn did not acquire payloads through the configured system proxy"
    }
  } finally {
    & netsh winhttp reset proxy | Out-Null
    Set-ItemProperty -Path $internetSettings -Name ProxyEnable -Type DWord -Value $oldProxyEnable
    if ($null -ne $oldProxyServer) {
      Set-ItemProperty -Path $internetSettings -Name ProxyServer -Type String -Value $oldProxyServer
    } else {
      Remove-ItemProperty -Path $internetSettings -Name ProxyServer -ErrorAction SilentlyContinue
    }
    if ($null -ne $oldProxyOverride) {
      Set-ItemProperty -Path $internetSettings -Name ProxyOverride -Type String -Value $oldProxyOverride
    } else {
      Remove-ItemProperty -Path $internetSettings -Name ProxyOverride -ErrorAction SilentlyContinue
    }
    if (-not $proxyProcess.HasExited) { Stop-Process -Id $proxyProcess.Id -Force }
  }

  # Build against the original digests, then corrupt the served bytes. Burn must
  # reject before the package process creates its result marker.
  $tamperResult = Join-Path $work "tamper-result.json"
  $tamperWxs = Join-Path $work "tamper.wxs"
  $tamperBundle = Join-Path $work "CreatorOS-RAT-tamper.exe"
  New-BundleSource $tamperWxs "CreatorOS T565 Tamper RAT" "3.0.0.0" "no" "http://127.0.0.1:$port" $tamperResult "tamper" "creatoros-t565-tamper"
  Invoke-Checked $wix @("build", "-arch", "x64", "-ext", "WixToolset.BootstrapperApplications.wixext", $tamperWxs, "-o", $tamperBundle)
  Remove-ExternalPayloadCopies
  [IO.File]::AppendAllText((Join-Path $served "core.zip"), "tampered")
  $tamperLog = Join-Path $output "burn-tamper.log"
  & $tamperBundle "-quiet" "-norestart" "-log" $tamperLog
  # Burn can return from its unelevated stub before the elevated engine finishes.
  # The engine's terminal log line, not the stub process code, is authoritative.
  Wait-LogPattern $tamperLog "\]i007: Exit code:" 60
  $tamperTerminal = (Select-String -Path $tamperLog -Pattern "\]i007: Exit code:" | Select-Object -Last 1).Line
  if ($tamperTerminal -match "Exit code: 0x0(?:,|$)" -or (Test-Path $tamperResult)) {
    throw "Burn accepted a tampered remote payload ($tamperTerminal)"
  }
  Add-Content $serverLog "TAMPER_REJECTED $tamperTerminal"
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}

$offline = Get-Content (Join-Path $output "burn-offline-result.json") -Raw | ConvertFrom-Json
$web = Get-Content (Join-Path $output "burn-web-result.json") -Raw | ConvertFrom-Json
foreach ($payloadName in $payloadNames) {
  if ($offline.payloads.$payloadName.sha512 -ne $web.payloads.$payloadName.sha512) {
    throw "offline/web digest mismatch: $payloadName"
  }
}

$summary = [ordered]@{
  passed = $true
  wixRatVersion = "5.0.2"
  productionLicenseDecision = "pending"
  offlineEmbeddedPayloads = $payloadNames.Count
  webRemotePayloads = $payloadNames.Count
  interruptionExercised = $true
  unchangedCacheReuseWithoutHttp = $true
  systemProxyExercised = $true
  tamperRejected = $true
  stateRecoveryBoundaries = @("materialized", "smoke-passed", "current-written", "entry-written")
  pathAttacksRejected = @("traversal", "absolute", "ADS", "reserved", "case-collision", "symlink", "junction", "hardlink")
  utc = [DateTimeOffset]::UtcNow.ToString("O")
}
$summary | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $output "summary.json") -Encoding utf8
Write-Host "T565_WINDOWS_RUNTIME_RAT_OK"
