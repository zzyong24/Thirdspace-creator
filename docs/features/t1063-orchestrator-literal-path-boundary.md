# T-1063：流程工具支持合法的字面方括号文件路径

## 问题与授权

T-1062负责用户2026-10-05已授权的各会话整合、提交、本地打包和逐功能验收。它的前端候选范围包含7个实际存在的Next路由文件，例如`frontend/src/app/(creator)/projects/[projectId]/article/page.tsx`。用户已确认账号组共享创作及相关页面；不能删除这些入口或扩大目录写权限来逃过校验。

2026-10-05只读核对发现，项目与已安装的`product-to-code-orchestrator` 3.27.2同时存在误判：`progress.mjs`的`isSafeRepoPattern`和`parallel-isolation.mjs`的`safePattern`禁止`[]`；后者在`validate-candidate`里还会拒绝Git报告的真实文件路径。两个匹配器实际只执行字符串精确比较或末尾`/**`的目录前缀比较，并不解释字符类。官方现有自检当场通过，但没有覆盖这类合法文件名，不能据此宣布误判已修复。

这是解除T-1062既定范围整合阻断所需的工具兼容修复，单独登记根因，不新增产品功能、服务合同、账户权限、数据迁移、发布行为或安全旁路。原T-1023非末尾glob声明问题继续保留，不因本修复代签关闭。

## 必须得到的行为

含字面方括号的仓内精确文件名可以进入声明、领取和候选校验。`src/customer/[customerId]/view.tsx`只授权该确切文件；不会授权`src/customer/a/view.tsx`、同目录其他文件或同名父目录。`reports/invoice[2026].md`同样按字面名称处理，证明工具不依赖Next或CreatorOS名称。

方括号仅允许用于非递归的精确路径；含方括号的目录`/**`声明继续拒绝。继续拒绝非末尾通配符、`*`、`?`、`{}`、绝对路径、反斜杠、空路径段和`.`/`..`；保持原控制文件保留、边界冲突、只读集合、大小写规则、真实worktree/branch/base/HEAD、单候选提交及lease校验。不引入glob库、转义协议、路径改名、假映射或目录`/**`扩大权限。

```mermaid
flowchart LR
  A[声明真实的精确文件名] --> B[原租约及隔离检查]
  B --> C[只接受同一文件的实际改动]
  C --> D[继续整合已确认页面]
```

## 范围和实施边界

上游技能来源仓为`/Users/zyongzhu/.skills-manager/skills`，当前HEAD为`3b27a757cde6368bd3894d75a26f783ee6ee9638`。只允许该仓`product-to-code-orchestrator/`内如下6个文件：`process/progress.mjs`、`process/parallel-isolation.mjs`、对应的两个`.test.mjs`、`VERSION`和`CHANGELOG.md`。预期最小生产修改仅在两处路径校验中允许非递归精确路径的字面方括号，并保留递归路径的原方括号禁令；不改变matcher或其他守卫。任何额外源码修改先报告并独立复核，不借机修其他历史欠债。

ROOT在独立临时工作树制作来源候选，先保留原公共红测，再实现并独立评审。上游候选只本地提交，核对来源主树仍保持原HEAD和干净状态后，才可安全快进已评审候选；不push、不发tag/Release。技能版本与CHANGELOG同步，使用技能原`tools/init-project.sh <项目> --update`更新项目，不手改vendor清单的hash来消除漂移。升级保留所有项目自有配置、BACKLOG、SPEC、控制状态与其他任务。

CreatorOS项目只接收受支持升级产生且事先核对过的引擎差异、vendor版本和维护记录。当前T-1062后端writer仍运行，保持其旧lease、MAIN base和现有3.27.2工具不变；先按原工具验证并整合它的最终候选，再升级工具。新增页面writer要在工具修复、前端精确范围及独立评审全部闭合后领取租约。

## 验收与诚实边界

- 原3.27.2公共`progress generate`或实际候选校验对合法字面路径的失败，当场保留argv、隔离fixture路径、exit和原日志；不补拍历史红测。
- 修改后的公共`generate → claim`与`parallel-isolation validate-candidate`用真实隔离Git仓/工作树验证上述两种不同领域的字面文件名，检查实际changed path；验证`[a-z]`只匹配同名字面文件、不展开字符类，相邻文件及字符类展开后的其他名称仍拒绝；含方括号的目录`/**`、穿越、非末尾glob、控制文件及lease/base不符继续拒绝。只测helper不能作为关闭依据。
- 原完整`process/progress.test.mjs`与`process/parallel-isolation.test.mjs`通过，官方`tools/selfcheck.sh`通过；独立复核最终6文件diff、来源SHA和所有原断言。
- 受支持升级后核对技能版本/vendor边界，执行真实`reconcile`，保留现有全局失败及其根因任务。不得改测试、历史证据或基线把33项既有错误洗成全绿。
- T-1062前端7条实际字面路径的声明及领取可通过，最终候选仍需正常验证。此工具修复不证明前端/native、ASR、安装包或用户验收通过。

任务状态使用`taskctl`留下审计事件；实际Gate与独立评审齐备后才完成，不以此SPEC或工具自检代替实现证据。
