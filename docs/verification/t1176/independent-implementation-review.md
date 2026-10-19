# T1176 精确实施独立只读复核

结论：PASS，仅限当前两测试实施、实际收据与现5a包隔离浏览器导航/滚动小范围；findings=[]。源码HEAD `335b1b5e055b1c8cb0935fe7f512409532236592`，工作树含已授权T1176两测试及root另行单写T1177测试。未将未提交树冒作干净HEAD。本报告不签完整Gate、task完成、T1015整体、真实平台/模型或原生安装启动。

## 精确源码与原保护

相对 `335b1b5e055b1c8cb0935fe7f512409532236592` 的本片完整diff只有shell.test.tsx与cover-file-repair.test.ts。T1176 SPEC仍为初审绑定的 `5ace50c84add624b358409d21ee26447b9845aff96dac9e60a6fb848c2327f02`；record/start原收据均真实exit0，log分别明示PASS[REV:d0fefb6b762e]和已记📋→🔨事件。当前root另改单个dashboard-read-performance.test.ts属于T1177，本复核不审其实施，不把它计入T1176越写集。

封面仅新增既有seedAdjacentContent导入及同ctx u/a建立output-1/output-2，让原public publishing服务先过真实project→output父链；未改source=user或绕repository/所有权。原真实临时文件删除→isAssetFileAvailable=false→候选→补采→版本保存→PNG实际字节回读、attempted1/filled1/failed0、好封面不变的完整断言均原样保留。原第二例unknown只延后自身、missing继续下载/保存、settled顺序与2/1/1计数原样保留。

新增3例均用fresh隔离库和真实父实体：不存在、跨user、同user跨account；原服务抛OwnershipError，publication与revision两表调用前后数组完全相等且当前workspace发布列表为空。没有所有权stub，没有改父链守卫；合法父链正例已实际5PASS。它证明本地文件修复和隔离持久库链，网络fetch/download仍为原stub，不能称真实抖音补采。

Shell独立固定13标签+href期待值，包含创作画布/canvases，不从PRIMARY_NAV派生。展开与收拢均验13个真实href及prefetch=false。旧“contentFill无PageScrollArea”改为同唯一Root/viewport，精确外层overflow-hidden、直接wrapper满高/min-h-0、直接scrollbar隐藏和原fill尺寸/child断言；并加false/true两个起点双向切换，Root/viewport/input DOM保持、未保存值保留、mount1/unmount0。原其它39用例保护未删除（3处校准保新合同，新增2例使shell为41），原app-shell.test.tsx2例无改，focused合计43。

产品AppShell/sidebar/ScrollArea、publishing service/repository、backfill、workspace过滤、seedAdjacentContent helper、配置/预算与包probe所用原resolver/helper相对335b的实际Git diff均为空。仓库src当前仅这两文件与T1177一测试变化；没有产品运行时、业务守卫或预算变化。T1069稳定同树与未保存稿合同保留。

## 真实RED/GREEN与类型

以下均来自root已发生的原命令收据/日志，本复核没有运行任何执行。18组包装收据的logSha256全部与实际log字节一致，逐项receipt自身SHA、logSHA、argv见READ_SET.json。

| 原证据 | exit | 秒 | 实际结果 | 实际log SHA256 |
|---|---:|---:|---|---|
| LED048 原RED | 1 | 219.252 | 15文件209PASS/1FAIL；首例父链前置失败 | `2d2b5e9666245e51a6b7ffb8e53427f7195d0a9eaf8fa0cb942de7e361f25964` |
| LED049 原RED | 1 | 5.083 | frontend76PASS/3FAIL；旧导航/容器断言，后段尚未执行 | `aa2b61e313b29fee3bb168d8571504db2563d1f6906dc3a5182c566e5be27ce7` |
| 封面focused | 0 | 16.331 | 5PASS，2原例与3父链拒绝 | `091b8d0923b6d11fad545063e5beba18475ea4690890aa241e6213e3cabeeb13` |
| Shell focused | 0 | 4.521 | 43PASS（shell41 + 原stable host2） | `1645221836b15d7eea740793652f185b0e2c291bc5807561ccccb99bae9e7799` |
| 首次frontend类型 | 2 | 10.003 | TS2769：TestingLibrary ByRoleOptions不支持exact，原失败保留 | `8fdf4a668dcb771b6fc9e4e6b7f402949e65ddaae153e1eb0182d604ef4f0bb1` |
| frontend corrected | 0 | 8.588 | 原无支持参数删除后类型通过 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| 最终Shell | 0 | 4.404 | 最终43PASS，保原名称/href/全部断言 | `711a56767c2ae98b381c014e46cb293f181a3fdd674c4806037a67f1864d4099` |
| backend类型 | 0 | 50.552 | 原tsc --noEmit通过，空stdout | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| LED048 原完整GREEN | 0 | 215.310 | 15文件213PASS，原命令/预算/retry0保留 | `eeb349c580aead69fb983287838cde29b08922359be2edccf3d7e129500e732b` |
| LED049 原完整GREEN | 0 | 153.833 | frontend7文件81PASS + 后段backend3文件49PASS，原串行&&命令保留 | `7ca20ec02261a1d3d7d3065a9eb4186103ccb9eaa1fc9a0205f1185371e5ea93` |

首次类型exit2与原log完整保留；最终测试只是删不支持exact参数，TestingLibrary的字符串名称匹配、13标签/href/prefetch和原行为断言仍在。corrected type0与最终43例支持当前字节，无靠宽松断言洗绿。LED048/049完整原命令全部保留，显式两隔离PG变量一致，原较短局部预算仍留在原命令；本片没有修或销账LED053旧债。

boundary实际exit0仍有5基线违规，semantic0，orphan0 errors/100 warnings；只表示本片无新增相关问题，不称历史违规或warnings清零。jsdom“navigation to another Document”及localstorage提示仍在GREEN原日志，不冒作浏览器错误清零。

原LED050 diagnostic整命令仍exit1/125.0313秒：frontend7PASS、backend45PASS/3FAIL。其backend配置仅dashboard4例和publishing.service文件；dashboard1PASS/3FAIL，故其余原publishing44PASS（按实际命令/计数相减）是局部服务回归证据，不是LED050全过。三失败已属T1177独立初审/start范围，本报告不销账或代签其实现。

## 实际随包浏览器与已看截图

已读三原probe、result JSON、wrapper/log与sidecar原log：随包Node `5ed0e129e708e36048981aed983f7302b0c18139f5a174e4b8d5fabbacb6d59d` 和生产resolver实际选择的fullChromium1223 `2447c7bdea8e8ad38b52594f1ba53e18821c05445e8a07ad1cf3b0f23931d89d` 与当前独立二进制字节核对吻合。每轮用随机fresh data/auth/master与合法宿主握手；原buildSmokeSidecarEnv清空DATABASE_URL并把DB/media/workspaces指向隔离目录；真实Playwright浏览器没有route interception、mock页面或evaluate插入假内容。本复核没有重跑、读真实用户库/profile/credentials或调用模型/真实平台。

三轮outer分别exit0/23.330秒（无组）、0/22.438秒（实际UI创建并进入空组）、0/22.820秒（建组后追加360高度）。真实13anchor顺序/href匹配，首页→内容雷达→首页全程同一个Root/viewport、唯一content。普通页overflowY=scroll，fill=hidden、720/360高且外层滚轮scrollTop0。第二轮720雷达三内层overflow:auto但clientHeight=scrollHeight，只能证明CSS可内滚，没有内容溢出，不虚签该轮实际内滚。

第三轮真实空组UI和自然内容在1280×360使中栏client95/scroll312，maxScroll217；鼠标wheel实际scrollTop217，外层仍0。返回1280×720首页后原外层滚轮实际663/max663。三轮pageerror在完整操作后统计为0，未取消原宿主或握手断言。no-op dispatch真实404、sidecar计划SIGTERM退出143、CLIENT_CONFIG_PENDING与持久driver启动原日志保留；不称所有日志/后台能力全绿。

本复核实际view_image看过：

- t1176-workspace-navigation-intelligence-fill.png：1280×720，所选隔离组真实三列空雷达，无双外滚条证据；不声称数据充满。
- t1176-inner-scroll-navigation-after-inner-wheel.png：1280×360，中栏自然溢出且已滚动，外壳和固定导航/身份区保持；滚动数值来自实际JSON，不凭静态图估算。
- t1176-inner-scroll-navigation-home-after.png：1280×720，已返回隔离组首页，真实0/—与原布局。probe是在后续首页wheel之前截此图，所以该图不是scrollTop663的截图，663来自后续真实测量。

截图实际SHA与尺寸逐一见READ_SET.json。测试对local-state child不卸载、真实浏览器对原容器和CSS/滚轮分别给证据，不把首页/雷达之旅冒作原T1069全套剪辑Tab/保存/刷新或原生App验收。

## 未签范围

当前完整canonical尚未复跑，旧32错误及T1015整体未闭合；pmem/reconcile、正式任务收尾与提交仍由root保真实结果。此局部复核不签真实数据profile的微信执行准入或研究恢复、扫码、平台采集/发布、模型、安装/原生App启动、全功能或发布。只写本私有REVIEW.md与READ_SET.json，未改仓库、任务/验证器、正式旧审核与报告。

## 关键字节

以下路径相对W，全部实读路径与SHA详见READ_SET.json。

| 路径 | SHA256 |
|---|---|
| `docs/features/t1176-current-regression-preconditions.md` | `5ace50c84add624b358409d21ee26447b9845aff96dac9e60a6fb848c2327f02` |
| `frontend/src/components/shell/shell.test.tsx` | `85232cb1b33f9874ff1133c388d20e017c6df1bee85cd6899c6e51ca168ab8a9` |
| `backend/src/application/collection/cover-file-repair.test.ts` | `930501eeec2d22b44957a904e2b0062b913678cc49d06de43f40762112e8c794` |
| `frontend/src/components/shell/app-shell.tsx` | `eb734f9c2b85f3fec5c7dfc16712aa48f52fd11339bdf6c01a96368eb282c76f` |
| `backend/src/modules/publishing/publishing.service.ts` | `5c741ec2fa1924ca2035a9c953a79cc5f3a5f75e91754bd4ee25f8fba15b07e9` |
| `backend/src/integration/adjacent-domain-fixtures.ts` | `d8aaf4ab031d9fb6a6be45b779511d18ddd91b1f7193037918bdf0c6e0e974ae` |
