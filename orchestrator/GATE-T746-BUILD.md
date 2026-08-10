# T-746 BUILD Gate — 官方版双平台离线激活清理工具

日期：2026-08-09
状态：实现与本机验证通过；Windows 真实设备执行待后续开箱机复验

## 用户确认边界

- 只供内部开箱、客服换码和重复验收；
- 不进入产品 UI，不改发布流程；
- 不联网，不包含激活服务器地址，不调用解绑或换绑 API；
- 只清本机激活态，保留全部业务数据、机器身份和模型密钥。

## TDD 证据

RED：

```text
node --test tools/reset-creatoros-activation.test.mjs
结果：8 pass / 1 fail
失败：Windows 场景仍按 macOS Application Support 路径运行，证明缺口真实存在。
```

GREEN：

```text
node --test tools/reset-creatoros-activation.test.mjs
结果：12 pass / 0 fail
```

覆盖：macOS dry-run、精确清理、运行中拒绝、幂等、渠道身份锁；Windows 官方路径、回收站、
用户目录防回拨点、Credential Manager 精确目标、运行中拒绝、幂等、拒绝渠道包越界；静态断言
脚本不含 URL、激活服务域名或网络模块/调用。

## 工程门

```text
node --check tools/reset-creatoros-activation.mjs
结果：PASS

git diff --check -- <T-746 files>
结果：PASS

node orchestrator/process/boundary-scan.mjs
结果：PASS，无新增违规；仓库既有基线 5 条

node orchestrator/process/orphan-scan.mjs
结果：0 errors / 100 existing warnings

node orchestrator/process/test-integrity.mjs
结果：0 errors / 1 existing coverage-config warning；测试 7→12，断言 33→55

node orchestrator/process/reconcile.mjs
结果：3 errors / 9 warnings；T-727 与 T-722 的既有 watched-path receipt 漂移，以及
ARTIFACT_MANIFEST updated_at 早于 DECISION_LOG。T-746 新增工具、测试和文档未被报错命中；
全局 reconcile 仍保持红色，不伪造为 PASS。
```

## 本机实际预览

在当前 macOS 官方 CreatorOS 上运行 `node tools/reset-creatoros-activation.mjs`，真实解析到官方
`appIdentifier=cloud.aitongban.creatoros`，只列出 3 个激活文件、单独的 Preferences 与待恢复
Keychain 项；同时检测到 CreatorOS 正在运行并明确提示执行前退出。本轮只做 dry-run，未再次清理。

## 未伪造证据

- 没有 Windows 真机执行记录；Windows PowerShell/Credential Manager 路径由平台夹具与精确
  Win32 API 契约覆盖，但正式交给开箱人员前仍应在一台 Windows 官方 v1.0 设备完成一次
  “执行前后保留项指纹一致 → 重启进入激活页”的实测。
- 没有把脚本做成普通用户可下载的安装程序；当前交付形态是仓库脚本 + 项目级 Skill，符合用户
  要求的最小内部工具边界。
