# T-635 CreatorOS 绑定 Growth 商品身份

- 状态：用户确认，独立复核修订中；复核通过前不进入 BUILD
- 日期：2026-07-30
- 上游权威：
  `/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-123-growth-activity-product-identity.md`

## 1. 用户目标

官方在 Growth 创建 CreatorOS 商品后，CreatorOS 正式安装包带有同一个 `projectKey`。运营人员
不再登录 Activity 手工配项目，用户不能通过运行时环境变量把可分发包切换到另一个产品或关闭
严格签名校验。

## 2. 产品身份与构建类型

- CreatorOS 的新 Growth 商品 `projectKey` exact 为 `creatoros`。
- Tauri `identifier=cloud.aitongban.creatoros` 是安装身份，不代替 Growth/Activity `projectKey`。
- 所有可安装、可分发、非 debug artifact 都属于受控发布构建，包括 Cargo/Tauri `release`、
  `release-fast`、NSIS 候选包和日常内测安装包。
- 受控发布构建只接受 exact `CREATOROS_LICENSE_PROJECT_KEY=creatoros`；missing、格式非法、
  `test`、其他合法 key 全部构建失败。
- 只有真正的 `tauri dev`/debug 构建可显式使用本地 project key。
- `build.rs` 从同一个已验证 canonical input 同时生成
  `CREATOROS_BUILTIN_LICENSE_PROJECT_KEY` 和 ProductManifest；Rust license、entitlement claim、
  config、feedback resolver 不得各自维护 project key 默认值。

## 3. 运行时安全

- 所有可分发包的 `projectKey` 为编译期只读，运行时环境变量无权覆盖。
- 所有可分发包强制 Activity 响应严格验签，运行时环境变量无权关闭。
- 既有 license-hardening `[gate-F2]` 的 `CREATOROS_LICENSE_STRICT_VERIFY=0` 降级只保留给
  debug/`tauri dev`；T-635 明确废止其在 `release/release-fast` 和任何安装包中的权威。
- Growth→Activity HMAC secret、Activity 管理凭证和生码能力不得进入仓库、workflow artifact、
  前端 bundle、Tauri resource 或日志。
- CreatorOS 只消费一次性 entitlement claim、Activity 签名授权事实和 Growth 签名配置。

## 4. Claim 发布门

- 本轮所有可分发包固定
  `CREATOROS_ENTITLEMENT_CLAIM_ENABLED=0`；运行时环境变量不能打开。
- 本地 identity receipt 只证明 T-635 BUILD 的三仓 `projectKey` 一致，绝不授权把 claim 改为 1。
- 只有 T-575 的 release program-gate GO 才能另行变更：该 GO 必须绑定三仓实际 release commit、
  HTTPS 部署、正式密钥和 live entitlement journey，不能由本地 receipt 替代。
- 当前 workflow 中 hardcode `1` 的配置和相应“必须为 1”测试失效，改为 fail-closed 验收。

## 5. 存量 `test/default` 迁移门

- 新代码和隔离本地闭环使用 `creatoros`，但不得因此自动发布安装包。
- 发布前盘点生产 Activity `test/default` Project、code、grant 和已发布 CreatorOS
  本地授权状态。
- 四类存量全为零才可切换；任一非零则保持现有发布不动、claim 关闭，另建明确 alias/双读迁移
  和回滚契约。
- 本任务不猜测 `test → creatoros`，不修改既有授权事实，也不把本地 E2E 当作生产零存量证据。

## 6. 非秘密 ProductManifest

```json
{
  "schema": "thirdspace-product-manifest/v1",
  "productRef": "creatoros",
  "appIdentifier": "cloud.aitongban.creatoros",
  "projectKey": "creatoros"
}
```

- manifest 和 Rust 内置值来自同一个 canonical build input，不能各写一份。
- manifest 是身份清单而非授权凭据，不包含服务密钥、激活码、claimToken、deviceSecret 或用户事实。
- release attestation 绑定 manifest digest、安装包 digest、release profile 和三仓 commit；
  避免 manifest 写 `creatoros` 而二进制内置另一 key 的假绿。

## 7. 验收

1. release workflow 和受控打包脚本不再出现 `projectKey=test`。
2. `release`、`release-fast` 分别拒绝 missing、非法、`test` 和其他合法 key，只接受 exact
   `creatoros`；debug 仍可显式使用本地 key。
3. 可分发包运行时即使注入另一 project key 或 `STRICT_VERIFY=0`，仍使用内置 `creatoros`
   并保持严格验签。
4. 可分发包 claim 固定关闭且运行时无法开启；本地 receipt 不改变该结论。
5. Rust license/claim/config/feedback 与 manifest 读取同一 canonical identity。
6. artifact inspection 不含 Growth→Activity secret，并证明 manifest digest 与安装包 digest
   同属当前 release attestation。
7. T-575 live program-gate GO 之前不发布身份切换安装包。
