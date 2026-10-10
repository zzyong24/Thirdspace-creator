# T1182 素材上传刷新最小区分研究

两次最小区分实验已用尽（2/2），第二次真实按钮控制也失败。仅由隐藏input绕过按钮造成的解释已被推翻；具体刷新根因仍UNKNOWN。保持researching和T1181暂停，不追加第三次实验。独立完整检查已完成，原运行时没有改动。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1181",
  "research_task_id": "T-1182",
  "status": "researching",
  "problem_statement": "隐藏input注入后MP4库存存在而DOM不可见；第二次通过真实按钮/filechooser选择PNG也复现库存1/DOM0、原列表等待120秒失败。按钮绕过不是唯一解释，刷新链根因仍UNKNOWN。",
  "failure_family": "asset-upload-ui-refresh-visibility",
  "observed_invariant": "真实上传完成后素材列表更新，刷新与同组持久文件仍可见；测试不绕过真实UI操作条件。",
  "trigger_kinds": [
    "repeated-failure-family",
    "non-deterministic-behavior"
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
        "ref": "frontend/src/features/assets/asset-upload-button.tsx",
        "claim": "button disabled=pending，而hidden input没有disabled/onChange pending校验；toast之后马上router.refresh，toast不是列表更新完成证据。"
      },
      {
        "kind": "approved-spec",
        "ref": "docs/features/t1179-asset-upload-regression-diagnosis.md",
        "claim": "真实UI上传/刷新/公开下载/组隔离必须通过，不代签原生或工程导入。"
      }
    ],
    "local": [
      {
        "kind": "log",
        "path": "docs/verification/t1181/t1181-packaged-upload-navigation-corrected.receipt.json",
        "locator": "exitCode=1/138.769秒",
        "observation": "原120秒列表等待失败，原驱动日志不覆盖。"
      },
      {
        "kind": "runtime",
        "path": "docs/verification/t1181/t1181-upload-list-navigation-corrected-failure.json",
        "locator": "beforeListWait MP4/publicList/domCards",
        "observation": "公开库存两项、DOM只有PNG，所有上传create/PUT/complete为200；当时disabled属性未捕获保持UNKNOWN。"
      },
      {
        "kind": "runtime",
        "path": "docs/verification/t1182/t1182-real-button-control-failure.json",
        "locator": "fileChooserSelections[0] / beforeListWait[0] / failure",
        "observation": "点击前disabled=false，无force真实按钮和chooser选择；选择后disabled=true，上传三步200，PNG公开库存1/DOM0，120秒文件名等待失败。最终disabled未采集，不能补判。"
      }
    ],
    "experiments": [
      {
        "question": "直接hidden input注入时公开库存与DOM是否一致",
        "command": "随包Node执行冻结t1181-upload-list-navigation-corrected.mjs（原argv见实际收据）",
        "environment": "新随机隔离data/auth，中性PNG/MP4，无真实用户/平台/模型/native",
        "result": "exit1；publicList有两项，DOM只有PNG，filename等120秒失败；实际按钮disabled属性UNKNOWN。",
        "artifact_path": "docs/verification/t1181/t1181-upload-list-navigation-corrected-failure.json",
        "artifact_sha256": "9b3164e4150f841d35590ded26a35d7e8ca7b75af2ad6e0974c5750e2560978f"
      },
      {
        "question": "真实上传按钮与filechooser是否消除同族列表不更新",
        "command": [
          "frontend/src-tauri/sidecar/server.app/Contents/MacOS/creatoros-server",
          "/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1182-real-button-control.mjs"
        ],
        "environment": "全新随机隔离data/auth；实际随包Node/full Chromium；中性PNG/MP4；无真实用户、平台、模型、原生App",
        "result": "exit1，138.492260375秒；PNG真实按钮/chooser上传完成，公开列表有PNG、DOM没有卡片，原120秒可见性断言失败；MP4、后续公共下载/刷新/跨组未执行。只淘汰“全部由绕过按钮造成”，根因未定位。",
        "artifact_path": "docs/verification/t1182/t1182-real-button-control-failure.json",
        "artifact_sha256": "81917097e5f75fa9bcd8cdcfa2b93b4a8e4363ccd51b6cecc5e89ec9981c0bae",
        "receipt_path": "docs/verification/t1182/t1182-packaged-real-button-control.receipt.json",
        "receipt_sha256": "5b81ad11090643eb5c6414b65656b294c5246d533b7082d812b3cdfbfd177573",
        "raw_log_sha256": "fc2021c06314899a589e1b443bfd5fed4acbbf872f2791b07ed583d1a0bc5b77"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "使用真实按钮可操作点击和filechooser，观察能否完成同一公开旅程",
      "tradeoffs": "只校正探针前置，不证明所有自动刷新并发场景；保原失败",
      "scope": "新私有驱动，无产品/预算/归属变更",
      "falsified_by": "第二实验真实按钮点击前disabled=false，chooser真实选PNG后仍publicList1/DOM0。仅由隐藏input绕过按钮造成的解释已被推翻；完整正常旅程仍FAIL。"
    },
    {
      "id": "OPT-2",
      "outcome": "确认为正常UI也失败后再定位产品刷新生命周期",
      "tradeoffs": "需新的精确产品SPEC独评和当前包验收，不能猜竞态强制整页刷新",
      "scope": "当前只读取证，未授权任何具体产品修补",
      "falsified_by": "真实按钮串行选择稳定完成当前旅程，但隐藏注入仍失败"
    }
  ],
  "recommendation": "两次实验已用尽。保留研究暂停，仅读源码核清候选断点并进入决策队列；不追加实验、不猜根因改产品或扩大workaround。",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "真实上传按钮与列表更新",
        "target": "无force真实click/filechooser后两文件列表可见且按钮恢复",
        "measurement": "精确新驱动当场button disabled观测、真实chooser与原列表断言",
        "observed": "FAIL：真实按钮+chooser后PNG库存1/DOM0，120秒可见性失败；后续按钮恢复与MP4未到达。",
        "verify_key": "t1182-real-upload-ui",
        "evidence_path": "docs/verification/t1182/t1182-real-button-control-failure.json",
        "evidence_sha256": "81917097e5f75fa9bcd8cdcfa2b93b4a8e4363ccd51b6cecc5e89ec9981c0bae"
      },
      {
        "name": "持久字节与账号组隔离",
        "target": "两媒体公开size/SHA逐字相等，刷新/第二组空/返回保留",
        "measurement": "原严格公开下载与UI组操作，不route或写库",
        "observed": "本控制实验未执行下载/刷新/跨组；旧诊断轮下载通过不能代签本控制，保持待验。",
        "verify_key": "t1182-real-upload-scope",
        "evidence_path": "docs/verification/t1181/t1181-upload-list-diagnostic-failure.json",
        "evidence_sha256": "a49fed9d24905e3b6732d1dac3e569dfe53ae2d6d0e7680db26a114ec727ebec"
      }
    ],
    "resume_criteria": "当前2/2实验用尽且验收失败，不能恢复。须经新的明确决策处理未知机制/预算与有效verify命令，再满足原正常旅程；不手写validated、不以失败证据代替验收。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

真实用户、微信研究、App安装与模型不接管；原中性文件和所有旧驱动/日志冻结。按钮截图颜色不能补造disabled布尔值。控制驱动须新前缀输出，并在执行前独立核精确写集，全部旧断言/120秒预算保留。


第二实验当场执行2026-10-10 01:41:34–01:43:52 UTC，exit1；当前验收与真实列表仍失败。代码仅读确认assets.list无展示缓存，SSR view model还串行读取trash/projects/usage/storage；没有保存本失败的RSC请求/响应/ctx或每步耗时，不能认定卡在其中某一步。新驱动创建前仅有独立READ_SET证明driver不存在，全部PNG/输出不存在的独立前置清单缺失；不追补历史检查，不把新前缀、wx或现存截图当作预检PASS。
