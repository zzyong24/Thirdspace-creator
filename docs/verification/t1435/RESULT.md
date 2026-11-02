# T-1435 双端官方安装包验收完成

Mac Apple 芯片与 Windows x64 安装包均已成功生成、下载并核验。两者来自同一冻结提交；原始日志没有 runner error 或失败退出，原生成功标志齐备。

- 安装包源提交、触发时 main：`b451b027433f5f1ed38d252f1742d9ee7d8f1fad`。
- 流水线：[41508284903](https://github.com/zzyong24/Thirdspace-creator/actions/runs/41508284903)，`only=all`、`validate_installers=true`。
- frontend/package.json、tauri.conf.json、Cargo.toml、Cargo.lock 四处版本均为 `1.2.0`。
- 机器可读交付清单：[DELIVERY.json](DELIVERY.json)；完整 CI/原始日志审计：[run-41508284903-audit.json](run-41508284903-audit.json)。两端 release attestation 的 source、产品身份、安装包字节数与本地 SHA256 均已逐项匹配。

## 安装包

| 平台 | 本地安装包 | 字节数 | SHA-256 |
| --- | --- | --- | --- |
| macOS Apple 芯片 | [CreatorOS_1.2.0_aarch64.dmg](/Users/zyongzhu/Downloads/CreatorOS-builds/41508284903/mac/CreatorOS_1.2.0_aarch64.dmg) | 887811054 | `c05dd72f4842043085d1d36f82f18da319a1de3128cddda9d6dbc20c0435137b` |
| Windows x64 | [CreatorOS_1.2.0_x64-setup.exe](/Users/zyongzhu/Downloads/CreatorOS-builds/41508284903/windows/CreatorOS_1.2.0_x64-setup.exe) | 913251151 | `270c32c15763d880eca6525bbe4b7e653bbdd834fb8b18a703fd32353ff95b27` |

Mac 本地 `hdiutil verify` exit 0 / VALID；Windows 本地 `7zz t` exit 0 / Everything is Ok。Windows PE certificate table offset/size 均为 0，**Windows 未签名（用户已接受）**；sidecar/updater 签名不等于 Authenticode。

## 要求与实际证据

| 要求 | 实际证据 | 结论 |
| --- | --- | --- |
| 既有根私钥接入 CI，秘密环境剥离、权限、失败清理 | step 限定 Secret `CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM`；release-ci 7项回归、独立 REVIEW；两端本轮原始日志根预检通过、临时密钥清理步骤成功 | 通过 |
| 固定信任根与104B签名协议 | 两端本轮日志有最终tar 104B签名；Rust构建/安装原签名门保留。Windows实际安装保留的签名为104字节，归档/签名字节与本轮输入一致 | 通过 |
| 包含 Chromium、原 updater 产物与签名 | 两端原生检查通过；原始日志明确生成 macOS `CreatorOS.app.tar.gz.sig`、Windows `CreatorOS_1.2.0_x64-setup.exe.sig` | 通过 |
| macOS Developer ID、公证、staple、Gatekeeper、DMG内应用 | [mac-41508284903-result.log](mac-41508284903-result.log)：Apple Accepted、T-709成功，app及DMG内应用严格签名有效 | 通过 |
| macOS可搬运归档和展开后签名 | 同日志T-705：零AppleDouble，展开后的server.app严格签名有效 | 通过 |
| macOS真实启动与主页面加载 | 同日志T-663实际成功标志 | 通过 |
| Windows完整prepared production runtime，零node_modules/链接 | [原生安装报告](final/windows/official-package-results.json)：12817文件、零模块目录/链接；[实际安装包内tar枚举](windows-41508284903-tar-inventory.json)：14349条目、零模块目录/链接 | 通过 |
| 下载包内tar就是实际安装使用的归档 | 本地提取gzip SHA256与原生安装资源SHA256同为 `d78722dbfe468dc412f59042df31736354d002f5aea3f6e88039b1565de693e7`，均874870032字节 | 通过 |
| Windows真实安装、verdict只读泄漏检查、页面加载、CLI、卸载 | [windows-41508284903-result.log](windows-41508284903-result.log)及完整原始日志：原生物化/主页面/官方卸载成功标志齐备；mainPageLoadFinished与cliHelpVerified均true | 通过 |
| Windows真实HTTP CSP，不能拿marker布尔值冒证据 | [实际响应](final/windows/desktop-csp.json)、[逐字比较](final/windows/CSP_CHECK.json)：HTTP200，与DESKTOP_RELEASE_CSP完全一致 | 通过 |
| 同源、同产品、实际下载包匹配 | 两端[产品身份与release attestation](final/)：source为b451b0274、productRef/projectKey均creatoros、appIdentifier为cloud.aitongban.creatoros；安装包哈希及字节数匹配 | 通过 |
| 实际回归与独立审查 | 六组170测试通过；production计划/原Git迁移身份17通过；依赖图本机22通过/1项Windows专属跳过，而本轮Windows原生23全部通过、0跳过；timeout-policy verify exit0。各修复独立前后审无阻塞 | 通过 |

Windows本轮原生安装耗时27.392秒，升级场景首次主页面加载94.385秒。它超过45秒参考值，仍处于现有120秒硬验收门内，原警告保留；这不是所有用户机器的性能承诺。

## 修复与回归

- CI wrapper从step Secret写仓库外受限临时文件，固定根预检后只转交路径；原始PEM从环境移除，finally/always清理。已签capsule不要求新增私钥，信任根及签名协议未换。
- Windows pnpm截短Pi源目录按真实manifest定位，保留完整可搬运依赖闭包；Chromium ZIP改用系统tar.exe，保留下载哈希校验。
- Codex原生沙箱资源按固定vendor尾路径及锁定name/version/os/cpu分类；搬运后的pNNNN路径还必须匹配worker图schema/root/原manifest SHA256/alias和execution-worker依赖边。其它安装包及递归污染仍拒绝，沙箱未移除。
- 大tar目录采用独占临时文件分块扫描，避免64MiB stdout限制；真实超64MiB目录RED→GREEN，末尾污染/Finder/坏归档/缺tar仍失败。
- Windows正式包验证并复用本轮prepared closure；源构建传播正式CSP/Growth公钥配置，最终复制/CLI/结构检查后绑定clean身份。来源/字节/资源失配明确要求重新准备，不再悄悄回退百万文件full builder。

聚焦验证命令：

```bash
pnpm -C frontend exec vitest run scripts/desktop/build-sidecar.test.mjs scripts/desktop/release-ci.test.mjs scripts/desktop/package-local.test.mjs scripts/desktop/desktop-release-workflow.test.mjs scripts/desktop/notarize.test.mjs scripts/desktop/tauri-signing-config.test.mjs
node --test tools/windows-closure-rat/build-production-closure.test.mjs
node --test tools/windows-closure-rat/worker-dependency-graph.test.mjs
node tools/timeout-policy/verify.mjs
python3 docs/verification/t1435/audit_ci.py 41508284903
git diff --check
```

原始RED、GREEN及独立评审分别保存在REVIEW、PI_REVIEW、CODEX_RESOURCE_REVIEW、TAR_LIST_REVIEW、PRODUCTION_REUSE_REVIEW、SCOPED_CODEX_REVIEW与对应日志中。收尾 `pmem sync` 成功；`reconcile --profile quick --read-only` 实际结果为0错误、2项既有范围外警告（BACKLOG大小及T-1420长行），见final-pmem.log与final-reconcile.log。完整全产品验证未执行。

## 历史失败保留

| run | 实际结果 |
| --- | --- |
| 41448308905 | 双端缺本地默认根私钥路径，未出包 |
| 41454572792 | Mac成功；Windows根预检后缺Pi运行时 |
| 41465727989 | Windows通过Pi/CfT后误拦Codex原生setup；修复候选就绪后剩余旧构建取消 |
| 41473263553 | Mac成功；Windows tar目录读取超同步stdout缓冲上限 |
| 41484713756 | API绿色，原始日志却有安装结构违规（10422个node_modules）及120秒主页面加载失败；未作为Windows交付 |
| 41503237730 | prepared结构已为零模块；搬运后的Codex沙箱误拦。新修复冻结推送后取消已被替代旧Mac任务，未冒称该run双端成功 |
| 41508284903 | 同一b451b0274候选双端全部所需原生门通过，实际产物已下载校验 |

发布范围为Actions制品和本地交付。额外全产品质量验证仍按原流程独立，未创建tag/GitHub Release、未公开分发、未更改Growth生产配置或向真实用户放量；release attestation中的publishAuthorized=false保留。本报告证明本任务的构建与原生安装验收，不冒称全产品/200微秒性能验证。
