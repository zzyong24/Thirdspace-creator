# LED-061 当前2d失败诊断

唯一获准精确重验已自然结束：`node docs/verification/t1073/verify-resource-lifecycle.mjs`，在`2d3826ef164241860437daa393d336d9b042f980`实际exit=1，用时104.955秒。五批共378PASS/1FAIL；唯一失败是T1062真实Pipeline测试导入`@xenova/transformers`时，sharp0.32.6找不到`build/Release/sharp-darwin-arm64v8.node`。尚未进入该例后续Whisper分块/拼接/恢复断言，不能称已经复现线程、响应流或回执泄漏。

大白话：这次managed目录少了真实原生依赖文件，测试在加载库时就失败了。没有证据要求修改T1364产品代码或放宽测试。

```mermaid
flowchart LR
 A[原full只留LED061 fire] --> B[同2d精确门一次重验]
 B --> C[实际库导入失败: sharp原生文件缺失]
 C --> D[保FAIL与原任务 不改源/断言]
 D --> E[Root另核交付闭包 不把它代签managed门]
```

## 证据与实际范围

原full的RECONCILE_2D_META记录同2d、exit1、1300.595秒；原PRIVATE输出为56ERROR/0WARN及LED-061 fire。reconcile的execSync使用stdio ignore，未留下LED子FAIL详情。这次新重验只能确定当前失败，不能倒签原full首因唯一相同，也不能抹除旧44基线的hold或原full56/LED fire。原full路径/SHA见SAFE_SUMMARY。

先只读排除了缺输入猜测：contract-vitest.config.mjs与serial/parallel原内存JSON均存在、在2d HEAD跟踪、非ignored，与旧候选和主树SHA相同。完整对照见INPUT_EXISTENCE_COMPARISON.json。随后仅运行原精确门一次，沿原五批、test/hook120000、retry0；未加较短父timeout，未修改脚本或断言。Node父进程与所有子批自然完成，真实退出码由subprocess.returncode保全。

|批次|本次实际结果|
|---|---|
|contract|23PASS|
|ai-worker|123PASS/1FAIL，sharp原生模块缺失|
|backend|72PASS，serial/parallel内存观察保本次日志后由原守卫还原原字节|
|frontend第一批|132PASS|
|frontend第二批|28PASS|

当前失败定位在`multimodal-whisper-local.test.ts:490`的vi.importActual，生产与测试Whisper文件、资源门、pnpm-workspace及lock均与e676字节相同。当前sharp包package.json为0.32.6，但build与vendor目录均不存在，构成这次import失败的直接可证条件。为什么原生工件没有安装/保留，没有安装过程原件，本审保UNKNOWN；pnpm-workspace事实上已列sharp于onlyBuiltDependencies，不能再声称是本次漏写allowlist。

同源码不证明旧环境或旧执行无错；这次其它批次通过也不使worker失败变绿。所有guard/config与原两内存JSON的前后SHA相同；最终候选git status为空。开始时.lessons-stats是control原full生成的唯一脏项，control负责原字节保全/恢复；本审没有写其状态、中央事件或LED结论。

## 最小策略与停止边界

不提出产品修法，不改Whisper Pipeline、T1364代码、资源生命周期断言或依赖allowlist。当前只需区分managed缺原生工件与独立交付目录的依赖完整性。已只读交付执行者保全的独立T7原件native-result-attempt01.json与native-check-result.json并核SHA：sharp0.32.6/vips8.14.5真实PNG roundtrip、SWC loaded、7个workspace链接/46个shim/2个native binding均指向该新source、outsideLinks为空，实际exit0/6.804秒。这是执行者的另一份运行证据，本审未重跑检查或触构建。两原件完整路径/SHA见SAFE_SUMMARY（分别f7b49572…与5e32eca7…）；不能把其通过回写为本managed资源门PASS或原full无错。Root可据两份不同环境的明确证据作放包裁定。

遵Root后续边界，本轮不在managed装依赖、不为绿再跑门、不重跑全reconcile，不接触另agent的LED057 cargo目录；没有用户库、profile、凭据或真人操作。当前唯一精确重验已结束，原FAIL与全部历史证据保留。若要修复任何运行环境，需Root另给精确环境写集；本报告本身不执行修复。

原始合并stdout/stderr为RECHECK_PRIVATE.log（0600），SHA256 `b0434fc68436eba55b102a35755133c309751106d790c3fe5f35f783ce653555`；实际命令/开始结束/exit/前后还原SHA见RECHECK_META.json。INPUTS、READONLY_EVIDENCE与SAFE_SUMMARY分别保入口、静态条件和安全结论，不替代原始失败。
