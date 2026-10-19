# T1246 集中修复修订：早期独立审查

结论：**发现三项最终准入前应补齐的窄缺口；当前不签最终控制面 PASS、不解除冻结**。评审绑定 SPEC SHA256 `009b8a1f046cf121bae4d922b5ea6dc3483b4e7ccb7768d318ea89c93993fc66`，来源 binding `9f180d5c88f7dc24881be0b329e070ab7775f5382486cb9cc6279dfddb3face9`，首轮产品候选 `533224f334c43cdb81a344424e420cad93784dd1`。

后台643和四types仍待真实EOF，不能提前给最终失败数/旧债归属/新增改动授权。T1097仅已评审合同8221447156d8及真实reviewctl，不代表已实施。设置两完整原body诊断仍进行，只读direct about:blank事实不确定其两原case因果，不授权settings产品修法。本评审未改SPEC/产品/测试，未启动任何测试、模型、PG或App。

```mermaid
flowchart LR
 A[完整首轮及原失败封存] --> B[精确根因与写集]
 B --> C[最终合同和控制面复评]
 C --> D[集中修复 后冻结新候选]
 D --> E[重新打包]
 E --> F[原下游与完整逐项复验]
 A -. backend 与 types 仍待 EOF .-> B
```

## 提前审查发现

### PRE1246-01：新V3测试及工具没有精确文件与计数闭包

当前157来源清单145项已有字节及12项新增路径当场重核全部匹配；这12项是T1097源/测试，没有V3 spec、support、launcher/config、协议fixture、预算及来源manifest路径。§“新增59/49验收工具”给行为但仅称“新副本”，不能据此授权修改首轮v2冻结copy、原driver或任意runtime路径。38route拆为独立case后，runtime test数量会变化；59原旅程、29计划族、49唯一key与38route属于不同计数，不能继续把59当新的固定framework case数或用一份共享图签多条入口。

最终准入前应固定具体新文件位置，并关联旧v2文件SHA→新副本各SHA/逐条caseID、49key、38route、29旅程下游映射。可用实际候选路径（建议，不是当前已授权实施）：

- `docs/verification/t1246/round-2/new-v3/source/e2e/acceptance-support.ts`
- 同目录 `integrated-native.spec.ts`、`integrated-dependent.spec.ts`、`integrated-browser.spec.ts`，需要拆路由时显式新增 `integrated-routes.spec.ts`。
- `docs/verification/t1246/round-2/new-v3/driver/playwright.config.ts`、`launch.cjs`、`start-isolated-next.cjs`、`manifest.json`、`budget-consumers.json`、`runtime-closure.json`、`README.md`。
- 协议独立 `source/e2e/integrated-protocol-recovery.spec.ts`、`driver/protocol-launch.cjs`、`protocol/codex-jsonrpc-fixture.cjs` 及对应源/原vendor/fixture运行绑定manifest。Pi若复用同support或单独 `protocol/pi-http-fixture.cjs`，也必须固定唯一实际路径。

运行时只将这些明确源码复制到自有runtime/frontend的固定testTree；输出用本轮唯一runDir模式，原round-1/new-native-v2及原170证据一律禁止写。复制后的实际import层级、原helper/生成driver依赖、深层pnpm工作区链接、Node/11bundles/产品候选在启动前和清理后独立核，不把“会复制”签作闭包。某recipe工具尚未交付应记录验收工作待完成，不能误标用户外部BLOCKED；真实登录/模型能力等外部限制到原准入门后可诚实BLOCKED。既有4窄PASS也不能代签完整知识版本/同步、T1245运行详情/关闭、freeze任务与其原后置。

### PRE1246-02：协议恢复尚需固定故障事件与原公开producer链

§合成JSONRPC方向保持私有clone、新inode、无官方转发/凭据/SQL伪造，边界正确；但“真实JSONRPC/host ACK/stdio故障触发unknown”仍未确定触发事件。若在thread/turn binding之前断开，只有缺binding unknown，不能测原同ID恢复成功；若最终receipt已保存再断开，可能正常settled，不能签unknown恢复。此时按工具缺项固定throw Blocked属于未交付，而非用户限制。

最终工具合同需列原公共聊天create/submit→native thread/turn保存→何个真实stdio通知/ACK后受控断开→公开task状态unknown→原command/resume→同call thread/read→原完整结果/usage读回的精确步骤和正负族。fixture自己持久化的原turn状态仅在owned数据文件中，不能写应用数据库/调用ledger setter；未知线程首次read仍unknown，不能爆重发turn或延deadline。必须独立记录turn/start/prompt为初始一次且恢复增量0，以及缺binding/错组/取消/过期限/attempt/fence原拒绝。合成usage只说明协议会计状态，绝不能冒真实费用或凭据成功。

真实消费者是 `ai-worker/src/execution/codex-app-server.ts:46–63` 的锁定包版本/platform require/realpath/vendor可执行和--version核验，公共恢复及原服务在T1238既有真实测试可借验合同，不能复制其helper结果代签浏览器E2E。原官方vendor与包/official59树SHA前后锁定；fixture替换只能原子unlink/replace私有vendor真实解析位置的新inode，任何共享store/hardlink/symlink最终指官方树都拒绝。README中的runtime/fixture路径、替换旧新SHA/inode、原解析返回位置和控制事件要精确定义后独立静态审核；不增加生产可执行注入接口。Pi也必须经公共生成原task/result链真实HTTPfixture，模型probe或别组旧测试PASS不等价本例兼容。

### PRE1246-03：非法SRT的状态校准应明确而非笼统保取消终态

原39第3项 `frontend/tests/e2e/ai-reliability-recovery.spec.ts:149` 期待cancelled；真实非法SRT任务已failed、`VIDEO_DECISIONS_FAILED`、attempt1、模型call0，原trace/账本没有用户cancel命令。草稿写“取消终态均保持/不任意扩大失败expected集合”，但没有固定这项实际状态变化如何校准。深核D05原报告仍明确等正式决定，不能据测试文件写许可直接洗成failed/cancelled二选一。

建议固定本非法输入例按真实failed+精确错误code/原task/attempt/call0核；保原错误脱敏/真实详情、终态停止轮询、刷新恢复、显式重新运行retryOf原task、无自动重发全部后置，不把生产failed改cancelled。真正用户cancel另用真实公开cancel命令同ID验证cancelled和无重发；不可将本无cancel的输入失败当取消证据，也不通过篡改response让下游过关。如果批准的当前合同仍强制输入失败cancelled，需先证明该条文并另外精确评审生产写集。最终修订应明确选择后再改原assert。

## 目前范围与保持门的判断

- FF001内部executionRoute与公开扫码strict body分离有真实消费者必要性。原account-binding.service.ts:61新run和:103 interrupted cleanup都严格parse同payload，read/status投影也读该真实平台；应在该文件统一窄解析内部可信route而非只修一处/接受任意业务key，public start仍strict。原run组版本、真实staging/身份、同事务commit/rollback/退出屏障与费用无关，不新增模型门。
- BA001首帧scope/SSR同步、D01完整组分页、D02现成员非微信目录及accountId cursor闭包有精确真实来源；只改列出的UI消费者，不能放宽归档/离组/转出或旧source权限。UI_RULES每行一直接动作与现管理弹层组合可实施，无须删旧historical资源或建立新作品服务。
- BC003只修可达coverchip及material/cover fallback的独立图API预填要求，IMAGE_MATERIAL_PREFILL本身原无该要求，不泛称全部图入口有问题；保Pi/视频/ASR/embedding与真实参考图资格。真实点击无自动提交后，再同source/task官方调用，缺参考资格准确记录不伪造。原prefill测试消费者实际为 `frontend/src/features/copilot/ai-copilot-content.test.tsx:260`（封面functionKey、参考选择）及 `ai-copilot-interactions.test.tsx`（真实点击/请求），均已在157绑定；最终写集明确该case与新增engine分支断言，不能按“prefill测试”扩写无关测试。
- T1097的原payload输入证明、原v1/新v2、resolved历史资料、user assisted唯一范围、同位置历史ref保可用、fact不自动confirmed、两artifact独立CAS/receipt及未知ACK不发新模型仍遵已独评822合同，不再将未实测文章9红或官方新49call0称通过。
- 69原测试映射范围精确已有来源，fixture校准不得删原后置或扩大权限/终态集合。原42 endpoint错误方法404/405仍保持；旧迁移必须真实旧producer→current迁移，不靠手补列；Rust--exact要验证真实正文数量，条件Python未执行不签取消。新增SDK/数据库迁移/真实平台发布/系统授权没有被本草稿打开。
- 不把整套unit32/旧checkpoint26/原54等不同回执数字相加；backend/types EOF后真实新增缺口必须追加原case/来源/consumer/最小写集并再最终独评。设置诊断真实结果出来前仍不可改settings产品。
- v3预算必须逐consumer完整串行+observer/ACK/末request/结算/图片多个文件/queue/start/cleanup实列，保原更长case，不以全局180s包住两个120s操作。bounded task继承原剩余期限，continuous无造新deadline，unknown原ID不自动重试；ledger/API0/原provider binding与blob真实200bytes/mime/size/checksum逐原call核，官方收费未知如实记未知。
- App用户真实2026-10-11决定暂不授权；本稿已纠正日期并保AC5未满足不complete。包构建/签名/worker startup、浏览器E2E都不代签Appium或App实际操作。

## 后续准入

本报告只审当前新binding和具体缺口。补固定V3精确写集/全映射、协议事件切点及D05状态决定，再等待完整backend/types/最后源指纹EOF并追加真实缺陷，合为最终SPEC+DEC+控制面context复评，才可集中实施。现在不改产品/原assert，不运行v3、不覆盖首轮结果，不把准备中的双方半成品笼统叫外部阻塞。
