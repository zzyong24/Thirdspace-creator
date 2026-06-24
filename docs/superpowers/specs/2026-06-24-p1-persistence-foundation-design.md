# P1 持久化底座 设计规范

> CreatorOS 产品化第一阶段。目标:把内存 pglite 换成**真 Postgres**,引入**版本化迁移(drizzle-kit)**,连接走 `DATABASE_URL`。**行为不变**,但**进程重启数据不丢、schema 可安全演进**。这是后续 P2(真账号/空首启)、P3(对象存储)、P4(前端 hydration)的地基。

- **日期**:2026-06-24
- **分支**:`feat/service-contract`(worktree `.worktrees/frontend-implementation`)
- **已确认决策(brainstorm)**:
  1. 开发期数据库:**本地 Docker Postgres**(仓库带 docker-compose),连接走 `DATABASE_URL`。
  2. 迁移体系:**drizzle-kit 生成迁移**,Drizzle schema 对象 = 唯一真源。
  3. 测试:**混合** —— 主体 1335 测试仍跑内存 pglite(跑同一套生成迁移),另加一小撮 repository 集成测试连真 Postgres,专测真驱动/连接池。

---

## 1. 背景与现状(勘察证据)

- DB 实例化:`backend/src/db.ts:89-141`,`createDb(options)`。`new PGlite()` 无落盘=纯内存,重启清零;`drizzle-orm/pglite` 方言。
- 建表:无 drizzle-kit、无 migration 目录。启动时顺序 exec 24 个手写 `*_DDL` 字符串(`backend/src/schema/*.ts` 的 `CREATE TABLE IF NOT EXISTS`),`backend/src/db.ts:94-138`。
- 单例:`persistence-client.ts` 用 `globalThis.__creatorosPersistence` pin 住进程级单例(Next dev 多模块实例间共享同一库)。
- `createDb()` 调用点:运行时 `persistence-client.ts:773`(`buildPersistence`)+ 各模块 `*.test.ts`。
- `next.config.ts`:`serverExternalPackages` 含 `@electric-sql/pglite`(WASM 外部化)与 `@anthropic-ai/claude-agent-sdk`。
- auth、领域服务、仓库层均已是真实现(多用户 `eq(userId, ctx.userId)` 隔离),**P1 不动**。

## 2. 目标不变量

P1 完成后:
- 运行时数据落**真 Postgres**;`docker compose up` 起本地库,连接读 `DATABASE_URL`。
- schema 由 **drizzle-kit 迁移**建立与演进;Drizzle `pgTable` 对象是唯一真源;有 `__drizzle_migrations` 记录表。
- **杀掉 dev / 重启进程 → 数据仍在**(核心验收)。
- canonical 用户 + canonical/douyin 数据照常可用(幂等 seed,只在空库首次写入)。app 行为、契约、UI 不变。
- 测试主体仍 ~100s(pglite),叠加真 PG 集成抽样。

**P1 明确不做**:空首启/注册流程(P2)、对象存储(P3)、前端 island hydration(P4)、app 容器化/CI/部署(P5)。docker-compose 仅为本地起 Postgres,不部署 app。

## 3. 架构改造

### 3.1 DB 工厂拆分(关键:运行时不再 import pglite)

把单一 `createDb` 拆成「运行时(node-postgres)」与「测试(pglite)」两条,**共享同一迁移目录**,避免运行时 bundle 再依赖 pglite WASM。

- `backend/src/db.ts`(运行时):
  - `createRuntimeDb()`:`const pool = new Pool({ connectionString: process.env.DATABASE_URL })`;`drizzle(pool, { schema })`(`drizzle-orm/node-postgres`)。返回 `{ db, pool }`。
  - 启动时应用迁移:`migrate(db, { migrationsFolder: <backend/drizzle> })`(`drizzle-orm/node-postgres/migrator`),幂等。
  - **不再** exec `*_DDL`;**删除** 24 个 `*_DDL` 常量(被生成迁移取代)。
- `backend/src/db.test-helpers.ts`(仅测试导入):
  - `createDb()`(保留旧签名,测试零改动):`new PGlite()` + `drizzle(client,{schema})`(`drizzle-orm/pglite`)+ `migrate(db,{ migrationsFolder })`(`drizzle-orm/pglite/migrator`)。
  - 同一 `backend/drizzle/*.sql` 迁移,pglite migrator 应用 → 测试库与运行库**同一 schema 源**。
- `backend/src/schema/index.ts`:导出 `schema` 对象(供两个 migrator/ drizzle 实例共用),保持不变。

> pglite 是 Postgres 编译到 WASM,标准 SQL 迁移可直接 apply,故两驱动共用一套迁移文件是可行且高保真的。

### 3.2 迁移体系(drizzle-kit)

- 新增 `backend/drizzle.config.ts`:`dialect: "postgresql"`,`schema: "./src/schema/index.ts"`(或 glob 到各 `*.ts`),`out: "./drizzle"`,`dbCredentials: { url: process.env.DATABASE_URL }`。
- **前置补全(最高风险步骤)**:逐个 `backend/src/schema/*.ts`,把目前**只存在于手写 `*_DDL`**、却**未在 `pgTable` 定义里声明**的对象补进 Drizzle 定义——索引、唯一约束(如 `model_config_user_capability`)、外键、列默认值、`NOT NULL`。用每个文件的 `*_DDL` 字符串逐项核对 pgTable 第三参回调(`(t) => ({ ... index()/unique()/foreignKey() ... })`)。**这一步决定生成迁移是否完整。**
- 生成:`pnpm db:generate` → `drizzle-kit generate` → `backend/drizzle/0000_init.sql`(覆盖 24 表全量 + 索引/约束)+ `meta/`。
- 应用:`pnpm db:migrate`(独立命令)与运行时启动时 `migrate()` 两条路都可,均幂等。
- 演进:改 `pgTable` → `db:generate` 出增量 `000N_*.sql` → `db:migrate`,保留旧数据。

### 3.3 连接单例 / 池(`persistence-client.ts`)

- 保留 `globalThis.__creatorosPersistence` 单例思路,但其持有 **Pool + drizzle 实例**(非内存库),避免 Next dev HMR 反复建池。
- `buildPersistence()`:`createRuntimeDb()` → `migrate()`(确保 schema)→ 现有 seed 序列(canonical user + canonical + douyin,均 `onConflictDoNothing`)。真库持久后,seed 仅首次空库真正写入,重启不重复灌。
- 关闭语义:进程退出时 `pool.end()`(尽力,dev 可忽略)。

### 3.4 docker-compose + 配置 + 脚本

- 新增 `docker-compose.yml`(仓库根):`postgres:16-alpine`,命名卷持久化数据,`5432:5432`,env 设 `POSTGRES_USER/PASSWORD/DB=creatoros`。
- `.env.example` 增 `DATABASE_URL=postgresql://creatoros:creatoros@localhost:5432/creatoros`(占位,无真密码);`.env.local`(gitignored)填真实值。
- `backend/package.json` 脚本:`db:generate`(drizzle-kit generate)、`db:migrate`(drizzle-kit migrate / 运行 migrator)、根或 frontend 加 `db:up`(`docker compose up -d`)。
- 本地流程:`pnpm db:up` → `pnpm db:migrate` → `pnpm dev`。
- `next.config.ts`:`serverExternalPackages` **去掉** `@electric-sql/pglite`(运行时不再 import 它),**加入** `pg`(node-postgres 含原生/动态依赖,需外部化);保留 `@anthropic-ai/claude-agent-sdk`。

## 4. 测试策略(混合)

- **主体(pglite,快)**:所有现有 `*.test.ts` 经 `createDb()`(test-helper)继续在内存 pglite 上跑,但建表改为 apply `backend/drizzle` 迁移(不再 exec `*_DDL`)。测试代码零改动,~100s 反馈不变。
- **真 PG 集成抽样(新增)**:新增一小组 repository 集成测试(如 `backend/src/__pg__/*.pg.test.ts` 或 frontend 对应),连 docker-compose 的真 Postgres,专测:真 `node-postgres` 驱动可连、迁移可 apply、连接池、一个跨表 ownership 查询。用环境变量 `TEST_DATABASE_URL` gate——未设则 skip(本地无库不挂),CI/本地起库后才跑。
- 验证迁移完整性:生成迁移后,既要 pglite 全绿,也要真 PG 抽样绿 + app 能起、能登录、能读 douyin 数据(任一缺索引/列会暴露)。

## 5. 风险与对策

- **生成迁移不完整**(pgTable 漏声明索引/约束):§3.2 前置补全 + §4 双引擎验证(pglite + 真 PG + app 启动)兜底;不求与旧 DDL 字节一致,只求 schema 正确(库是全新的,无历史数据要保)。
- **pglite vs node-postgres 细微方言差**:两者均 Postgres 语义,风险低;集成抽样专门覆盖真驱动。
- **seed 在持久库重复/污染**:`onConflictDoNothing` 幂等;首次空库写入,重启不重复。
- **dev 连接池泄漏**:globalThis 单例持池,HMR 不重建。

## 6. 验收标准

1. `pnpm db:up && pnpm db:migrate && pnpm dev` → app 起、登录 canonical 用户、看到 58 抖音作品。
2. **杀掉 dev 进程、重启 → 数据仍在**(不再回 seed 初值即证持久;或:登录态/新建项目重启后还在)。
3. 在某 `pgTable` 加一列 → `pnpm db:generate` 出 `0001_*.sql` → `pnpm db:migrate` → 列加上、旧行保留。
4. `__drizzle_migrations` 表存在且记录已应用迁移。
5. 测试:pglite 主体全绿(~100s);真 PG 集成抽样在起库后全绿(未起库则 skip,不挂)。
6. typecheck 干净;契约/registry 不变(P1 不动契约)。

## 7. 文件清单(预期)

**新增**
- `docker-compose.yml`
- `backend/drizzle.config.ts`
- `backend/drizzle/0000_init.sql` + `backend/drizzle/meta/*`(生成物)
- `backend/src/db.test-helpers.ts`(pglite 测试工厂 + migrator)
- 真 PG 集成测试若干(`*.pg.test.ts`)

**修改**
- `backend/src/db.ts`(node-postgres + Pool + migrator;删 `*_DDL` exec)
- `backend/src/schema/*.ts`(补全 pgTable 的索引/约束/FK/默认;删除 `*_DDL` 常量导出)
- `frontend/src/server/persistence-client.ts`(单例持 Pool;启动 migrate;seed 不变)
- `frontend/next.config.ts`(serverExternalPackages 调整)
- `.env.example`、`backend/package.json`(scripts)、根/frontend `package.json`(db:up)

## 8. 下一阶段衔接

P1 落地后,P2(真账号/空首启)将拆掉「启动即 seed canonical/douyin」、加注册流程、douyin 数据移到 dev-only gate;P3 对象存储、P4 前端 hydration 在持久底座上各自展开。每个仍走独立 spec→plan→实现。
