# T1338 受控公共 RED 装配

当前未执行测试体、未调用真实供应商、生产代码未改。仅按已审 SPEC 11c9cca…准备。

一条独立公共用例：真实本机身份 → 公开建原账号及其真实 legacy 组 → 原账号公开建项目/组合/朋友圈成员 → 正常 work.review 创建 → 原 prepare 真实绑定执行 → 不可变 3851 structured worker 经真实 supervisor/ports/账本产生正式报告 → 正常 model confirm → 原 confirmed_current。只有外部模型 HTTP 在新 owned loopback 返回固定协议结果，不替换 reader、授权、prepare、commit、确认。

随后真实 Next `createRequestStoreForRender`/AsyncLocalStorage 提供实际 cookie，调用原 session、work/page 与 server client。JSDOM 物化原 WorkCompositionWorkbench、WorkspaceInitializationProvider、AccountSwitcher；真实 dispatch POST route 承接客户端读取。原切换器正常从账号选中其真实 legacy 组并清 account；`router.refresh` 实际重执行原 page/session，再将真实结果重渲染，不用空 refresh mock。保 cookie 前后、实际 page 拒绝、DOM 与每个公开调用。

原组合/朋友圈物理 group_id=NULL 只在本次新 owned DB 实读断言；7f1 原库不打开，历史物理字段不据此补证。group 下原组合、成员、报告、状态、历史版、create 回执与成员预约都按公共读口检查；同原 confirm key/body 重放应返回原确认。RED 对合法读取成功的真实期望用 soft 断言，保完整各处拒绝；正式报告确认前置仍 hard，不把装配失败当目标 RED。

```text
原账号合法完整报告/确认 → 原真实 cookie 账号
                         ↓ 实际 AccountSwitcher
                      原 legacy group
                         ↓ 实际 router.refresh
                   原 page / server client
                         ↓
              组合、朋友圈、状态与同原回执
```

此为真实 Next page/session/请求上下文与组件受控集成，不是独立 Next HTTP 服务或像素浏览器验收。7f1 原浏览器整页 digest1542333634 FAIL 另存，最终修复包必须实际正常页面补看。

每 case 独立 test 28800s，hook 180s，global 30600s，wrapper execution 31800s，outer 32400s（保600s清理）；retry0。原持久任务 deadline 不续期；prepare 有限观察120s，明确业务或 runtime 失败/UNKNOWN/partial 即保存原 task 并停止，不等待不存在的 executionId。1个本次受控模型调用，0真实供应商；后续 GREEN 只打开该已完成 owned DB 与从开始持久的原0600 key，原任务/报告/确认不重发，0新模型。GREEN continuation 需原 RED 收据、cleanup 与 exact receipt SHA 后才能实际生成，不预填。

DB/media/tmp/cache/log 只使用 OWNED_RUNTIME.json 对应 C 真实授权外盘新根。无 scheduler、无共享 dist build、无外部凭据复制，不打开旧 UNKNOWN。测试 finally 逐项记录真实 unmount/DOM close/dispatcher stop/persistence dispose/supplier close 状态；wrapper 核初始 PID/PGID/lstart/comm、所有登记子进程身份，TERM/KILL 后等待并重读，最终原 source/link/absence 漂移与残留必须为空。DB 和私有 key 保留供终态同 ID 后续验证。

公共新写继承、纯组/外组/跨用户/归档/父转组及 pending/receipt 冲突在已审 SPEC 范围，待真实目标 RED 与生产授权后用原 backend test 和最小新增消费者族落实，不提前导入尚不存在的新 helper。reportWhere、readFrozenTask、sameOwner 与两个 stage 不改。
