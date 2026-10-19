# T1341 修改前公共组合装配

2个串行case；新外盘owned root，各独立DB/media/fixture key0600，原53768/原DB不连接。

公开contract transport→真实上传blob PUT（本fixture随机handshake，只内存）→完成上传→真实taxonomy挂载→assets.list/get/search→真实buildAssetsViewModelReal→实际AssetDetailPanel SSR。SSR不声称浏览器像素，13dd双viewport目标UI RED另引用V2索引。storage/guard/标签返回不mock成功；fetch一旦发生明确记录并拒绝，0外部模型；自然自动任务只如实记录，不伪零行。

第二case用公开project/output primaryAssetId引用后migration产生grant；保目标只读而不能打标；公开去掉活引用后仅真实canRevoke=true才撤销，再核不可读。若前置不成立为装配FAIL，不冒目标RED；未伪造grant/ledger。

所有正请求180000ms、case3600s，retry0，2×3600+4×180hooks+360启动清理=8280s，Node child9000s；hash前后各300s、进程清理600s、setup/report300s，合10500s≤独立outer10800s。执行必须由launch.py实际watchdog覆盖，工具调用再覆盖外层+120s TERM/120s KILL。before/after全source/deps/links锁，排除无关tests/他人docs/活动DB/keys。

9维护tests及10生产修改前18份完整snapshot和HEAD blob映射保存在before/与BEFORE_MAPPING.json；本次RED不改任何生产。C正式验收窗口RELEASE前不写生产。
