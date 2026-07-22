# CreatorOS 本机 Windows 打包环境一键 bootstrap。
#
# 目标:让本机跑通 `pnpm -C frontend node scripts/desktop/release.mjs` 出 setup.exe,
# 免掉 GHA($2/次 + 60min 等待)。首次 ~45 min(装 Rust + 首次 cargo build),
# 之后 ~15 min(cargo 增量 + pnpm/next cache)。
#
# 检查+装(幂等,已装的跳):
#   1. rustup + stable-x86_64-pc-windows-msvc(cargo/rustc)
#   2. Node 25(fnm 版本管理器,不动系统 Node)
#   3. pnpm 10.32.1(engines 硬对齐)
#   4. Visual Studio Build Tools(cargo 编 tauri 必需的 MSVC linker)—— 仅探测,缺则指路
#   5. 5 个必需 env 的落盘位置检查:%USERPROFILE%\.creatoros\keys\*.env
#
# 用法(管理员 PowerShell 打开,项目根目录):
#   Set-ExecutionPolicy -Scope Process Bypass; .\tools\bootstrap-local-build.ps1
#
# 校验步骤(不改机):
#   .\tools\bootstrap-local-build.ps1 -Check
#
# 打包(env 加载 + 一键 release.mjs):
#   .\tools\bootstrap-local-build.ps1 -Build

param(
    [switch]$Check,   # 只检查现状,不装
    [switch]$Build    # 加载 env + 跑 release.mjs
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$keysDir = Join-Path $env:USERPROFILE ".creatoros\keys"
$envFile = Join-Path $keysDir "build.env"

# 从 Bash/子 shell 起来时,$env:PATH 可能少 User 层的 rustup/fnm 目录 → cargo/fnm 找不到。
# 强制把 Machine + User PATH 合起来,与开新 PowerShell 一致。
$env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH", "User")

function Write-Step($msg) { Write-Host "`n[bootstrap] ▶ $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[bootstrap] ✓ $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "[bootstrap] ⚠ $msg" -ForegroundColor Yellow }
function Write-Err2($msg) { Write-Host "[bootstrap] ✗ $msg" -ForegroundColor Red }

function Test-Cmd($name) {
    $null = Get-Command $name -ErrorAction SilentlyContinue
    return $?
}

function Check-Rust {
    Write-Step "检查 Rust (cargo + rustc)"
    if (Test-Cmd cargo) {
        $v = cargo --version 2>&1
        Write-Ok "cargo 已装: $v"
        return $true
    }
    Write-Warn2 "cargo 未找到"
    return $false
}

function Install-Rust {
    Write-Step "装 rustup + Rust stable (msvc)"
    if (Test-Cmd rustup) {
        Write-Ok "rustup 已在: $(rustup --version)"
    } else {
        Write-Host "[bootstrap] 用 winget 装 rustup..."
        winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Err2 "winget 装 rustup 失败;手动从 https://rustup.rs 装后重跑"
            exit 1
        }
        # winget 装后 PATH 未在当前 shell 生效;直接用绝对路径
        $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
    }
    Write-Host "[bootstrap] rustup default stable-x86_64-pc-windows-msvc..."
    & "$env:USERPROFILE\.cargo\bin\rustup.exe" default stable-x86_64-pc-windows-msvc
    & "$env:USERPROFILE\.cargo\bin\rustup.exe" update stable
    Write-Ok "Rust 就绪: $(& "$env:USERPROFILE\.cargo\bin\cargo.exe" --version)"
}

function Check-VSBuildTools {
    Write-Step "检查 MSVC Build Tools (cargo linker 依赖)"
    # cargo 编 tauri 用 link.exe;vswhere 是官方探测法
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vswhere)) {
        Write-Warn2 "vswhere 不在预期位置,可能未装 Visual Studio Build Tools"
        return $false
    }
    $installs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>&1
    if ([string]::IsNullOrWhiteSpace($installs)) {
        Write-Warn2 "未探测到含 VC.Tools.x86.x64 的 VS 安装"
        return $false
    }
    Write-Ok "MSVC Build Tools: $installs"
    return $true
}

function Install-VSBuildTools {
    Write-Step "装 Visual Studio 2022 Build Tools (含 MSVC C++ + Windows SDK)"
    Write-Host "[bootstrap] winget install Microsoft.VisualStudio.2022.BuildTools..."
    Write-Warn2 "这会下载 ~2GB,装到 C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\"
    winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements `
        --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    if ($LASTEXITCODE -ne 0) {
        Write-Err2 "装 Build Tools 失败;可手动去 https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022 装"
        exit 1
    }
    Write-Ok "Build Tools 装完"
}

function Check-Node25 {
    Write-Step "检查 Node 25 (package.json engines: >=25 <26)"
    if (Test-Cmd node) {
        $ver = (node --version) -replace '^v',''
        $major = [int]($ver.Split('.')[0])
        if ($major -eq 25) {
            Write-Ok "Node $ver 满足 engines(全局)"
            return $true
        }
    }
    # 全局 node ≠ 25 → 看 fnm 有没有装 25(打包时会用 fnm exec 激活)
    if (Test-Cmd fnm) {
        $fnmList = (fnm list) -join "`n"
        if ($fnmList -match 'v25\.') {
            Write-Ok "fnm 内已有 Node 25 (打包时会通过 fnm exec 激活)"
            return $true
        }
    }
    Write-Warn2 "Node 25 未装(全局与 fnm 均无)"
    return $false
}

function Install-Node25 {
    Write-Step "用 fnm 装 Node 25 (不动系统全局 Node)"
    if (-not (Test-Cmd fnm)) {
        Write-Host "[bootstrap] winget install Schniz.fnm..."
        winget install --id Schniz.fnm -e --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { Write-Err2 "装 fnm 失败"; exit 1 }
    }
    # fnm 装后当前 shell PATH 没刷,直接 %LOCALAPPDATA%\fnm\ 找
    $fnmExe = "$env:LOCALAPPDATA\fnm\fnm.exe"
    if (-not (Test-Path $fnmExe)) { $fnmExe = "fnm" }  # 试全局
    & $fnmExe install 25
    & $fnmExe use 25
    & $fnmExe default 25
    Write-Ok "fnm 已切 Node 25,新开 shell 生效"
    Write-Warn2 "注意:当前 shell 里 node --version 还是老版本;打包前先跑 `& $fnmExe env --use-on-cd | Out-String | Invoke-Expression` 或直接开新 PowerShell"
}

function Check-Pnpm {
    Write-Step "检查 pnpm 10.32.1"
    if (Test-Cmd pnpm) {
        $v = pnpm --version
        if ($v -eq "10.32.1") { Write-Ok "pnpm $v"; return $true }
        Write-Warn2 "pnpm $v (需 10.32.1)"
    }
    return $false
}

function Install-Pnpm {
    Write-Step "装 pnpm 10.32.1 (corepack)"
    corepack enable
    corepack prepare pnpm@10.32.1 --activate
    Write-Ok "pnpm 就绪"
}

function Check-Secrets {
    Write-Step "检查打包 secret 落盘 ($envFile)"
    $required = @(
        @{ Name = "TAURI_SIGNING_PRIVATE_KEY"; Desc = "updater minisign 私钥(pnpm desktop:updater-keygen 生成,存 ~/.creatoros/updater.key)" }
        @{ Name = "CREATOROS_VERDICT_SIGNING_KEY_B64"; Desc = "verdict-token Ed25519 私钥 base64(verdict-keygen.mjs 生成)" }
        @{ Name = "CREATOROS_VERDICT_PUBKEY_B64"; Desc = "verdict-token Ed25519 公钥 base64(同上生成)" }
        @{ Name = "CREATOROS_UPDATE_BASE_URL"; Desc = "updater 下载前缀,如 https://github.com/zzyong24/Thirdspace-creator/releases/download/v0.1.0(可先占位)" }
    )
    if (-not (Test-Path $envFile)) {
        Write-Warn2 "$envFile 不存在"
        Write-Host "[bootstrap] 需配以下 env(密钥严禁进 git / IM):"
        foreach ($r in $required) {
            Write-Host "  · $($r.Name) = $($r.Desc)"
        }
        return $false
    }
    $content = Get-Content $envFile -Raw
    $missing = @()
    foreach ($r in $required) {
        if ($content -notmatch "(?m)^$($r.Name)=") { $missing += $r.Name }
    }
    if ($missing.Count -gt 0) {
        Write-Warn2 "缺 env: $($missing -join ', ')"
        return $false
    }
    Write-Ok "所有 secret 齐备"
    return $true
}

function Setup-Secrets {
    Write-Step "初始化 secret 目录 + 生成占位 env"
    if (-not (Test-Path $keysDir)) {
        New-Item -ItemType Directory -Path $keysDir -Force | Out-Null
        Write-Ok "建 $keysDir"
    }

    if (-not (Test-Path $envFile)) {
        $template = @"
# CreatorOS 本机打包 env(严禁进 git / IM)
# 由 tools/bootstrap-local-build.ps1 -Build 加载

# updater minisign 私钥 —— 首次跑:
#   cd $repoRoot
#   pnpm -C frontend node scripts/desktop/updater-keygen.mjs
#   然后把 ~/.creatoros/updater.key 内容单行填这里(或用 Get-Content 拼)
TAURI_SIGNING_PRIVATE_KEY=

# updater 私钥密码(生成时留空则这里也空)
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=

# verdict-token Ed25519 密钥对 —— 首次跑:
#   pnpm -C frontend node scripts/desktop/verdict-keygen.mjs
#   把输出的 private / public 分别填入
CREATOROS_VERDICT_SIGNING_KEY_B64=
CREATOROS_VERDICT_PUBKEY_B64=

# updater 下载前缀 —— 内测本机打包可先随便填个合法 https URL 占位:
CREATOROS_UPDATE_BASE_URL=https://github.com/zzyong24/Thirdspace-creator/releases/download/v0.1.0
"@
        Set-Content -Path $envFile -Value $template -Encoding UTF8
        Write-Ok "生成模板 $envFile"
        Write-Warn2 "打开 $envFile 补全 4 个 secret,然后重跑 -Check 或 -Build"
    }
}

function Load-EnvFile {
    if (-not (Test-Path $envFile)) {
        Write-Err2 "$envFile 不存在,先跑不带参数的 bootstrap"
        exit 1
    }
    Write-Step "加载 $envFile"
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^\s*#' -or $line -eq '') { return }
        if ($line -match '^([^=]+)=(.*)$') {
            $k = $matches[1].Trim()
            $v = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($k, $v, "Process")
        }
    }
    # 校验必填
    foreach ($k in @("TAURI_SIGNING_PRIVATE_KEY","CREATOROS_VERDICT_SIGNING_KEY_B64","CREATOROS_VERDICT_PUBKEY_B64","CREATOROS_UPDATE_BASE_URL")) {
        $v = [Environment]::GetEnvironmentVariable($k, "Process")
        if ([string]::IsNullOrWhiteSpace($v)) {
            Write-Err2 "env $k 空,先补 $envFile"
            exit 1
        }
    }
    Write-Ok "env 已加载(4 项齐)"
}

# ── 主流程 ─────────────────────────────────────────────────────────────

if ($Build) {
    Load-EnvFile
    # 激活 Node 25(fnm)。fnm env --shell=powershell 返回 setter 脚本,exec 之后
    # 本 shell 的 node/npm 就切到 25。若全局 node 已是 25 则 fnm 也无害。
    if (Test-Cmd fnm) {
        Write-Step "激活 fnm Node 25"
        $fnmSetup = fnm env --shell=powershell --use-on-cd | Out-String
        Invoke-Expression $fnmSetup
        # 显式切 25(若 default 25 也是这行)
        try { fnm use 25 } catch { Write-Warn2 "fnm use 25 失败(可能已在 25)" }
        $activeNode = (node --version) 2>&1
        Write-Ok "当前 node = $activeNode"
    } else {
        Write-Warn2 "fnm 不在 PATH,跳过版本切换(依赖全局 Node 25)"
    }

    Write-Step "跑 desktop 打包(release.mjs 全链)"
    Push-Location (Join-Path $repoRoot "frontend")
    try {
        # PowerShell 5.1 里 $ErrorActionPreference=Stop 会把 native command 的 stderr
        # 当异常终止(NativeCommandError):Next.js `Turbopack build encountered N warnings`
        # 写 stderr → 整个脚本挂。改成 Continue,让 node 的 exit code 决定成败。
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & node scripts/desktop/release.mjs
            $rc = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $prevPref
        }
        if ($rc -ne 0) {
            Write-Err2 "打包失败(exit $rc)"
            exit $rc
        }
        Write-Ok "打包完成"
        Write-Host "[bootstrap] 产物:"
        $bundle = Join-Path $repoRoot "frontend\src-tauri\target\release\bundle"
        Get-ChildItem -Path $bundle -Recurse -Include "*setup.exe","*.msi","latest.json" -ErrorAction SilentlyContinue |
            Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
    } finally {
        Pop-Location
    }
    exit 0
}

# 现状总结
$rustOk = Check-Rust
$vsOk = Check-VSBuildTools
$nodeOk = Check-Node25
$pnpmOk = Check-Pnpm
$secretsOk = Check-Secrets

Write-Host "`n[bootstrap] === 现状 ===" -ForegroundColor Magenta
Write-Host "  Rust:              $(if($rustOk){'✓'}else{'✗ 待装'})"
Write-Host "  MSVC Build Tools:  $(if($vsOk){'✓'}else{'✗ 待装'})"
Write-Host "  Node 25:           $(if($nodeOk){'✓'}else{'✗ 待装'})"
Write-Host "  pnpm 10.32.1:      $(if($pnpmOk){'✓'}else{'✗ 待装'})"
Write-Host "  Build secrets:     $(if($secretsOk){'✓'}else{'✗ 待补 '+$envFile})"

if ($Check) {
    if ($rustOk -and $vsOk -and $nodeOk -and $pnpmOk -and $secretsOk) {
        Write-Ok "全齐,可以直接 -Build"
        exit 0
    } else {
        Write-Warn2 "有缺项,-Check 仅检查不装;去掉 -Check 参数装齐"
        exit 1
    }
}

# 装
if (-not $rustOk) { Install-Rust }
if (-not $vsOk)   { Install-VSBuildTools }
if (-not $nodeOk) { Install-Node25 }
if (-not $pnpmOk) { Install-Pnpm }
if (-not $secretsOk) { Setup-Secrets }

Write-Host "`n[bootstrap] === 完成 ===" -ForegroundColor Magenta
Write-Host "1. **开新 PowerShell**(让 PATH / Node 25 生效)"
Write-Host "2. 补全 $envFile 里空着的 secret:"
Write-Host "     - TAURI_SIGNING_PRIVATE_KEY: 跑 pnpm -C frontend node scripts/desktop/updater-keygen.mjs 生成后填"
Write-Host "     - CREATOROS_VERDICT_*: 跑 pnpm -C frontend node scripts/desktop/verdict-keygen.mjs 生成后填两个"
Write-Host "3. cd $repoRoot; pnpm install --frozen-lockfile"
Write-Host "4. .\tools\bootstrap-local-build.ps1 -Check   # 全 ✓ 才继续"
Write-Host "5. .\tools\bootstrap-local-build.ps1 -Build   # 一键打包(首次 ~45 min)"
