# T-988 首页与导航性能验收

## 改动与诊断

旧安装源af62ddda。ego-browser TaskSpace35读取安装包内置前端，同账号首页5连点实际5个RSC，等待完整总览指标约4027ms。fetch头耗时19/806/1572/2441/3104ms，不能把响应头当完整页面时间。通过非秘密账号选择cookie指定账号；没有注入桌面鉴权，普通浏览器客户端RPC及侧栏账号不可当作验证通过；并非原生WKWebView点击。原始证据：[baseline](../research/t988/baseline.json)。

移除同目标重复导航，保持首点即时、不同目标可替换、缓存瞬时命中和异步失败可重试。首页先选5条再读取版本标题；请求内导入判据共享；独立查询并行；只缓存按数据版本失效的指标汇总/趋势，动态任务/排期/粉丝基线实时。设置及常用页面可见开发话术改为功能说明。

## 当场测试

- TDD：后端新增断言原实现2失败/44通过；新前端模块在未实现时导入失败。未把历史测试冒充红测。
- 首页/发布service/query composition：3文件62通过，包括展示前筛选、SQL最多11次、空允许集、动态任务每次读取、基线读取失败保持未知。
- 真实React useTransition/Suspense：6通过，覆盖连点、缓存、同步/异步失败、旧失败不解新锁、切号。
- 缓存及常用界面回归：7文件65通过；LED047 156通过；LED049 前端77/后端43通过。
- 前端tsc通过；官方打包基础4文件42通过。
- 扩展首页/知识图谱检查：38通过/1失败。知识图谱错误文案断言在旧af62ddda独立工作区同样失败（8通过/1失败），记录T989，不删除断言或改变错误行为。
- boundary现存7条（基线5，另2条live-chat-session SDK引用）为已有越界，本次没有新增。orphan 0错误/100警告。
- 两名独立只读审查：查询与缓存语义、导航生命周期均无剩余阻断；审查发现的基线错误回退已修复并回归。

## 安装实测

以下均为当场安装与浏览器记录，普通浏览器不具备原生桌面鉴权。

首次安装1cb73db6：DMG校验通过，原应用/数据备份t988-navigation-20260915后启动成功；公共CLI full，6个计划ID/启用/错峰不变。浏览器5连点1个RSC，完整首页572ms；90ms间隔5次同样1个RSC。设置已实际显示“显示名称，保存后立即生效。”。普通浏览器客户端RPC返回403仍是宿主鉴权限制，未绕过鉴权，不作为该功能失败或成功的证据。

安装检查发现Next首次进入某些页面会先提交骨架且transition结束，补充可见骨架期间防重复同URL；隐藏Activity骨架必须放行。新增当场1红/5通过，修后含shell/cache3文件44通过、tsc通过。最终包验收如下。


### 最终安装 9095f5a9

- 源码：`9095f5a9cf319d922e2c89a53dd0aef7e8a9ea37`，干净工作区 `Thirdspace-creator-t984-package`。
- 固定入口已完成 Next、混淆、Tauri 编译、最终密钥泄漏检查和 DMG 封装，但首次收尾 TLS 检查遇到公网 DNS ENOTFOUND；单独 `--verify-tls-only` 使用官方 `buildLocalPackageEnv` 后通过。网络恢复后的固定入口重跑在混淆时遇到 ENOSPC，未进入下一次 Tauri、未覆盖前次最终 .app/DMG，因此停止重复编译。
- 保留前次同源码完整产物；再次通过官方 TLS-only，并执行原入口剩余 codesign、notarize、product-identity/release-manifest helper 收尾。没有修改或跳过校验规则，没有把完整流水线的两次非零退出写成成功。日志：`/tmp/t988-final-build.log`、`/tmp/t988-final-build-recovered.log`、`/tmp/t988-final-artifact-verification.log`。
- 最终 DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`；SHA-256 `9026106089786fe430a67f55a203260b7165c71d1f0814c61a5e9c0382eda759`。`hdiutil verify` VALID。
- `.app` 的 `codesign --verify --deep --strict` 通过；安装后二进制 SHA-256 `a252c3b806cbac08c4bb3a8f4d2585a343237baa67610b47e7cdc8745b5e11c9`，安装资源 tar 与受验产物相同。仅本地 ad-hoc，未 Apple 公证。
- 温和退出旧应用及 sidecar，离线备份至 `~/.creatoros/backups/t988-navigation-final-20260915`，官方 install helper 替换 `/Applications/CreatorOS.app` 并启动，PID 78771；sidecar 78948、端口 60741。公共 CLI 自动 full，读取 6 个计划的 ID、sourceKind、schedule、enabled 与安装前完全一致；未人工触发采集。
- 实际安装包前端、同账号、内容雷达→首页同步连点5次：仅1次首页RSC；等到总览指标完整出现且导航等待结束为 **424.5ms**，旧包同条件为 **4027.3ms**。第一轮修复安装为572.1ms。这是特定浏览器场景，不是原生WKWebView、冷启动或所有页面的速度保证。
- 设置页首次进入时，通过 MutationObserver 实际捕获可见加载骨架，当前地址已为/settings；追加3次点击，最终仍只有1次/settings RSC。页面加载完毕，骨架消失，真实可见帮助文字为“显示名称，保存后立即生效。”。
- 普通浏览器没有注入桌面鉴权，后台 dispatch 的403不计入导航成功/失败，未据此宣称客户端全部业务功能通过。CLI 数据验证走正式授权。

### 防复发与已知范围外问题

全局 reconcile 已实际运行：LED-047/048/049/050 均通过；仍有233条既有工件漂移（T-916），不是本轮全绿。T-989 的既有知识图谱断言失败已独立登记。本轮不更改这些历史工件来消除检查失败。
