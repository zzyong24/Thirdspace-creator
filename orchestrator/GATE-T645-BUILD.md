# GATE-T645 — 渠道模型逐能力管控

> 日期：2026-08-02  
> SPEC：`docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md`  
> 评审：`PASS[REV:5dfe24b42eb7]`

## 结论

本地实现与聚焦 Gate 通过。模型 authority 已从“渠道 extension 整体接管”改为 capability
逐项裁决；渠道没给、给残或客户端不支持的能力继续使用用户本地配置。白标缺失仍由既有壳层
回退官方 CreatorOS 名称，未参与模型裁决。

## 已验证

- `default / transcribe.audio / image.generate / video.generate` 共用唯一 parser，逐项输出
  `managed | local`。
- 完整 managed 能力只读渠道 provider/model/base/protocol；缺 Key 明确阻断，不回退本地。
- local 能力保留原 DB/env/Whisper 路径，渠道只管文本时 ASR 仍可编辑，反向亦然。
- service Key 以 `userId + scopeId + serviceId` 加密保存；公开 API 不接受 scopeId、不回显明文；
  多能力共用 service 时只列一次 Key；重置工作区后从归档迁回的也始终是密文。
- scopeId 为版本化 identity JSON 的 SHA-256；异步 digest 同时绑定 scopeId + payload；渠道切换后
  旧任务在 provider 调用前取消并提示“模型配置已变化，请重新发起”。
- 设置页显示“渠道已接管 N/4 类模型，其余由你配置”，managed 卡只读，local 卡保持完整表单；
  service Key 操作在小视口纵向排列，充值/帮助链接按已验签字段存在性展示。

## 命令证据

1. Contract registry：3 tests PASS。
2. Backend parser / resolver / encrypted repository / settings service：58 tests PASS。
3. Frontend scope / authority / composition API / search fallback / settings UI：96 tests PASS。
4. Backend 与 Frontend `tsc --noEmit`：PASS。
5. `PATH=/opt/homebrew/opt/node@25/bin:$PATH pnpm --dir frontend build`：PASS；仅保留仓库既有
   Turbopack dynamic filesystem tracing 与 ESM external 警告，无本任务新增构建错误。
6. `boundary-scan`：0 条新增违规（5 条既有基线）。
7. `orphan-scan`：0 error，既有规划链 warning 保留。
8. `workspace-restore.test.ts`：7 tests PASS，覆盖渠道 service Key 密文的归档迁回。
9. 本地 `release-fast` 验收包构建 PASS：Node 25、sidecar 真启动冒烟、最终包 verdict 公钥、
   TLS 自包含与 DMG CRC 均通过；产物 `CreatorOS_0.2.1-beta.3_aarch64.dmg`，按用户要求明确
   `signed:false / notarized:false`，只用于本机验收。

## 后置范围

- Growth 托管子 Key、余额、额度、用量和充值回调不在本任务实现，由 T-653 在中转站正式协议
  固定后承接。
- OmniHi video adapter 尚未实现，因此当前渠道中的 OmniHi 视频能力如实判为 local，不显示为
  已托管。
- 本地验收包已生成；正式安装包上的真实长期 verdict 密钥、代码签名、公证及完整渠道配置 E2E
  仍随正式发布执行。本地包使用仅存在于本次构建进程的临时 verdict 密钥，不得对外分发。
