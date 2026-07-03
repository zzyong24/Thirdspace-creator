# @creatoros/mcp-server

CreatorOS 的 MCP 底座(T-063f,吸收 T-059「全功能 CLI 化」战略)。把 `@creatoros/contract` 的全部 ops 自动暴露为 MCP tools,外部 MCP client(Claude Code / Claude Desktop / 任意 MCP 客户端)以 stdio 连接后即可调用 CreatorOS 的能力。

## 架构

- **stdio 进程形态**:本包是独立进程,不直连 DB、不 import persistence-client(避免双持 Pool 和调度器)。
- **一切走 dispatch**:每个 tool call 通过 HTTP 打到运行中的 Next dev server 的 `POST /api/v1/dispatch`,复用全部鉴权 / transport / 确认门语义,零重复装配。
- **工具面自动生成**(`src/tools.ts`):遍历 contract `ENDPOINTS` ——
  - 工具名 = op id 点换下划线(`projects.list` → `projects_list`);
  - inputSchema = endpoint 的 `params` / `query` / `body` zod schema 经 `z.toJSONSchema`(zod v4)合成 `{ params?, query?, body? }`,与 dispatch 的 input 形状一一对应;
  - annotations:GET → `readOnlyHint`;DELETE → `destructiveHint`;
  - description:写 op 写明确认门语义(AI 任务类 op 只产候选、需 `ai_tasks_confirm` 才物化);物理删除类附高危警告。
- **辅助工具** `creatoros_overview`:一发拿 dashboard 摘要(等价 `pages_dashboard_get`),外部 AI 起步入口。

## 前置条件

CreatorOS dev server 在运行(默认 `http://localhost:3000`):

```bash
pnpm --filter @creatoros/frontend dev
```

## 在 Claude Code 里接入

```bash
# tsx 直跑(monorepo 各包以 src/*.ts 直发,无需 build)
claude mcp add creatoros -- node --import tsx /Users/zyongzhu/Workbase/Thirdspace-creator/mcp-server/src/index.ts

# 或走 bin 入口(等价,内部经 tsx ESM loader 加载 TS)
claude mcp add creatoros -- node /Users/zyongzhu/Workbase/Thirdspace-creator/mcp-server/bin/creatoros-mcp.mjs
```

Claude Desktop(`claude_desktop_config.json`)同理:

```json
{
  "mcpServers": {
    "creatoros": {
      "command": "node",
      "args": ["--import", "tsx", "/Users/zyongzhu/Workbase/Thirdspace-creator/mcp-server/src/index.ts"],
      "env": { "CREATOROS_BASE_URL": "http://localhost:3000" }
    }
  }
}
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `CREATOROS_BASE_URL` | `http://localhost:3000` | dev server 根地址 |
| `CREATOROS_EMAIL` | — | 登录邮箱;与 PASSWORD 同配时启动后自动 login 拿 session cookie,401 自动重登 |
| `CREATOROS_PASSWORD` | — | 登录密码 |

两个凭据都缺省 = T-046 本机免登录模式:dispatch 裸调(服务端以本机主用户直通)。

## 确认门语义(写操作)

- **AI 任务类**(`ai_tasks_create` 等):只产生候选结果,不落账;必须审阅后调 `ai_tasks_confirm` 才物化。`cancel` / `results.patch` 只作用于候选。
- **物理删除类**(DELETE,如 `contentCalendar` 删除):tool description 带【高危】警告,`destructiveHint: true`,调用前必须得到用户明确确认。
- 其余 POST/PATCH/PUT:直接落账的业务写,description 中已注明。

## 开发

```bash
pnpm --filter @creatoros/mcp-server typecheck   # tsc 0 错
pnpm --filter @creatoros/mcp-server test        # vitest 单测(schema 转换/工具名/dispatch 封装)
pnpm --filter @creatoros/mcp-server smoke       # 冒烟:stdio 起 server,initialize + tools/list + tools/call 对着 :3000 真调
```

冒烟脚本 `scripts/smoke.mjs` 模拟最小 MCP client:子进程 stdio 拉起 server,JSON-RPC 走 initialize → tools/list → `projects_list` → `pages_dashboard_get`,三步都要真实返回才算过。
