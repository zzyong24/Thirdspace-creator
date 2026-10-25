# SPEC Review — current

- Task: T-656
- Verdict: PASS
- Round: 3/3 (recheck)
- Spec receipt: ca037dafc7b2
- Review receipt: 5f6970ac76f2

## 当前有效问题

当前无未销账问题。

已销账：REV-001 (SPEC-LINE:61:885827e6578204c9 明确 smoke 驱动完成签名后从实际 Sidecar child env 删除 signing/allow 变量，禁止 `...process.env` 继承，并要求纯函数测试同时证明 token 存在、私钥变量不存在；SEC-656-03 与 AC-656-06 同步收紧。)；REV-002 (SPEC-LINE:87:6e23a30a5b8a9f8f 新增独立 post-Tauri Gate；SPEC-LINE:89:b3d24d0107e116a6、SPEC-LINE:90:e1e68147dc6aa83b 定义双平台目标；SPEC-LINE:91:7f99c100d8c3d213、SPEC-LINE:100:7eaea1ce7d1fd621 规定流式解压、读取失败 fail-closed 及测试覆盖。)；REV-003 (SPEC-LINE:65:cf710ffcc545222f、SPEC-LINE:67:ad8cdf63bcac3a87、SPEC-LINE:73:b1539b8f2db07b32 统一 package/smoke/Cargo 的 canonical base64url 输入、显式 CI secret 表示迁移，并要求 legacy 输入三处一致硬失败；AC-656-08 已绑定验收。)；REV-004 (SPEC-LINE:90:3fcb79d9b0c09a9f 改为读取现有 `runtime-current.txt`，要求单行非空且受限 runtimeId、禁止 `..` 与分隔符，先做目录边界校验，再扫描 `$INSTDIR/runtime-images/$runtimeId/sidecar`；缺失、逃逸、非法或读取失败均 fail-closed。该路径与 `.github/workflows/desktop-release.yml:373-383` 的已验证安装布局一致。)

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-656",
  "round": 3,
  "max_rounds": 3,
  "review_kind": "recheck",
  "verdict": "PASS",
  "summary": "REV-001～REV-004 均已销账；本轮唯一改动与现有 Windows NSIS runtime 物理布局一致，未引入新的 blocker 或 major。",
  "spec_path": "docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md",
  "spec_sha256": "ca037dafc7b21ab04ce3ffe20502e7cc8862f14dc342a1e3db2437a67887f40e",
  "constitution_path": "PROJECT.md",
  "constitution_sha256": "d01469220b22455024bd58473a6ca9f307162b1317ba0fa5fe036b148f90362a",
  "review_path": "docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.review.md",
  "review_mode": "cross-model-same-family",
  "model": "gpt-5.6-terra",
  "policy": "convergent-review/v2",
  "latest_event_hash": "417ae43280b9c642bc3d6af8387550e6ffb11a80346b57244fe4c06135cb4885",
  "open_findings": [],
  "resolved_findings": [
    {
      "id": "REV-001",
      "resolution_evidence": "SPEC-LINE:61:885827e6578204c9 明确 smoke 驱动完成签名后从实际 Sidecar child env 删除 signing/allow 变量，禁止 `...process.env` 继承，并要求纯函数测试同时证明 token 存在、私钥变量不存在；SEC-656-03 与 AC-656-06 同步收紧。"
    },
    {
      "id": "REV-002",
      "resolution_evidence": "SPEC-LINE:87:6e23a30a5b8a9f8f 新增独立 post-Tauri Gate；SPEC-LINE:89:b3d24d0107e116a6、SPEC-LINE:90:e1e68147dc6aa83b 定义双平台目标；SPEC-LINE:91:7f99c100d8c3d213、SPEC-LINE:100:7eaea1ce7d1fd621 规定流式解压、读取失败 fail-closed 及测试覆盖。"
    },
    {
      "id": "REV-003",
      "resolution_evidence": "SPEC-LINE:65:cf710ffcc545222f、SPEC-LINE:67:ad8cdf63bcac3a87、SPEC-LINE:73:b1539b8f2db07b32 统一 package/smoke/Cargo 的 canonical base64url 输入、显式 CI secret 表示迁移，并要求 legacy 输入三处一致硬失败；AC-656-08 已绑定验收。"
    },
    {
      "id": "REV-004",
      "resolution_evidence": "SPEC-LINE:90:3fcb79d9b0c09a9f 改为读取现有 `runtime-current.txt`，要求单行非空且受限 runtimeId、禁止 `..` 与分隔符，先做目录边界校验，再扫描 `$INSTDIR/runtime-images/$runtimeId/sidecar`；缺失、逃逸、非法或读取失败均 fail-closed。该路径与 `.github/workflows/desktop-release.yml:373-383` 的已验证安装布局一致。"
    }
  ],
  "receipt": "5f6970ac76f2"
}
```
