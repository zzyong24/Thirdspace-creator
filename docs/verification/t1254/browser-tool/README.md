# T-1254：两个真实浏览器用例的完整工具候选

当前是**源码候选**。没有执行私有复制、运行副本 types/list、PG、Next、Playwright 或 App。两个用例源码保持 `b16d722f…`，原 170 与新 111 的用例分母、first100 冻结 types、全部历史失败均保留。

这套工具最终从一个入口准备独立副本，然后按用户可操作的流程载入 Doocs、改一段正文、通过宿主上传图片、保存、刷新读回。两种视口各留三张真实截图、完整 trace 和公开回执；截图仍需人看结果。创建账号组和项目使用真实公开 dispatch，文章创建、编辑、插图和保存使用页面控件，不给业务返回值打桩。图片下载 SHA 与上传的真实 PNG 对比，原生加载资源和对应源码与新交付完整 SHA 对比。

```mermaid
flowchart LR
  A[新源码、11 Worker、DMG、动态库封存] --> B[独立评审与 ROOT 精确准入]
  B --> C[单入口：私有复制、types、list 两项]
  C --> D[独立 PG 与 Next]
  D --> E[两个浏览器流程与截图]
  E --> F[只读对账、两次归属清理、完整输入复核]
  F --> G[人看截图把关；App 仍未验收]
```

## 最终实际输入

`PENDING_INPUTS.json` 逐项记录缺失的实际输入。`driver/manifest.json` 目前不存在，不能填一个假 commit、假成功打包回执或旧 DMG 使工具开跑。`seal.cjs` 仅在最终实际输入完整后执行只读封存，不启动服务。随后必须对**新的完整 manifest 和工具 bytes**做 peer 与 ROOT 精确复核，再以新 24 位十六进制 nonce 执行 `complete-run.cjs` 一次。

封存包含冻结产品 Git 清单、原 253 源文件、完整 installed 文件与符号链接、完整 Chrome 实现、PG 工具、11 Worker、DMG 与实际打包回执、原 170/新 111 manifest、两个用例和全工具。installed 清单只忽略位于 `node_modules` 直接子目录的 `.vite`、`.vite-temp`、`.cache`，不会跳过包内部同名目录。前后复核既查 bytes，也查实际文件清单新增或删除。

动态库清单保留 builder 原件，并由独立的新copy producer扩成实际Node/Chrome/PG/installed/元数据工具的真实 `LC_LOAD_DYLIB`/`LC_RPATH` 递归产物。消费者查 regular bytes/size/mode/uid/realpath、link/target、每条 `@rpath` 第一存在路径，明确保留系统 dyldcache host 边界。builder原图 `3bc9de0d…` 只覆盖其58根，未改写。当前新只读图 `074af906…` 记录94根（原80 +12 Chrome整包Mach-O +实际otool-classic +实际Homebrew Git）、128 regular、50 links、253非系统边、851系统host边和0未解析项。每个真实MH_EXECUTE取自己的@executable_path，Node addon仅继承Node主栈；未LC_LOAD连接的Chrome graphics库枚举全部实际同arch Chrome主入口，明确未观察实际dlopen caller。最终浏览器所用 Node、Chrome、PG 和当前 installed Mach-O 根必须全列入新的实际清单，缺一则静态封存拒绝。不能把旧 Node entry SHA 或旧执行结果回签成完整动态闭包。白名单PATH实际先命中 `/opt/homebrew/bin/git`，真实入口为Git2.53.0；源码核验、prepare和seal都在第一次Git调用前核这一入口及PATH首个可执行项。局部clone/object五个helpers当前真实symlink都落同一Git入口，其逻辑链接、实际exec-path及非系统加载链一并封存，不借builder的Xcode Git。只读首次otool括号filename实际exit1和第二图2个未知主上下文均留原件；后续fd读取原inode和可能主上下文矩阵不改历史。

私有复制后，`runtime-dyld.cjs` 在types/list/服务之前通过实际文件fd重新读取每个owned loader的LC_LOAD/RPATH。相对loader/rpath在实际副本目录重新展开并选择第一存在目标；绝对LC_LOAD保留原绝对路径。实际图须与source图的完整规范化上下文、load commands和依赖边一致，所有真实target bytes、link/target、完整raw命令关闭收据受新binding保护。后续 runtime:true 只查这份实际owned图、实际加载文件及第一存在路径，不以source图代签。当前owned collector没有执行。

## 单入口和执行预算

`complete-run.cjs` 在入口第一行建立一次 monotonic 截止，覆盖准备、launch、两段父进程组关闭余量和最终输入复核。环境使用白名单，保留原 HOME/CODEX_HOME 值，去掉代理、密钥、NODE_OPTIONS 和 DYLD 覆盖；Git 子进程禁用全局/系统配置和 LFS smudge。Doocs 无生成需求，不读取或复制摘要中来源/使用未确认的 Codex auth seed，使用 fresh ownedDB 的现有 ensureLocalUser。

BT004预算候选由实际封存的131个唯一file+arch、194个上下文派生，保留每条otool命令120,000 ms。metadata另外给每条FD启动/关闭/raw120,000 ms、入口与读后IO各原900,000 ms和600,000 ms余量，完整串行槽为33,840,000 ms。每条命令启动前检查全部剩余pairs；可能存在绝对sourceRoot加载时，原文件变体另加容量，绝对路径不重映射。

source verify实际四条Git各240,000 ms，加原900,000 ms IO为1,860,000 ms；runtime verify还含owned HEAD240,000 ms与owned IO900,000 ms，为3,000,000 ms。准备阶段所有四次verify合计9,720,000 ms，保留旧3,600,000 ms非verify基槽并增加完整metadata槽，新的准备上限47,160,000 ms。launch入口runtime/source/runtime为7,860,000 ms，尾部source/runtime为4,860,000 ms；Next和readonly孩子各自的runtime verify再加3,000,000 ms到原启动/readonly完整槽和Next ready admission。launch其余长槽保持，新的launch上限391,500,000 ms。

complete父入口自身四次verify9,720,000 ms、两次原helper生命周期各2,160,000 ms与原600,000 ms余量全部覆盖，单出生完整上限453,300,000 ms。静态seal覆盖原IO900,000 ms、单独productInventory Git240,000 ms和末source verify1,860,000 ms，完整槽3,000,000 ms。所有单命令和body/fixture/cleanup/原长预算不降低；新完整表见BUDGET_V3_DELTA_PROOF.json。stage间隔最多60秒，不续任务期限，不重派。同步verify在其完整方法槽和父出生截止后显式检测越期；清理保日志后不能写成complete。

每次运行生成真正 `/private/tmp/t1254-browser-supervisor-<nonce>` 与 `/private/tmp/t1254-browser-evidence-<nonce>` 两个 0700 根；日志不放 `.codex` 工作树。Postgres 的短 Unix socket 在 `/private/tmp/t1254d-<nonce>`。独立 Git 副本在系统临时目录，私有 node_modules 完整复制并重接本副本的 workspace links，不运行 install/build。副本 types 只检查实际复制的 driver，不签全局 frontend types。

PG 在 Client 构造前核 nonce、UID、PID/birth/parent、pidfile、role、loopback URL、data root 和 executable；readonly 查询只有独立 PG 的真实 execution_calls，不写业务数据，也不冒充服务端网络 spy。所有关闭收据等 child close 和日志关闭；信号只给已证明归属与出生的进程。最后两次独立扫描和输入复核完成才可签整次 complete，首次失败或中断留 raw。私有根保留，之后再按完整清单归档。

## 当前只读/纯 guard 检查

`checks/SOURCE_V3_STATIC_RESULT.json` 记录新7个CJS只做--check解析，不导入或执行候选代码。两个TS文件未变，原语义0保留。旧31c的31个PG/16预算/7动态路径协议检查留在历史绑定；新actual owned graph没有执行，新动态guard的协议测试脚本已适配但本轮未执行；新budget-v3只评估纯预算函数与只读JSON，核131次全部未来槽/1ms不足拒绝和全部方法预算，不调用collector/Git/otool/服务，不能借旧结果签它。所有运行副本 types、真实list两项、body两项、截图、trace和对账清理仍pending。

用户已明确暂不授权原生 App 自动化，因此本工具和浏览器结果都不会签 App、Windows、官方生成模型或平台发布。

末尾 sourceafter 前的真实 `processSnapshot` 正执行另显式预留 `120000ms`，phasefuture 和 finally 入场共同消费；该槽使用原 `600000ms` margin 的 `120000ms`，不扩大 launch `391500000ms` 或 complete `453300000ms`。原 d0eb 50 项保存于 `browser-tool-history/toold0eb-final-ps-admission`。
