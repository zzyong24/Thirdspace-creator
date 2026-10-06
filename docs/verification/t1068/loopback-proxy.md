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
