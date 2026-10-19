# T1296 在T1298当前源码上的公共回归

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1296",
  "contract_path": "docs/verification/t1296/JOURNEY_CONTRACT.md",
  "contract_sha": "9c0e752b4cc2",
  "commit_sha": "8dbccad6a1b359bd69cd0d43a68988b1b4d37b95",
  "observed_at": "2026-10-15T12:19:31.874862+00:00",
  "run": {
    "verify_key": "script-first-workspaces:e2e",
    "command": "CREATOROS_TEST_PORT=3196 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome T1296_EVIDENCE_RUN=t1298-revalidation pnpm --dir frontend exec playwright test tests/e2e/t1296-script-first-workspaces.spec.ts --project=e2e --workers=1 --retries=0",
    "exit_code": 0,
    "output_ref": "docs/verification/t1298/regression/t1296-initial.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome / macOS，fresh隔离PGlite公共宿主；父环境额外T1296_NATIVE_RUN=t1298-revalidation-native仅分离证据输出，不改变业务逻辑。首次产物另快照在regression/initial-t1296-*以保留正式门重跑前证据。",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 1280,
        "height": 800,
        "result": "pass"
      },
      {
        "width": 390,
        "height": 844,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "grp-a0f30b27-174",
        "role": "独立剪辑测试组"
      },
      {
        "id": "project-a0f30b27-176",
        "role": "公共API创建测试项目"
      },
      {
        "id": "output-a0f30b27-187",
        "role": "实际候选采纳/保存刷新/导出的作品"
      },
      {
        "id": "asset-a0f30b27-288",
        "role": "真实导出并登记的MP4素材"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-artifact-inspection.json；docs/verification/t1298/regression/t1296-initial.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-artifact-inspection.json；docs/verification/t1298/regression/t1296-initial.log"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-artifact-inspection.json；docs/verification/t1298/regression/t1296-initial.log"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "独立视觉评审已完成；未冒充用户亲自验收或安装版认可。详见 REPORT.md。"
    }
  },
  "checks": [
    {
      "id": "script-platform-delivery",
      "test_id": "脚本是原稿，两个平台默认承接并保持独立，稿面只保留重组主动作",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-initial.log；docs/verification/t1298/regression/t1296-artifact-inspection.json"
    },
    {
      "id": "native-assistant-delivery",
      "test_id": "T1296 全高助手布局保持真实剪辑候选、保存刷新与MP4交付",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-initial.log；docs/verification/t1298/regression/t1296-artifact-inspection.json"
    }
  ],
  "coverage": [
    {
      "condition": "平台原稿独立及真实保存交付",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-artifact-inspection.json"
    },
    {
      "condition": "旧Doocs版式交付",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-artifact-inspection.json"
    },
    {
      "condition": "真实候选采纳刷新和MP4导出",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-artifact-inspection.json"
    },
    {
      "condition": "响应式与小窗口发送区可达",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/regression/t1296-artifact-inspection.json"
    }
  ],
  "tdd_red_ref": "docs/verification/t1296/logs/browser-native-context.log",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "本回归未调用真实模型或ASR；T1298真实四轮模型旅程另有独立证据，不互相代签",
    "既有slider方向键被全局快捷键拦截另记T-1297，不冒充键盘缩放通过",
    "200%只覆盖原公共测试的保存按钮、更多菜单、Escape焦点和画面布局，未在该缩放下实际操作助手输入；1366/1280/1024已实际聚焦输入、滚动并核发送按钮在视口内",
    "本轮截图为测试合成媒体，不宣称实际内容质量或用户亲自体验认可"
  ],
  "scope_note": "两个公共旅程2/2通过；逐字承接及交付后刷新，公众号独立改稿后更新脚本、图文保持初始原稿，脚本保新旧版本，旧Doocs ZIP版本与保存稿相同，均由未修改的原公共测试实际断言。额外独立检查HTML/ZIP全文与MP4 ffprobe；revision3→4、刷新完整plan相等、历史恢复revision6，原登记成片保持。候选预览/导出H264 640×360/24fps/48帧/视频2s，AAC44100Hz双声道与容器2.089796s；与历史同源内核逐帧/PCM/容器全等。已查看本轮1366/1280/390候选/200%及输入可达截图；不夸大200%对话覆盖。"
}
```

代表图：`docs/verification/t1298/regression/initial-t1296-native/assistant-reachable-1366.png`、`docs/verification/t1298/regression/initial-t1296-native/assistant-reachable-1280.png`；实物检查：`docs/verification/t1298/regression/t1296-artifact-inspection.json`。

仅额外设置证据目录环境变量，原配置命令和测试断言未改。正式taskctl门会重新运行同一配置命令，首次截图/文件快照保留。全局既有对账欠债仍按Root当前对账记录归因，不以本公共回归冒全局全绿。
