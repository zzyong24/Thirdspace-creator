# CreatorOS 工程教训升格到通用脚手架审计

- 日期：2026-08-12
- 任务：T-787
- 范围：只沉淀跨项目可复用的工程规则；不修改业务功能代码，不把产品品牌、渠道字段或具体页面写进通用脚手架。

## 一句话结论

这次不是把“Windows 不能用 `open -R`”记成一条平台特例，而是补上一个通用工程合同：凡是调用桌面
宿主能力，都必须同时验证系统 API/命令、参数与路径、完成时机、用户文案，并在最终安装物上取证。

```text
功能意图
  └─ platform_execution_matrix
       ├─ command / native API
       ├─ shell-free argv + path / encoding
       ├─ completion: spawn / exit / callback
       └─ user copy + unsupported behavior
             └─ 每个目标 OS 的最终安装物证据
```

## 已升格的四组经验

| 项目证据 | 可跨项目的根因 | 脚手架规则 |
| --- | --- | --- |
| T-786：Windows 连续 7 次执行 macOS `open -R`；更早 FE-L01 已提醒 Finder 文案 | 单平台命令、路径、完成语义和文案没有共同契约；报告没有变成守卫 | `platform_execution_matrix` 进入 SERVICE/TEST 模板、TDD/Integration Gate、上线审计 |
| T-781：本地渠道包正常，CI 产物仍有内部身份未覆盖 | 构建参数只覆盖外层，原生壳与 Web bundle 没消费同一来源 | 用 immutable build manifest 贯穿所有编译层，并检查安装后的内部产物 |
| T-782 / LED-021：API 声称 reflink 成功，真实磁盘仍增加约完整文件大小 | API 返回或能力名被误当成物理结果 | 能力声明必须证明 target filesystem / host 上的真实物理效果 |
| T-785：改稿后重审复用旧失败任务 | 任务 ID 只有业务对象，没有输入版本和每次尝试身份 | 异步身份固定为 immutable input version + attempt identity；旧 worker 提交前复核版本 |

## 留在项目账本、不升格为通用规则的内容

- 具体渠道名称、激活码字段、品牌文字和图标路径：属于 CreatorOS 构建配置，不应污染通用脚手架。
- 抖音账号绑定、素材匹配、分镜卡片尺寸和本地模型配置：属于产品业务契约，继续由对应 SPEC、测试和项目 LED 管理。
- 某个具体系统命令（例如 `open -R` 或 Windows Explorer 参数）：只是平台矩阵的一行实现，不应成为通用规则本身。

## 防止“写过但没拦住”

FE-L01 在一个月前已经看见 Finder 文案残留，但没有任务、红测和发布门卫，所以不能算预防完成。
今后 Blocker/High 发现至少要有明确 BACKLOG 归属；能机械验证的必须先取得 RED，再接入测试或 Gate。
只有文字提醒、没有执行消费点的经验维持 `candidate`，不得宣称已经根治。

## 当前边界

通用脚手架已补齐规则和结构门卫；T-788 也已修复 CreatorOS 素材/项目目录的跨平台执行计划与素材中心
文案，并将真实测试接入项目 reconcile，因此 LED-022 已晋升 `rule`。Windows 最终安装物仍须在下一次
出包时验证 Explorer 真实窗口与文件选中效果；这项物理回执不能由 macOS 上的单元测试代替。
