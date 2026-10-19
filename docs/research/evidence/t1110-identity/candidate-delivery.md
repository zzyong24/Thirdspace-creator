# T1110 身份操作错误：仅/tmp固定分段诊断候选

结论：候选只补内部诊断，尚未合入共享源码，也未证明原62或83真实失败的根因。新family研究Gate开启后没有执行候选测试、类型检查、浏览器、服务/API或任务操作。当前禁止以它重发原任务或追加原生盲试。

## 交付

- `/tmp/t1110-identity-diagnostic-tests-only.patch`：新增一份14例明确合成Page/Context测试；实际调用正式source与内置witness，不启动Chromium。
- `/tmp/t1110-identity-diagnostic-implementation.patch`：仅修改worker的browser-source和DOM witness两文件。
- `/tmp/t1110-identity-diagnostic-candidate-manifest.json`：基线、候选、补丁SHA及实际执行边界。
- `/tmp/t1110-read-identity-failure-analysis-20261010.md`：原62只读分析，事实与推断分开。

静态 `git apply --check` 对tests-only与implementation两个补丁联合执行，实际exit0；没有apply。最后读取共享HEAD `86e73907dc0bfe3384b944fdab2545452da09731`，两生产源SHA仍与初次 `39dcfae6` 基线一致。

| 文件 | 原生产SHA256 | 候选SHA256 |
|---|---|---|
| `ai-worker/src/runtime/platform/wechat-browser-source.ts` | `f172f920fefc08a2c00d39e753eda97a0e0391369bc7064f60d2c6bd48403d0c` | `e748b8701e010d2a4cd7109d73bfc2287fed292a4fee2146a5fc9de424f378e2` |
| `ai-worker/src/runtime/platform/wechat-dom-witness.ts` | `10d7b940110ffc96316c2687bae539259c2ba22feabebde34a57d12144c1048b` | `9eedfeca552e4b6d508a9c57b22e0b8e794e57230b078311029198305e5a1025` |
| `ai-worker/src/runtime/platform/wechat-identity-diagnostic.test.ts` | `新测试` | `7fa6b8581a99feea6dff7a3241c19d36ff4f5e3971d8a82e1143633af3b495ab` |

## 固定接口与行为

新增内部导出 `WechatIdentityStep = loginProbe | identityNavigation | identityFields | identityRead`，作为 `WechatBrowserDiagnostic.identityStep?`。`WechatOperationControls.onIdentityStep?`只接受navigation/fields两个固定值；built-in witness在真实调用前标记，custom witness未标记则保留identityRead。它不读取页面、链接、正文或身份，也不参与登录判断。

source原login仍跳过isLoggedOut，collect/readIdentity仍先probe；原goto、观察、signal、期限、预算、重试、任务和publicDTO均无改动。身份完成后进入prepare，诊断显式按stage白名单投影，避免陈旧identityStep混进报表回执。read结束后的晚标记、非法值或原signal已取消后的标记不接受；marker和诊断callback异常不会替代原失败或停止。

既有四个Chromium固定类别保留，补两个内部failureKind：`EVALUATION_CONTEXT_DESTROYED`、`JAVASCRIPT_EVALUATION_FAILED`。只匹配page/frame.evaluate或evaluateHandle的固定SDK前缀/协议，普通未知Error没有类别；原message、stack、URL、ID、Cookie均不输出。不据此转为LOGIN_REQUIRED。

正式composition目前两个callback都直接记录已经白名单化的event：`frontend/src/server/persistence-client.ts:4697`（report）与`:4982`（binding）。无需增加composition配置来得到identityStep，也没有candidate对composition的修改。

## 必要断言及旧测试兼容

14例覆盖三处分段普通Error、custom fallback、上下文销毁/JS异常固定分类、未知错误不推登录、含合成秘密的错误脱敏、diagnostic抛错、prepare不漏旧标记、晚/非法标记、原取消、原120000期限与晚fields，以及built-in marker抛错不改变原身份与导航。

原 `wechat-browser-source.test.ts:244–250` 两个custom identityWitness.read拒绝的exact diagnostic断言，在新字段落地后应只追加 `identityStep:'identityRead'`。该fixture本身没有built-in分段，不应改断言冒充identityNavigation/identityFields。当前没有编辑旧测试。

## 实际测试证据与限制

新的研究暂停消息到达前，仅/tmp isolated原基线source曾执行这14例，实际13 FAIL/1 PASS、exit1，日志 `/tmp/t1110-identity-diagnostic-candidate-red.log`。它证明旧source缺少拟议细分与固定分类；不是共享生产RED，更不是实际62/83根因证据。此前runner依赖路径配置失败0tests保存在 `/tmp/t1110-identity-diagnostic-candidate-harness-failed.log`，不能当红测。

上述RED之后候选实现才写在/tmp；测试仅补mock callback参数类型注解。由于新的研究Gate暂停，最终候选没有GREEN/type结果；不能签已通过。候选完整src及runner镜像位于 `/tmp/t1110-identity-diagnostic-candidate`，其cacheDir也在/tmp；镜像config/dependency symlink不在交付patch。

## 待根在研究卡登记后的最小实验设计（本轮未执行）

只允许先应用tests-only；保原生产source不变，以三个实际source注入点分别抛含明确合成秘密的普通Error，验证缺失固定分段。一次isolated测试命令即可，不需要真实浏览器/账号/网络/新intent：

```bash
pnpm --dir ai-worker exec vitest run src/runtime/platform/wechat-identity-diagnostic.test.ts --testNamePattern='loginProbe普通Error|identityNavigation普通Error|identityFields普通Error' --retry=0 --maxWorkers=1 --no-file-parallelism --testTimeout=180000 --hookTimeout=180000
```

预期是三例因缺identityStep失败；这是预测，命令未在共享树执行。若研究卡/独评允许再验证候选，用同一完整14例命令，不追加真实平台试验：

```bash
pnpm --dir ai-worker exec vitest run src/runtime/platform/wechat-identity-diagnostic.test.ts --retry=0 --maxWorkers=1 --no-file-parallelism --testTimeout=180000 --hookTimeout=180000
```

该实验只回答“细分是否安全且真正映射注入操作”，仍不回答实际62/83抛错在哪一处。实际SDK异常字符串是否被当前两个固定模式覆盖也未知；如果未匹配，仍保未知普通失败，不扩大匹配或猜登录失效。

原统计section family的历史OPEN/CLOSE与两实验记录不改写；新identity family的原62 failed0与83 failed/null保留。83无本次扫码回复，不能将它说成扫码后平台故障。
