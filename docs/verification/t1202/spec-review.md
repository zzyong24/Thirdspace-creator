# T1202 独立只读 SPEC 评审

结论：PASS（仅既有文案断言校准的SPEC，测试是否通过尚待实际运行）。

对象：docs/features/t1202-automation-cadence-error-contract.md
SHA256：2268aac26597bfc581d646e721e335edcfd8f0f06b63f3e357c77f854db9327c
日期：2026-10-10
独立辅助审稿：未改repo、任务、Git或产品/测试文件。

## 实际核对

原 automations-first.log 显示6文件119例，113通过6失败；其中复杂cron例停止在notice包含“无法反解”的旧字面断言。收到notice实际完整为“当前执行计划无法在这里编辑，请重新选择执行时间后保存。”，不是锁或保存行为已失败。

已用 git show HEAD:frontend/src/features/automations/automations-island.tsx 核基线：HEAD同一 data-testid=automation-cadence-unresolved 的p就是该完整人话句；本轮产品该notice语句未改。当前isEdit的canSubmit仍包含 !cadenceUnresolved，初始化compileCronToCadence返回null时锁定，CadenceEditor明确onChange后解除。不能为了旧术语测试改回产品文案或解除guard。

现成 automations-edit.test.tsx:219复杂计划用例还核：重选前saveDisabled、切“按间隔”后notice消失/saveEnabled、保存恰一次、精确payload.schedule===“0 */3 * * *”。这些原行为断言必须保留。更早的“旧复杂cron仍需重选频率，不因采集类型绕过校验”用例也必须保留。

## 精确实施解释

同一notice有两个过时展示断言：toContain(“无法反解”) 与 toContain(“0 9 * * 1,3”)。实际HEAD及当前产品notice从未在本轮显示raw cron。按本SPEC“此句完整期望”校准，应该把这两个notice展示断言合为精确完整人话文本相等断言，并校正测试注释“明示原cron”；不要只改第一个后留下必然失败的第二个，也不要删saveDisabled、通知消失、保存次数或精确新cron断言。

这只是校准已经存在的产品展示合同，不扩大范围、不变cron编译/降级/写入行为。保留完整错误句断言，比弱化成泛用词/任意notice存在更精确。唯一写集 automations-edit.test.tsx 充分。

原产品行注释仍说“明示原值”而实际p为人话，这只是既有注释漂移，本任务不授权顺便改产品。不能从此SPEC断言复杂cron已受支持；仍要求用户重新选择时间才能保存。

修后须实际跑该完整用例与自动化既有回归，检查guard与原payload断言，不仅替换文本后静态声称通过。原失败日志保留，不把旧FAIL改成历史Green、不将本次SPEC PASS当全功能验收。
