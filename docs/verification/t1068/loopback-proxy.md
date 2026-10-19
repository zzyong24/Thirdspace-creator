# T-1068 本地启动探测代理修复实测

2026-10-06用户明确报告f0安装版原生窗口启动超时。实际官方日志解码退出0：完成哨兵12:55:26.693Z，看门狗13:00:27.423Z；保留失败，不由CLI/HTTP成功覆盖。

重新启动f0安装版，同61485端口、reqwest0.12.28与同15秒builder：默认代理返回502/非HTML（1543ms），no_proxy返回200 HTML68033字节（39ms）。中性本机fixture独立复现默认502/直连200。实际App完整环境未读取，不冒签环境归因。

实现仅`build_sidecar_probe_client`加no_proxy及两行说明，专用固定127.0.0.1启动探测直连。既有所有guard、哨兵、预算、退出、页面判定保持。

正式准入control基线436ff8e9；progress正常worktree claim实际0，任务packet已保存。早前claim因旧复杂度预算缺失被拒绝时曾误提前复制测试并执行，未改产品；提前证据保留不补签成合法准入后RED。预算独立核对后正常准入并重新取得RED。

最终验证器SHA c0ed7a93d7ad091fecd755cf86d3fcf367adaab803270571a4a621b73e77d82c：读取实际Rust启动函数、Cargo.lock版本与rlib depinfo/features，隔离子进程注入代理。正常fixture请求预算120秒，正常wait idle120/max240秒；仅缺哨兵预期超时负例使用短synthetic时限，产品原15秒/5分钟/30分钟不改。

- 同最终测试、436ff8e9实际Git原lib私有副本RED：exit1，all-proxies-empty-no-proxy预期true实际false；receipt `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1068-loopback-proxy-o048J6/receipt.json`。
- 当前窄修GREEN：17项全部实际通过，exit0；receipt `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1068-loopback-proxy-jYaZQB/receipt.json`。含默认builder代理拒绝对照、5种代理环境直连、哨兵与真实页面、缺哨兵超时、退出优先、404/500/空/非HTML/not-found、重定向上限。
- 既有startup-safety合同：10通过/1失败；失败仅T-734抖音浏览器旧断言，原库同436ff8e9 lib实际复测仍10通过/同1失败。原测试与抖音代码字节未改。原生启动相关10项通过，不将整个文件签为PASS。基线raw记录在本地验收根`t1068-startup-contract-baseline`。

夹具不代表安装版或原生窗口验收；新包/安装/真实窗口加载/公开读取仍须独立实际验证。T-1062完整功能和用户验收仍待完成。

## 新包安装及原生启动验收（实际完成）

- 冻结source `69b6be8f8078ebf9380014be000416a89880dbb0`，1.2.0四处版本一致/工作树前后干净，固定入口实际exit0；四项基本打包检查44通过。安装包`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，662046739字节，SHA256 `b4676ed5e4f63251546cd46add6bef5fa66bafa3478222c0b8d821a56e17ac1b`。镜像验证、深层严格签名及277旧迁移资源精确核验均实际通过；本地ad-hoc，未公证。
- 固定入口自动安装并启动69909，早于计划的单独安装检查；没有执行私有planned installer，不伪造其检查。此前新鲜完整备份`offline-backup-real-provenance-journal-7i4su_mk`和closure SHA `07f66bcccf5a8f0f99bc466ee9ac189f3a4b19d28da855db8992e34f9e4451e9`已实际完成，原App保留在备份中。安装后独立核Info、exe、sidecar.tar.gz与真实built App精确一致，深层签名exit0；运行时映射与真实归档stamp相符。
- 两次独立captured open均先由宿主自行加载，没有提前公共HTTP请求预热。实际原生`MAIN_PAGE_LOAD_FINISHED`分别为`http://127.0.0.1:53461/`和`http://127.0.0.1:53758/`，各1完成哨兵，无看门狗超时；`tauri://localhost`启动页事件单列，绝不当首页通过。随后各轮公共CLI status及首页200通过（0.049/0.554秒）。仅关闭精确确认的本App PID，不停止外部项目进程。
- 公开中性账号组get、粗剪工程、旧成功渲染task及asset get均实际0；工程/渲染task/asset data与f0验收后的公共数据整字段深等。未恢复或重置库/激活/模型配置，未重新发模型或改变剪辑候选。
- 用户实际回答“已显示正常首页”。只确认启动恢复，不代签完整功能。
- 范围相关启动合同聚焦10项实际通过；另1条T734浏览器旧断言仅在该聚焦命令跳过，完整文件10/1失败及真实旧基点失败全部保留，未改原断言。代理真实17项及原代码RED保持。

安装与启动证据合并：本地验收根`local-package-t1068-loopback-proxy-20261006/startup-acceptance.json`及`runtime-binding.json`；两轮原生stdout/stderr及已分类事件保留于`t1068-native-launch-first`/`second`。用户确认保留在`human-startup-confirmation.json`。

本任务是宿主逻辑窄修，无页面/组件/视觉变化及frontend journey contract。独立分类报告SHA `efe4acc8240c80a1a434808237e5b96a72161ef902c4e31df76beb194773f1c0`确认BACKLOG初始“待验”属于错误UI路由，正常纠正为非UI“—”，仍保留原生实测和人确认。ROOT是唯一实际writer，旧worktree lease正式release后改现有普通claim/done收尾，原准入/红绿证据和历史拒绝保留，不重签子代理来源或放宽门卫。T-1062其他功能验收仍未完成。

## 正式收尾对账

`pmem sync`实际退出0；完整`reconcile`实际退出1，37错误/1告警，原始stdout/stderr/result保留在本地验收根`t1068-post-startup-reconcile`。与前次T1067真实36错误逐行比较：原36项全部保留，新增一次LED-027稿件并发检查失败；未重签全局为绿。原边界/历史receipt和LED失败继续由T-1015/T-1018/T-916核查；LED-027此次失败登记T-1018，具体根因待查，不推断为假阳性或宣称旧基点同样失败。

自真实准入基点436ff8e9至整合HEAD只变动本任务Rust本地probe、独立验证器、实测文档及控制账本，LED-027涉及的artifacts后台、frontend稿件卡及其测试均未变动。故本次全局失败属于该启动窄修范围外的保留问题；T1068有独立17代理回归、10原生启动合同、44出包检查、实际安装/两次原生首页和用户确认，不据此完成T1062完整验收。
