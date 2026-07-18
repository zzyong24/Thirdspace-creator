# spec-review 评审记录:native 防逆向软加固 + 加密日志 SPEC

- **被审 SPEC**:`docs/superpowers/specs/2026-07-17-native-hardening-and-encrypted-logging-design.md`
- **review_mode**:`cross-family`(MiniMax,`mmx text chat`)——与作者会话主模型(Fable 5)不同家族,强门。
- **日期**:2026-07-17
- **verdict**:`CONCERNS`(非 FAIL → 处理后可开工)→ 处理后 **CONCERNS(已处理)**
- **传递纪律**:只喂宪法(`docs/产品定位.md`)+ 被审 SPEC 全文,第三方框架(「另一位同事交来的方案」),未暴露作者身份/自评/投入成本,防锚定。

## Findings 与逐条裁决

### F1 — major / fit-positioning:Windows 防逆向代码与宪法「当前不做 Windows」张力

- **reviewer 指控**:§7/§10 含 Windows 反调试代码且声称「比 mac 多投入」,与宪法 §16/§2.3「当前不做 Windows 正式分发」冲突;要求澄清是防御性存根还是显式 scope 扩展。
- **裁决:接受,已处理**。reviewer 只拿到当前 `产品定位.md`,不知 T-372 DEC-W(宪法修正案)已把 Windows 升为正式分发目标且 W-core/W-ci 已过审。处理:§7 新增 [gate-A1] 段——Windows 加固**挂靠 T-372 DEC-W**(不独立扩张),`cfg(target_os="windows")` 条件编译(macOS 内测构建不编译不执行),随 T-372 W-cluster 同波交付,不早于 Windows 分发,测试面内测轮只跑 macOS。既不静默扩张又不为不存在范围铺路。

### F2 — minor / completeness:Part C 缺 L0→L1s 接口契约

- **reviewer 指控**:§10 Part C 声称依赖 L1s 但无接口契约定义,另一 agent 无法独立落地客户端集成。
- **裁决:接受,已处理**。处理:新增 §10.5——复用 T-372 已定义契约(`activate`/`status` 签名头 + `serverTime/expiresAt/revoked/graceSeconds/nonce`),L1s 不可达行为复用 T-372 L3 买断 fail-open,降级复用 L3 `updatesBlocked` 机制。证明 Part C 可执行,不改其「后续波次」性质。

## 人的裁决

两条均接受并已改 SPEC。verdict CONCERNS(非 FAIL),按宪法「verdict≠FAIL 才准开工」+ 两 concern 已处理 → **准予拆 Task 开工**。BACKLOG 审核列记 `CONCERNS(已处理)`。
