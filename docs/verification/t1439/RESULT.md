# T-1439 本地候选验收

状态：用户已确认仅599元永久版包含分销与源码共创，月卡不包含。两站已上线，线上校验通过。

## 已完成
官网首屏文字＋87秒真实视频、明确购买入口；两站新增分销/源码共创说明与299.50元结算例；购买区提前到14图展示之前。新CSS沿用现有风格，交易脚本和SKU/金额未改。

原视频86.633333秒，1920×1080，H264/AAC；网页副本24393654字节，同画幅/时长/音轨，faststart。ffmpeg完整解码退出0。原视频未改。

## 当场校验
- website/assets.test.mjs＋website/pricing.test.mjs：8/8通过，见website-tests.log。
- timeout-policy/verify.mjs：退出0，见timeout-policy.log（Node环境警告保留）。
- git diff --check：通过。
- Ego TaskSpace18真实浏览器：官网1440×1000与390×844无横向溢出；购买页相同两尺寸无横向溢出。截图均实际查看。buy-rights-mobile-390.png显示单列排版，保留当场滚动位置。
- 视频实际播放到0.516956秒、暂停成功、seek到40秒成功；本地预览服务器增加标准Range支持后验证。此为本地结果，未冒充线上206验收。
- 购买页月卡/永久版切换：creatoros_monthly_30d/creatoros_lifetime，分别¥49/¥599；推荐人非必填。未提交购买/兑换。
- 真实截图放大后dialog display:grid，Escape关闭display:none；新增分销FAQ展开显示299.50元说明。

## 线上验收
- 六个展示文件定点部署，三份原文件哈希与发布前快照一致后才执行。回滚备份：`/var/backups/creatoros-t1439/creatoros-t1439-20261105`。详见deploy-manifest.json和deploy-receipt.json。
- 官方首页、购买页、商品JSON、新样式与封面通过HTTPS回读，SHA256与本地一致；视频Range请求返回206，Content-Range为bytes 0-1023/24393654，内容与本地前1024字节一致。详见https-checks.json。
- 线上真实浏览器：视频播放至0.592383秒、暂停成功、seek到40秒成功，时长86.633333秒；两站1440×1000和390×844无横向溢出，最终截图已查看。
- 线上购买页两套餐选择：永久版creatoros_lifetime/¥599，月卡creatoros_monthly_30d/¥49；推荐人仍选填。FAQ文字明确月卡不含两项附加权益。未提交真实交易。
- 共享交易脚本、store.css、Moving页面与配置、两站Nginx文件发布前后哈希完全一致，无需修改Nginx或重新加载。
- 初次HTTPS检查误用了购买页被既有Nginx禁止的/creatoros/index.html路径，返回404；改为实际公开入口/creatoros/通过，无需更改服务器策略。

## 治理收尾
按顺序执行pmem sync、quick reconcile、taskctl complete；最终结果以命令日志和任务状态为准。

