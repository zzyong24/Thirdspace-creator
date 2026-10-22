---
name: product-to-code-orchestrator
description: 将产品想法、设计稿或已有需求推进为可运行产品。适用于“实现这个想法”“把想法变成代码”“初始化项目”和完整产品开发；单点代码修改无需启动整套流程。
---

# 产品开发编排

围绕用户要得到的实际结果，完成规划、实现和验证。已有授权支持持续工作；规则只补充当前任务需要的边界和证据，不代替用户目标。

## 入口与规模

先确定产品目录和现有代码，不把当前 skill 目录误当成产品。新项目依据实际范围选择 `S|M|L`，依据交付关系选择 `single|multi`，运行：

```bash
bash <skill>/tools/init-project.sh <project-dir> --triage <S|M|L> --topology <single|multi> --name <name>
```

`multi` 还需 `--program-id`。S 保持产品总纲与内嵌设计；M/L 按实际模块维护 `docs/features/` 和结构边界。规模不由页面数量决定。已有项目通过 `--update` 更新，保护项目自有配置、记录和 `AGENTS.md`；核对运行时基线、项目固定规则包及更新后的迁移诊断。GitHub CI 用 `--ci github` 显式接入，远端启用状态另行核实。

## 事实归属

| 事实 | 主要位置 |
|---|---|
| 产品方向与确认范围 | `PRODUCT_SPEC.md`；模块细节在 `docs/features/` |
| 用户可见用语 | `PRODUCT_VOCABULARY.md` |
| 执行顺序与任务状态 | `BACKLOG.md` |
| 阶段状态 | `orchestrator/ARTIFACT_MANIFEST.yaml` |
| 重要取舍与授权 | `orchestrator/DECISION_LOG.md` |

同一事实由一处维护，其他文件引用；语义唯一不要求物理文件合并。“继续”时从最上面的依赖就绪任务推进。新增已确认需求写入看板。

## 按需执行

1. 运行 `node orchestrator/process/context-plan.mjs --root <project-dir> [--task <T-id>] --json`。
2. 按 `read_root` 读取项目固定规则包的 `required_reads`，按产品目录读取 `required_project_reads`，再读当前说明、代码和实际依赖。旧项目使用本机规则会明确提示；未加载某份说明不代表可绕过已启用的程序检查。
3. 按 [阶段路由](prompts/stage-router.md) 进入 `PLAN → CONTRACT → DESIGN → BUILD → SHIP`。授权和提问由 [公共流程](workflows/_COMMON.md) 统一处理，实现选型由 [公共规则](rules/global-rules.md) 维护。
4. 仅在派发、并行写入或自治执行时编译 `context-compile.mjs <T-id>`；范围、步骤、验证或隔离不明时先补齐交接条件。

新项目默认 `buildout`，不运行正式审核，持续实现、验证、集成和验收；稳定后经用户决定，用 `delivery-phase.mjs promote` 单向进入 `maintenance`，再对稳定行为的变化启用适用审核。

## 交付底线

- 真实交互对应真实操作和数据所有者；模拟数据、局部测试和模型自报通过不能冒充完整验收。
- 用户文案服从产品词表，保留内部 ID 与数据语义，不向用户泄漏实现术语。
- 模型判断含义和取舍，程序核对机械事实；未知按未知报告，不编造证据或空表。
- 重复且机制不明的阻塞按 [研究门](gates/04-research-first-gate.md) 收敛问题；独立任务可继续。
- 操作系统集成需核对命令/API、无 shell 的参数路径、完成语义和用户文案，详见相应契约与平台验证。
- 通用规则只保留可复用边界，不携带项目、供应商或历史事故常量。
- 并行写入遵循 [隔离规则](rules/parallel-collab-rules.md)，主会话整合；push 和部署核对现有明确授权。

## 条件材料

界面、架构、知识层、研究、自治和跨项目控制由规划器及其结构化配置激活。迁移、不可逆操作和发布按实际影响验证。追溯、范围、威胁、审核等记录只有对应条件成立才创建，缺少休眠材料不是缺陷。

日常控制面核对使用 `reconcile --profile quick --read-only`；完整验证使用项目真实命令和适用的 full 检查。快速通过不代表未执行的 lessons 或真实旅程通过，预算与副作用边界见 [过程层说明](process/README.md)。

需要外部工具或技能时，参考 [外部能力选用](prompts/external-skill-dispatch.md)，先核对宿主实际可用能力。

维护本 skill 或发现脚手架自身异常时运行 `bash tools/selfcheck.sh`。普通产品任务不重复运行 skill 源码测试。
