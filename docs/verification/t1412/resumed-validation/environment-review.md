# T-1412 恢复执行后的外盘验证环境独立审核

复核日期：2026-10-25。复核者：独立审查子代理 `/root/t1427_contract_review`。本次只读新环境、公开构建源码、资产字节和已有收据，仅新写本文件；未执行测试、构建、网络请求或读取秘密值，未修改 state、控制面、产品或其他证据。

**结论：未发现当前静态准备的阻断，可以继续既有范围内的打包与真实验证。该结论不是 full 放行或全部验收 PASS。** 新环境已经实拷并独立核验，不再借用已删除旧工作树/旧 privateRoot 的运行身份。CFT 预编译的真实成功已补核；固定 package-local 正在由 root 执行，尚没有本报告确认的合法最终资源、安装或 full 结果。

## 当前绑定

- 工作树及实际 HEAD：`/Volumes/T7-MacData/creatoros-validation-20261025-58l1q3bd/Thirdspace-creator`，`f9e5e5ece06d7d86dbb5bd38db76d18cc2437d84`，与 state.commit 一致。
- 外盘私有根：`/Volumes/T7-MacData/creatoros-validation-20261025-58l1q3bd`。
- 短 TMPDIR：`/private/tmp/cos1412-dudvlycw`；启动 owned PG 和最终 full 时须保持这个真实路径。
- Cargo 输出：工作树自己的 `frontend/src-tauri/target`，位于外盘且匹配固定 package-local、manifest、打包收尾脚本的路径约定。
- 实际 `reconcile.config.json` SHA：`c8c13b6788b08f48aa4f154bcbdd0d1f74cf72a0e3e4863788e9b4aaa9cb8ffc`，已与上述提交逐字节比较一致。

## 独立核验结果

| 对象 | 实际只读核验 |
| --- | --- |
| 跨卷六组 node_modules | 源/目标设备不同，按真实复制判断，不称 APFS 同卷克隆。六个根均为独立目录。重新扫描 4,998 个链接：无绝对目标、断链或解析后外逃。 |
| `.bin` | 重新扫描 265 个普通脚本，无主树绝对前缀残留。172 个改动逐项验证：当前 SHA 等于 afterSha，反向替换等于 beforeSha，源文件仍等于 beforeSha；旧前缀只在 export NODE_PATH 的依赖路径中，mode 保持，源目标 inode 身份不同。 |
| 原生和包代码 | 66 个原生文件逐项匹配原冻结 nativeBefore 及当前主树 SHA。HyperFrames 59 个、Pi 611 个包普通文件（排除嵌套 node_modules）与主树字节/路径集合一致。实际 HyperFrames CLI SHA 仍为 `1250669d951c4a462b7e4b5d574256f61978797ba3b941cc8491d620e3ef925b`。 |
| 锁及补丁 | pnpm-lock、HyperFrames patch、Pi patch 均与当前主树及候选提交字节一致。两份 Cargo.lock 仍分别为 `c13d3e59a27b4ebff91696c1dbdd37b165dc77bd8ac7f1dd0dd8be9bdc41910d`、`a2aea4e2b53e7e9aaad471e7fe8daffb450348f83b27e651e0204de1e0546613`。 |
| Cargo 资产 | 1,184 个文件逐项核源/目标 SHA、非 symlink、目标身份独立；相对路径与 SHA 集合完全等于先前精确离线清单（561 个归档、622 个 sparse index、1 个公共 registry 元数据）。源范围限 registry；未读用户 Cargo config/credentials。 |
| 浏览器与打包资产 | 357 个既有浏览器文件逐项匹配历史资产 SHA；私有 HOME 下 Chromium 的 334 个普通文件及 5 个内部链接逐项匹配，链接没有指回用户缓存。工作台 CfT 149.0.7827.155 归档及静态 ffmpeg/ffprobe 三个实拷文件与源和新收据 SHA 一致。Playwright 1223 与工作台 149 两套资产分别记录，未互相冒充。 |
| LED-061 | 工作树和主树的两份历史基线均匹配已审双 SHA；仍标历史基线，不是本轮测试观测。 |
| 私有目录与配置入口 | privateRoot、HOME、CARGO_HOME、短 TMPDIR 均为 uid 501、0700、非 symlink，realpath 与声明一致。npm 用户/全局及 Git 全局配置文件均为 0 字节。仅检查文件名：根及五工作区的活动开发/测试/生产 `.env` 变体均未发现；从当前工作树向上及 CARGO_HOME 未发现活动 Cargo config/credentials。未读取秘密正文。 |
| full 的声明环境 | 已核 state.env 没有 RUSTUP_HOME、TAURI_CONFIG、通用数据库变量、NODE_PATH/NODE_OPTIONS 或签名/模型秘密；使用 direct RUSTC/RUSTDOC，CARGO_NET_OFFLINE=true。浏览器变量指向已核的纯资产缓存。state.json 字节在本次核验期间保持不变。 |

`offline-relink.receipt.json` 真实退出 0，processClosed=true、signal=null、remainingOwnedGroupMembers=[]，无预算耗尽/外部中止。没有因为 pnpm 退出 0 就推定 shim 正确：本审核另行完成了上表的字节和链接检查。dependency-copy 中记录的首轮验证脚本缩进匹配失败仍保留为准备历史，不改写为产品测试失败或通过。

## 已补核的执行收据及限度

1. **CFT no-run。** 原固定 cargo 实际 argv 为 `test --manifest-path frontend/src-tauri/Cargo.toml --locked --offline --features workbench-browser --lib --test workbench --no-run`；在上述工作树自然退出 0，elapsedMs=176764，processClosed=true，无信号、预算耗尽或残留组成员。日志末尾确有 lib 与 workbench 两个 test executable。只证明这个本机编译闭包成功，没有执行五项 CFT、ignored fixture 或浏览器交互。两个原 fixture 使用的单独 TAURI_CONFIG 空 resources/externalBin 与预编译方案相符；state 的 full 环境没有该覆盖。
2. **打包前置。** 四文件、58 tests passed，实际收据退出 0 且完整关闭；不是 package-local 已完成、资源已签或 App 已安装。
3. **LED-043。** 原串行链实际 Node test 1 pass/0 skip，frontend 12 pass，backend 133 pass；总命令退出 0，完整关闭。仅覆盖这一条原链，不能据此给其余 lesson 代签。

Cargo 清单仍诚实标 allLockTargetsComplete=false：跨所有锁目标的 151 个版本没有本地缓存。当前 no-run 成功已经消除了“这个本机 fixture 编译是否缺包”的不确定性；不能再拿这 151 项泛称此次预编译阻断，也不能把一次成功外推到所有平台、profile 或其它原 Cargo 目标。

## 后续仍须真实完成

- package-local 构建环境与 state 的 full 环境须继续分开；只在既有构建入口消费必要材料，不保存秘密值，不将构建 env 整包传给 full。打包只准备合法资源，按已定 `CREATOROS_LOCAL_SKIP_INSTALL=1` 保持本项不安装。读取资源存在性时 tar 及其签名尚未生成；external binary 已存在也不能单凭文件存在宣称固定打包完成。须按同候选最终资源和真实 package 终态收据判定 LED-018/057 的输入已就绪。
- 原五项 CFT 仍由原命令实际执行，保原 90 秒 ready 预算、测试超时和断言，不指向未知旧 fixture binary，不用 no-run 或打包前置替代它们。
- owned PG 尚须按本轮身份启动、核归属并正常清理；full 仅投影原协议四个专用字段，不注入 DATABASE_URL/TEST_DATABASE_URL/PGLITE_DATA_DIR/PG*。
- 新路径下的原生隔离能力与原八组、合法 owned PG 原门仍按 T-1412 协议取得适用收据。旧内部盘 PASS 不证明外盘路径的实际运行；不得扩大 HyperFrames 沙箱或删安全探针来适配位置。
- 最终 55 项 full 保原集合及已独审的 T-1413 精确迁移、原顺序/计数/断言；绑定最终候选与配置 SHA，保真实失败、退出/信号、日志及资源清理。历史基线的提交扫描由另一审查员处理，本报告不代其作结论。

## 收据摘要 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| state.json | `e26eb54fcd9ff79651f17a62a4c800316a0c7b2eea3039815ae1775c6a4008c5` |
| dependency-copy.json | `7203989b39005dc22a0e24f5e1033215c7ec38a26e07ea99e3b5f4eab56d0897` |
| offline-relink.receipt.json | `4ac26612c882ea3d39a69112fadd85c2231cec4449e60fd7e472c1498be9c2ae` |
| cargo-assets.json | `d3028e851153507b62cbc0a7510e21aaf559ba15b260f961af6342f72c1561be` |
| package-assets.json | `3bccb03096c12121c5fbce001db913871602b23f84a49b944d306c18b562ef39` |
| historical-baselines.json | `00b3fc0373c4070af2a8a6ce8b27ffc333500364d6dcb187bc3b6f07fea2c019` |
| cft-precompile.receipt.json | `ae6353e3385dfdfe06e2c1a1cbb95a6791f7f82cb4867aa488179dc4977c447d` |
| package-preflight.receipt.json | `3c922c8fd69d4261979287b9aa8014c11d2c677f253d64f84555de3a780749e2` |
| led043.receipt.json | `b4c43db7c64f658246d367edb17054c40945abc96a0ca538822d3f4233bb845c` |
