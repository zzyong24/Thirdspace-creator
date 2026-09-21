# T-916 历史规格回执修复与复核证据

- 日期：2026-09-21
- 范围：`reviewctl audit` 最初报告的 16 个历史任务，以及共享 SPEC 联动影响的 T-707
- 任务状态：T-916 继续保持进行中；本文只证明本轮规格回执、审查工具和相关台账修复，不冒充旧任务的真机、发布或业务效果验收

## 1. 已修复的问题

1. 对 16 个过期回执逐项执行独立审查；发现真实规格缺口时先记录 `CONCERNS`，修正后再由原审查者定向复核，未直接刷新哈希。
2. T-652 与 T-707 共用同一 SPEC。`reviewctl` 新增任务级 review snapshot 迁移，保留 append-only 事件链，避免一个任务覆盖另一个任务的审查快照。
3. T-694 的旧安全 finding 早于 threat model 强制绑定规则。历史事件保持不变，新周期绑定已确认的 `THREAT-REL-001` 后完成复核。
4. 修正审查中确认的规格矛盾，包括：视频时间线和素材真值、当前稿件归属、自然语言改单段、ASR 回退、定位候选幂等与纯人设边界、渠道模型所有权与计费幂等、桌面 verdict 私钥传播、正式包身份 attestation 与存量迁移门。
5. 更新现行桌面激活指南，移除手工创建 `test` 项目和正式包运行时覆盖身份的旧说明，并恢复当前严格验签边界。
6. `pmem sync` 后 PROJECT.md 仅改变 `LAST_SYNCED` 生成元数据；受影响任务使用绑定旧哈希与 `PMEM-SYNC` 的新周期能力重新完整审查。
7. 使用 `backlog-compact.mjs --all` 将 11 条已完成任务迁入 `BACKLOG-archive.md`，主看板从 46.4KB 降至 43.0KB。

## 2. 最终回执

| 任务 | 最终回执 |
| --- | --- |
| T-915 | `PASS[REV:ad76cf555129]` |
| T-859 | `PASS[REV:5818394813ca]` |
| T-858 | `PASS[REV:c76009a5586c]` |
| T-824 | `PASS[REV:f0e215103ddf]` |
| T-819 | `PASS[REV:a8879edf798f]` |
| T-816 | `PASS[REV:7896d566ccf8]` |
| T-768 | `PASS[REV:64f8010b2045]` |
| T-726 | `PASS[REV:39e3f41ca866]` |
| T-707 | `PASS[REV:87de34262527]` |
| T-703 | `PASS[REV:0662dafac8fa]` |
| T-694 | `PASS[REV:171b7c9ad2f2]` |
| T-691 | `PASS[REV:2f2a131519e7]` |
| T-656 | `PASS[REV:bd8a6ac135f0]` |
| T-652 | `PASS[REV:eb61c0840578]` |
| T-645 | `PASS[REV:7ff0c3cb1906]` |
| T-642 | `PASS[REV:9002b8dbeb4d]` |
| T-635 | `PASS[REV:84661017fde5]` |

## 3. 验证结果

```text
node --test orchestrator/process/reviewctl.test.mjs
21 tests, 21 pass, 0 fail

node orchestrator/process/reviewctl.mjs audit
review receipts + event chain PASS

node orchestrator/process/pmem.mjs sync
PROJECT.md sync PASS

node orchestrator/process/reconcile.mjs
0 errors, Manifest reconciles with reality
```

`reconcile` 的边界扫描、孤儿扫描、前端验证、知识层检查和 LED-001～LED-051 已全部通过。唯一保留项是非阻断的 BACKLOG 体积警告：机械归档已完成，但 130 个开放任务仍使主看板为 43.0KB，高于 30KB 维护阈值；后续需要在 T-916 中继续压缩活动任务行，不能通过删除任务或改低阈值伪造通过。

## 4. 证据边界

- 本轮修改的是审查工具、规格、审查回执、威胁模型、运营文档和治理台账。
- 本轮没有把仍标为“待验”的历史业务任务写成真机通过，也没有补拍历史 TDD、安装包或生产发布证据。
- T-916 仍承接更广泛的工程对账与活动看板压缩，因此不在本轮标记完成。
