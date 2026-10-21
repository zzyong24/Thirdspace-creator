# T-1382 真实浏览器旅程验收报告

本文件由真实运行工件计算；仅覆盖合同列出的十条路径和双窗口。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1382",
  "contract_path": "docs/verification/t1382/control/PAGE_SPEC.md",
  "contract_sha": "88e85d6c0044",
  "commit_sha": "38213454db95827a4db6fae747ae200493595d29",
  "observed_at": "2026-10-21T12:42:43.829Z",
  "run": {
    "verify_key": "t1382-unified-intake:e2e",
    "command": "node docs/verification/t1382/control/run-journeys.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "真实 Chromium 浏览器 + Next dev + 已装账号 PGlite 私有副本",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 1024,
        "height": 680,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J01-home-navigation/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J02-project-list-detail/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J03-manual-create/readback.json"
      },
      {
        "id": "f80e7338e6bfd15a8f75",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J03-manual-create/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J04-quick-source/readback.json"
      },
      {
        "id": "7a00ccc3e7a874f7def1",
        "role": "已装账号副本的真实来源作品",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J04-quick-source/readback.json"
      },
      {
        "id": "6288fcf1417623b27ce7",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J04-quick-source/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J05-quick-empty/readback.json"
      },
      {
        "id": "cdd0bc96441a9dde24bb",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J05-quick-empty/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J06-radar-idempotency/readback.json"
      },
      {
        "id": "7a00ccc3e7a874f7def1",
        "role": "已装账号副本的真实来源作品",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J06-radar-idempotency/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J07-topic-upgrade/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J08-preparation-controls/readback.json"
      },
      {
        "id": "c16667ab399031e2ee4c",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J08-preparation-controls/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J09-transcript-ready/readback.json"
      },
      {
        "id": "d975d94e4b462e385783",
        "role": "已装账号副本的真实来源作品",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J09-transcript-ready/readback.json"
      },
      {
        "id": "7a597aba12bc807da910",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J09-transcript-ready/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J10-settings-assistant-reference/readback.json"
      },
      {
        "id": "8a2e534cefeaa56357bb",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-normal/J10-settings-assistant-reference/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J01-home-navigation/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J02-project-list-detail/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J03-manual-create/readback.json"
      },
      {
        "id": "7873747cde379e95db40",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J03-manual-create/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J04-quick-source/readback.json"
      },
      {
        "id": "d52434171fe14382b6cb",
        "role": "已装账号副本的真实来源作品",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J04-quick-source/readback.json"
      },
      {
        "id": "db144a4739217bc5be66",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J04-quick-source/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J05-quick-empty/readback.json"
      },
      {
        "id": "61bbe32e717f7fc3cd4e",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J05-quick-empty/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J06-radar-idempotency/readback.json"
      },
      {
        "id": "d52434171fe14382b6cb",
        "role": "已装账号副本的真实来源作品",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J06-radar-idempotency/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J07-topic-upgrade/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J08-preparation-controls/readback.json"
      },
      {
        "id": "e75620fed8c88fe2f838",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J08-preparation-controls/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J09-transcript-ready/readback.json"
      },
      {
        "id": "78cfac816b1675037163",
        "role": "已装账号副本的真实来源作品",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J09-transcript-ready/readback.json"
      },
      {
        "id": "439e03171717e99002b9",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J09-transcript-ready/readback.json"
      },
      {
        "id": "9a72d3429b5145ffb37b",
        "role": "已装账号副本的真实账号组",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J10-settings-assistant-reference/readback.json"
      },
      {
        "id": "5a42ba7b7c111d9febeb",
        "role": "本轮副本中经用户界面保存的项目",
        "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/cases/t1382-minimum/J10-settings-assistant-reference/readback.json"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/EVIDENCE_SUMMARY.json"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/EVIDENCE_SUMMARY.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-results.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "本次为真实浏览器自动走查，未请求或代记用户亲手体验确认。"
    }
  },
  "checks": [
    {
      "id": "AC-1382-HOME",
      "test_id": "J01-home-navigation",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-c811d-ome-navigation-首页到真实创作入口并返回-t1382-normal/attachments/journey-witness-865e5d5734f743a900cb8ded1b0f4b0dd54e6832.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-c811d-ome-navigation-首页到真实创作入口并返回-t1382-minimum/attachments/journey-witness-138b80248a9c80ceb58bbf4ce854aa78f05ae93c.json"
    },
    {
      "id": "AC-1382-PROJECT",
      "test_id": "J02-project-list-detail",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-12122-ct-list-detail-项目列表打开详情刷新保留-t1382-normal/attachments/journey-witness-cfffa8ad423c2c91c6212065b36cb0cf9b4c81f9.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-12122-ct-list-detail-项目列表打开详情刷新保留-t1382-minimum/attachments/journey-witness-0fb8e13e2373ced46fc8d9aa2b831becbdf3ca99.json"
    },
    {
      "id": "AC-1382-MANUAL",
      "test_id": "J03-manual-create",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J03-manual-create-手动新建空描述真实保存-t1382-normal/attachments/journey-witness-8fca8507d993fc59d40c2a6a4802e4e550ed869a.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J03-manual-create-手动新建空描述真实保存-t1382-minimum/attachments/journey-witness-ccf9b592bdbae52bdbd5c0a0f9a8d82409dd18c3.json"
    },
    {
      "id": "AC-1382-QUICK-SOURCE",
      "test_id": "J04-quick-source",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J04-quick-source-快速创作保留真实来源与作品-t1382-normal/attachments/journey-witness-73222bf56463be3734827cbd53ed1e23e23aa073.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J04-quick-source-快速创作保留真实来源与作品-t1382-minimum/attachments/journey-witness-bff1b9cb74269967358cbe3b5f7f36a57a8edfaa.json"
    },
    {
      "id": "AC-1382-QUICK-EMPTY",
      "test_id": "J05-quick-empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J05-quick-empty-无来源快速创作不虚构工程-t1382-normal/attachments/journey-witness-0f1fe89bea0fc3d9acb9b503fc84622c9166b597.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J05-quick-empty-无来源快速创作不虚构工程-t1382-minimum/attachments/journey-witness-a25db42b2f0db8f19cf748e29d3980427ad49933.json"
    },
    {
      "id": "AC-1382-RADAR",
      "test_id": "J06-radar-idempotency",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-47263-empotency-雷达多次与另一作用域入口返回同项目-t1382-normal/attachments/journey-witness-dc1ab934d9daecdb556b6830e7c37b33715fdc91.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-47263-empotency-雷达多次与另一作用域入口返回同项目-t1382-minimum/attachments/journey-witness-7e3695c45aa4df462609ec228fc4027b868c0ee2.json"
    },
    {
      "id": "AC-1382-TOPIC",
      "test_id": "J07-topic-upgrade",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J07-topic-upgrade-选题升级直接打开真实项目-t1382-normal/attachments/journey-witness-ee1a64e48cdbff1401c3592d972d8bb3d0694a89.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J07-topic-upgrade-选题升级直接打开真实项目-t1382-minimum/attachments/journey-witness-6799587d384872c225c713ea17eb81d05763af0d.json"
    },
    {
      "id": "AC-1382-CONTROLS",
      "test_id": "J08-preparation-controls",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-normal/attachments/journey-witness-edf3c27abf7c3c782213faed3f297d9e8f97c696.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-minimum/attachments/journey-witness-28050a86c999061eb98fc85fff31257fefefa21d.json"
    },
    {
      "id": "AC-1382-TRANSCRIPT",
      "test_id": "J09-transcript-ready",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-36476-cript-ready-项目补逐字稿持久就绪不冒充采纳-t1382-normal/attachments/journey-witness-29b53e3e97b8de511208a18cc3232a7e79236188.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-36476-cript-ready-项目补逐字稿持久就绪不冒充采纳-t1382-minimum/attachments/journey-witness-261a0627e1e17b74cccea2bf00d80d453c6083e5.json"
    },
    {
      "id": "AC-1382-SETTINGS-REF",
      "test_id": "J10-settings-assistant-reference",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-abcc2--reference-模型未登录提示与助手真实项目引用-t1382-normal/attachments/journey-witness-7fb01979ac975dc18fc15c56c7b6a34fa6498d0c.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-abcc2--reference-模型未登录提示与助手真实项目引用-t1382-minimum/attachments/journey-witness-8417b093f2642c4dc5dc953ed876c8e1d51e4cf9.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-12122-ct-list-detail-项目列表打开详情刷新保留-t1382-normal/attachments/journey-witness-cfffa8ad423c2c91c6212065b36cb0cf9b4c81f9.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J03-manual-create-手动新建空描述真实保存-t1382-normal/attachments/journey-witness-8fca8507d993fc59d40c2a6a4802e4e550ed869a.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J04-quick-source-快速创作保留真实来源与作品-t1382-normal/attachments/journey-witness-73222bf56463be3734827cbd53ed1e23e23aa073.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J05-quick-empty-无来源快速创作不虚构工程-t1382-normal/attachments/journey-witness-0f1fe89bea0fc3d9acb9b503fc84622c9166b597.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-47263-empotency-雷达多次与另一作用域入口返回同项目-t1382-normal/attachments/journey-witness-dc1ab934d9daecdb556b6830e7c37b33715fdc91.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J07-topic-upgrade-选题升级直接打开真实项目-t1382-normal/attachments/journey-witness-ee1a64e48cdbff1401c3592d972d8bb3d0694a89.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-normal/attachments/journey-witness-edf3c27abf7c3c782213faed3f297d9e8f97c696.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-36476-cript-ready-项目补逐字稿持久就绪不冒充采纳-t1382-normal/attachments/journey-witness-29b53e3e97b8de511208a18cc3232a7e79236188.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-12122-ct-list-detail-项目列表打开详情刷新保留-t1382-minimum/attachments/journey-witness-0fb8e13e2373ced46fc8d9aa2b831becbdf3ca99.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J03-manual-create-手动新建空描述真实保存-t1382-minimum/attachments/journey-witness-ccf9b592bdbae52bdbd5c0a0f9a8d82409dd18c3.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J04-quick-source-快速创作保留真实来源与作品-t1382-minimum/attachments/journey-witness-bff1b9cb74269967358cbe3b5f7f36a57a8edfaa.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J05-quick-empty-无来源快速创作不虚构工程-t1382-minimum/attachments/journey-witness-a25db42b2f0db8f19cf748e29d3980427ad49933.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-47263-empotency-雷达多次与另一作用域入口返回同项目-t1382-minimum/attachments/journey-witness-7e3695c45aa4df462609ec228fc4027b868c0ee2.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J07-topic-upgrade-选题升级直接打开真实项目-t1382-minimum/attachments/journey-witness-6799587d384872c225c713ea17eb81d05763af0d.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-minimum/attachments/journey-witness-28050a86c999061eb98fc85fff31257fefefa21d.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-36476-cript-ready-项目补逐字稿持久就绪不冒充采纳-t1382-minimum/attachments/journey-witness-261a0627e1e17b74cccea2bf00d80d453c6083e5.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-c811d-ome-navigation-首页到真实创作入口并返回-t1382-normal/attachments/journey-witness-865e5d5734f743a900cb8ded1b0f4b0dd54e6832.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-normal/attachments/journey-witness-edf3c27abf7c3c782213faed3f297d9e8f97c696.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-c811d-ome-navigation-首页到真实创作入口并返回-t1382-minimum/attachments/journey-witness-138b80248a9c80ceb58bbf4ce854aa78f05ae93c.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-minimum/attachments/journey-witness-28050a86c999061eb98fc85fff31257fefefa21d.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-47263-empotency-雷达多次与另一作用域入口返回同项目-t1382-normal/attachments/journey-witness-dc1ab934d9daecdb556b6830e7c37b33715fdc91.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J07-topic-upgrade-选题升级直接打开真实项目-t1382-normal/attachments/journey-witness-ee1a64e48cdbff1401c3592d972d8bb3d0694a89.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-47263-empotency-雷达多次与另一作用域入口返回同项目-t1382-minimum/attachments/journey-witness-7e3695c45aa4df462609ec228fc4027b868c0ee2.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J07-topic-upgrade-选题升级直接打开真实项目-t1382-minimum/attachments/journey-witness-6799587d384872c225c713ea17eb81d05763af0d.json"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J03-manual-create-手动新建空描述真实保存-t1382-normal/attachments/journey-witness-8fca8507d993fc59d40c2a6a4802e4e550ed869a.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J05-quick-empty-无来源快速创作不虚构工程-t1382-normal/attachments/journey-witness-0f1fe89bea0fc3d9acb9b503fc84622c9166b597.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J03-manual-create-手动新建空描述真实保存-t1382-minimum/attachments/journey-witness-ccf9b592bdbae52bdbd5c0a0f9a8d82409dd18c3.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journeys-J05-quick-empty-无来源快速创作不虚构工程-t1382-minimum/attachments/journey-witness-a25db42b2f0db8f19cf748e29d3980427ad49933.json"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-normal/attachments/journey-witness-edf3c27abf7c3c782213faed3f297d9e8f97c696.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-abcc2--reference-模型未登录提示与助手真实项目引用-t1382-normal/attachments/journey-witness-7fb01979ac975dc18fc15c56c7b6a34fa6498d0c.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-8d3ff-ls-准备原任务暂停恢复取消及Codex未登录有限观察-t1382-minimum/attachments/journey-witness-28050a86c999061eb98fc85fff31257fefefa21d.json, docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/playwright-artifacts/t1382-unified-intake-journ-abcc2--reference-模型未登录提示与助手真实项目引用-t1382-minimum/attachments/journey-witness-8417b093f2642c4dc5dc953ed876c8e1d51e4cf9.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1382/journey/runs/green-2026-10-21T12-17-25.200Z-MBTakO/VISIBLE_COPY.json",
    "artifact_sha256": "ecdf52fbdcfce3763355502a8fb43ee35bb2bbc9b8885e409059345aa4bc44c5"
  },
  "tdd_red_ref": "docs/verification/t1382/journey/runs/red-2026-10-21T12-14-25.009Z-U3eJqF/run.json",
  "red_ref": "docs/verification/t1382/journey/runs/red-2026-10-21T12-14-25.009Z-U3eJqF",
  "open_defects": [],
  "status": "pass",
  "scope_notes": [
    "已装库只读复制后在本轮私有PGlite副本运行；不声称真实供应商生成、平台采集、助手模型提案或已安装桌面App验收通过。",
    "后续taskctl会另建run完整重执行；本报告与其visible copy不可被重执行覆盖。"
  ]
}
```
