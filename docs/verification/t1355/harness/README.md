# T1355 私有绑定验收宿主

本工具只服务隔离验收，不是业务运行入口。必须传入本轮全新、当前用户拥有的空 `mkdtemp` 目录；不复用用户数据库、App、profile 或任何实际账号。源码不写生产路径。

启动：从仓库运行 `pnpm -C backend exec tsx <本文件同目录/binding-fixture-server.mts的绝对路径>`。调用者提供 `T1355_FIXTURE_ROOT`、`T1355_PG_PORT`、`T1355_HOST_PORT`。端口须不同且大于1023，禁止5432/55422。PostgreSQL使用本机 `/opt/homebrew/bin`，只监听127.0.0.1，禁Unix socket以兼容macOS长临时根。私有role为`t1355_fixture`，数据库为`creatoros_t1355`；不读取现有连接文件或真实凭据。

私有 `root/ready.json` 权限0600，含同私有库连接串、真实owner用户/组ID、helper/PG PID、端口和ready时间；stdout仅报告文件路径、PID、端口，不能把连接串打印进验收日志。根目录0700，所有原根与失败日志保留。启动时真实 `createRuntimeDb` 迁移并调用 `ensureLocalUser`；Next必须等ready后使用同一私有DATABASE_URL，且配置现成 `CREATOROS_DISABLE_BACKGROUND_DRIVERS=1` 与 `CREATOROS_DISABLE_SCHEDULER=1`。

| 接口 | 数据 |
| --- | --- |
| `GET /health` | 实际DB SELECT1后返回`{ready:true}`，未ready/DB不可读503。 |
| `GET /state` | 见下方结构；绑定状态通过每个run真实冻结groupId读取。 |
| `POST /rpc` | `{id,input:{params?,query?,body?},scope?:{groupId?,accountId?}}`；固定真实fixture owner，组/账号边界仍经真实service。返回真实transport `{data,meta}`。只开放文件中的精确binding/group/account操作，其余404；不接受userId。 |
| `POST /control/release` | `{runId?,outcome:'success'|'failed',accountHandle?,navigationRace?}`，只放已经到login门的指定run；无runId仅在恰好一个pending时允许。立即ACK `{released:runId}`，不等待完整身份读取或提交。未到门/重复释放409。 |

`state` 固定字段：`userId/currentGroupId/currentGroupName:string`，`fillerGroupIds/accountIds/runIds:string[]`，`hostCalls:安全事件[]`，`hostCallCount:number`，`stage:string`，`runs:真实BindingRun[]`，`stageDetails:[{runId,platform,stage,pending}]`。另有真实私有PG行计数`collectionSubmissions/aiTaskCount/scheduledJobCount`。`configuration`只陈述未装配采集/外部宿主/onBound的配置事实；`networkObservation`仅统计该官方合成BrowserContext被route实际fulfill和阻断的请求，不能冒整个系统零网络证明。

初始化创建空当前组及独立filler组100账号。真实账号列表按createdAt倒序，因此仅filler service使用明确的合成未来时钟（当前+366天），绑定服务仍用真实当前时钟；新绑定账号会自然位于真实第2页。manifest保留该clock，不修改分页结果或伪造meta；filler成员不会进入当前组。

登录门之外均为真实account-binding service、task/lease、profile authority/lifecycle、local stage、preparer/committer和PG事务。新start回执返回后才由唯一后台drain推进。非官方平台身份由受控stage提供，不能描述为真人扫码。公众号额外使用当前源码`createWechatBrowserSource`与`createVerifiedWechatDomWitnesses`，真实独占Chromium context的官方origin页面全部由route合成，其他origin阻断，DNS禁外网；AppID/名称来自实际DOM。可选`navigationRace:true`在原Page字段读取时触发一次真实同origin goto，仅计实际SDK context-loss，不能手抛错误冒导航。官方窄bridge以esbuild keepNames=false构建，避免tsx名称注入污染evaluate闭包。context/browser均await关闭后释放本次profile租约。

不传`onBound`，不创建采集授权，capability明确collect/publish/draft不可用。实际UI验收仅代理binding三操作；组/账号/分页列表、RSC和route refresh均由同PG的真实Next读取，不能用helper内存返回代替SSR持久回读。

SIGTERM/SIGINT只停止本helper：推进停止标志并abort本地受控门，await binding.stop、HTTP关闭、pool.end，重新核postmaster.pid/精确dataDir/端口/进程argv后正常pg_ctl stop。不会强杀其它进程或删除根目录。`STOPPED.json`记录真实失败数组；失败不冒清理成功。

自验原件`selftest-attemptNN.json`逐次保留，私有完整日志由其中绝对路径定位。01空根被runner日志污染、02Unix socket过长、03计数表名误用、04合成staging目录未创建均为真实失败；随后真实公共链GREEN不覆盖它们。该helper自验不替代正式Next UI/双视口/视觉验收。
