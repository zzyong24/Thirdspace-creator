# T1182 素材上传刷新最小区分研究

T1181重复可见性失败；产品/root cause尚未知。已完成一次隐藏注入观测，剩余一次真实按钮控制，最多两次，不追加第三次；其它源代码冻结的独立完整检查可继续。当前verify keys未注册，研究未validated，不宣称可恢复。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1181",
  "research_task_id": "T-1182",
  "status": "researching",
  "problem_statement": "两次MP4完成提示后精确列表等待120秒失败；公开库存含已落盘文件，UI仍只PNG；SDK body未知和菜单导航已另核，真实按钮可操作条件未验证。",
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
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "使用真实按钮可操作点击和filechooser，观察能否完成同一公开旅程",
      "tradeoffs": "只校正探针前置，不证明所有自动刷新并发场景；保原失败",
      "scope": "新私有驱动，无产品/预算/归属变更",
      "falsified_by": "实际按钮点击已可操作且选文件后，仍库存2/DOM1或后续跨组失败"
    },
    {
      "id": "OPT-2",
      "outcome": "确认为正常UI也失败后再定位产品刷新生命周期",
      "tradeoffs": "需新的精确产品SPEC独评和当前包验收，不能猜竞态强制整页刷新",
      "scope": "当前只读取证，未授权任何具体产品修补",
      "falsified_by": "真实按钮串行选择稳定完成当前旅程，但隐藏注入仍失败"
    }
  ],
  "recommendation": "OPT-1",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "真实上传按钮与列表更新",
        "target": "无force真实click/filechooser后两文件列表可见且按钮恢复",
        "measurement": "精确新驱动当场button disabled观测、真实chooser与原列表断言",
        "observed": "待第二次控制实验，不填PASS",
        "verify_key": "t1182-real-upload-ui",
        "evidence_path": "docs/verification/t1181/t1181-upload-list-navigation-corrected-failure.json",
        "evidence_sha256": "9b3164e4150f841d35590ded26a35d7e8ca7b75af2ad6e0974c5750e2560978f"
      },
      {
        "name": "持久字节与账号组隔离",
        "target": "两媒体公开size/SHA逐字相等，刷新/第二组空/返回保留",
        "measurement": "原严格公开下载与UI组操作，不route或写库",
        "observed": "原诊断轮两下载通过；当前新轮未执行完整跨组",
        "verify_key": "t1182-real-upload-scope",
        "evidence_path": "docs/verification/t1181/t1181-upload-list-diagnostic-failure.json",
        "evidence_sha256": "a49fed9d24905e3b6732d1dac3e569dfe53ae2d6d0e7680db26a114ec727ebec"
      }
    ],
    "resume_criteria": "两项当前验收闭合、第二实验实录并独评，恢复前注册/实跑有效verify keys；不以手写passed恢复，原超时UNKNOWN继续保留。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

真实用户、微信研究、App安装与模型不接管；原中性文件和所有旧驱动/日志冻结。按钮截图颜色不能补造disabled布尔值。控制驱动须新前缀输出，并在执行前独立核精确写集，全部旧断言/120秒预算保留。
