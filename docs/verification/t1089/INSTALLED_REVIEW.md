# T1089 安装包与最终范围独立复核

- 复核时间：2026-10-09（Asia/Shanghai）
- 复核方式：只读已提交源码、构建/安装/公开调用证据和全局 Gate 结果；未修改仓库或任务状态，未重新运行产品、数据库、模型或测试
- 源提交：`6e4689b3180f91189110208267708ad72b03ae64`
- 结论：**T1089 自身验收范围满足，可由 ROOT 使用 `taskctl complete`，但 evidence 必须明确保留 reconcile 的既有全局失败和 T1090；不得写成 CreatorOS 全功能、全局 reconcile 或所有助手回归 PASS。**

## 1. 源码、构建与 DMG

独立复采确认当前 HEAD 与待验提交均为 `6e4689b3180f91189110208267708ad72b03ae64`。提交内 `0130_legacy_source_ownership.sql` SHA-256 为 `cc25f17ac270d230b82f1697bd20c674931877459cc0a70f667cab3461a3fc70`，与此前独立实施复核、包内检查和最终测试绑定一致。

本地打包实际 exit 0，耗时 431.168 秒：

- `package-local-build.json` SHA-256 `e975781faedbb3c37deb2110f2bc1425875f37785e07994eeb74a95812fe945b`
- 构建日志 SHA-256 `777c2ce49ed0d8d2c1f59811cc49e224a7d4108006a1b05d2ed668c769c95332`

DMG `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg` 独立复采 SHA-256 为 `7a618520bfd5321b2f5d93873f9b7fb1759feab9c23ce2d1e0d0cd1390e1476f`，大小 840,237,701 字节。`new-package-verification.json`（SHA-256 `0d1f62202849b8d7655df134f3febb14005b25b703843751c1fd2297b4df17f6`）记录：

- `hdiutil verify` exit 0；
- 构建 App 与 DMG 内 App 的四个核心文件逐项同 SHA；
- 两处 `codesign --verify --deep --strict` exit 0；
- sidecar archive 内实际包含 SHA 为 `cc25f17...` 的 0130 SQL；
- 签名是本地 ad-hoc，**没有公证**。

## 2. 安装与启动边界

`new-app-installation.json` SHA-256 `ed99679424c02bc1a7df0c7da3e112b61215424fd69754ed78013ff4bf1ffb1c`：原 App 通过 `osascript` 温和退出，确认退出后没有执行 `pkill`；安装没有创建用户数据备份、没有 reset 数据、没有强杀进程。新 App 从 `/Applications/CreatorOS.app` 启动并获得新 PID `26888`。

`new-startup-verification.json` SHA-256 `a7eb1aed4d007281ed67ec49fee5714b24e32e672985b53d230b416a6bf396b0`：真实 sidecar origin 为 `http://127.0.0.1:60314/`，观察到 `SIDECAR_STARTUP_VERIFIED`、主导航请求与 `MAIN_PAGE_LOAD_FINISHED`；安装后四个核心文件与构建包同 SHA，公开 CLI `status` 和 `access status` 均 exit 0。

这些证据支持“新包装入并完成真实 HTTP 主页面加载”。它们没有观察窗口内逐项点击，也没有验证普通 warm restart、平台扫码、公证或全功能 UI。

## 3. 安装版旧账号来源与公开模型链

首次 probe 因没有传 bootstrap workspace context 返回 HTTP 428；原失败由 `installed-legacy-entry-run.json`（SHA-256 `a5568c32b1835af37ad587a9add2fe2bbe169bcda7fd1c06b65a5a6d59cd1bf7`）和日志 SHA `c021865ec48c00b5552d3eadad5442af806325e83bc7bcc20f14b11a7b617a88` 保留。后续证据说明该次在实际写入前停止，未将失败改写成 PASS。

修正调用只把用户原已选择的“月明水清深”账号作为新中性账号登记的 bootstrap context，没有修改该账号内容或登录。本次隔离出的新对象为：

- account `acct-c68e8d14-137`
- canonical group `grp_legacy_acct-c68e8d14-137`
- project `project-c68e8d14-143`
- project conversation `ai-conv-c68e8d14-157`
- global conversation `ai-conv-c68e8d14-160`
- article output `output-c68e8d14-163`
- graphic output `output-c68e8d14-177`
- original AI task `ai-task-c68e8d14-194` / execution task `execution-task-c68e8d14-195`

修正后的安装版验收 exit 0、耗时 47.244 秒：`installed-legacy-entry-scoped-run.json` SHA-256 `cca57c517303bec3aa78340948fd9289f2ab09251808c8a133e18f070b7604ee`，日志 SHA `f2a3d921d7295ed52dccddc34b526420805f1ba69914074239cff6d6de8e15ec`。

`installed-legacy-verification.json` SHA-256 `11ba8c5e4ffbad24972da7134af5063eda6cb665a19d7250cb331f3582bdf344` 和 `installed-legacy-cross-check.json` SHA-256 `fdfe430951d0e2b5fe502efb93ff5a9945de45de605e02ad26a4146a6d9eed5e` 共同证明：

- 公开消息走实际 Pi 模型，任务最终 `succeeded`，模型阶段 34.387 秒；
- 实际完成三次 `system.read`：`projects.outputs.list`、`articles.get`、`graphicPosts.get`；
- 三个工具 part 均为 `output-available`，读取了真实 project/output/version ID；
- 文章与图文是空的初始 v1，报告如实显示空内容，没有编稿；
- 调用前后业务 DTO 深度相等，没有写文章、图文或项目内容；
- 使用同一原任务/执行任务完成，没有重新发送第二个模型任务。

该证据支持 T1089 的“安装版旧入口建立真实 canonical group 后，项目会话、文章 anchor、图文 anchor 可由公开 owner 链读取”。它只覆盖新建中性账号和项目；不等于对旧用户库做人工更新，也不代签 Codex、平台登录或非空稿件。

## 4. T1090 与 reconcile 的范围归因

扩大回归的唯一 completion 失败已用冻结的原 `b75eb8...` backend 做 counterfactual。`completion-baseline-original60.json` SHA-256 `682aae74646ff33a38654e50dcd450086ab0c2e569cefeaf1d95df2dde442272` 记录原 60 例同样为 59 PASS / 1 FAIL，日志 SHA `abd7b17d4b77cac748b19a0e82803e5465120b1fd0f97d85e19f5c4b46b98e9a`；Vite source audit 禁止加载当前工作树 backend source。`chat-completion-replay-diagnosis.md` SHA-256 `94d6c41670e6e45f6f95c9c81b9b50f5bb94f80b4ddf387b9f1647d4547b8aaa` 将机制定位为同一 `createdAt` 下 assistant/user 排序导致 replay source digest 变化。

因此该失败不是 T1089 引入的回归；原失败仍被保留并登记为 T1090，不能称作已修复或删除。

当前完整 reconcile 实际 exit 1、耗时 1231.026 秒：`reconcile-current.json` SHA-256 `738d1b7848848d47607708ddcc9a4880796e6c31c6b47298232409c366c3580f`，日志 SHA `5a7dc597bbef244902c857fc708f2a8e4fbfe10583fb9d46624d709b7079ea5a`。日志为 42 error / 0 warning，包含 BACKLOG runaway、旧任务 review receipt、既有 frontend receipt 和多个 LED 全局欠债；stdout SHA 与前轮相同。未发现 T1089 新 SQL、三族恢复、安装包或公开 owner 验收自身的新失败。

依项目收尾规则，reconcile 失败不能写成全绿；但在本任务 Gate 已通过且失败已确认是范围外既有欠债时，允许在 completion evidence 中逐项保留后完成当前任务。这里 T1089 的专项、打包、安装与公开模型只读链均已形成实际证据，T1090 也已单独登记，因而 **T1089 可以执行 `taskctl complete`**。completion evidence 必须至少引用：

1. commit `6e4689b3180f91189110208267708ad72b03ae64`；
2. backend 最终 31 PASS 与 frontend 恢复 4 PASS；
3. DMG SHA `7a618520...` 及 package verification；
4. 安装版 scoped run 与 cross-check；
5. reconcile exit 1 / 42 errors 的既有欠债事实；
6. T1090 baseline 同 FAIL 与诊断 SHA。

## 5. 明确保留的未验范围

本复核不宣称以下事项通过：CreatorOS 全功能、Codex、原生窗口逐项交互、平台扫码与真实登录、非空稿件编辑、旧用户库人工更新、普通 warm restart、公证/发布渠道、全局 reconcile、T1090 修复。T1089 完成只代表本 SPEC 定义的旧来源归属修复、迁移/恢复回归、安装包包含关系和本次中性公开只读验收已闭合。
