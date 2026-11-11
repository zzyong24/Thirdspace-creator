# T-1466 官网与buy站内嵌完整豆包宣传片

## 用户需求与授权
2026-11-11用户明确要求“把这个视频 放在官网和buy两个网站 放完整视频 不要放链接”。授权将T-1462已验收的4分58秒豆包官方音色完整版部署到官网和buy购买站；访客在页面内播放、暂停、定位和全屏，不以跳转链接或GIF替代视频，不自动播放声音。

## 范围与边界
官网为 https://creatoros.aitongban.cloud/ ，购买站为 https://buy.aitongban.cloud/creatoros/。用户拥有这两个站点。复用官网现有video区域，替换旧87秒片和文案；购买页在购买区域前增加同款16:9内嵌完整播放器及清楚的时长说明，沿用原风格。官网使用/media/、buy使用既有允许的/assets/同源资源路径部署同一完整H264/AAC MP4与封面，保留原视频供回滚。只改静态展示，不改套餐、金额、交易脚本、接口、Moving、数据库、下载包、已有真实截图和产品流程。

写集：website/index.html、website/buy/creatoros/index.html、website/buy/assets/rights.css、website/media/creatoros-full-promo-20261111.mp4及同名poster；本SPEC、docs/verification/t1466/**及必要任务控制面。若既有T1434收据因页面变化失效，用taskctl正式重开原旅程回归并保留旧证据，不忽略新引起的失效。

## 验证与部署
核对源文件SHA256为c205659b91080a156572ad678a9a6405b08ce7180de57c8edab0230cbeb6c214、297.866667秒、1920×1080、H264/AAC。纯静态内容替换不制造TDD红测；运行既有网站测试、差异检查、desktop/mobile实测（1440×1000、390×844），两站播放器加载完整时长、手动播放/暂停、seek至后半段，页面无横向溢出；只GET核对原购买与兑换入口，不提交交易。

先以HTTPS/SSH回读线上文件并保全最新内容，记录本地和线上哈希；部署仅明确文件清单，媒体先就位再原子替换页面。原文件备份、变化时停止覆盖，保全共享脚本与Moving哈希。复用既有受授权SSH连接，不读私钥；如确需新凭证仅走Bitwarden。上线核对HTTPS页面与本地候选、两站完整媒体字节数与Range206、真实浏览器播放/暂停/seek，保存回滚位置。pmem sync、quick read-only reconcile与taskctl完成；不冒称产品全回归。

## 既有旅程收据刷新
页面变更命中T1434 watched_paths；已用taskctl block/resume撤销并重开原收据。扩展写集为T1434 SPEC、原verify-website.mjs与r5证据，沿用全部既有断言，不放宽交易保护。
