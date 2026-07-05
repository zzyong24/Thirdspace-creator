# CreatorOS 部署与初始化(单机 · 多抖音号人设)

> 部署方向:**单机分发** —— 每个用户一台机 / 一个独立实例 + 一个独立数据库。一个用户可绑
> **多个抖音号**,每号一套独立人设(定位 / 作品 / 数据 / 采集),见 T-136。

## 核心原则:数据在「数据库 + 文件」里,不在代码里

CreatorOS 的所有业务数据都存在**数据库和本地文件**,**git 代码仓库里一条业务数据都没有**。
所以新用户 clone 代码 = 拿到空壳程序,不带任何人的数据。数据分三处:

| 数据 | 存在哪 | 新用户 |
|---|---|---|
| 作品 / 知识 / 定位 / 发布 / 评论 / 配置 | **数据库**(`DATABASE_URL` Postgres,或 `PGLITE_DATA_DIR` 落盘) | 用全新空库 |
| 抖音登录态(cookie) | `.auth/douyin/<accountId>/` 目录 | 自己扫码建 |
| 生成 / 采集的图·视频·截图 | 素材落盘目录 / `.cache/` | 新库无引用,天然空 |

启动时 `buildPersistence()` **只 seed「工具默认能力骨架」**(T-135 后):中性身份「创作者」+
违禁词默认表 + 校准默认 rubric + AI capability 槽(空 provider,待配)。**不再 seed 任何内容
数据**(金句 / 素材 / 定位 / 候选 / 账号 / 经验全部退役,含开发者本人的 douyin 真实金句)。

## 一、给新用户首次部署

```bash
# 1. 拿代码(零数据)
git clone <repo> && cd Thirdspace-creator && pnpm install

# 2. 起一个全新空 Postgres(docker) + 配 DATABASE_URL
pnpm db:up                         # docker compose up -d(空库)
cp .env.example .env               # 若有;否则手写 .env:DATABASE_URL=postgres://…@localhost:5432/creatoros

# 3. 建表(跑迁移)
pnpm db:migrate

# 4. 启动 → 开箱即干净:中性身份「创作者」+ 违禁词/rubric 默认 + AI 能力待配 + 空作品库
pnpm dev

# 5. 新用户走引导页(T-131 onboarding):配文本模型 → 填定位 → 扫码绑抖音号 → 建首个项目
```

新用户在设置里配**自己的**模型 provider(如 MiniMax)+ API key,扫码绑**自己的**抖音号。

## 二、部署时不会带过去的东西(确认干净)

- ✅ 代码仓库:零业务数据。
- ✅ 新用户用**独立空库**:开箱只有工具默认,无任何人的作品/内容。
- ✅ `.auth/`:新用户自己扫码,不共用。

### ⚠️ 千万别做(否则才会把数据带过去)
- ❌ 别把你的**数据库 dump / `PGLITE_DATA_DIR` 目录**复制给新用户 —— 等于搬走整个库。
- ❌ 别把 **`.auth/` 目录**复制过去 —— 会带你的抖音登录态。

## 三、把当前实例彻底重置到「从 0」(清空所有数据重来)

用于:开发者想把自己攒了数据的库清空、亲自走一遍全新初始化。**不可逆**(连真实作品一起删)。

```bash
# 0. 停 dev server(Ctrl-C)

# 1. 彻底清空数据库 —— 二选一:
#    (A) docker named volume 直接删(最干净,推荐):
pnpm db:down && docker compose down -v && pnpm db:up
#    (B) 或保留容器、只清 schema:
#    psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

# 2. 重新建表
pnpm db:migrate

# 3. 清抖音登录态 + 缓存
rm -rf .auth/douyin .cache/search-browser

# 4. 重启 → 空库 + 工具默认 seed(中性身份/违禁词/rubric/AI骨架空)
pnpm dev

# 5. 浏览器清 localStorage(DevTools Console):
#    Object.keys(localStorage).forEach(k => { if (/^(creatoros|copilot)/.test(k)) localStorage.removeItem(k) })

# 6. 走 onboarding 从 0 配置(配模型 → 定位 → 扫码 → 建项目)
```

> 只想清「canonical 假残留」但**保留真实作品**?用 `backend/scripts/purge-canonical-residue.ts`
> (dry-run 优先),别用本节的全清。

## 四、单机分发 vs 多租户云

- **单机分发(当前方向)**:每用户独立实例 + 独立库。代码里「本机主用户」内部 id 写死
  `user-zyongzhu`(仅内部标识,UI 显示中性「创作者」,用户不可见),每个实例互相独立,**无影响**。
- **多租户云(将来若做)**:一个库装多用户时,这个写死 id 需改成「每个新用户动态生成」+
  真正的登录鉴权(现为单机免登录 T-046)。届时另立任务处理。
