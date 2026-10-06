# T-1063 双端流水线验收记录

## 真实失败与版本

用户2026-10-06确认“1.12”为口误，目标是1.2.0。读取当前GitHub API而非旧会话日志：Windows失败run [34942593764](https://github.com/zzyong24/Thirdspace-creator/actions/runs/34942593764)，SHA `5c1c7060dcabb22fa47142b05abd6fd2602d3b54`；job `104294515361` 在“验证 Windows runtime 被占用时仍可安全启动(T-992)”失败，2026-09-15T07:47:09Z首个真实错误为 `tauri_build 失败: resource path binaries\creatoros-server-x86_64-pc-windows-msvc.exe doesn't exist`，exit101。该cargo test运行在sidecar生成前，后续打包全部跳过；远端77eabca3已撤旧测试，同日Windows run [34976587686](https://github.com/zzyong24/Thirdspace-creator/actions/runs/34976587686)成功。当前不是声称“最新Windows仍失败”，而是按用户要求调整仍存在的出包限制并重新运行。

远端基点 `d84d10af5857262620388fc0d0d15ab84a3649e0`，1.2.0版本不变；9月15日至本基点只有提交活动SVG更新。主工作树与T-1062未提交/整合候选未并入。

## 改动与验证边界

- 删除desktop-release全部5处job timeout，关闭并发自动取消在途构建。
- 双端默认显式build-only；Windows保持五层少文件资源组装，Worker/Next真实编译、资源生成、Tauri打包和实际签名仍失败传播。
- 类型验证与两处课程校验、运行时/渲染/PDF/Pi/媒体/Worker探针、额外清单验证退出默认制品链；公钥烘焙、资源不存在、路径安全和账号运行时授权未改。移除构建探针timeout及媒体人为大小下限，空下载仍失败。
- 安装包生成后先收集并上传；候选安装包也先上传；纯RAT仍可独立选择实际验证。额外安装/启动/卸载、Gatekeeper/归档回放由validate_installers显式选择且不阻断上传。未运行项保留not-run，不冒充质量或真机验收。
- 独立审查查出Windows反斜杠导致Next漏build参数、候选RAT缺版本step及引号错误、tar前Worker30秒探针、课程二次校验和ffmpeg烟测等，全部修正。

## 本地证据

新测试 `node --test tools/windows-closure-rat/package-build-only.test.mjs` 首次真实失败（旧计划仍含runtime consumer smoke），修改后通过。基础四项打包测试43/43通过；扩展build-sidecar、release及Node入口测试后7文件89/89通过。闭包/内存/新出包计划18/18通过；actionlint 1.7.12通过（禁用机器未安装的shellcheck/pyflakes外部工具）；相关JS node --check与git diff --check通过。媒体没有既有fetch-ffmpeg.test.mjs，查找命令报No test files found，不记PASS。

独立代码审查（同模型家族）已复核默认Windows出包链，无剩余阻断；审查不代表实际Windows/Mac构建或安装通过。

首次整改时技能3.27.2→3.27.3按--update --topology single执行。更新报告保留历史T-979缺合法emoji、strict receipt迁移未完成；当时reconcile为257 errors，主要write_set/verify缺失、自治声明/回执与旧证据漂移，由既有T-916承接，不标全绿。boundary-scan报2个既有copilot/live-chat-session.ts AI SDK import；该文件与HEAD相同，本任务不涉及runtime边界，由既有T-916承接。

## 实际构建

Windows运行 [37440775757](https://github.com/zzyong24/Thirdspace-creator/actions/runs/37440775757) 已实际success；Windows job `112193758217` 于2026-10-06T09:41:49Z结束，候选SHA `67437998bb18b5b18ceb4be95ff1a270756de182`。已下载并核对非空setup.exe的真实版本、体积及SHA256，详见下方制品节和windows-run.json/windows-installer.json。已有授权见authorization.json；本轮推送仅独立候选分支。draft-release实际skipped，没有tag/Release、main推送、生产更新、公开分发或安装替换。Mac、Windows安装/启动/卸载未实跑；Windows未签名；T-1066运行时修改未进入本候选。


## 本轮继续的冻结检查（2026-10-06）

重新读取GitHub，main仍d84d10af，最新desktop-release仍9月15日的成功run34976587686；本轮新运行尚未提交时没有虚构run URL。四处版本重新核对均1.2.0；基础4文件43项再次实际通过，actionlint1.7.12与受改动脚本语法检查通过。候选仅应用出包链整改与会话诊断/治理工件，不包含T-1066运行时修改。项目引擎已按支持入口更新3.27.4，历史T-979非法状态阻断strict receipt migration如实保留，更新入口已实际完成全量reconcile：234 errors / 0 warnings，根因主要为既有自治配置、write_set/verify缺失及历史证据漂移，由既有T-916承接，不描述为全绿。


## 本轮实际安装制品（运行已成功结束）

候选 `67437998bb18b5b18ceb4be95ff1a270756de182`，分支 `codex/t1063-release-pipeline`；手动Windows运行 [37440775757](https://github.com/zzyong24/Thirdspace-creator/actions/runs/37440775757)。Actions artifact `desktop-windows-x86_64` / ID `11402966236` 的workflow_run.head_sha与候选完全相同；其ZIP digest为 `c469b82df93a014dc27f644e0ee4679f5c707dd0455cc87af72bb79769a9462a`，它与解压后EXE的校验值是两个不同对象，不混用。

安装包已实际下载到 `/Users/zyongzhu/Downloads/CreatorOS-t1063-windows-37440775757/installer/CreatorOS_1.2.0_x64-setup.exe`，非空Windows PE文件；文件大小 **555841160 bytes**，SHA256 **`5369d92e9e841f4e94f5366c2126028832fb4f3cb6a040241312de12b9576bf2`**。安装器资源的FileVersion/ProductVersion均为 `1.2.0.0`，版本字符串为 `1.2.0`，四处源码版本同为1.2.0。PE证书目录offset/size均0，即未带Windows Authenticode签名；没有声称用户额外接受未签名或已完成真机安装。

实际artifact报告：运行资源组装9步通过；桌面打包8步退出0，耗时1,270,966ms（约21分11秒），JS混淆424,699ms，Tauri编译及打包843,772ms。通用计时器把Windows签名/公证平台跳过也记录为退出0，**不能据此称Windows已代码签名或Mac已公证**。额外验收validation-status.json明确status=not-run；安装、GUI主页面启动、卸载与Mac实跑均未执行。此候选不含T-1066运行时修复，不以1.2.0名称混淆不同SHA的包。

项目删除了全部5处自设job timeout、构建链探针超时与额外验收阻断；GitHub托管runner仍有平台每job6小时执行上限，官方证据：[Actions limits](https://docs.github.com/en/enterprise-cloud%40latest/actions/reference/limits)。删除timeout-minutes不能删除平台约束。本轮并未触及该上限。

截至制品下载后的远端核对：main仍 `d84d10af5857262620388fc0d0d15ab84a3649e0`，候选远端与构建SHA一致。未推main、打tag、建Release、修改生产配置或公开分发。


## 收尾工程对账

制品到本机后实际运行pmem sync和全量reconcile，保留234 errors / 0 warnings的原始输出（logs/post-artifact-reconcile.log）；冻结后的前一次也为234/0（logs/final-reconcile.log）；根因与更新前相同，主要是既有write_set/verify、自治声明、旧任务回执/状态漂移。本任务打包相关测试与真实Windows制品验收通过；全局对账与既有2条边界违规由T-916承接，不以当前任务完成声称项目全绿。
