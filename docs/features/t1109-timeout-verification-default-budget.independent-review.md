# T-1109 独立 SPEC 初审

- 结论：**PASS**
- SPEC SHA-256：`643f8beeca0218a3c9c169988f2ab032478e119e3b39d0c0102f92ba608dc44a`
- modules.config SHA-256：`4010dd9eeb7ba433427d6d0d8e6343e472e58a2d22325af59f71b096dde210d3`
- Constitution SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 当前 `tools/timeout-policy/verify.mjs` SHA-256：`be3ac0cba4c3c0b8300e8abaca9806058a9cedb655cde75b65f34ad0e725c85c`

## 判断

实际日志 SHA `39cdd8bb6bfca9a64ccc64f79b6d31448bf4fe5e10507496ab4634c7f8d4850f` 明确显示 backend 三文件命令只有 `--retry=0`，`execution-call-ledger.service.test.ts` 的 `beforeAll` 命中 Vitest 默认 10000ms，导致 25 例全部 skip；这不是产品失败，也不能计为已验证通过。SPEC 的根因和证据一致。

修复边界充分且最小：

- 只修改 `tools/timeout-policy/verify.mjs`；
- 给其 Vitest 调用显式传入 `--testTimeout=120000` 和 `--hookTimeout=120000`，包括 mcp-server 的 pnpm test 透传；
- 不修改测试源、不新增镜像断言、不改变 Node 原生探针、spawn/退出码、产品期限或外层执行上限；
- 局部已有更长预算继续优先，不被缩短。

T1109 模块绑定与 SPEC 一致：唯一产品/工具写入为 verify 入口，验证先以相同三个 backend 文件、retry=0 和真实 PGlite 证明 0 skip，再执行完整 verify、三门卫和 reconcile。完整 verify 若仍因原静态27项失败，必须继续 exit 1 并关联既有 T1081，不能洗绿。

## 边界

本结论仅允许 root 在正式 record/start 后串行修改验证入口。未签署实现、完整 verify、全局 Gate、安装或产品功能。
