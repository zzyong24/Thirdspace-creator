# T1168 / T1169 独立当前实施复核

**PASS_BOUNDED，仅这两项局部修复。** 实读 HEAD `aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`，dirty 冻结字节。两份已独立 PASS 的 SPEC SHA 保持为 `7da66499…` / `1dcc665e…`；当前无新增实施问题。

T1168：身份不足或真实 needsAuth 时，页头只有原“扫码绑定账号”/“重新扫码登录”主动作，错误正文保留，重复恢复入口移除。按钮复用原 Dialog/AccountBindingPanel 与原key路径，不新增执行。空态先检查能力关闭，再检查身份恢复；能力关闭继续禁扫码/同步，正常空态仍指向原同步。h1 使用现 text-xl，未改 globals/tokens 映射24px；实际 Chrome 六次 computed style断言24px。已查看新视频号身份图与公众号390px空态图：品牌主动作、错误文字和同状态空态一致，正文仍14px自然换行。

T1169：两个原转组触发器共用本地 openTransfer，保存原DOM、所选组及真实当前workspace。Dialog关闭清ref，只有 alive、isConnected、所选组和当前workspace均相同时才回焦。Esc/取消与重复打开保持原成员/目标，不调用preview或commit；旧表面切组、真实回读移除DOM均不聚焦旧按钮。原 preview/commit、membership、busy关闭和绑定Dialog未纳入本修复。

## 实际证据

| 证据 | 实际结果 |
|---|---|
| 原行为RED | 6 FAIL（过滤器43 skip）；3个转组失败点为toHaveFocus，3个恢复失败点为真实空态文字 |
| 原两组件GREEN | 49 PASS，无skip |
| 能力关闭优先RED | 1 FAIL（过滤器27 skip），能力已关闭但恢复空态仍错误指向扫码 |
| 最终原两组件 | 51 PASS，无skip；包含重复打开/取消、切组与脱离DOM守卫 |
| frontend type | exit 0，9.640812333秒 |
| 原LED-047 | 8文件174 PASS，无skip |
| boundary / semantic / orphan | 均exit 0；orphan保留100 warning，0 error |
| 当前原Chrome | 外层exit 0 / 79.362602958秒；内层1 PASS / 78.378165125秒；0retry |

每份实际receipt的logSha256均由本评审对原日志字节重新核对，完整SHA、命令与路径在同目录 REVIEW.json。 当前Chrome、8图、观测及RED/GREEN/type/LED/boundary/semantic/orphan证据已归档到 `docs/verification/t1168-1169/fixed-current`，本评审逐份验证gzip解压日志SHA与原日志相同；三门使用真实原命令文件名，原N证据与归档字节相同。Chrome raw log SHA为 `3843b0aaa098da1897b3c5bf335d26cf0604d0eb93fd4bb12d4a037c1cd57b89`。当前journey 61路径 before=after=现字节；相对 fixed-beforecommit只变化下列精确5路径，另56路径（后台/合同/绑定组件/runner等）不变。该比较不宣称整个dirty仓库只有5文件改动。

| 当前实施/测试路径 | 本次实读SHA256 |
|---|---|
| `frontend/src/features/platform-account/account-group-manager.test.tsx` | `e6256d79b570a6078a307fd0804a8d0cd72d4f709c99d0e7142d34495a6cacd7` |
| `frontend/src/features/platform-account/account-group-manager.tsx` | `2f03585d319e21cb24f850dc22aba80f45ed1a3761a4734bfed6e831fdeb67b2` |
| `frontend/src/features/platform-account/native-report-panel.test.tsx` | `b8717bb3e466d4c6c8ea11d234113c3709b156a29dffa3bad763ce0095541e6d` |
| `frontend/src/features/platform-account/native-report-panel.tsx` | `5a28c3e89a1ce62d00e8f16c53228f97548946f4e09446e6c0d4fc0c171ad4b4` |
| `frontend/tests/e2e/t1159-wechat-native-report.spec.ts` | `df40efd73678a1d7d36d251ebe17164a5d57f9affde00d7b9396f0e0c554a200` |

两平台各三个窗口保留显式账号入口、真实0报告、refresh/back/repeat和真实单次HTTP400 SCOPE_MISSING。新增六次转组Esc回原按钮、两次恢复Dialog纯打开/Esc回焦及六次标题computed24px均在真实Playwright通过路径内。bindingStarts=0，未替换领域响应；同fresh PGlite停止原服务后run/report/bind计数和微信profile文件均0。评审者只读日志/源码/截图，没有运行测试、服务、DB、模型或业务CLI。

## 保留边界

原SPEC formal PASS、原视觉FAIL和独立任务walk失败报告均保留；四份历史报告SHA与初审记录相同。本结论销解对应局部缺口，不篡改历史FAIL，也不签真人微信、真实采集报表、扫码结果、转组提交、安装或完整Gate。原任务/请求ID、owner、能力门、持久期限与25,200,000ms测试/26,400,000ms runner/120,000ms内层/0retry保持。T1159来源研究pause、两实验耗尽且剩余0、全局旧27超时静态失败和审核漂移继续原样记录。

本评审唯一写集为本私有目录 REVIEW.md / REVIEW.json；无仓库、源码、任务状态或验证器改动。
