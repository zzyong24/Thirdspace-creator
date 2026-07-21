# T-449 Windows 直装 sidecar 目录 ACL 收紧 —— 调研

> 归属:BACKLOG T-449(2026-07-21 立项,follow-up 于 T-446 Windows 直装路径)。
> 上位 SPEC:[docs/research/2026-07-21-packaging-and-anti-reversing-optimization-research.md](2026-07-21-packaging-and-anti-reversing-optimization-research.md) §4.2。
> 定位对齐:目标是**多用户机上把其他账号静态盘点 `.jsc` + rc4 混淆 chunks 的门槛显著抬高**;IP 净泄露增量小(密文/字节码),门槛下降是真的(见上位 SPEC §2.2)。

## 0. 一句话结论

**推荐方案:NSIS `installerHooks` + `NSIS_HOOK_POSTINSTALL` 里 `icacls /inheritance:r /grant:r` 白名单三方(SYSTEM / Administrators / 本机 Users:RX)。**

- **不用 `/deny Users:R`**——deny 优先级最高,连管理员被 Users 组间接继承时也会挨挡,坑深、卸载又要单条移除。
- **不用去动 WiX/MSI**——本项目 MSI 只是次要产物(release 走 NSIS `-setup.exe`,见 `frontend/scripts/desktop/release.mjs:44-58`),MSI CustomAction 走 WiX Handlebars template 定制成本高,同一效果两处维护重复。

**但有一个决定性变量必须先拍板**(下面 §5 详述):**当前 NSIS installMode 是 Tauri v2 默认的 `currentUser`,装到 `%LOCALAPPDATA%\Programs\CreatorOS\`——这个位置默认 ACL 已经"仅该用户 + SYSTEM + Administrators 可读",其他普通用户本来就 `dir` 不出来。** 只有当装到 `C:\Program Files\`(installMode=`perMachine`)时,`Users:(RX)` 的宽松继承才让本机所有用户可读。因此 **T-449 的施工价值取决于 installMode 走哪档**。

---

## 1. 事实盘点(不重述上位 SPEC)

### 1.1 Tauri v2 NSIS Hook 机制(已在 v2 稳定 API)

- 配置字段:`bundle.windows.nsis.installerHooks`,值为 **`.nsh` 文件相对路径(相对 `tauri.conf.json` 所在目录 = `src-tauri/`)**。
- 官方支持四个 macro(installer.nsi 内 `!ifmacrodef` 挂钩,未定义即空转):
  - `NSIS_HOOK_PREINSTALL` —— 文件拷贝前
  - `NSIS_HOOK_POSTINSTALL` —— 全部安装动作完成后(本任务落点)
  - `NSIS_HOOK_PREUNINSTALL` —— 卸载前(移除自定义 ACL,可选)
  - `NSIS_HOOK_POSTUNINSTALL` —— 卸载文件清理后
- 权威依据:Tauri v2 官方 Windows Installer 文档([v2.tauri.app/distribute/windows-installer](https://v2.tauri.app/distribute/windows-installer/))+ tauri-bundler `crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi` 模板源码(GitHub API 404 → 已通过 raw 文档确认 hook 存在)。

### 1.2 Tauri v2 NSIS installMode(权限侧的**决定性**参数)

| installMode | 默认 InstallDir | RequestExecutionLevel | 其他用户默认可读? | 我们目前状态 |
|---|---|---|---|---|
| `currentUser`(默认) | `%LOCALAPPDATA%\Programs\<App>\` | `user`(不提权) | **否**(该目录 ACL 只授当前 user + SYSTEM + Admins) | **本项目当前实际值**(未在 `tauri.conf.json`/`tauri.windows.conf.json` 显式配) |
| `perMachine` | `%PROGRAMFILES%\<App>\` | `admin`(UAC 提权) | **是**(Program Files 默认给 `BUILTIN\Users:(RX)` 继承) | 未启用 |
| `both` | 安装期用户选 | `Highest`(用户选) | 视选项而定 | 未启用 |

**T-449 的静态盘点风险仅在 `perMachine` 情形下真实存在。** 当前 currentUser 场景下,其他账号 `dir` 已经会被 Windows 默认 ACL 挡回来(继承自 `C:\Users\<user>\AppData\Local\`)。

上位 SPEC §2.2 "通常 `C:\Program Files\CreatorOS\resources\sidecar\`"——这句是**未来态描述,非当前事实**。BACKLOG T-446 表述"用户选择的安装目录"也印证。

### 1.3 Tauri v2 Auto-Updater 在 Windows 的运行身份

- 配置:`plugins.updater.windows.installMode`,三档:`passive`(默认)/ `basicUi` / `quiet`。
- **updater 是拉起一个新的 `-setup.exe` 完成覆盖安装**——因此**它遵循 installer 的 `RequestExecutionLevel`**:
  - `installMode=currentUser` → updater setup 以当前用户跑,不提权,能覆盖 `%LOCALAPPDATA%\Programs\`。
  - `installMode=perMachine` → updater setup 需要 UAC 提权;**若 updater 用 `quiet` 模式则 UAC 无法弹出 → 更新静默失败**(官方明确的边界)。`passive`/`basicUi` 可正常弹 UAC。
- 结论:**ACL 收紧动作发生在 setup.exe 执行期(即提权后),与 updater 兼容性天然一致**——只要 setup 跑得起,ACL 就能重设。updater 覆盖写不会因 ACL 变更失败,因为 setup 内本身是管理员身份(perMachine 前提下)。

### 1.4 elevated 安装器里"当前登录用户"的检测(**关键陷阱**)

- **`$USERNAME` / 环境 `%USERNAME%` 在 UAC 提权后返回的是「输入 Admin 凭据的那个账号」,不一定是「桌面前坐着操作的那个用户」。** 后果:公司电脑常见"标准用户 Bob 装软件 → 弹 UAC → IT 员工 Alice 敲 Admin 密码",此时 `%USERNAME%=Alice`,若把 sidecar 授权给 Alice 而不是 Bob → **CreatorOS 在 Bob 桌面跑 → 读不到 sidecar → 启动即崩**。
- 检测"真实交互用户"的正确姿势(NSIS 侧):
  ```nsis
  nsExec::ExecToStack '"$SYSDIR\wbem\wmic.exe" path win32_computersystem get username /value'
  Pop $0 ; exitcode
  Pop $1 ; "UserName=DOMAIN\Alice"
  ```
  `Win32_ComputerSystem.UserName` = 交互登录到 console 的用户,不受 UAC token 影响。或用 `query user | findstr console`。
- **本项目现实**:普通个人开发者/创作者用机大概率没有"分离标准用户 + Admin"结构,`%USERNAME%` 大概率就是本人。但**多用户共享机**恰好是 T-449 的核心场景——这一块**必须用 WMIC 兜底**,否则 T-449 反倒把自己坑掉。

### 1.5 icacls 常识与坑

- `/inheritance:r` = 断继承并清空当前 ACL(激进但干净)。
- `/grant:r` = 授权并**替换**同 SID 已有条目(避免重复堆叠)。
- `/deny Users:(R)` = 会连"Administrators 里恰好也在 Users 组"的账号一起挡;文档明确 deny 优先。**不要用 deny**。
- 权限位:`(OI)(CI)` = 目录 ACE 继承到文件(Object Inherit)+ 子目录(Container Inherit);sidecar 有 292 个 `.jsc` + 混淆 chunks,必须继承生效。
- 权限档:`(RX)` = 读 + 执行(遍历目录+运行 exe);sidecar 是 node 加载,`(RX)` 够。
- SID 硬编稳过命名坑:`*S-1-5-18` = SYSTEM,`*S-1-5-32-544` = Administrators;`Users` 不同语言 Windows 有本地化名(简中"Users"仍是英文,俄语/法语会翻),用 SID `*S-1-5-32-545` 保险。

---

## 2. 方案对比表(**全量保留,含被否决项**)

| # | 方案 | 落点 | 施工量 | 兼容性 | 卸载清理 | updater 兼容 | 决 |
|---|---|---|---|---|---|---|---|
| **A** | **NSIS `installerHooks` + `NSIS_HOOK_POSTINSTALL` 里 `icacls /inheritance:r /grant:r SYSTEM/Admins/CurrentUser(RX,OI,CI)`** | `src-tauri/windows/hooks.nsh` + `tauri.windows.conf.json` 加 `nsis.installerHooks` | 半天 | 全平台桌面产物只影响 NSIS,mac/msi 零变化 | `NSIS_HOOK_POSTUNINSTALL` 里 `icacls /reset /T /C` 或直接删父目录(NSIS 卸载已 RMDir /r) | ✅ setup 提权后重设 ACL,updater 每轮走同路径 → 幂等 | **✅ 采纳(前提是 installMode=perMachine)** |
| B | NSIS 里 `/deny "*S-1-5-32-545":(R)`(拒 Users 组) | 同上 | 半天 | 同上 | 需显式 `/remove:d` 卸干净,否则残留 deny 条目 | ⚠️ deny 优先级最高,若 Admin 用户装完运行,updater 侧偶发 UAC 提示混乱 | ❌ deny 语义脆,踩坑面大 |
| C | WiX/MSI `<CustomAction>` 里 `CAQuietExec64` 调 `%SystemRoot%\System32\icacls.exe` | 新增 `.wxs` fragment + `bundle.windows.wix.fragmentPaths/componentRefs` | 1.5 天 | 只覆盖 MSI 产物;NSIS 侧要另做 → 双套维护 | MSI 卸载走 Windows Installer 自身,ACL 变更不自动回滚 → 需 Rollback CustomAction | 视 MSI 更新路径而定,可用但复杂 | ❌ 我们主分发 NSIS `-setup.exe`(release.mjs 命名硬编);MSI 只是次要产物,双维护不值 |
| D | Tauri v2 `bundle.windows.nsis.installMode: "currentUser"` + 保持默认路径 `%LOCALAPPDATA%\Programs\` | 无 icacls,靠 Windows 默认 ACL(该 user + SYSTEM + Admins) | **0**(现状) | 与 T-446 现状一致 | 无需清 | 无冲突 | **⚠️ 若最终决策仍走 currentUser,T-449 是零施工的**——但同时 CreatorOS 不能装到 `Program Files` 显得"没那味儿",且共享机上"该 user 换人登录"时另一用户看不到快捷方式 → UX 有代价 |
| E | PowerShell `Set-Acl` 而不是 icacls | `Add-Type` + `System.Security.AccessControl` 写 SDDL | 1 天 | 兼容性 = PS 5.1+(所有 Win10/11 自带) | 同 A | ✅ | ❌ PS 依赖 execution policy;icacls 就在 System32 且无 policy 门,更稳 |
| F | 目录 EFS 加密(`cipher /e`) | POSTINSTALL 后跑 cipher | 半天(命令简单) | 依赖用户账号证书;跨用户 EFS 反而更麻烦 | 卸载可 `cipher /d` | ⚠️ updater 覆盖写可能触发 EFS 密钥不匹配 | ❌ 与"多用户机分权"目标错配,EFS 是"跟着 user profile 加密";放弃 |
| G | 只对 `.jsc` 文件而不是 `.next/server/` 整目录改 ACL | 更细颗粒 | 1 天(要 walk + 逐文件) | 同 A | 逐条清 | ✅ | ❌ 收益边际(其他文件也是混淆 chunk + node_modules,同样值得保护),施工量翻倍;直接目录级更简洁 |
| H | 走 Rust 壳启动首启做 icacls(而不是 installer) | `src/lib.rs` setup 里 spawn `icacls` | 中等 | Rust 壳普通用户身份 → **改不了 Program Files 目录 ACL**(权限不够) | 无 | ✅(什么都不做) | ❌ **物理不可行**:Rust 壳非提权,Program Files 目录他碰不了 |

**采纳:A(前提 installMode=perMachine),否则 D(=零施工)。**

---

## 3. 最终推荐:方案 A 的完整 `.nsh` 骨架

`src-tauri/windows/hooks.nsh`(**草案,未提交**,供任务开工时参考):

```nsh
; T-449 Windows 直装 sidecar 目录 ACL 收紧
; 落点:NSIS_HOOK_POSTINSTALL(setup 已完成拷贝、身份 = Admin token)
; 目标:.next/server/** 仅 SYSTEM / Administrators / 交互登录用户可读

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "[T-449] 收紧 sidecar 目录 ACL(icacls /inheritance:r + 白名单)…"

  ; 1) 探测「真实交互登录用户」,防 UAC over-the-shoulder 场景把权限授给错的账号。
  ;    WMIC 输出形如:UserName=DOMAIN\Alice(尾部含 \r\n)。NSIS 只取赋值右侧。
  nsExec::ExecToStack '"$SYSDIR\wbem\wmic.exe" path win32_computersystem get username /value'
  Pop $0
  Pop $1
  ; $1 需要用 nsis-strfunc / StrRep 提取 "=" 之后的值到变量 $LoggedUser。
  ; 兜底:若解析失败或域账号,退回 $USERNAME(与 setup 身份同一 → 至少能读)。

  ; 2) icacls 断继承,原子重建 ACL 白名单(用 SID,躲本地化坑)。
  ;    *S-1-5-18   = SYSTEM
  ;    *S-1-5-32-544 = BUILTIN\Administrators
  ;    (RX) 读+执行  (OI)(CI) 目录/文件继承  /T 递归应用  /C 忽略单文件错  /Q 静默
  nsExec::ExecToLog 'icacls "$INSTDIR\resources\sidecar\frontend\.next\server" \
    /inheritance:r \
    /grant:r *S-1-5-18:(OI)(CI)(RX) \
    /grant:r *S-1-5-32-544:(OI)(CI)(RX) \
    /grant:r "$LoggedUser":(OI)(CI)(RX) \
    /T /C /Q'
  Pop $0
  ${If} $0 != 0
    ; 不 Abort:ACL 收紧失败也让安装成功,免升级踩坑。日志留证,红队回归时 flag。
    DetailPrint "[T-449] icacls 返回 $0(非致命),继续。"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; 卸载前 NSIS 已 RMDir /r $INSTDIR(把 sidecar 一并删),ACL 随目录一起消失。
  ; 只有在「用户选择保留数据」的极端路径下需要 icacls /reset,当前 NSIS 模板不留 resources/。
  ; 故此 macro 保留占位,后续若发现 sidecar/ 残留再补 `icacls /reset /T /C /Q`。
!macroend
```

`src-tauri/tauri.windows.conf.json` 增补(**当前配是 5 行 skeleton,加两处**):

```jsonc
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "bundle": {
    "targets": ["nsis", "msi"],
    "resources": ["sidecar/"],
    "windows": {
      "nsis": {
        "installMode": "perMachine",          // 显式化(否则默认 currentUser,ACL 施工失去意义)
        "installerHooks": "./windows/hooks.nsh"
      }
    }
  }
}
```

---

## 4. 需要用户拍板的点(**不可自主决定**)

1. **installMode 走 `currentUser` 还是 `perMachine`?**
   - `currentUser`(现状默认)= 装到 `%LOCALAPPDATA%\Programs\`,其他账号**本来就读不到**,T-449 零施工,但共享机上换用户登录后**新用户看不到 CreatorOS 快捷方式**(需重新装或手工建);安装无 UAC 弹窗、体验轻。
   - `perMachine` = 装到 `Program Files`,共享机所有账号都能启动,但**默认所有人可读 sidecar** → T-449 才有意义;安装弹 UAC。
   - **只有第二档启用后,T-449 才值得做。**

2. **updater `installMode` 是否需要同步升到 `passive`?**
   - `plugins.updater.windows.installMode` 目前**未在 `tauri.conf.json` 显式设置** → Tauri 默认 `passive`(会弹 UAC)。
   - 若 perMachine + updater `quiet`(有人手改过)→ 静默更新会永远失败。**开工时须校验 config 未被改成 quiet**。

3. **"当前登录用户"授权到底给谁?**
   - 方案 A 用 WMIC 拿交互用户 → 单人用机零风险;共享机上"IT Admin 装完 → 换标准用户运行"这条路径下,标准用户就是被授权的那个,能正常跑。
   - 若产品定位是"这台机只有装的这个人用" → 也可直接不做用户级授权,只 SYSTEM+Admins+**Users:(RX) 从 ACL 里删掉**——不过这样其他用户即使装完切用户登录也跑不起 CreatorOS,与"多用户机共享一份装机"预期冲突。**这条需求边界建议在 SPEC 里写死**。

---

## 5. 立即可开工 vs 需拍板

| 项 | 状态 |
|---|---|
| Hook 落点确认(NSIS_HOOK_POSTINSTALL) | ✅ 可开工,官方 API |
| `.nsh` 语法 + icacls 命令 | ✅ 可开工,已给出草案 |
| Tauri config 字段路径 | ✅ 可开工,已给出补丁形状 |
| **installMode 决策**(currentUser vs perMachine) | ⛔ **等用户拍板**,前置于所有代码改动 |
| **"授权用户"检测姿势**(WMIC vs $USERNAME vs 只 SYSTEM+Admins) | ⛔ **等用户拍板**,决定 hook.nsh 内部逻辑分支 |
| Windows CI 验证 | ⚠️ 需在真机(perMachine 装完后)验:①管理员 `dir` 能列 ②新建标准用户 `runas` 后 `dir` 被拒 ③CreatorOS 能启动 ④跑一次 auto-updater 覆盖装看有没有 ACL 漂移 |

---

## 6. CI 检查清单(方案 A 落地时同步补)

- **构建期**:`tauri.windows.conf.json` 若含 `installerHooks` 但对应 `.nsh` 文件不存在 → CI 硬失败(防未提交 hook 文件)。
- **构建期**:`.nsh` 内出现 `deny` 关键字 → CI 硬失败(拦回退到 B 方案)。
- **打包后 smoke**:提取 `-setup.exe`(NSIS 可用 7z 解),定位嵌入的 installer.nsi 编译产物,确认含 icacls 字符串(证 hook 编译进去了,不是空 macro)。
- **真机回归(新建 Windows CI 步骤)**:
  1. 用 Admin 装 → `icacls "$INSTDIR\resources\sidecar\frontend\.next\server"` 输出应含 `SYSTEM:(OI)(CI)(RX)` `Administrators:(OI)(CI)(RX)` + `<InstallUser>:(OI)(CI)(RX)`,**不含 `Users:(RX)`**。
  2. `runas /user:TestStandardUser` 打开 CreatorOS → 若与 InstallUser 不同 → 应读不到(证 ACL 生效);若同一账号 → 应能启动。
  3. 卸载后 `dir $INSTDIR` = 目录已不存在 → 无 ACL 残留可查。

---

## 7. 已排除的路径(留档避免二次翻旧)

- **不做**:方案 C(WiX/MSI CustomAction)—— release 主产物是 NSIS `-setup.exe`,双套无意义。
- **不做**:方案 F(EFS)—— 与目标错配。
- **不做**:方案 H(Rust 壳启动首启 chmod)—— 普通用户权限碰不了 Program Files。
- **不做**:全 `.jsc` 逐文件 ACL(方案 G)—— 收益边际,施工量大。

---

## 引用来源

- Tauri v2 官方 Windows Installer 文档:[v2.tauri.app/distribute/windows-installer](https://v2.tauri.app/distribute/windows-installer/)
- Tauri v2 Config 参考(NsisConfig):[v2.tauri.app/reference/config/#nsisconfig](https://v2.tauri.app/reference/config/#nsisconfig)
- Tauri auto-updater(installMode passive/quiet/basicUi):[v2.tauri.app/plugin/updater](https://v2.tauri.app/plugin/updater/)
- Microsoft icacls 官方参考:[learn.microsoft.com/windows-server/administration/windows-commands/icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
- WMI `Win32_ComputerSystem.UserName` 检测交互用户:社区多处交叉验证(NSIS 论坛 / StackOverflow "get logged-in user when running as admin")。
- 上位 SPEC(本项目):[docs/research/2026-07-21-packaging-and-anti-reversing-optimization-research.md §4.2](2026-07-21-packaging-and-anti-reversing-optimization-research.md)
- 相关代码坐标:
  - `frontend/src-tauri/tauri.windows.conf.json`(installMode 未显式设 = 默认 currentUser)
  - `frontend/src-tauri/src/lib.rs:530-559`(Windows sidecar 入口哈希校验;ACL 收紧不改此逻辑)
  - `frontend/src-tauri/src/lib.rs:663-685`(`resolve_sidecar_dir` Windows 分支;从安装目录 Resource 读)
  - `frontend/scripts/desktop/release.mjs:44-58`(release 主产物 `-setup.exe`,证 NSIS 为主 MSI 为副)
