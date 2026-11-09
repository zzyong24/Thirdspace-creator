# 视频号报表跳转及同账号首页回退取证

T1454有界导航恢复的真实验收仍失败，原任务已暂停；不继续猜测业务修复或重复同步。原home/report截图授权均限定一次且已消耗。当前任务先准备默认禁用的诊断能力，完成源码、回归和验收包；实际启用/开窗/截图必须取得用户新的、独立的一次授权，禁止转用旧标记。

新增受信targetPage=report-entry模式，仅在后台宿主私有配置中选择，公开CLI请求不能传任意URL或扩大范围。先核原组/原账号稳定身份，再沿生产固定菜单进入官方/platform/statistic/post（菜单不可用才用该固定goto）；进入后立即拍第一帧，固定120秒观察后拍第二帧。两帧仅允许该报表页或同官方origin、重新核原身份的固定首页/、/platform、/platform/。普通home/report模式不变，未知路径、跨域、登录提示、身份/归属改变仍失败并删除/隔离图。

新模式每张home截图前后都用不导航的current identity reader重新核对原稳定ID、平台、非空名称及当前固定sourcePath。复用现有普通UID/名称纯DOM reader，仅显式内部诊断调用可接受首页斜杠别名；默认业务identity逻辑不变。reader缺失、字段不完整或身份不匹配不得保存/发布。截图、identity再核及IO共同裁剪在原capture stage120秒和原持久deadline，不新增预算或浏览器。全部图片与完整结构仅本机0700/0600私有根，公共回执仍只有原诊断摘要/图ID/哈希；诊断完成不代表报表同步成功。

新增readCurrent可选内部witness端口，不更改现有业务read、采集、数据提交或任何报表守卫。现有宿主一次性标记、可信CLI invocation、当前账号组/成员版本核验、原物理停止与租约释放、scope变化隔离和幂等回读不变。新执行仅用新的authorizationId/root/key，结束普通无配置启动；执行前记录用户对本模式明确同意（DEC-145601待确认）。

TDD：backend严格配置/模式传递及一次消耗先红后绿；真实Chromium合成页面中report→home（含斜杠）可取得两张图且current identity确实核对；wrong identity/缺current reader/未知route/login/取消/归属变化不留有效图片。原report拒绝home仍保留。完整导航隐私/停止/真实120秒链、原367报表族、worker/backend类型、timeout/boundary/治理守卫均过。新权限未到时只能在隔离fixture测试，不得打开真实账号取图。准备完成后请求一次新授权；没有答复不是批准。

## 相同入口与截图时点

为复现本机同步路径，新report-entry模式复用生产固定官方菜单入口（原菜单不可用时保留固定goto），仅导航而不调用prepare/日期/下载；正常home/report模式不变。新增可选内部navigateForDiagnosis端口，由原DOM witness装配；所有菜单子调用共同裁剪在原单次导航120秒stage及持久deadline，不按子步骤续时。首张图改为原身份核验完成、进入报表入口之后立即拍，第二张仍在固定120秒观察结束；两图都只能是post报表或已重核原身份的固定首页。沿用identity_verified phase仅表示此前已核身份，不声称该图内必有身份字段。这样不先截图拖慢初次菜单进入，也不以整页直达替代真实菜单复现。
