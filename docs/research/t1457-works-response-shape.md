# 视频号作品原生响应HTTP201被误拒绝

两个研究实验已闭合到HTTP成功范围假设；不是空列表或未知值当零。HTTP201后的JSON和最终保存尚待业务验收，不能提前写成功。第二实验复用了既有目标手动任务，保留该用户任务，不取消。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1457",
  "research_task_id": "T-1457",
  "status": "validated",
  "problem_statement": "实际同当前窗口POST返回HTTP201，原代码仅200提前拒绝；官方同站Axios默认接受200..299，已明确是成功状态假设错误，不是列表/日期或登录失效。",
  "failure_family": "wechat-works-native-response-rejected",
  "observed_invariant": "同官方frame、正确日期和原生完整性必须保留；合法空数据不能因错误协议假设被拒绝，未知不能当零。",
  "trigger_kinds": [
    "repeated-failure-family",
    "high-cost-feedback-loop"
  ],
  "paused_actions": [
    "further-production-changes",
    "broadened-workaround",
    "repeated-full-system-runs",
    "irreversible-operations"
  ],
  "evidence": {
    "authoritative": [
      {
        "kind": "source-code",
        "ref": "https://res.wx.qq.com/t/wx_fed/finder/helper/statistic/finder-helper-statistic/res/static/js/async/211.72930a2e.js",
        "claim": "官方ed.getPostList直接取totalCount并可选映射list；默认pageSize10/currentPage1。只支持候选输入族，不证明本机实际shape。"
      },
      {
        "kind": "source-code",
        "ref": "https://res.wx.qq.com/t/wx_fed/finder/helper/finder-helper-web/res/static/js/816.c7a59812.js",
        "claim": "官方Axios validateStatus为200<=status<300；允许201成功但仍需要原响应体/日期/完整性验证。"
      }
    ],
    "local": [
      {
        "kind": "runtime",
        "path": "docs/verification/t1454/prefix-safe-diagnostic-events.json",
        "locator": "collection-6404fd0b-103",
        "observation": "实际菜单命中后前两报表完成，在channelsWorks REPORT_RESPONSE_INVALID；原自建任务内部4次重试已公开取消。"
      },
      {
        "kind": "source-code",
        "path": "ai-worker/src/runtime/platform/wechat-dom-witness.ts",
        "locator": "readChannelsWorksResponse",
        "observation": "原合并guard要求errCode0/number totalCount/array list/首屏数量；本次只拆等价失败分支并固定安全元数据，不放行。"
      }
    ],
    "experiments": [
      {
        "question": "本机具体是响应错误、类型不符、合法空列表缺失还是数量不符？",
        "command": "冻结226c685fa本地包并安装；公开scheduledJobs.runNow同原group/account/job仅一个新稳定key，失败首次取固定shape后取消自己创建的验收任务；不截图。",
        "environment": "用户本机普通无诊断配置，原登录态",
        "result": "实际reason=endpoint，body/日期形状尚未读取，不能实施空列表兼容；首次失败即公开取消自建验收任务，正常exec取消终态待回读。",
        "artifact_path": "docs/verification/t1457/probe-safe-diagnostic-events.json",
        "artifact_sha256": "31b43a1366ee7f28e63efd7bc8ce47a2cc1f879e9cdebdca50281085d2346ead"
      },
      {
        "question": "原匹配门是预检方法、3xx跳转还是实际HTTP失败？",
        "command": "R2仅增原HTTP状态和固定方法，提交后固定入口本地包，一次原账号普通同步首次失败即止住Agent自建任务，不截图。",
        "environment": "同已登录账号普通无诊断配置，第二且最后最小研究实验",
        "result": "实际endpoint、HTTP201、methodPOST，菜单唯一且已进入目标路由；调用复用既有目标run-b10927b7-92fe-49df-854e-24836d73a4d6 / exec_6f5bf2c3-5927-4d29-89b8-a0ddd03b1831，没有新建重复任务，非Agent创建故保留原任务而未取消。",
        "artifact_path": "docs/verification/t1457/http-safe-diagnostic-events.json",
        "artifact_sha256": "9cf360905f9936ff7ab2cf263af145cfdd1cb7d6b73a773bf34adc873acd0ddc"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "如果捕获非POST预检，过滤不属于数据POST的响应并保留真正POST失败处理",
      "tradeoffs": "必须实际固定method/status证实且保留合法旧响应/错误路径，不盲目等待掩盖真实错误",
      "scope": "待第二实验实际形状，不当前实施",
      "falsified_by": "实际是POST而非预检方法。"
    },
    {
      "id": "OPT-2",
      "outcome": "如果捕获官方重定向，只沿同官方origin、同frame、同窗口的已证重定向关系等待真实最终数据响应",
      "tradeoffs": "不得接受任意重定向或忽略真实HTTP错误；需官方协议和完整旧/拒绝族",
      "scope": "待第二实验实际形状，不当前实施",
      "falsified_by": "实际不是3xx重定向。"
    },
    {
      "id": "OPT-3",
      "outcome": "如果真实数据POST返回非200，则保留失败并按实际HTTP原因处理，不能当零或成功",
      "tradeoffs": "不能靠删除状态守卫使数据可信",
      "scope": "待实证",
      "falsified_by": "实际状态200且只是预检/其他方法。"
    },
    {
      "id": "OPT-4",
      "outcome": "只让HTTP成功状态范围与官方客户端一致，继续原POST/frame/日期/errCode/count/list/CSV全部核验",
      "tradeoffs": "HTTP201只证明不该提前拒绝，不证明JSON数据或最终保存已经成功；正常安装版必须继续验收原任务",
      "scope": "纯机械成功码兼容，不改页面/账号/数据归属/超时，不跳过错误响应或数量守卫",
      "falsified_by": "完整旧/拒绝族退化，或实际201之后数据校验/保存仍失败。"
    }
  ],
  "recommendation": "OPT-4",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "本机首拒绝门是成功POST201",
        "target": "同attempt/当前菜单/POST201且源包已验真",
        "measurement": "现场verify命令/固定字段与SHA",
        "observed": "同attempt/当前菜单/POST201且源包已验真",
        "verify_key": "t1457-native-http201",
        "evidence_path": "docs/verification/t1457/http-safe-diagnostic-events.json",
        "evidence_sha256": "9cf360905f9936ff7ab2cf263af145cfdd1cb7d6b73a773bf34adc873acd0ddc"
      },
      {
        "name": "官方原生成功范围与代码不一致",
        "target": "固定公开bundle接受200..299，原代码仅200",
        "measurement": "现场verify命令/固定字段与SHA",
        "observed": "固定公开bundle接受200..299，原代码仅200",
        "verify_key": "t1457-official-success-status",
        "evidence_path": "docs/verification/t1457/official-http-success.json",
        "evidence_sha256": "a2c1d49b126ba086262be755e29954358b502362012ac9f1b10a5f432ea45bdd"
      }
    ],
    "resume_criteria": "两个有界研究实验已证实错误成功状态假设，恢复后更新SPEC R3审核，先201完整公共链及2xx/错误/空响应输入族RED/GREEN，再安装并跟随既有目标任务回读真实保存，不新建重复任务、不额外研究实验或截图。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```
