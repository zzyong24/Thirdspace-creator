# 剪辑隔离验收启动诊断

两次已有失败保留，先做最多两个最小区分实验；不修改生产实现。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1274",
  "research_task_id": "T-1275",
  "status": "researching",
  "problem_statement": "隔离Next两轮首页编译300秒超时，同期公共库初始化120秒超时；尚不能区分资源竞争与运行链缺陷。",
  "failure_family": "editing-isolated-runtime-startup",
  "observed_invariant": "隔离公共链应在原启动/初始化预算内就绪，不以全量重跑或预算扩张替代诊断。",
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
        "kind": "approved-spec",
        "ref": "docs/features/t1274-chatcut-editing-redesign.md",
        "claim": "需要真实公共链、真实媒体与UI验收"
      },
      {
        "kind": "source-code",
        "ref": "frontend/playwright.config.ts",
        "claim": "测试数据/媒体根隔离，启动预算300000ms"
      },
      {
        "kind": "source-code",
        "ref": "backend/vitest.config.ts",
        "claim": "真实库hook与测试120000ms预算"
      }
    ],
    "local": [
      {
        "kind": "log",
        "path": "docs/verification/t1274/e2e-first.txt",
        "locator": "config.webServer",
        "observation": "首页编译300000ms超时"
      },
      {
        "kind": "log",
        "path": "docs/verification/t1274/e2e-second.txt",
        "locator": "config.webServer",
        "observation": "相同阻断再次发生"
      },
      {
        "kind": "runtime",
        "path": "docs/verification/t1275/environment.json",
        "locator": "memory/processes",
        "observation": "32GB物理内存，交换空间接近19GB，后台多进程繁忙；非已确认因果"
      }
    ],
    "experiments": [
      {
        "question": "不并行其它本任务检查，当前public单文件是否恢复初始化？",
        "command": "pnpm --dir backend exec vitest run src/modules/production/production-script.public.test.ts --maxWorkers=1",
        "environment": "仅本任务单public文件；系统另有已运行应用/其它构建。后段与启动对照有短时重叠，不能算完全控制并发。",
        "result": "FAIL：transform494.12s/import710.01s、beforeAll120000ms超时、3SKIP；fork退出也超时。没有业务断言结果。",
        "artifact_path": "docs/verification/t1275/public-chain-serial.txt",
        "artifact_sha256": "1321981d06e1251015594a45eaeb8d5c7edc8a75befb764bbac99373c62ff767"
      },
      {
        "question": "同隔离数据与原300000ms预算，已安装Next支持的webpack启动是否恢复？",
        "command": "pnpm --dir frontend exec playwright test --config ../docs/verification/t1275/playwright-comparison.config.ts",
        "environment": "私有配置使用next dev --webpack；数据/媒体仍为独立临时根。前段与单文件公共测试尾部有短时重叠，不签无竞争对照。两次配置加载错误未启动服务，另行保留。",
        "result": "FAIL：Ready39.1s后停于Compiling /instrumentation，webServer300000ms超时；未进入业务页面。",
        "artifact_path": "docs/verification/t1275/startup-comparison-bootstrap-fixed.txt",
        "artifact_sha256": "7a51635ac5dc6f8a90390b16ffc2c269522a8aa311aeceb6e11894c31f9d9ce1"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "串行当前公共链先验证库和候选服务",
      "tradeoffs": "运行少、保原隔离和预算；不能独自证明Next启动",
      "scope": "单文件真实public read/propose/apply，不更改产品",
      "falsified_by": "单文件仍在初始化超时或发生可复现业务错误"
    },
    {
      "id": "OPT-2",
      "outcome": "用已安装Next支持的webpack dev进行隔离启动对照",
      "tradeoffs": "只用于识别bundler影响；若成功仍需原路径核验，不默认改全局配置",
      "scope": "私有临时启动配置，同数据/媒体隔离、同300秒预算",
      "falsified_by": "仍同一阶段超时，或Next本地CLI不支持该选择"
    }
  ],
  "recommendation": "两项最小实验均失败，停止本轮重复执行；用户已选择先释放资源，完成后再以新的现场条件继续原公共链与启动验收。",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "当前公共候选链",
        "target": "3例PASS且无hook超时",
        "measurement": "原公共测试单进程执行",
        "observed": "FAIL，3SKIP，beforeAll120000ms超时",
        "verify_key": "t1275-public-chain",
        "evidence_path": "docs/verification/t1275/public-chain-serial.txt",
        "evidence_sha256": "1321981d06e1251015594a45eaeb8d5c7edc8a75befb764bbac99373c62ff767"
      },
      {
        "name": "隔离首页启动",
        "target": "原300000ms内成功HTTP响应",
        "measurement": "原数据隔离/预算的对照启动",
        "observed": "FAIL：webpack对照仍在instrumentation编译阶段超时，未取得HTTP就绪",
        "verify_key": "t1275-isolated-startup",
        "evidence_path": "docs/verification/t1275/startup-comparison-bootstrap-fixed.txt",
        "evidence_sha256": "7a51635ac5dc6f8a90390b16ffc2c269522a8aa311aeceb6e11894c31f9d9ce1"
      }
    ],
    "resume_criteria": "真实公共链和隔离启动证据闭合，现场核验通过；保持原UI/媒体/正式范围验收。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

研究门observe本轮拒绝：T-1274已为⏸️，工具只接受进行中任务再次block。保留原阻塞与本次拒绝，不反转状态绕过；本卡只读取证，未登记research_open，也不冒充可恢复PASS。诊断任务T-1275已taskctl start。


2026-10-14续检结论：本轮两项最小实验均失败，未执行剪辑业务断言。已只读核对createDb启动、迁移及冷缓存参考PGlite串行重放路径；该重工作为既有机制。public beforeAll在createDb返回后才取得close，初始化超时后无法由afterAll取消尚在途初始化。采样可见WASM工作，不能定位具体SQL或签内存压力为唯一根因。transform与import计时重叠，不相加。用户明确选择“我先释放资源，再继续验收”，当前尚未收到释放完成信号。本轮owned vitest与Playwright/3919进程均已退出。保留全部FAIL，不改预算、迁移或真实数据归属。
