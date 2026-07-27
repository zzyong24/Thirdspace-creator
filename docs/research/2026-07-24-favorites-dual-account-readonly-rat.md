# T-502 收藏来源双账号只读 RAT

> 日期：2026-07-24  
> 环境：CreatorOS desktop runtime `0.1.0`，macOS arm64  
> 目的：验证“当前工作区归属账号（owner）不变、收藏读取账号（collector）由用户从任一已绑定账号中自由选择”的真实双账号前置条件。  
> 结论：`BLOCKED`。本机账号注册册有 2 个 active 抖音号，但只有 1 个 active 账号档案能读回稳定身份；另一 active 档案无法识别身份，不能把本次验证写成双账号通过。

## 用户确认的产品口径

- 新增“我的收藏”来源时显示账号选择器，候选为本人所有 active、已绑定的抖音账号。
- 默认选中当前工作区账号只是方便操作，用户可切换到任一候选账号。
- “大号”“小号”只是用户对账号的称呼，不进入字段、权限或自动判断规则。
- 切换采集账号后必须清空上一账号的收藏夹列表与选择结果，再读取新账号。
- 当前工作区继续决定来源和采集结果归属；所选账号只决定使用哪份登录态读取收藏夹。

## 执行约束

- 仅读取账号管理页、登录身份和收藏夹列表。
- 不点赞、不收藏、不关注、不发布，不触发同步任务，不写业务数据库。
- 抖音浏览器档案先复制到 `/tmp/creatoros-t502-rat.*`，读取只在副本中执行；副本在每次验证结束后删除，原档案未被验证进程打开。
- 不记录账号昵称、抖音号、平台原始 ID、收藏夹名、Cookie、签名参数或原始 profile 目录名。
- 身份与目录只保留 SHA-256 截断摘要，用于判断“相同/不同”，不可用于还原原值。

## 结果

| 检查 | 脱敏结果 | 判定 |
|---|---|---|
| 账号注册册 | `/accounts` 返回 HTTP 200；页面渲染 2 个 active 账号行 | PASS：产品层确有两个可选账号记录 |
| 本地 profile | 共 5 个目录，均存在 Cookie 数据文件 | INFO：目录数量不等于有效账号数量 |
| active 账号到 profile 映射 | active 记录对应 `A4`、`A5` | PASS：两条 active 记录各有独立目录 |
| active `A4` 身份读回 | `ok=true`，稳定身份摘要 `1b416b384c5e` | PASS |
| active `A5` 身份读回 | `ok=false`，无稳定身份 | FAIL：第二账号登录态不可用 |
| 历史 profile 身份 | `A2`、`A3` 与 `A4` 的稳定身份摘要相同；`A1` 无稳定身份 | INFO：不能把历史目录冒充第二账号 |
| 收藏夹列表 | `A1`—`A5` 均返回 0 个收藏夹、0 个稳定收藏夹 ID | BLOCKED：空数组不能证明双账号收藏链可用 |

可复核脱敏摘要：

```text
T502_ACCOUNT_REGISTRY_PAGE={
  "httpStatus":200,
  "activeRowCount":2
}
T502_REGISTRY_PROFILE_MAPPING=[
  {"alias":"A1","referencedByAccountPage":false},
  {"alias":"A2","referencedByAccountPage":false},
  {"alias":"A3","referencedByAccountPage":false},
  {"alias":"A4","referencedByAccountPage":true},
  {"alias":"A5","referencedByAccountPage":true}
]
T502_ACTIVE_IDENTITY_RAT=[
  {"alias":"A4","ok":true,"hasStableId":true,"identityHash":"1b416b384c5e"},
  {"alias":"A5","ok":false,"hasStableId":false,"identityHash":null}
]
T502_ALL_PROFILE_FOLDERS=[
  {"alias":"A1","folderCount":0,"stableIdCount":0},
  {"alias":"A2","folderCount":0,"stableIdCount":0},
  {"alias":"A3","folderCount":0,"stableIdCount":0},
  {"alias":"A4","folderCount":0,"stableIdCount":0},
  {"alias":"A5","folderCount":0,"stableIdCount":0}
]
```

## 代码事实

当前实现尚不能表达 owner 与 collector 分离：

1. `intelligence.sources.listFavoriteFolders` 要求请求中的 `accountId` 与当前
   `RequestContext.accountId` 完全相等；
2. `browserSessionRef` 必须等于当前账号派生的
   `douyin-profile:${accountId}`；
3. 收藏夹 adapter 使用 `douyinAuthDirFor(accountId)`，其中 `accountId` 仍是当前工作区账号。

因此目标交互不能只在前端增加下拉框；Contract、服务端验属主、运行时登录态解析和审计都必须显式区分：

```text
ownerAccountId     = 当前工作区账号（决定 source/run/task/item 归属）
collectorAccountId = 用户本次从任一已绑定账号中选择的账号（只决定收藏读取登录态）
```

## 阻塞与恢复条件

当前不能进入 Contract/Build，也不能把“5 个目录”或“0 个收藏夹”包装成双账号成功。

恢复条件：

1. 用户在 CreatorOS 中重新连接第二个 active 抖音账号；
2. 两个 active profile 分别读回不同的稳定身份摘要；
3. 在 owner 保持为账号 A 时，collector 选择账号 B 能获得可证明的上游收藏夹响应；
4. 合法空收藏夹必须有上游成功证据，不能只依据 `[]` 判 PASS；
5. RAT 前后业务表无新增 source/run/task/item，证明验证未产生业务写入。

RAT 通过后再创建 replacement PLAN SPEC；原 T-496 工件已经三轮评审 FAIL，不继续原地修补。
