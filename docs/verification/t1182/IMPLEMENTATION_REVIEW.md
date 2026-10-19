# T1182 独立实施复核

驱动源码符合已审定的精确改动范围；真实控制实验为 **FAIL**，全部新输出的执行前不存在检查为 **UNKNOWN／缺当场独立证据**。这三项不能合并写成实施全通过。刷新根因仍 **UNKNOWN**，研究实验已用尽 **2/2**，剩余 **0**；维持 `researching` 与 T1181 暂停。

## 绑定与写集

- W HEAD：`b34447aaf7836e7798d4bd37c262eff2357aaf7d`。
- 正式 SPEC SHA256：`c1f94d403e482b06ebf08c488bf5f221186d9e28989b1acad43f59bc1d2d1569`；constitution：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。
- 正式 initial review `PASS[REV:456a0d53bb41]` 的实际 record receipt 为 exit0，日志 SHA256 为 `12a4a8f41e685142cbb8f279e48835fddc661a72e7e85a0ab14631752208ad04`。此 PASS 仅是前置 SPEC 审核。
- 新 driver `t1182-real-button-control.mjs` SHA256：`322bb272266cb8097d629e589c3fc77d3fe4c6e661f988a603ff21a2796b5113`；冻结原 driver `e43e384bfe254ec16ac5945649adfac657ad3073b025567905fae1fb8deddf51` 未改。
- 当前研究卡 SHA256：`6826c66bb33969ee1fabe638d2dd0ec215561e0aafcea0498c0ceaec90a7cf49`；初始卡 `57dbba6853af1fde62ce62bd9c9ac5d359b2580dbf0eff8914e9db3724038836` 保存在 `docs/verification/t1182/RESEARCH_CARD_INITIAL.md`，不改原时点。

已完整比较两份 driver。除统一新前缀与新随机隔离 root，行为差异仅为：取得真实上传按钮属性，先监听 filechooser，使用默认 actionability 的真实 `button.click({timeout:120000})`（无 force），随后真实 `chooser.setFiles`，保存按钮/chooser观测；在原两文件列表等待后添加原120秒有限 enabled 等待。记录的 click/chooser 成功布尔值在这些实际调用完成后才写入，不是假定成功。原所有 toast、文件名、上传三步顺序/200/header/body、公开下载 size/SHA、刷新、真实菜单跨组/返回和错误断言均保留，原120000毫秒预算没有缩短。新输出使用精确新前缀，文件保留 wx；这些实现事实不能替代历史预检证明。读到的17个生产源码文件及 `reconcile.config.json` 与 b344 Git 字节相等，未发现本任务改产品、SDK、配置、归属或预算的差异。

## 实际失败与证据缺口

原 wrapper `t1182-packaged-real-button-control.json` 为 exit1，实际 `138.49226037500193` 秒；其 logSha256 与实际原日志 SHA256 均为 `fc2021c06314899a589e1b443bfd5fed4acbbf872f2791b07ed583d1a0bc5b77`。日志在 driver 第59行原 PNG 文件名可见性等待处超时120秒，原失败不改写为 PASS。failure JSON SHA256 为 `81917097e5f75fa9bcd8cdcfa2b93b4a8e4363ccd51b6cecc5e89ec9981c0bae`。

已实际看1280×720上传后与失败两图：页面仍显示0个素材、空列表，无 PNG 卡片；上传后截图可见成功提示。实际观察保存 `actualButtonClick=true`、真实 chooser、点击前 disabled=false、选择后 disabled=true，PNG create/PUT/complete 三次响应200，公开列表有PNG，DOM卡片0，精确文件名匹配为空。选择后的 disabled 是当时值；最终失败时未采集 disabled 属性，截图颜色不能补判该布尔值。PUT 请求体不可得，保存 available=false、bytes/SHA=null，不能补成0或历史 strict request-body PASS。

失败发生在 PNG 可见性等待；紧随其后的正式网络顺序/200/header/body断言以及 MP4、最终按钮恢复、公开下载严格 size/SHA、刷新、第二组/返回、最终 page-error 和 final result JSON 均未执行。三步200等值是已保存实际观测，不能把尚未执行的全部断言签为通过。finally 的 sidecar结束日志保留，但也不能把 `CLIENT_CONFIG_PENDING` 或其它原日志抹掉。归档收据、driver、观测、截图与N原件逐字一致；gzip日志解压与原日志一致，见 READ_SET。

**EVIDENCE-001：** 正式 SPEC 要求所有新输出在创建前核不存在。原独立初审 READ_SET 只证明新 driver 当时不存在，全部新 PNG/JSON/输出的当场独立前置清单缺失。新前缀、wx、新随机root和现存截图不能补判执行前检查 PASS。本项保留缺证，不追补历史，不否认当场失败材料本身。

原隐藏input研究实验 exit1／138.76938770897686秒与 MP4 publicList2／DOM1 的证据仍保留。其 disabled 未记录、原 MP4 超时机制未知，不由本次复现重新解释。原 research observe 实际exit2；重复 taskctl block 实际exit1且已暂停拒重复，均未伪造为0。当前卡准确记录控制2 FAIL与2/2用尽，无第三次实验或恢复准入。

## 只读源码调查

实际链路是 `AssetUploadButton` 成功状态后调用 `router.refresh()`；assets server route 读取已验证 session，再以 **plain** `createServerClient(session.ctx)` 构建完整VM。session读 currentGroup/account cookie 并验证真实归属；进入账号组的原UI调用 `writeCurrentGroupId` 同步 cookie 后 refresh。上传 dispatch 冻结范围分支保持原 group/header，避免以旧scope回写当前cookie。这些静态守卫保留；本失败 refresh 请求实际 cookie/ctx 未保存，不能据上传 public header 正确反推 RSC ctx 正确或错误。

assets页没有使用 cached client；页面读缓存白名单不含 `assets.list`，assets.list GET 经真实 service/repository 读取 user、active、workspace 范围，不见列表结果缓存。运行时 composition 使用进程共享 persistence bundle。主 assets 列表后还串行读取 trash/projects/usage/storage，整个VM完成才传给页面；interactive gallery依赖新server props，未发现上传成功即直接插入新卡片的本地路径。

这只能排除“源码明确采用 assets.list 展示缓存”的推断，不能定位真实卡点。此次没有 refresh RSC请求/响应、实际session/ctx、VM各子读耗时、返回VM或新props提交记录；因此具体机制与候选产品修复均 **UNKNOWN**。可能需要区分的边界在请求发出/范围验证/完整VM子读取/客户端提交，但当前没有证据选择其中一项，不能据此称竞态、改cookie/cacheTTL、强制整页刷新或修改产品。

此次真实按钮控制仍失败，足以否定“全部失败仅由隐藏input绕过按钮造成”的充分解释；不证明某个具体产品根因。研究上限用尽，当前仅完成只读审查，不启动第三实验、不恢复研究、不改产品。

本报告只签精确 driver 源码符合与实际证据真实性，保留实验 FAIL、预检缺证和根因 UNKNOWN；不签 T1179/T1180 旅程完成、任务完成、canonical／完整Gate、原生App、真用户安装、微信研究恢复、模型／平台或全功能。完整canonical结果另由根负责，本报告未独立复核其全部日志。全部实读路径、SHA、收据日志对应与范围见 READ_SET.json。
