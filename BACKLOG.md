# CreatorOS 任务看板

> 状态与审核、验收以本表为准。完整范围及原文来源见详情；规则见 [AGENTS.md](AGENTS.md)。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

|ID|任务|状态|审核|验收|文档|一句话|
|---|---|---|---|---|---|---|
|T-1433|重复发布同步不误改项目版本|✅|PASS[REV:22b8d85b13ac]|—|[SPEC](docs/features/t1433-project-noop-timestamps.md)|修复两个可复现空操作更新时间写入点。|
|T-1432|修复接手看板重复与任务包生成阻塞|✅|PASS[REV:2cac63f1896c]|—|[SPEC](docs/features/t1432-handoff-control-repair.md)|用户授权逐条修复；原记录与审核票据保全，密钥和新Mac包不动。|

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-1418|🔨|PASS[REV:8fc500f6763a]|待验|[D](BACKLOG-details.md#m-b390e375)|
|T-1419|🔨|PASS[REV:66d05b52db53]|待验|[D](BACKLOG-details.md#m-ea2c717e)|

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
|---|---|---|---|---|---|---|
|T-1420|以文生图生成小红书逐页配图与独立配文|⏸️|PASS[REV:a66a51f4d977]|待验|[SPEC](docs/features/t1420-graphic-post-content-structure.md)|用户2026-10-26再次明确：逐页图片必须调用AI文生图，不能用文字排版卡片冒充；复用已有组图生成、预览采纳与真实图片导出链。 接手检查与阻塞：[2026-10-28证据](docs/verification/t1420/handoff-20261028/README.md)。 本机账号组1经用户确认正确；独立验收两张真实图已生成采纳并精确回读，正文、旧安装界面与ZIP未通过，详见[重新验收](docs/verification/t1420/handoff-20261028/reverify-report.md)。 两个旧稿兼容原始样本已按用户提供的下载文件原样补回，兼容回归52/52通过。 测试文件仅去掉末尾多余空行以通过diff检查，断言未变。|
|T-1421|理清剪辑转写与按文字剪辑入口|🔨|PASS[REV:ea60d1b6c009]|待验|[SPEC](docs/features/t1421-transcript-editing-clarity.md)|明确导入视频、转成文字、按文字剪辑的用途和先后关系，保留真实能力。|

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-1413|⏸️|PASS[REV:c1d93ff9d0e3]|—|[D](BACKLOG-details.md#m-19dc128e)|

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
|---|---|---|---|---|---|---|
|T-1427|修复官方Pi与未通过验收并在通过后推送|⏸️|PASS[REV:d56ad5c3ab9f]|待验|[SPEC](docs/features/t1427-official-pi-acceptance-and-push.md)|[D]|

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-1407|⏸️|PASS[REV:9e869f1d693f]|待验|[D](BACKLOG-details.md#m-8782f861)|

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
|---|---|---|---|---|---|---|
|T-1426|修复CLI真实对话的组上下文、模型错误与开销|🔨|PASS[REV:53f6deaf29e5]|—|[SPEC](docs/features/t1426-chat-model-combination-fixes.md)|[D]|
|T-1424|沿用已确认账号并实测CLI对话组合|⏸️|—|待验|[SPEC](docs/features/t1424-cli-chat-combination-acceptance.md)|[D]|
|T-1423|历史激活码无感升级模型权益与原授权恢复|🔨|PASS[REV:d36ef51c3a72]|待验|[SPEC](docs/features/t1423-legacy-license-one-click-upgrade.md)|[D]|
|T-1422|接入试用设备一次模型权益与明确恢复|🔨|—|待验|[SPEC](docs/features/t1422-trial-device-model-benefits.md)|[D]|

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-1400|⏸️|—|待验|[D](BACKLOG-details.md#m-13a5c831)|
|T-1399|⏸️|—|待验|[D](BACKLOG-details.md#m-f5da2329)|
|T-1398|🔨|—|待验|[D](BACKLOG-details.md#m-62b0a1bf)|
|T-1397|⏸️|—|—|[D](BACKLOG-details.md#m-f7d02044)|
|T-1380|⏸️|PASS[REV:fade0e6a2c0c]|—|[D](BACKLOG-details.md#m-37b1d9e4)|
|T-1378|🔨|PASS[REV:48c6e24fa806]|—|[D](BACKLOG-details.md#m-09c149db)|
|T-1385|🔨|—|—|[D](BACKLOG-details.md#m-9fb8f94c)|
|T-1393|⏸️|—|—|[D](BACKLOG-details.md#m-bc2110ff)|
|T-1392|⏸️|—|—|[D](BACKLOG-details.md#m-8a269a7e)|
|T-1387|⏸️|—|—|[D](BACKLOG-details.md#m-ddee5cf9)|
|T-1388|⏸️|—|—|[D](BACKLOG-details.md#m-6f6280ef)|
|T-1389|⏸️|—|—|[D](BACKLOG-details.md#m-db829267)|
|T-1390|⏸️|—|—|[D](BACKLOG-details.md#m-1b596f8e)|
|T-1391|⏸️|—|—|[D](BACKLOG-details.md#m-b04550de)|
|T-1374|⏸️|PASS[REV:16648a3ea984]|待验|[D](BACKLOG-details.md#m-b4aa8fc1)|
|T-1369|🔨|PASS[REV:bcb32fe90d8b]|待验|[D](BACKLOG-details.md#m-24dd95fa)|
|T-1373|📋|待审|待验|[D](BACKLOG-details.md#m-32804d56)|
|T-1367|⏸️|PASS[REV:c7a98f074848]|待验|[D](BACKLOG-details.md#m-a494bc84)|
|T-1366|📋|待审|待验|[D](BACKLOG-details.md#m-e283ec32)|
|T-1360|📋|待审|待验|[D](BACKLOG-details.md#m-d013cd95)|
|T-1358|📋|待审|待验|[D](BACKLOG-details.md#m-eb418a01)|
|T-1353|📋|待审|待验|[D](BACKLOG-details.md#m-62fa9788)|
|T-1351|📋|待审|待验|[D](BACKLOG-details.md#m-1176794c)|
|T-1349|📋|待审|待验|[D](BACKLOG-details.md#m-e5a074ad)|
|T-1336|📋|待审|待验|[D](BACKLOG-details.md#m-ea6e0f16)|
|T-1333|📋|待审|待验|[D](BACKLOG-details.md#m-f87b4fb6)|
|T-1321|⏸️|PASS[REV:271af53ebf46]|待验|[D](BACKLOG-details.md#m-03cb3f92)|
|T-1300|⏸️|PASS[REV:6094ba8d7ed5]|待验|[D](BACKLOG-details.md#m-50c111b9)|
|T-1297|📋|待审|待验|[D](BACKLOG-details.md#m-ffd4a614)|
|T-1292|📋|待审|待验|[D](BACKLOG-details.md#m-a0dfe779)|
|T-1291|📋|待审|待验|[D](BACKLOG-details.md#m-311d1f24)|
|T-1289|🔨|PASS[REV:92eba9d78497]|待验|[D](BACKLOG-details.md#m-2b9c4a05)|
|T-1288|🔨|PASS[REV:cf5a6070b2b5]|待验|[D](BACKLOG-details.md#m-9857caa3)|
|T-1287|📋|待审|待验|[D](BACKLOG-details.md#m-2774b136)|
|T-1286|🔨|PASS[REV:be715ef3b46d]|待验|[D](BACKLOG-details.md#m-97198cf6)|
|T-1283|📋|待审|—|[D](BACKLOG-details.md#m-c06d83c5)|
|T-1279|🔨|PASS[REV:3056f3673e0a]|待验|[D](BACKLOG-details.md#m-9e54ec7d)|
|T-1278|🔨|PASS[REV:c23accf0a926]|待验|[D](BACKLOG-details.md#m-913dd54c)|
|T-1276|⏸️|PASS[REV:f677c9cdf3ed]|待验|[D](BACKLOG-details.md#m-99f7b9ca)|
|T-1275|⏸️|—|待验|[D](BACKLOG-details.md#m-4fa94d58)|
|T-1274|⏸️|PASS[REV:55a3f14a70a5]|待验|[D](BACKLOG-details.md#m-d5cc524b)|
|T-1277|📋|—|待验|[D](BACKLOG-details.md#m-70f658e4)|
|T-1273|🔨|PASS[REV:f993e9496349]|待验|[D](BACKLOG-details.md#m-83cbce42)|
|T-1271|🔨|PASS[REV:b5247eee4711]|—|[D](BACKLOG-details.md#m-b13acd3a)|
|T-1265|🔨|PASS[REV:54a830e5bcfc]|待验|[D](BACKLOG-details.md#m-d2074ad4)|
|T-1264|🔨|PASS[REV:363fd9378c93]|待验|[D](BACKLOG-details.md#m-bcc96cf6)|
|T-1263|🔨|PASS[REV:b4fda4422df6]|待验|[D](BACKLOG-details.md#m-a1c7232c)|
|T-1272|🔨|PASS[REV:57f7140fcca6]|待验|[D](BACKLOG-details.md#m-e6b244c2)|
|T-1270|🔨|PASS[REV:ed99956c0313]|待验|[D](BACKLOG-details.md#m-d5b78700)|
|T-1268|🔨|PASS[REV:b9d6a2958cc7]|待验|[D](BACKLOG-details.md#m-89cf7000)|
|T-1267|🔨|PASS[REV:cc01d69f8185]|待验|[D](BACKLOG-details.md#m-c2349ade)|
|T-1266|🔨|PASS[REV:bda5b2a67bbd]|待验|[D](BACKLOG-details.md#m-882f4088)|
|T-1269|🔨|PASS[REV:03376b43b303]|待验|[D](BACKLOG-details.md#m-dc5ecc8c)|
|T-1261|🔨|PASS[REV:cd5f6ec85eda]|待验|[D](BACKLOG-details.md#m-edc2bdf1)|
|T-1260|📋|—|—|[D](BACKLOG-details.md#m-99d855a5)|
|T-1255|🔨|PASS[REV:9700ff342ac4]|待验|[D](BACKLOG-details.md#m-387aa755)|
|T-1256|🔨|PASS[REV:b3d116e19a48]|待验|[D](BACKLOG-details.md#m-b58d65d7)|
|T-1254|🔨|PASS[REV:1ebe2f90de0b]|待验|[D](BACKLOG-details.md#m-a94ccfc5)|
|T-1253|🔨|PASS[REV:e890e7d4ffac]|待验|[D](BACKLOG-details.md#m-fba3dca3)|
|T-1246|🔨|PASS[REV:883f7fe733ba]|待验|[D](BACKLOG-details.md#m-e9a70308)|
|T-1252|🔨|PASS[REV:5ceaed23e00c]|待验|[D](BACKLOG-details.md#m-c36e89af)|
|T-1250|🔨|PASS[REV:73326e8df3e3]|待验|[D](BACKLOG-details.md#m-73b1b765)|
|T-1251|🔨|PASS[REV:41b45f1c67d4]|待验|[D](BACKLOG-details.md#m-2867bfb1)|
|T-1249|🔨|PASS[REV:19cbaf3743b6]|—|[D](BACKLOG-details.md#m-020b7467)|
|T-1247|🔨|PASS[REV:b75c6d75921d]|—|[D](BACKLOG-details.md#m-13379c64)|
|T-1248|🔨|PASS[REV:2d9887301cb3]|—|[D](BACKLOG-details.md#m-537a47a6)|
|T-1238|🔨|PASS[REV:6b70a2a85595]|待验|[D](BACKLOG-details.md#m-39596a96)|
|T-1245|🔨|—|待验|[D](BACKLOG-details.md#m-2d27b28f)|
|T-1244|🔨|—|待验|[D](BACKLOG-details.md#m-ef74b92c)|
|T-1243|🔨|—|待验|[D](BACKLOG-details.md#m-955ea8bd)|
|T-1239|🔨|—|待验|[D](BACKLOG-details.md#m-91c36668)|
|T-1241|🔨|—|待验|[D](BACKLOG-details.md#m-85eb6d21)|
|T-1242|🔨|—|待验|[D](BACKLOG-details.md#m-c2a2351d)|
|T-1240|🔨|—|待验|[D](BACKLOG-details.md#m-4e2d601b)|
|T-1227|⏸️|—|—|[D](BACKLOG-details.md#m-f94e51bd)|
|T-1228|📋 待办|—|—|[D](BACKLOG-details.md#m-6b851fdf)|
|T-1229|🔨|—|—|[D](BACKLOG-details.md#m-c77e1638)|
|T-1231|🔨|—|待验|[D](BACKLOG-details.md#m-90213354)|
|T-1233|🔨|—|待验|[D](BACKLOG-details.md#m-738c84c5)|
|T-1232|🔨|—|待验|[D](BACKLOG-details.md#m-fc4637ac)|
|T-1235|🔨|—|待验|[D](BACKLOG-details.md#m-e7510971)|
|T-1236|🔨|—|待验|[D](BACKLOG-details.md#m-87685ec9)|
|T-1237|🔨|—|待验|[D](BACKLOG-details.md#m-04d6b95d)|
|T-1234|🔨|—|待验|[D](BACKLOG-details.md#m-47e48a1e)|
|T-1230|🔨|—|待验|[D](BACKLOG-details.md#m-bcc0fc51)|
|T-1226|🔨|—|—|[D](BACKLOG-details.md#m-b2eb84b2)|
|T-1225|🔨|—|—|[D](BACKLOG-details.md#m-9706a351)|
|T-1224|🔨|—|—|[D](BACKLOG-details.md#m-3c7b87f3)|
|T-1223|🔨|—|—|[D](BACKLOG-details.md#m-92328205)|
|T-1222|📋 待办|—|待验|[D](BACKLOG-details.md#m-e260ed0c)|
|T-1221|🔨|—|—|[D](BACKLOG-details.md#m-3e449818)|
|T-1217|🔨|—|—|[D](BACKLOG-details.md#m-987d2974)|
|T-1207|🔨|—|待验|[D](BACKLOG-details.md#m-a6b60827)|
|T-1208|🔨|—|待验|[D](BACKLOG-details.md#m-a4507f94)|
|T-1199|🔨|—|待验|[D](BACKLOG-details.md#m-eee010b3)|
|T-1200|🔨|—|待验|[D](BACKLOG-details.md#m-5924199c)|
|T-1201|🔨|—|—|[D](BACKLOG-details.md#m-24204ec4)|
|T-1202|🔨|—|—|[D](BACKLOG-details.md#m-a4672419)|
|T-1203|📋 待办|—|待验|[D](BACKLOG-details.md#m-48e5167b)|
|T-1204|🔨|—|—|[D](BACKLOG-details.md#m-6ee6d9e7)|
|T-1197|📋 待办|—|待验|[D](BACKLOG-details.md#m-aabf90a0)|
|T-1196|📋 待办|—|—|[D](BACKLOG-details.md#m-c48cd94b)|
|T-1193|📋 待办|—|—|[D](BACKLOG-details.md#m-7c18ad0e)|
|T-1192|📋 待办|—|—|[D](BACKLOG-details.md#m-9b62b07b)|
|T-1191|🔨|PASS[REV:ad518ff0cf03]|—|[D](BACKLOG-details.md#m-76ed0b8e)|
|T-1189|📋 待办|—|—|[D](BACKLOG-details.md#m-0b90c531)|
|T-1188|📋 待办|—|—|[D](BACKLOG-details.md#m-a906fd8b)|
|T-1182|🔨|PASS[REV:456a0d53bb41]|—|[D](BACKLOG-details.md#m-ad895a7f)|
|T-1181|⏸️|PASS[REV:f8b0038f725b]|—|[D](BACKLOG-details.md#m-e38ee77e)|
|T-1180|🔨|PASS[REV:36946ee35804]|—|[D](BACKLOG-details.md#m-6ed2b07e)|
|T-1179|🔨|PASS[REV:13d0145a7fcd]|—|[D](BACKLOG-details.md#m-8a84804a)|
|T-1171|🔨|—|—|[D](BACKLOG-details.md#m-856a81f8)|
|T-1159|🔨|PASS[REV:914cad514a19]|待验|[D](BACKLOG-details.md#m-ef759510)|
|T-1155|⏸️|—|—|[D](BACKLOG-details.md#m-62a4500d)|
|T-1149|🔨|PASS[REV:0a91f954eb8f]|待验|[D](BACKLOG-details.md#m-9d678893)|
|T-1144|🔨|—|—|[D](BACKLOG-details.md#m-72c7f8fb)|
|T-1135|⏸️|—|—|[D](BACKLOG-details.md#m-286f66bf)|
|T-1118|📋 待办|—|—|[D](BACKLOG-details.md#m-c79646ce)|
|T-1116|🔨|—|—|[D](BACKLOG-details.md#m-e8001199)|
|T-1101|🔨|PASS[REV:146ff2046c2c]|待验|[D](BACKLOG-details.md#m-3594c1aa)|
|T-1101-global-gates|📋 待办|—|—|[D](BACKLOG-details.md#m-9fe6987c)|
|T-1109|🔨|PASS[REV:a85dda74b249]|待验|[D](BACKLOG-details.md#m-2ecf48fa)|
|T-1110|📋 待办|—|—|[D](BACKLOG-details.md#m-91bb9980)|
|T-1107|🔨|PASS[REV:9c9181db2c1c]|待验|[D](BACKLOG-details.md#m-a11efcb1)|
|T-1105|🔨|PASS[REV:675552d2d02f]|待验|[D](BACKLOG-details.md#m-7dfc95ec)|
|T-1103|🔨|—|—|[D](BACKLOG-details.md#m-c781ff51)|
|T-1102|🔨|—|—|[D](BACKLOG-details.md#m-316d9abd)|
|T-1094|🔨|PASS[REV:5d2c91b81b45]|—|[D](BACKLOG-details.md#m-346d9037)|
|T-1096|📋|—|—|[D](BACKLOG-details.md#m-a558cacd)|
|T-1099|⏸️|PASS[REV:b5aa667d8485]|—|[D](BACKLOG-details.md#m-816fa3c8)|
|T-1098|📋|—|—|[D](BACKLOG-details.md#m-20530c4a)|
|T-1097|🔨|PASS[REV:3f5ea43b69f5]|—|[D](BACKLOG-details.md#m-125f0b15)|
|T-1095|⏸️|PASS[REV:b3b9dda4753e]|—|[D](BACKLOG-details.md#m-443f658f)|
|T-1093|🔨|PASS[REV:267bf399a6b1]|—|[D](BACKLOG-details.md#m-191e9af4)|
|T-1091|🔨|PASS[REV:dcd0b932fca7]|—|[D](BACKLOG-details.md#m-f69b5184)|
|T-1092|📋|—|—|[D](BACKLOG-details.md#m-d0502122)|
|T-1072-owned-devices|🔨|PASS[REV:351f7db55691]|待验|[D](BACKLOG-details.md#m-08b31664)|
|T-1066-timeout-policy|⏸️|PASS[REV:13310516269c]|待验|[D](BACKLOG-details.md#m-38eb5147)|
|T-1067-skill-verification|📋 待办|—|待验|[D](BACKLOG-details.md#m-db46bdf4)|
|T-1018|📋 待办|—|待验|[D](BACKLOG-details.md#m-e40b307e)|
|T-1083|📋 待办|—|—|[D](BACKLOG-details.md#m-8d6c5909)|
|T-1082|📋 待办|—|—|[D](BACKLOG-details.md#m-38403201)|
|T-1081|📋 待办|—|待验|[D](BACKLOG-details.md#m-d3a32784)|
|T-1026|🔨|—|—|[D](BACKLOG-details.md#m-30a0b917)|
|T-1027|🔨|—|—|[D](BACKLOG-details.md#m-c1a64c2d)|
|T-1025|📋|—|—|[D](BACKLOG-details.md#m-a1865f26)|
|T-1077|🔨|PASS[REV:a36209c19783]|待验|[D](BACKLOG-details.md#m-59ca53cf)|
|T-1075|🔨|PASS[REV:73a6052db08f]|—|[D](BACKLOG-details.md#m-591fbfcc)|
|T-1074|🔨|PASS[REV:b19144c34cab]|待验|[D](BACKLOG-details.md#m-057bfb70)|
|T-1071|🔨|PASS[REV:a53e25bf48df]|待验|[D](BACKLOG-details.md#m-f701f923)|
|T-1070|🔨|PASS[REV:b195ac203ec0]|待验|[D](BACKLOG-details.md#m-b4343ac4)|
|T-1069|🔨|PASS[REV:19bad8ef6f93]|待验|[D](BACKLOG-details.md#m-0402a772)|
|T-1066|⏸️|PASS[REV:0d40d8466937]|—|[D](BACKLOG-details.md#m-23dfb658)|
|T-1062|🔨|PASS[REV:5912ba60da16]|待验|[D](BACKLOG-details.md#m-aa899265)|
|T-1063|🔨|PASS[REV:4d99824da112]|待验|[D](BACKLOG-details.md#m-6ee8ad24)|
|T-1024|🔨|—|待验|[D](BACKLOG-details.md#m-f2e73100)|
|T-1022|⏸️|PASS[REV:2f179f8d9380]|待验|[D](BACKLOG-details.md#m-80a9a21e)|
|T-1023|📋 待办|—|—|[D](BACKLOG-details.md#m-c6906c46)|
|T-1021|🔨|PASS[REV:a6345304472d]|待验|[D](BACKLOG-details.md#m-1e11076b)|
|T-1019|⏸️|PASS[REV:3a0362412b23]|待验|[D](BACKLOG-details.md#m-af4ab433)|
|T-1020|📋 待办|待审|待验|[D](BACKLOG-details.md#m-647d1b28)|
|T-1017|🔨|PASS[REV:d2fb4541c82d]|待验|[D](BACKLOG-details.md#m-02b018a1)|
|T-1409|📋|—|待验|[D](BACKLOG-details.md#m-0badad0a)|

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
|---|---|---|---|---|---|---|
|T-1408|默认无需抖音登录即可定位|⏸️|—|待验|[SPEC](docs/features/t1408-positioning-without-douyin-login.md)|本地账号组生成候选、手动采纳及创建项目；用户已授权独立差量推送合main，整体验收未通过，不混入PR11。|
|T-1406|修复新版安装验收发现的八项缺陷|🔨|PASS[REV:dfe6653bd98e]|待验|[SPEC](docs/features/t1406-installed-eight-defects.md)|八项限定实机复验通过；整体PARTIAL及数据快照差异保留。2026-10-26用户授权合main，保全main正式发布workflow，合并与全量验收分开留证。|

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-1405|🔨|—|待验|[D](BACKLOG-details.md#m-3c558c2e)|
|T-1404|🔨|—|待验|[D](BACKLOG-details.md#m-93c8a8ac)|

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
|---|---|---|---|---|---|---|
|T-1403|修复 Windows 全流程实测失败与可本机解除的阻塞|⏸️|—|待验|[SPEC](docs/features/t1403-windows-flow-repair.md)|四条失败流程与本机缺口源码修复、限定回归和构建已过；Windows合法包/真机复验待既有持钥环境；quick对账未全绿，不伪造发布和外部验收。|


|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-1015|🔨|—|—|[D](BACKLOG-details.md#m-b6004b1c)|
|T-1004|📋 待办|—|—|[D](BACKLOG-details.md#m-17f5c5a3)|
|T-1005|📋 待办|—|—|[D](BACKLOG-details.md#m-e1e63c81)|
|T-1006|📋 待办|—|—|[D](BACKLOG-details.md#m-6ba1d49e)|
|T-1007|📋 待办|—|—|[D](BACKLOG-details.md#m-86da3392)|
|T-1008|📋 待办|—|—|[D](BACKLOG-details.md#m-5e9b8c31)|
|T-1009|📋 待办|—|—|[D](BACKLOG-details.md#m-7707f470)|
|T-1010|📋 待办|—|—|[D](BACKLOG-details.md#m-ace3bbbe)|
|T-1011|📋 待办|—|—|[D](BACKLOG-details.md#m-867c0205)|
|T-1012|📋 待办|—|—|[D](BACKLOG-details.md#m-5bb58776)|
|T-1013|📋 待办|—|—|[D](BACKLOG-details.md#m-bbf99c83)|
|T-998|📋 待办|—|—|[D](BACKLOG-details.md#m-bee6903b)|
|T-997|📋 待办|—|—|[D](BACKLOG-details.md#m-f71fee3a)|
|T-996|📋 待办|—|—|[D](BACKLOG-details.md#m-59050096)|
|T-993|📋 待办|—|—|[D](BACKLOG-details.md#m-594ce62d)|
|T-992|🔨|—|—|[D](BACKLOG-details.md#m-3380d1d5)|
|T-989|📋 待办|—|—|[D](BACKLOG-details.md#m-72bedd52)|
|T-984|⏸️|—|—|[D](BACKLOG-details.md#m-d987fbde)|
|T-986|📋 待办|—|—|[D](BACKLOG-details.md#m-fa13b1f5)|
|T-980|🔨|—|—|[D](BACKLOG-details.md#m-3a9ef56a)|
|T-979|⬜ 待办|—|—|[D](BACKLOG-details.md#m-69fba1b6)|
|T-976|🔨|—|—|[D](BACKLOG-details.md#m-d90bd622)|
|T-957|🔨|—|—|[D](BACKLOG-details.md#m-331ca12a)|
|T-956|🔨|—|—|[D](BACKLOG-details.md#m-7fd8daab)|
|T-954|🔨|—|—|[D](BACKLOG-details.md#m-83863d46)|
|T-951|⏸️|—|—|[D](BACKLOG-details.md#m-b94ee2e1)|
|T-950|⏸️|—|—|[D](BACKLOG-details.md#m-3290f96a)|
|T-945|⏸️|—|—|[D](BACKLOG-details.md#m-8fd7e1cd)|
|T-943|⏸️|—|—|[D](BACKLOG-details.md#m-8de8f5a0)|
|T-940|📋 待办|—|—|[D](BACKLOG-details.md#m-527b6398)|
|T-935|🔨|—|—|[D](BACKLOG-details.md#m-ebae04c0)|
|T-934|🔨|—|—|[D](BACKLOG-details.md#m-be5028fd)|
|T-933|🔨|—|—|[D](BACKLOG-details.md#m-ab0740e5)|
|T-919|🔨|—|—|[D](BACKLOG-details.md#m-593cc62b)|
|T-915|🔨|PASS[REV:6048196960a2]|—|[D](BACKLOG-details.md#m-951c70ee)|
|T-916|🔨|—|—|[D](BACKLOG-details.md#m-36370655)|
|T-917|📋 待办|—|—|[D](BACKLOG-details.md#m-b98f70b0)|
|T-908|📋 待办|—|—|[D](BACKLOG-details.md#m-48992361)|
|T-906|⏸️|—|待验|[D](BACKLOG-details.md#m-cebce0f5)|
|T-905|📋 待办|—|—|[D](BACKLOG-details.md#m-a80ab15c)|
|T-884|⏸️|—|—|[D](BACKLOG-details.md#m-93ab0cbf)|
|T-883|⏸️|—|—|[D](BACKLOG-details.md#m-15ba3824)|
|T-878|📋 待办|—|—|[D](BACKLOG-details.md#m-de897f16)|
|T-867|🔨|—|待验|[D](BACKLOG-details.md#m-a9a9b9cf)|
|T-860|🔨|—|待验|[D](BACKLOG-details.md#m-32db98ff)|
|T-859|🔨|PASS[REV:eea836a09361]|待验|[D](BACKLOG-details.md#m-5c11dc00)|
|T-858|🔨|PASS[REV:248be748b943]|待验|[D](BACKLOG-details.md#m-e4e027a0)|
|T-857|⏸️|—|待验|[D](BACKLOG-details.md#m-848b33f0)|
|T-856|⏸️|—|待验|[D](BACKLOG-details.md#m-8c1f2625)|
|T-855|⏸️|—|—|[D](BACKLOG-details.md#m-be767ff5)|
|T-851|📋 待办|待审|待验|[D](BACKLOG-details.md#m-d9df93f5)|
|T-850|📋 待办|待审|待验|[D](BACKLOG-details.md#m-64ffedcc)|
|T-847|⏸️|—|—|[D](BACKLOG-details.md#m-26d594af)|
|T-846|⏸️|—|—|[D](BACKLOG-details.md#m-f61303f5)|
|T-845|🔨|—|待验|[D](BACKLOG-details.md#m-89e30cbc)|
|T-843|🔨|PASS[REV:ea17774db868]|—|[D](BACKLOG-details.md#m-8e800313)|
|T-835|🔨|—|待验|[D](BACKLOG-details.md#m-8b02f443)|
|T-833|🔨|—|待验|[D](BACKLOG-details.md#m-07e1f079)|
|T-831|🔨|—|待验|[D](BACKLOG-details.md#m-2d485019)|
|T-829|🔨|—|待验|[D](BACKLOG-details.md#m-2206002e)|
|T-828|🔨|—|待验|[D](BACKLOG-details.md#m-9444a8cf)|
|T-827|🔨|—|待验|[D](BACKLOG-details.md#m-45c1770c)|
|T-826|🔨|—|待验|[D](BACKLOG-details.md#m-458ca763)|
|T-824|🔨|PASS[REV:75ad91fe7654]|待验|[D](BACKLOG-details.md#m-c24423d2)|
|T-823|🔨|—|待验|[D](BACKLOG-details.md#m-18a3bcff)|
|T-821|🔨|—|待验|[D](BACKLOG-details.md#m-d5ae9cde)|
|T-819|🔨|PASS[REV:e6f5293361af]|待验|[D](BACKLOG-details.md#m-c2b8c596)|
|T-820|📋 待办|—|—|[D](BACKLOG-details.md#m-6656f61e)|
|T-816|🔨|PASS[REV:ae495e3cb84f]|待验|[D](BACKLOG-details.md#m-09f475c2)|
|T-814|📋 待办|—|—|[D](BACKLOG-details.md#m-43ce1d78)|
|T-779|🔨|—|待验|[D](BACKLOG-details.md#m-0da0f08a)|
|T-773|🔨|—|待验|[D](BACKLOG-details.md#m-8ac14796)|
|T-768|🔨|PASS[REV:62cbba60bcd7]|待验|[D](BACKLOG-details.md#m-6b6ce0ca)|
|T-762|🔨|—|—|[D](BACKLOG-details.md#m-8917492a)|
|T-759|🔨|—|待验|[D](BACKLOG-details.md#m-1ac61723)|
|T-754|🔨|—|—|[D](BACKLOG-details.md#m-affd3a14)|
|T-748|🔨|—|—|[D](BACKLOG-details.md#m-b78689f4)|
|T-741|🔨|—|待验|[D](BACKLOG-details.md#m-d01d7b87)|
|T-739|🔨|—|待验|[D](BACKLOG-details.md#m-c5d8d48a)|
|T-738|🔨|—|待验|[D](BACKLOG-details.md#m-b1070960)|
|T-735|🔨|—|待验|[D](BACKLOG-details.md#m-da6ec947)|
|T-734|🔨|—|待验|[D](BACKLOG-details.md#m-f09d3b9a)|
|T-733|🔨|—|待验|[D](BACKLOG-details.md#m-69942b8f)|
|T-732|🔨|—|待验|[D](BACKLOG-details.md#m-0a25ecec)|
|T-730|🔨|PASS[REV:aeda30778cf2]|待验|[D](BACKLOG-details.md#m-ac306275)|
|T-731|📋 待办|—|待验|[D](BACKLOG-details.md#m-669fe425)|
|T-729|📋 待办|—|待验|[D](BACKLOG-details.md#m-4fed1462)|
|T-726|🔨|PASS[REV:6c2611e23cf5]|待验|[D](BACKLOG-details.md#m-5ab0716e)|
|T-721|🔨|—|待验|[D](BACKLOG-details.md#m-b2c8f5de)|
|T-720|📋 待办|—|待验|[D](BACKLOG-details.md#m-1ed8f53f)|
|T-719|🔨|—|待验|[D](BACKLOG-details.md#m-962af3d4)|
|T-718|🔨|—|待验|[D](BACKLOG-details.md#m-11705d22)|
|T-716|🔨|—|待验|[D](BACKLOG-details.md#m-28cee261)|
|T-715|🔨|—|待验|[D](BACKLOG-details.md#m-e3a6572c)|
|T-714|📋 待办|—|待验|[D](BACKLOG-details.md#m-1b3f9ab2)|
|T-713|🔨|—|待验|[D](BACKLOG-details.md#m-bcc08c2f)|
|T-712|🔨|—|待验|[D](BACKLOG-details.md#m-fc647419)|
|T-709|🔨|—|待验|[D](BACKLOG-details.md#m-43f5cbb4)|
|T-708|🔨|—|待验|[D](BACKLOG-details.md#m-ed1e724c)|
|T-707|🔨|PASS[REV:ad527fa6490f]|待验|[D](BACKLOG-details.md#m-2e49c25c)|
|T-705|🔨|—|待验|[D](BACKLOG-details.md#m-accce142)|
|T-703|🔨|PASS[REV:66d1b5828813]|待验|[D](BACKLOG-details.md#m-d67032d7)|
|T-702|📋 待办|—|待验|[D](BACKLOG-details.md#m-c3bc1f79)|
|T-695|🔨|—|待验|[D](BACKLOG-details.md#m-7cf0adb8)|
|T-691|🔨|PASS[REV:08fce87b6b59]|待验|[D](BACKLOG-details.md#m-76abcd4e)|
|T-694|🔨|PASS[REV:e589af9ef3ce]|待验|[D](BACKLOG-details.md#m-558ad093)|
|T-686|🔨|—|待验|[D](BACKLOG-details.md#m-05b05bb2)|
|T-687|🔨|—|待验|[D](BACKLOG-details.md#m-6f478c03)|
|T-685|🔨|—|待验|[D](BACKLOG-details.md#m-dec9af38)|
|T-684|🔨|—|待验|[D](BACKLOG-details.md#m-66416cb0)|
|T-683|🔨|—|待验|[D](BACKLOG-details.md#m-2899179a)|
|T-679|🔨|—|待验|[D](BACKLOG-details.md#m-b4a4fc97)|
|T-678|📋 待办|—|待验|[D](BACKLOG-details.md#m-12827a62)|
|T-677|📋 待办|—|待验|[D](BACKLOG-details.md#m-c3d85bc7)|
|T-676|📋 待办|—|待验|[D](BACKLOG-details.md#m-b6b3c6f0)|
|T-671|🔨|—|待验|[D](BACKLOG-details.md#m-ff67d8a5)|
|T-670|🔨|—|待验|[D](BACKLOG-details.md#m-46779fc2)|
|T-666|🔨|—|待验|[D](BACKLOG-details.md#m-56f8de09)|
|T-665|🔨|—|待验|[D](BACKLOG-details.md#m-2a74fc1f)|
|T-662|🔨|—|待验|[D](BACKLOG-details.md#m-58e4259a)|
|T-661|🔨|—|待验|[D](BACKLOG-details.md#m-5045e4a3)|
|T-660|🔨|—|待验|[D](BACKLOG-details.md#m-b81f3b37)|
|T-656|🔨|PASS[REV:12cb549493b0]|待验|[D](BACKLOG-details.md#m-d495246d)|
|T-655|🔨|—|—|[D](BACKLOG-details.md#m-aea2f729)|
|T-654|🔨|—|待验|[D](BACKLOG-details.md#m-78b1eccf)|
|T-653|📋 待办|待审|待验|[D](BACKLOG-details.md#m-6350533d)|
|T-652|🔨|PASS[REV:01c2e5babfb4]|待验|[D](BACKLOG-details.md#m-8cb3334c)|
|T-650|🔨|—|待验|[D](BACKLOG-details.md#m-9dfbe90f)|
|T-651|🔨|—|待验|[D](BACKLOG-details.md#m-da182273)|
|T-649|📋 待办|—|待验|[D](BACKLOG-details.md#m-0e3c9c68)|
|T-646|🔨|—|待验|[D](BACKLOG-details.md#m-4263bc00)|
|T-645|🔨|PASS[REV:3367f027528e]|待验|[D](BACKLOG-details.md#m-d93f730a)|
|T-644|🔨|—|待验|[D](BACKLOG-details.md#m-6c31515f)|
|T-643|📋 待办|—|待验|[D](BACKLOG-details.md#m-a336ad57)|
|T-642|🔨|PASS[REV:4ccb2dd450a1]|待验|[D](BACKLOG-details.md#m-263e8388)|
|T-641|🔨|—|待验|[D](BACKLOG-details.md#m-c53f639b)|
|T-640|🔨|—|待验|[D](BACKLOG-details.md#m-e72f9443)|
|T-635|🔨 本地实现待验|PASS[REV:80491a56d447]|待验|[D](BACKLOG-details.md#m-42bfde45)|
|T-633|🔨|—|待验|[D](BACKLOG-details.md#m-025565c5)|
|T-632|🔨|—|待验|[D](BACKLOG-details.md#m-dcf4ee4a)|
|T-631|🔨|—|待验|[D](BACKLOG-details.md#m-f2d5f891)|
|T-621|📋 待办|—|—|[D](BACKLOG-details.md#m-d8014cab)|
|T-576|🔨 免审|—|—|[D](BACKLOG-details.md#m-ccfd0b0b)|
|T-575|🔨 本地PASS·待生产E2E|—|待验|[D](BACKLOG-details.md#m-df42b3ef)|
|T-562|🔨 免审|—|待验|[D](BACKLOG-details.md#m-5e843517)|
|T-548|🔨 待安装版真机|—|待验|[D](BACKLOG-details.md#m-ac33acfc)|
|T-538|🔨 本地PASS·待生产E2E|—|待验|[D](BACKLOG-details.md#m-c5675e28)|
|T-536|🔨 待真实账号只读验收|—|待验|[D](BACKLOG-details.md#m-71a0f48e)|
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl resume <T-id> --reason "恢复依据"`。

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-626|⏸️|—|待验|[D](BACKLOG-details.md#m-d349f204)|
|T-577|⏸️|—|待验|[D](BACKLOG-details.md#m-ac9ccee7)|
|T-565|⏸️|—|待验|[D](BACKLOG-details.md#m-a5980cd9)|
|T-524|⏸️|—|待验|[D](BACKLOG-details.md#m-4ac7cc93)|
|T-519|⏸️|—|待验|[D](BACKLOG-details.md#m-86960a9b)|
|T-525|⏸️|—|待验|[D](BACKLOG-details.md#m-25bdaac4)|
|T-517|⏸️|—|待验|[D](BACKLOG-details.md#m-f07f0403)|
|T-516|⏸️|—|待验|[D](BACKLOG-details.md#m-41f44984)|
|T-510|⏸️|—|待验|[D](BACKLOG-details.md#m-afbd216a)|
|T-506|⏸️|—|待验|[D](BACKLOG-details.md#m-1abded37)|
|T-502|⏸️|—|待验|[D](BACKLOG-details.md#m-e5553279)|
|T-497|⏸️|—|待验|[D](BACKLOG-details.md#m-bdf081af)|
|T-451|⏸️|—|待验|[D](BACKLOG-details.md#m-dae68b9b)|
|T-449|⏸️|—|待验|[D](BACKLOG-details.md#m-fdafab42)|
|T-448|⏸️|—|待验|[D](BACKLOG-details.md#m-bfcce871)|
|T-433 S2|⏸️|—|待验|[D](BACKLOG-details.md#m-4569f744)|
|T-433 S4|⏸️|—|待验|[D](BACKLOG-details.md#m-85978790)|
|T-433 S5|⏸️|—|待验|[D](BACKLOG-details.md#m-6a1c6872)|
|T-426|⏸️|—|待验|[D](BACKLOG-details.md#m-49ef2f42)|
|T-425W|⏸️|—|待验|[D](BACKLOG-details.md#m-4e877f7a)|
|T-413|⏸️|—|待验|[D](BACKLOG-details.md#m-16259192)|
|T-417|⏸️|—|待验|[D](BACKLOG-details.md#m-88f11e51)|
|T-418|⏸️|—|待验|[D](BACKLOG-details.md#m-0519ef14)|
|T-420|⏸️|—|待验|[D](BACKLOG-details.md#m-d16c9df4)|
|T-399|⏸️|—|待验|[D](BACKLOG-details.md#m-578fa058)|
|T-399c|⏸️|—|待验|[D](BACKLOG-details.md#m-65ae9398)|
|T-409|⏸️|—|待验|[D](BACKLOG-details.md#m-f35672b6)|
|T-372 W-spike|⏸️|—|待验|[D](BACKLOG-details.md#m-ceb35438)|
|T-372 W-ci|⏸️|—|待验|[D](BACKLOG-details.md#m-eceb5737)|
|T-391 H-econ|⏸️|—|待验|[D](BACKLOG-details.md#m-13951026)|
|T-393|⏸️|—|待验|[D](BACKLOG-details.md#m-e322f0f7)|
|T-401|⏸️|—|待验|[D](BACKLOG-details.md#m-54ef4a48)|
|T-406|⏸️|—|待验|[D](BACKLOG-details.md#m-59a23ad1)|
|T-407|⏸️|—|待验|[D](BACKLOG-details.md#m-9468c353)|
|T-396|⏸️|—|待验|[D](BACKLOG-details.md#m-88c5b056)|
|T-398|⏸️|—|待验|[D](BACKLOG-details.md#m-4f7f60a6)|
|T-366c|⏸️|—|待验|[D](BACKLOG-details.md#m-d6bb6819)|
|T-361|⏸️|—|待验|[D](BACKLOG-details.md#m-efdedfc8)|
|T-352|⏸️|—|待验|[D](BACKLOG-details.md#m-4d277a38)|
|T-320c|⏸️|—|待验|[D](BACKLOG-details.md#m-934282e0)|
|T-350c|⏸️|—|待验|[D](BACKLOG-details.md#m-b8e2ce99)|
|T-351|⏸️|—|待验|[D](BACKLOG-details.md#m-914a97c0)|
|T-349d|⏸️|—|待验|[D](BACKLOG-details.md#m-bd291c59)|
|T-339|⏸️|—|待验|[D](BACKLOG-details.md#m-3f5789d3)|
|T-328|⏸️|—|待验|[D](BACKLOG-details.md#m-326bb9e3)|
|T-332R|⏸️|—|待验|[D](BACKLOG-details.md#m-4265f429)|
|T-336|⏸️|—|待验|[D](BACKLOG-details.md#m-44780d16)|
|T-335|⏸️|—|待验|[D](BACKLOG-details.md#m-9bd15bc5)|
|T-337|⏸️|—|待验|[D](BACKLOG-details.md#m-20ba43ac)|
|T-337a|⏸️|—|待验|[D](BACKLOG-details.md#m-32c1e32f)|
|T-337b|⏸️|—|待验|[D](BACKLOG-details.md#m-6a762b20)|
|T-337c|⏸️|—|待验|[D](BACKLOG-details.md#m-98c9aba5)|
|T-337d|⏸️|—|待验|[D](BACKLOG-details.md#m-1701b8f2)|
|T-337e|⏸️|—|待验|[D](BACKLOG-details.md#m-360f8469)|
|T-337f|⏸️|—|待验|[D](BACKLOG-details.md#m-33a4eeca)|
|T-337g|⏸️|—|待验|[D](BACKLOG-details.md#m-19a74d69)|
|T-334|⏸️|—|待验|[D](BACKLOG-details.md#m-6fd6d325)|
|T-324|⏸️|—|待验|[D](BACKLOG-details.md#m-151526ff)|
|T-340|⏸️|—|待验|[D](BACKLOG-details.md#m-e981a803)|
|T-315|⏸️|—|待验|[D](BACKLOG-details.md#m-b2ea5704)|
|T-316|⏸️|—|待验|[D](BACKLOG-details.md#m-9e003f50)|
|T-317|⏸️|—|待验|[D](BACKLOG-details.md#m-b3eb3c4b)|
|T-318|⏸️|—|待验|[D](BACKLOG-details.md#m-6a76af4e)|
|T-319|⏸️|—|待验|[D](BACKLOG-details.md#m-92c7b86e)|
|T-312|⏸️|—|待验|[D](BACKLOG-details.md#m-91e6e13a)|
|T-307|⏸️|—|待验|[D](BACKLOG-details.md#m-24dc64b7)|
|T-306|⏸️|—|待验|[D](BACKLOG-details.md#m-688691d3)|
|T-301|⏸️|—|待验|[D](BACKLOG-details.md#m-1a73cd6f)|
|T-302|⏸️|—|待验|[D](BACKLOG-details.md#m-1bef533c)|
|T-261|⏸️|—|待验|[D](BACKLOG-details.md#m-9f9614fc)|
|T-249|⏸️|—|待验|[D](BACKLOG-details.md#m-d135e45b)|
|T-250|⏸️|—|待验|[D](BACKLOG-details.md#m-4501cdb3)|
|T-255b|⏸️|—|待验|[D](BACKLOG-details.md#m-357d19b3)|
|T-185R|⏸️|—|待验|[D](BACKLOG-details.md#m-6ae8a118)|
|T-136R|⏸️|—|待验|[D](BACKLOG-details.md#m-2cec6296)|
|T-100|⏸️|—|待验|[D](BACKLOG-details.md#m-6fbf95ad)|
|T-087|⏸️|—|待验|[D](BACKLOG-details.md#m-894b4b71)|
|T-045|⏸️|—|待验|[D](BACKLOG-details.md#m-b16b9f75)|

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。

[D]: BACKLOG-details.md
