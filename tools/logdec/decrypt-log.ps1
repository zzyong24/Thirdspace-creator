# CreatorOS 日志解密工具 (T-455, PowerShell 版)
# 用法:
#   .\decrypt-log.ps1 -Key <私钥文件> <sidecar.log.enc> [<sidecar.log(2).enc> ...]
#   .\decrypt-log.ps1 -Key <私钥文件> -Dir <目录>
# 输出:每份 xxx.enc → xxx.log (或 xxx.txt 若原名已含 .log);同目录

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$Key,

    [string]$Dir = "",

    [switch]$Force,

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Files = @()
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Logdec = Join-Path $ScriptDir "creatoros-logdec.exe"

if (-not (Test-Path $Logdec)) {
    Write-Error "找不到 logdec 二进制: $Logdec`n先跑打包并把 exe 拷进 tools/logdec/"
    exit 2
}
if (-not (Test-Path $Key)) {
    Write-Error "私钥文件不存在: $Key"
    exit 2
}

# 补齐 -Dir 模式
if ($Dir) {
    if (-not (Test-Path $Dir -PathType Container)) {
        Write-Error "目录不存在: $Dir"
        exit 2
    }
    $Files += (Get-ChildItem -Path $Dir -Filter *.enc -Recurse -File | ForEach-Object { $_.FullName })
}

if ($Files.Count -eq 0) {
    Write-Error "未指定文件 (给几个 .enc 或用 -Dir <目录>)"
    exit 2
}

$ok = 0
$skipped = 0
$failed = 0

foreach ($f in $Files) {
    if (-not (Test-Path $f)) {
        Write-Warning "跳过 (不存在): $f"
        $failed++
        continue
    }
    # 输出路径: 去 .enc 后缀,若原名已含 .log 则加 .txt,否则加 .log
    $base = $f -replace '\.enc$', ''
    if ($base -match '\.log(\(\d+\))?$' -or $base -match '\.log ') {
        $out = "$base.txt"
    } else {
        $out = "$base.log"
    }
    if ((Test-Path $out) -and (-not $Force)) {
        Write-Host "⏭ 已存在 (-Force 覆盖): $out"
        $skipped++
        continue
    }
    Write-Host "→ $f"
    try {
        & $Logdec --key $Key $f > $out 2>$null
        if ($LASTEXITCODE -eq 0) {
            $size = (Get-Item $out).Length
            Write-Host "  ✓ 输出 $out ($size B)"
            $ok++
        } else {
            Remove-Item $out -ErrorAction SilentlyContinue
            Write-Host "  ✗ 解密失败 (exit $LASTEXITCODE) - 密钥不匹配或文件损坏"
            $failed++
        }
    } catch {
        Remove-Item $out -ErrorAction SilentlyContinue
        Write-Host "  ✗ 解密失败: $_"
        $failed++
    }
}

Write-Host ""
Write-Host "汇总: 成功 $ok · 跳过 $skipped · 失败 $failed"
if ($failed -gt 0) { exit 1 } else { exit 0 }
