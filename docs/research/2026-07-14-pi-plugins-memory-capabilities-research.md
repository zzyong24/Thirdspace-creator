# Pi 扩展性 / 插件生态 / 记忆能力 —— 深挖调研

- 日期:2026-07-14
- 任务:补齐上一份基础调研(`2026-07-14-pi-runtime-integration-research.md`)未覆盖的维度——Pi(`earendil-works/pi`)的**插件/扩展架构、记忆能力、MCP、子 agent、skill 热加载、状态持久化**。用户特别强调「Pi 有很多插件」「Pi 需接入记忆层」。
- 证据全部来自 Pi 官方 docs(`packages/coding-agent/docs/*.md`)、DeepWiki 架构页、npm 包元数据、GitHub issue/package。

## 头号结论(先给,会改基础调研的选包结论)

**上一份调研拍板「只用 `pi-agent-core`,`pi-coding-agent` 是 CLI 不用」——这个选包在「要插件 + 要记忆」的目标下站不住。**

因为 **用户想要的插件生态、记忆压缩、会话持久化、skill、MCP、sub-agent,几乎全部只存在于 `pi-coding-agent`,`pi-agent-core` 一个都不带**(见下表)。而关键事实是:**`pi-coding-agent` 本身导出一套可库级嵌入的 SDK(`createAgentSession()` / `createAgentSessionRuntime()`)**,不是只能当 CLI 跑。所以正解不是「嵌 pi-agent-core 自己造记忆/插件」,而是**嵌 `pi-coding-agent` 的 SDK**——用户要的东西大半开箱即得。

| 能力 | `pi-agent-core`(基础调研选的) | `pi-coding-agent`(SDK 可嵌) |
|---|---|---|
| agent 循环 / 工具 / turn 生命周期 | ✅ 有 | ✅ 有(封装 core) |
| 上下文压缩(记忆短期) | ❌ 无 | ✅ 内置(auto-compaction) |
| 会话持久化(JSONL/fork/resume) | ❌ 无 | ✅ 内置(SessionManager) |
| skill(SKILL.md 渐进披露) | ❌ 无 | ✅ 内置 |
| extension / plugin 体系 | ❌ 无 | ✅ 内置(ExtensionAPI) |
| Pi Packages(npm/git 装插件) | ❌ 无 | ✅ 内置(`pi install`) |
| MCP client | ❌ 无 | ✅ 社区扩展 `pi-mcp-adapter` 现成 |
| sub-agent 编排 | ❌ 无 | ⚠️ 非内置,有示例扩展(spawn) |
| prompt 模板 / 主题 | ❌ 无 | ✅ 内置 |

代价:`pi-coding-agent` 依赖更重(拖 `@earendil-works/pi-tui`、`photon-node`、`highlight.js`、`undici`、`jiti` 等),且自带的默认工具是**编码工具**(read/edit/shell),嵌进 CreatorOS 要用 `customTools` / `skillsOverride` 覆盖成我们的领域工具。这是一次**架构选型再评估**,不是小改。

---

## ① 插件 / 扩展架构 + 现成插件清单

### 架构(证据:`docs/extensions.md`、`docs/packages.md`)

Pi 的插件叫 **extension**,是 **TypeScript 模块**(经 `jiti` 加载,免编译),导出一个工厂函数:

```ts
export default function (pi: ExtensionAPI) { /* ... */ }   // 也支持 async
```

`ExtensionAPI`(插件能调的注册面)方法:
- `registerTool()` — 注册 LLM 可调工具(带 `renderCall`/`renderResult` 自定义渲染)
- `registerCommand()` — 注册 `/xxx` slash 命令(同名多插件自动加 `:1`/`:2` 后缀)
- `registerShortcut()` — 绑快捷键
- `registerFlag()` — 加 CLI 参数
- `on(event, handler)` — 订阅约 30+ 生命周期事件(`session_start`、`tool_call`、`tool_result`、`message_update`、`before_agent_start`、资源发现、模型选择、用户输入……)
- `sendMessage()` / `sendUserMessage()` — 注入消息(投递模式 `steer`/`followUp`/`nextTurn`)
- `appendEntry()` — **往会话里存自定义状态**(← 记忆/状态注入的口子)
- `getActiveTools()` / `setActiveTools()` — **运行时增删激活工具**(热加载工具)
- `setModel()` — 运行时换模型
- `registerProvider()` — **注册自定义 LLM provider(← model-config 回接可走这里)**
- `registerMessageRenderer()` / `registerEntryRenderer()` — 自定义 UI 组件
- `exec()`、`events`(共享事件总线)

`ExtensionContext`(handler 里拿到):`ctx.ui`(`.select/.confirm/.input/.custom`)、`ctx.cwd`、`ctx.sessionManager`、`ctx.signal`、`ctx.isIdle()`、`ctx.getContextUsage()`;命令上下文还有 `ctx.fork()`、`ctx.newSession()`、`ctx.switchSession()`、`ctx.navigateTree()`、`ctx.reload()`。

**底层 hook(在 `pi-agent-core` 层,基础调研已记)**:`beforeToolCall`(可 block)、`afterToolCall`。extension 的 `pi.on('tool_call')` 是更高层的封装。

### 装 / 注册方式(`docs/packages.md`、`docs/extensions.md`)

extension 自动发现自:
- `~/.pi/agent/extensions/*.ts`(全局)、`.pi/extensions/*.ts`(项目局部)
- `settings.json` 的 `"extensions"` 路径 / `"packages"` npm|git 包
- `pi -e ./x.ts`(仅临时测)

**Pi Packages** = 把 extension/skill/prompt/theme 打成一个 npm 或 git 包分发。`package.json` 里 `pi` key 声明资源目录,或走约定目录(`extensions/`、`skills/`、`prompts/`、`themes/`)。安装:
```bash
pi install npm:@scope/pkg@1.2.3
pi install git:github.com/user/repo@v1
pi install ./local/path
```
或 `settings.json` 的 `"packages": [...]`。

### 现成插件清单(核实到的)

**关键落差:Pi 官方并没有一个「琳琅满目的官方插件市场」。** extension 机制齐全、Pi Packages 分发链路齐全,但官方 docs **没有列出成体系的现成插件清单**;生态以「示例 + 社区包」为主。核实到的:

| 名字 | 能力 | 官方? | 装法 |
|---|---|---|---|
| **pi-mcp-adapter** | MCP client 适配器:把外部 MCP server 的工具接进 Pi(见 ③) | 社区(nicobailon,MIT) | `pi install npm:pi-mcp-adapter` |
| sub-agent 示例扩展 | `node:child_process.spawn` 起 pi 子进程,Single/Parallel/Chain 编排(见 ④) | 官方示例(`docs`/repo examples) | 拷示例 .ts 进 extensions 目录 |
| MCP extension 官方示例 | issue #563 提的官方 MCP 示例扩展 | 官方,**仍 open/未合入** | 未发布 |
| 内置资源示例 | compaction 自定义、custom-provider、theme、prompt-template 等 docs 均带可拷示例 | 官方 docs | 拷贝改写 |

> 判断:用户印象里「Pi 有很多插件」更准确的说法是 **「Pi 有一套完整、开放、npm/git 可分发的插件框架」**,而不是「有一堆现成插件可直接装来省活」。除了 `pi-mcp-adapter`(这个确实省事),其余大多要我们自己按 ExtensionAPI 写——但写起来很轻(一个 default 函数)。

---

## ② 记忆能力(内置 vs 插件 vs 自建,推荐接法)

### 内置:短期上下文压缩(`docs/compaction.md`、DeepWiki session-management)

`pi-coding-agent` **自带 auto-compaction**(记忆的「短期」层):
- **自动触发**:每次 prompt 前估算 token,超过 `contextWindow - reserveTokens`(默认 `reserveTokens=16384`)就压缩。
- **切点**:`findCutPoint()` 从最新消息往回累加,保留最近 `keepRecentTokens`(默认 20000)的原文,更早的走 LLM 摘要;在自然边界切,避开 tool result;单 turn 超限会 split-turn 分段摘要再合并。
- **落盘**:生成 `CompactionEntry` 追加进会话文件,`firstKeptEntryId` 标未压缩边界;并抽取被压缩段里的文件操作记进 `details`。
- **可自定义**:`compact(customInstructions?)` 手动触发、可注入自定义摘要指令;extension 也能插自定义 compaction 逻辑。

### 内置:会话状态持久化(= 跨会话「续」的记忆,见 ⑥)

JSONL 树状会话 + fork/clone/resume。这是「同一任务跨会话续上下文」的记忆,但**不是跨任务的长期语义记忆**。

### 缺口:长期语义记忆 / 检索(RAG)

Pi **没有内置**长期记忆库 / 向量检索 / 「记住用户偏好跨项目复用」这类。要长期记忆,三条路:
1. **skill 当静态长期记忆**:把稳定知识写成 `SKILL.md`,渐进披露按需加载(适合「方法论/规则」类记忆,不适合动态事实)。
2. **extension + `appendEntry()` / `pi.on()`**:自己在事件里把要记的写进外部存储(CreatorOS 的 PGlite),再在 `before_agent_start` 注入回上下文。
3. **memory 当一个 tool**:注册 `memory_save` / `memory_search` 工具,后端接 CreatorOS 已有存储,让模型自己存取(最通用)。

### 推荐接法(最省事排序)

- **短期记忆**:直接白嫖 `pi-coding-agent` 的 auto-compaction,零成本——**这是「接入记忆层」最省事的一半**。
- **跨会话续**:用内置 SessionManager(见 ⑥),把 JSONL 会话目录指到 CreatorOS 的 app-data,天然跨会话续。
- **长期语义记忆**:用户若要「跨任务记住品味/偏好」,走 **memory-tool + CreatorOS 存储** 自建(Pi 不带,但 tool 注册成本低);别指望 Pi 现成给。

> 一句话:**Pi 的记忆层 = 内置短期压缩(白拿)+ 内置会话续(白拿)+ 长期语义记忆得我们自己用 tool/extension 接 CreatorOS 存储。** 用户说的「接入记忆层」,前两块 Pi 已备好,第三块需我们接。

---

## ③ MCP 支持(client / server)

- **MCP client:✅ 能,且有现成社区包 `pi-mcp-adapter`(npm,MIT,`pi install npm:pi-mcp-adapter`)。** 证据:`pi.dev/packages/pi-mcp-adapter`。
  - 传输:**stdio**(本地进程)、**HTTP/SSE**(远端,支持 bearer/OAuth)。
  - 读标准 MCP 配置(`~/.config/mcp/mcp.json`、`<pi-dir>/mcp.json`、`.mcp.json`、`.pi/mcp.json`),**与 Claude Code 同格式**——CreatorOS 现有 MCP server 配置可直接喂。
  - 用 `mcp()` 单一 proxy 工具(~200 token)暴露全部 MCP 工具,避免上下文被几百个 tool 定义撑爆;也可 `directTools` 把指定工具提升为一级工具。
  - 懒连接(用到才连)、tool 元数据本地缓存(不连也能 search/describe)、10 分钟空闲自动断。
- **官方 MCP 示例扩展**:issue #563(2026-01-08 开)仍 **open,未合入**;官方内建 MCP 尚未落地,当前靠社区 `pi-mcp-adapter`。
- **MCP server(把 Pi 当 server 暴露给别人):❌ 无证据支持。** Pi 定位是 client/host 侧消费 MCP,不是把自己发布成 MCP server。(另有 ACP/Agent Client Protocol 的 discussion #4444,是另一回事。)

> 对 CreatorOS 的意义:**我们现有的 MCP 工具能直接喂给 Pi**(装 `pi-mcp-adapter` + 复用 mcp.json),这块基本不用自己写。

---

## ④ 子 agent / 多 agent

- **非内置。** 官方明说:Pi 不内建 sub-agent,而是「用 tmux 起多个 pi 实例 / 用 extension 自建 / 装一个别人写的包」。
- **官方示例扩展**:用 `node:child_process.spawn` 起 pi 子进程,支持 **Single / Parallel / Chain** 三种编排模式。
- **orchestrator 包**:monorepo 有 `packages/orchestrator/`(RPC 协调,**标 experimental**)+ `docs/rpc.md`,是进程级编排的官方基建,但实验性。
- SDK 侧:`docs/sdk.md` 明列用例「Build custom tools that spawn sub-agents」——即注册一个「起子 agent」的 customTool,自己在里面 `createAgentSession()` 再跑一轮。

> 对 CreatorOS:sub-agent 要我们自己搭(注册一个 spawn 工具 or 复用示例),Pi 不白给;但 SDK 允许「工具里再开一个 session」,实现路径清晰。

---

## ⑤ 工具 / skill 热加载(关系到「和 Pi 对话改 skill」)

### 工具热加载:✅ 支持

`ExtensionAPI.getActiveTools()` / `setActiveTools()` **运行时增删激活工具**;`session.agent.state.tools` 也可读写。`registerProvider()`/`setModel()` 运行时换 provider/模型。所以「跑着改工具集」可行。

### skill(`docs/skills.md`)—— 用户「对话改 skill」的核心载体

- **skill = 一个含 `SKILL.md` 的目录**;frontmatter 必填 `name`+`description`,选填 `allowed-tools`、`disable-model-invocation`、`license`、`metadata` 等;正文是指令,可带 `scripts/`/`references/`/`assets/`。**与 Anthropic Skills 同构**(CreatorOS 现有一堆 SKILL.md 可直接复用)。
- **发现路径**:`~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/`、`.agents/skills/`(递归到 git root)、npm 包的 `skills/` 或 `package.json` 的 `pi.skills`、`settings` 的 `skills` 数组、CLI `--skill`。
- **渐进披露**:系统提示里常驻只有 skill 的 name+description(XML),命中才用 `read` 加载全文 `SKILL.md`,或 `/skill:name` 显式调。→ 加再多 skill 也不炸上下文。
- **热加载**:extension 支持 `/reload` 热重载;skill 是文件系统扫描,新增/改文件后 reload 即生效。
- **SDK 注入**:`createAgentSession({ skillsOverride })` 可编程注入 skill 集;`DefaultResourceLoader` 负责发现。

> 对「和 Pi 对话改 skill」:完全可行且天然——让 Pi 用文件工具写 `~/.pi/agent/skills/<name>/SKILL.md` 再 reload,就是「对话即改 skill」。CreatorOS 的品味飞轮(对话沉淀 skill)与 Pi 的 skill 体系是**同一套 SKILL.md 抽象**,可对齐。

---

## ⑥ 状态持久化

- **格式**:JSONL,每行一条独立 JSON,追加写不用重写全文件;**树状**(`id`/`parentId`),支持分支。
- **条目类型**:`message`、`compaction`(带 `firstKeptEntryId`)、`branch_summary`、`model_change`、`thinking_level_change`、`custom`(extension 状态,持久但不进 LLM 上下文)、`custom_message`(extension 注入进上下文)、`label`(书签)、`session_info`。
- **API(`pi-coding-agent` 导出)**:`SessionManager.create(cwd)` / `.continueRecent(cwd)` / `.open(path)` / `.list(cwd)` / `.inMemory()` / `.fork(entryId)` / `.getBranch(id)` / `.getTree()` / `importFromJsonl()`;SDK 层 `createAgentSessionRuntime()` 提供 `newSession()`/`switchSession(path)`/`fork(entryId)`。
- **存储后端**:官方给 **file-backed(JSONL)** 与 **in-memory** 两档(DeepWiki 提到 `InMemorySessionStorage` / `JsonlSessionStorage` 两个导出 + 自定义 metadata)。**接 CreatorOS 记忆层的两条路**:
  1. 最省事:`SessionManager.create(<CreatorOS app-data 目录>)`,让 Pi 把 JSONL 会话写进我们的数据目录,跨会话 resume/fork 白拿。
  2. 深接:若要落进 PGlite,需实现自定义 SessionStorage(接口存在但公开稳定性待装包核实)——工作量更大,非首选。
- **凭证/模型状态**:`AuthStorage.create(path)`(可指自定义路径)+ `ModelRegistry.create(authStorage)`;runtime key 用 `setRuntimeApiKey`(不落盘)——**model-config 回接可经此**,而非只走 pi-ai `createProvider`。

---

## 依赖 / 打包影响(相对基础调研的增量)

`pi-coding-agent` 依赖比 `pi-agent-core` 重:除 `pi-agent-core`+`pi-ai`,还拖 `@earendil-works/pi-tui`、`@silvia-odwyer/photon-node@0.3.4`(图像,可能带 wasm/native)、`highlight.js`、`jiti`(动态加载 .ts extension)、`undici`、`proper-lockfile`、`glob`、`chalk`、`diff` 等。**均 JS/wasm 级,无重型 native addon**(photon-node 是 wasm 需验证),但打包 sidecar 的实拷清单要比只嵌 pi-agent-core 长——沿用基础调研 §4 的 `serverExternalPackages` + build-sidecar 实拷范式即可,只是包多几个。`jiti` 运行时加载 .ts extension 这一点在打包环境要专门验证(可能需预编译或改走 .js extension)。

---

## 待装包现场核实项

1. 自定义 SessionStorage 接口是否公开稳定(要落 PGlite 才需;走 app-data 目录则不需)。
2. `photon-node` 在 sidecar/桌面打包里是否引入 native/wasm 加载问题。
3. `jiti` 动态加载 `.ts` extension 在打包后能否工作(可能得预编译成 .js 或用 SDK 的 inline factory 绕开文件发现)。
4. `pi-mcp-adapter` 是社区包(非官方),版本/维护风险需评估;或参考它自建一个受控的 MCP client extension。
5. `pi-coding-agent` SDK 的 `createAgentSession` 是否能完全禁用其内置编码工具(read/edit/shell),只留我们的 `customTools`——需核实(基础调研的工具白名单物理隔离要在这层重做)。
