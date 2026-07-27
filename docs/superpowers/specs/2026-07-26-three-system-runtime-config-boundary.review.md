# T-534 CreatorOS 三系统运行时边界独立评审记录

## Round 1 — 2026-07-26

- `review_mode`：`cross-family`
- 模型：`gpt-5.6-sol`
- 隔离方式：`codex exec -s read-only`，输入仅含评审量规、`docs/产品定位.md` 与被审 SPEC
- Verdict：`FAIL`
- Blocker：2
- Major：2

原始结构化结论：

```json
{
  "verdict": "FAIL",
  "summary": "方向与宪法基本一致，但本地接口无法区分可信停销配置、无配置和读取故障，另把 Windows 原子写入纳入当前交付；同时授权采纳分支和 loopback 权限契约仍不完整，当前不可进入 BUILD。",
  "findings": [
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "§3 六键 nullable；§6 sales_disabled；§8 API-TSB-001 响应与失败语义",
      "issue": "六键全 null 同时表示可信配置、无配置和读取故障，调用方无法可靠区分。",
      "suggestion": "增加最小非敏感读取状态，区分 ready、unavailable、read_error。"
    },
    {
      "severity": "blocker",
      "category": "scope-inflation",
      "where": "§7 跨 macOS/Windows replace-existing",
      "issue": "Windows 不在当前产品正式支持范围，属于无授权平台扩张。",
      "suggestion": "本轮硬验收限定 macOS，Windows 进入 Future possibilities。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§4 验证顺序与 §5 降级矩阵",
      "issue": "未定义 runtime 缺失/未知时 license、identity、runtime 三者如何原子更新。",
      "suggestion": "补字段级 replace/retain/detach/reject 决策表和故障断言。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§8 API-TSB-001 权限与 TEST-TSB-010",
      "issue": "未锁定启动随机 token、Host、Origin 的接受/拒绝行为。",
      "suggestion": "绑定现有 loopback trust middleware 并补负向测试。"
    }
  ]
}
```

逐条处置：

| Finding | 裁决 | 修订 |
| --- | --- | --- |
| F1 状态混淆 | 接受 | API 增加 `runtimeState=ready/unavailable/read_error`；明确它不是 lifecycle，URL null 不推断停销；read_error 显示重试 |
| F2 Windows 扩张 | 接受 | 原子替换硬验收收回 macOS；Windows 仅登记 Future possibilities |
| F3 三列原子分支 | 接受 | 新增 §4.2，逐项锁定 license decision/current identity/runtime cache 的 replace/retain/detach/reject；失败不部分提交 |
| F4 loopback 权限 | 接受并按现有代码语义校正 | 绑定 `proxy.ts/isTrustedLocalRequest`；desktop token、Host、bad Origin 拒绝。GET 缺 Origin + 有效 token/Host 按现有 guard 接受，未照建议错误拒绝合法 GET |

Round 1 不放行 BUILD；完成上述最小修订后进入 Round 2。修订没有新增 actor、实体、operation 或
平台，正文增幅未超过 20%，无需重新开启 scope-budget。

## Round 2 — 2026-07-26

- `review_mode`：`cross-family`
- 模型：`gpt-5.6-sol`
- 隔离方式：全新 `codex exec -s read-only`；未提供 Round 1 结论
- Verdict：`CONCERNS`
- Blocker：0
- Major：3

```json
{
  "verdict": "CONCERNS",
  "summary": "总体边界与产品宪法一致，未发现范围缩水或膨胀，但 legacy 信任输入、验证条款测试追踪及 RFC 8785 选型仍不够可执行。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5 legacy v1 与 §7 cache",
      "issue": "无 schemaVersion 的 legacy 输入缺 closed schema、类型/nullability、缺键/额外键策略。",
      "suggestion": "定义最小 LegacyChannelRuntimeV1 并补正反 fixture。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§3/§4.1 与 §11 TEST-TSB-004/006",
      "issue": "version/time/URL/brand 的多项强制验证未逐项映射测试。",
      "suggestion": "为每个边界补接受、拒绝和原字符串保持用例映射。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§9 RFC 8785 方案",
      "issue": "只写标准实现，没有至少两个具体候选及采用/弃用理由。",
      "suggestion": "列出 Rust/TS 适配、维护与 fixture 互操作并锁定采用者。"
    }
  ]
}
```

逐条处置：

| Finding | 裁决 | 修订 |
| --- | --- | --- |
| F1 legacy 输入 | 接受 | 新增 §5.1 closed required 4-key schema；malformed 整体不更新，合法 object 的坏字段逐项 null；TEST-TSB-007 fixtures |
| F2 测试追踪 | 接受 | §11 新增逐规则映射表，覆盖 version/time/Unicode/URL/DNS/path/percent/query/brand |
| F3 RFC 8785 选型 | 接受 | 锁定 Rust `serde_json_canonicalizer`；对比 `serde_jcs` 与手写方案；TS 不建第二实现，三仓 fixture 是接线门 |

Round 2 的 CONCERNS 已按最小修改处置；无新增 actor、entity、operation 或平台，进入 Round 3
最终独立复审。Round 3 前仍不放行 BUILD。

## Round 3 — 2026-07-26

- `review_mode`：`cross-family`
- 模型：`gpt-5.6-sol`
- 隔离方式：全新 `codex exec -s read-only`；未提供前两轮结论
- Verdict：`CONCERNS`
- Blocker：0
- Major：2

```json
{
  "verdict": "CONCERNS",
  "summary": "总体边界符合产品宪法且范围克制，但原子采纳矩阵存在未定义分支，现有外链 opener 的复用契约也遗漏了打包态握手接线，尚不足以无歧义进入 BUILD。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "§4.1/§4.2/§5.1/§11",
      "issue": "known-v2 校验失败与 malformed legacy 没有定义同/new identity 下三列结果。",
      "suggestion": "补齐 license、identity、runtime 的裁决、稳定错误码与逐列测试。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§8 外链 opener 与 TEST-TSB-010",
      "issue": "新 GET 要求 handshake，但现有 opener POST 调用漏带，打包态会被全局 proxy 403。",
      "suggestion": "所有 opener 调用合并 handshakeHeaders，定义 403 UI 降级并补真实调用断言。"
    }
  ]
}
```

逐条处置：

| Finding | 裁决 | 修订 |
| --- | --- | --- |
| F1 invalid runtime 三列 | 接受 | §4.2 补 same/new identity 下 replace/retain/detach；四个稳定脱敏错误码；TEST-TSB-004/007 逐列断言内存/磁盘一致 |
| F2 opener 握手 | 接受 | §8 要求 IssueFeedbackDialog、ExternalLinkOpener 与触及的日志 POST 合并 `handshakeHeaders()`；desktop 403/500 显示失败，只有 `{desktop:false}` 才 web fallback；§9 增加现网 file:line |

Round 3 是本工件三轮上限。结果无 blocker，2 个 major 已按最小修改逐条处置；不启动 Round 4
洗 verdict。最终 Gate 记为 `CONCERNS（已处理）`，仍须 scope-budget、contract completeness、
上游 fixture drift 与 TDD red gate 后才能 BUILD。
