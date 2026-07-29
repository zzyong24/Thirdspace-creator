# T-565 Windows Runtime 可信分层交付 SPEC 独立评审

> 被审工件：`2026-07-27-windows-runtime-delivery-burn-transaction.md`
> review_mode：cross-family
> reviewer：`gpt-5.6-sol`
> 执行：`codex exec --skip-git-repo-check -s read-only --output-schema spec-reviewer.schema.json`
> 输入：`spec-reviewer.md + docs/产品定位.md + 被审 SPEC`，未传旧 review 或作者自评
> 日期：2026-07-27

## Round 1 — FAIL

总评：方向符合 Windows 发布目标，但原生 RAT 未完成，且 launcher、journal、旧 NSIS
迁移存在事务缺口。

```json
{
  "verdict": "FAIL",
  "summary": "方案方向符合 Windows 发布目标，但关键可行性尚未通过原生 RAT，且 launcher、journal 与旧 NSIS 迁移存在会破坏安装原子性的契约缺口，当前不能进入 BUILD。",
  "findings": [
    {
      "severity": "blocker",
      "category": "value-viability",
      "where": "§4.4、§18",
      "issue": "RAT-565-03～06 未完成，关键架构前提尚未获原生 Windows 证据。",
      "suggestion": "进入 BUILD 前做最小原生 Windows spike；没有环境则向用户升级授权。"
    },
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "FR-04/07/08、ENT-04",
      "issue": "稳定 launcher 在 set 和 journal 之外，可能成为事务外第二提交点。",
      "suggestion": "固定 ABI 不变，或纳入完整 replace/backup/restore 事务。"
    },
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "旧版迁移、FR-07、FLOW-04/05",
      "issue": "缺少 NSIS 到 Burn 的发现、ARP、shortcut、uninstaller 所有权交接契约。",
      "suggestion": "补 legacy 状态机、证据与边界 fixture。"
    },
    {
      "severity": "blocker",
      "category": "approach",
      "where": "FR-07、ENT-04、AC-04",
      "issue": "journal 自身没有原子写、checksum、合法状态迁移与损坏恢复；undo target 是任意字符串。",
      "suggestion": "为 journal 定义耐久协议和受限结构化目标。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-05、ENT-02",
      "issue": "allowlist 必填字段与 LayerManifest nullable 字段矛盾。",
      "suggestion": "新增或补齐可机械校验的 allowlist 契约。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§10 反证",
      "issue": "无实现断言没有可复现负向搜索。",
      "suggestion": "记录 rg/codegraph 查询、范围、commit 与零命中。"
    },
    {
      "severity": "major",
      "category": "value-viability",
      "where": "FR-05、§11、FR-12",
      "issue": "默认删除许可证副本可能破坏第三方发行合规，缺 license Gate。",
      "suggestion": "生成许可证清单并验证必需 notice/source offer。"
    }
  ]
}
```

## Round 1 裁决与处置

| Finding | 裁决 | 处置 |
|---|---|---|
| F1 原生 RAT | 接受 | 本机无 Windows/Wine/VM，仅有 Linux Docker；保持 PLAN 阻断，待用户授权原生 runner 后回填，不伪造 PASS |
| F2 launcher | 接受 | launcher 改为 release-lock 独立 `launcher-v1` payload；ABI/digest 在所有 v1 发行恒定，layered upgrade 禁止替换 |
| F3 legacy migration | 接受 | 新增 FR-11A，钉住当前 Tauri NSIS HKCU registry、路径验证、shortcut/ARP/uninstaller snapshot、交接和步骤级 kill fixture |
| F4 journal | 接受 | 补 temp/write-through/flush/replace、backup、sequence/checksum、合法迁移和损坏事实重建；删除任意 `undo.target` |
| F5 allowlist | 接受 | 新增 `RuntimeAllowlistV1`，普通文件必须非空引用规则，按 smoke/license evidence 分类 |
| F6 反证 | 接受 | 记录基线 `8721fda5`、完整 `rg` 命令和零命中 |
| F7 license | 接受 | 不再默认删除许可证；生成第三方清单和必需 notices/source-offer Gate，且继续计入文件预算 |

人的裁决：用户已明确要求“彻底根治 启动”，但此前流程约束把付费 Windows runner/外部
dispatch 设为单独授权点；故 F2～F7 可立即回写，F1 不越权假定授权。Round 2 只在原生 RAT
补齐或用户明确裁决该阻断后执行。

## Round 1 后补证（2026-07-27）

用户已通过 `DEC-PKG565-002` 明确授权 agent 创建、推送并持续运行 Windows RAT，费用不设
上限，但不授权创建 Release 或分发安装包。

- `RAT-565-03 PASS`：最终成功 run
  [30269208805](https://github.com/zzyong24/Thirdspace-creator/actions/runs/30269208805)
  证明 Web/Offline 同源 digest、系统代理、断流 Range 续传、cache reuse、篡改拒绝；
- `RAT-565-04 PASS`：四个 durable boundary 强杀恢复、torn journal backup、双损坏
  fail-closed；
- `RAT-565-05 PASS`：Windows 恶意路径、symlink、junction、hardlink containment；
- `RAT-565-06 PASS`：最终成功 run
  [30276584646](https://github.com/zzyong24/Thirdspace-creator/actions/runs/30276584646)
  证明真实 CreatorOS runtime=3,009 文件、core=985、通用 `node_modules`=0、
  symlink/reparse=0；Next/PGlite/Pi/Playwright+Chromium/Xenova/ONNX/sharp/
  HyperFrames/ffmpeg 全消费链及 Windows stdin 生命周期全绿。

完整证据：
`docs/research/2026-07-27-windows-native-burn-transaction-rat-evidence.md`。

RAT-565-03～06 已补齐 Round 1 唯一剩余 blocker，现请求全新上下文的 cross-family
Round 2；Round 1 verdict 保留为历史事实，不覆盖。
