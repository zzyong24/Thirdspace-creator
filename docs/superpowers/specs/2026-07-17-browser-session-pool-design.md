# SPEC:浏览器登录态系统化 + Profile 池(T-370)

> 用户 2026-07-17 拍板方向:「Cookie 存到我们系统里,按需注入,做一个池,最多 5 个 Profile」。
> 本 SPEC 把该方向落成可实现设计,并划一条**风控红线**:抖音不进池。
> **改数据归属**(登录态从 playwright profile 文件目录 → 系统 DB 加密表)→ 过 spec-review gate 才开工。

## 0. 一句话定义

Web 域登录态(ChatGPT/GitHub 等 web-session 保管库)从「埋在 `.auth/web/<domain>` profile 目录」
改为「**加密存进系统 DB 当单一真值**,持久 profile 池(≤5)checkout 时按需注入、用完回写归还」;
**抖音扫码登录态完全不动**(per-account persistent profile 抗风控,T-369 guard 已治其稳定性)。

## 1. AS-IS(源码证据)

- cookie **不在系统里**:web 域在 `.auth/web/<domain>`(persistence-client.ts:1350 webAuthDirFor),
  抖音在 `.auth/douyin/<accountId>`(:1339)——都是 `launchPersistentContext` 的 userDataDir,
  系统读不到、备份不了、无法按需注入;web-session.ts 零 storageState 调用。
- 同域内单 profile:登录窗与状态探针同 authDir,T-369 修后不再互相拆台但仍串行排队。
- T-369 chromium-guard 已就位:per-profile 残留清理/串行/超时人话错——**池化后继续复用**(每个池
  成员 checkout 前走同一 guard)。
- 加密先例:settings.repository.ts + secret-migration.ts 已用 master-key 加密模型 key——**复用同款
  加密 helper**,不新造 crypto。

## 2. 关键裁决

### 2.1 抖音不进池(风控红线,不容再议)
抖音风控对设备指纹敏感;当年拍板 `launchPersistentContext` 专属持久 profile 正为指纹稳定
(douyin-collection-approach)。**抖音保持现状**:`.auth/douyin/<accountId>` per-account 专属,
不注入不轮换。本 SPEC 只动 **web 域**(web-session 登录保管库 / web-reader 读文 / web-capture 截图)。

### 2.2 混合式而非纯注入
纯「每次新建临时 context + 注 cookie」指纹每次变,一样有被风控/掉登录风险(web 站点同理,只是
弱于抖音)。故:**持久 profile 池**(池成员目录复用不销毁 → 指纹相对稳定)+ **DB 存 storageState
单一真值** + checkout 注入/归还回写。两全:并发不争抢 + 登录态可管理。

### 2.3 池语义
- 池目录 `.auth/pool/p1..p5`(上限 5,可配 env);成员无域绑定,谁 checkout 谁注入自己的域 cookie。
- checkout(domain):取空闲成员(走 T-369 guard 预检)→ 清该成员上残留 cookie → 从 DB 解密注入该域
  storageState → 返回 context;并发超池上限 → 排队(复用 guard 串行队列思想,池级)。
- return:读回 context.storageState → 加密写回 DB(登录态更新不丢)→ 清成员 cookie → 标空闲。
- 崩溃恢复:成员目录残留(进程死没 return)→ 下次 checkout 时 guard 清理即可,DB 真值不受影响
  ——这正是对 T-369「打不开」的根治:**登录态不再依赖 profile 目录活着**。

## 3. 设计

### 3.1 新表 `browser_sessions`(迁移 0047)
`id / user_id NOT NULL / scope_kind('web-domain') / scope_key(domain) / state_encrypted(TEXT,
master-key 加密的 storageState JSON) / updated_at`;唯一键 (user_id, scope_kind, scope_key)。
预留 scope_kind 枚举扩展位但**本期只 web-domain**(抖音红线不进)。account_id 不加:web 登录保管库
现状即用户级(域名维),不随抖音号切换——保持语义不变。

### 3.2 pool manager(`frontend/src/server/ingestion/browser-pool.ts` 新)
checkout/return/池上限/排队/guard 集成/回写,如 §2.3;deps 注入可单测(fake launch/fs/db)。

### 3.3 存量迁移(一次性 best-effort)
首次 checkout 某域且 DB 无该域记录 → 尝试从旧 `.auth/web/<domain>` 目录起一次 context 读
storageState 导入 DB(成功后旧目录改名归档);失败(目录坏/无)→ 诚实要求重新登录一次。
不做批量预迁移(按需惰性,失败面小)。

### 3.4 接线
web-session(登录窗+探针)/ web-reader / web-capture(需登录态时)→ 全走 pool.checkout(domain);
登录窗特殊:登录成功即回写 DB(登录态第一时间进系统)。douyin-cdp **零改动**。

## 4. 不做

- 抖音登录态入池/注入(§2.1 红线)。
- 指纹伪装/多指纹管理(超范围)。
- storageState 出网/云同步(P-04 本地优先;DB 本地加密)。

## 5. 切片

- **T-370a**:`browser_sessions` 表+迁移 0047+加密存取(复用 settings master-key helper)+
  web-session 登录成功回写/checkout 注入(单域先通,含存量惰性迁移)。
- **T-370b**:browser-pool.ts 池管理(≤5/排队/guard 集成/return 回写)+ web-reader/web-capture 接线。
- **T-370c**:真机验(登录一次→DB 有加密记录→杀 profile 目录→再打开仍登录[真值在系统]→并发多窗不抢)。

## 6. gate

改数据归属(登录态文件→DB)→ 过 spec-review gate(verdict≠FAIL)才开工。重点审:①抖音红线是否
守住(zero touch)②加密与 P-04 ③存量迁移失败面诚实。
