# T1246 新增 59 项验收执行器（准备期）

产品候选固定 `533224f334c43cdb81a344424e420cad93784dd1`；独立运行副本 `/private/tmp/t1246-native-runtime-533`。复制已验证的 11 个 Worker 成品和安装依赖，不重建、不改产品源码、不复用原 170 的数据/Next 缓存。深层 `.pnpm` 工作区链接均绑定本副本。

59 runtime 用例 = 49 个唯一 generation key + 10 个界面/边界用例。三个 spec 可以依次独立执行（browser 10、native 33、dependent 16），也可以同一配置完整运行；每例新建真实组/项目，default 模式、retry0、workers1，不因前项失败连锁 skip。缺真实平台登录/原历史分支等前置的用例也实际执行检查并报 BLOCKED，不删除、不 skip。

启动：在本副本 `frontend`，预先创建全新数据根；声明 `CREATOROS_TEST_PORT=61347`、`CREATOROS_PLAYWRIGHT_DATA_ROOT=/tmp/t1246-new-native-data-533-v1`、`CREATOROS_T1246_RUN_DIR=/private/tmp/t1246-native-runtime-533/docs/verification/t1246/round-1-new-v1`、候选 SHA、`PACKAGE_READY=1` 和原 DMG SHA，然后 `pnpm exec playwright test --config=../docs/verification/t1246/new-driver/playwright.config.ts --project=e2e --workers=1 --retries=0 --trace=on`。无 suite 短截止；原持久任务截止不续期。request/action/navigation/expect 120 秒，有限任务观察 33 分钟涵盖原 30 分钟任务＋120 秒请求＋60 秒结算；test/hook/fixture 180 秒以上，复杂 test 6 小时涵盖串行生成、启动、清理。原更长值保留。

JSON 中 browserStepStatus=pass 只说明浏览器断言；有 generationKey 的通过回执一律 status=pending_ledger，须停止后原 task/call/Codex thread/turn/API0、图片文件 bytes/mime/size/checksum 逐项只读对账后才能签功能 PASS。共享首页截图不签 UI 消费；有真实按钮的链路记录 UI response＋同候选显示；内部/旧无独立按钮 key 明确公共 API 覆盖。官方账户来自当前合法本地环境，不复制凭据、不发布平台内容。

原 170 完整首轮与新 59 彼此独立，失败回执不覆盖、不改原产品或原断言。当前文件仅准备与冻结证据，不能认作已执行或通过。

准备期版本二补齐真实按钮：系列图经“生成所选 2 页”触发原 bundle，每页原 file预览后“采用到这一页”；朋友圈经“使用当前保存稿作为来源→生成朋友圈候选→采纳候选并保存新版本”；每日自动选题经原 job 行“立即运行”。所有源任务与候选仍公共同 ID。INT-FREEZE 虽无 generationKey，只要有真实任务同样 pending_ledger。
