# T-704 BUILD 证据：渠道配置空 POST 真机形态回归

日期：2026-08-05（America/Los_Angeles）

## 根因与修复

- 桌面壳激活回调和设置页 Bootstrap 都按既有安全协议发送零字节 POST，不携带授权码、渠道身份、
  ticket、bundle 或受管 Key。
- Next.js 的 Node 请求适配器会把真实 POST（即使字节数为 0）表示为非空 `body` stream；原 route
  用 `request.body !== null` 判断是否携带内容，导致生产桌面请求在调用配置同步服务之前固定返回
  422“请求格式不正确”。
- route 现改为检查真实字节：合法零字节流进入既有 server-only 同步链；声明长度非法/大于 0，
  或流中读到任意字节仍 fail-closed 返回 422。伪报 `Content-Length: 0` 不能绕过。

## TDD 证据

- RED：`pnpm --dir frontend exec vitest run src/app/api/v1/local/client-config/route.test.ts`
  新增零字节 body-stream 回归后稳定得到 `expected 422 to be 200`，证明不是假阳性测试。
- GREEN：
  `pnpm --dir frontend exec vitest run src/server/activation/client-config.server.test.ts src/app/api/v1/local/client-config/route.test.ts src/components/shell/channel-config-bootstrap.test.tsx src/features/settings/settings-page.test.tsx`
  —— 4 个文件、58/58 通过。
- `pnpm --dir frontend exec eslint src/app/api/v1/local/client-config/route.ts src/app/api/v1/local/client-config/route.test.ts`
  —— 通过。
- `pnpm --dir frontend typecheck` —— 通过（本机 Node 22 仅报告项目声明 Node >=24 的既有 engine 警告）。
- `node orchestrator/process/boundary-scan.mjs` —— 0 个新增违规，既有基线保持 5。

## 安全与验证边界

- Web 请求协议仍为空 POST；本修复没有把任何秘密字段移入 body，也没有放宽 loopback + handshake
  信任门。
- 当前已安装的 0.3.0 包仍含旧 route，只有重新构建并安装包含本修复的本地包后，才能继续做
  Activity → Growth bundle → OmniHi 受管 Key 的真实网络验收；本任务不把组件回归冒充 live 验收。
