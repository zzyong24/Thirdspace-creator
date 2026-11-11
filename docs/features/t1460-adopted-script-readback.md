# T-1460 采纳稿件后生成入口误报保存不一致

2026-11-11 用户反馈“国产Image2.5实测：会打字，就能自己改封面…”项目在采纳稿件后报错。截图同时显示644字已保存、初稿候选已采纳和“当前脚本与保存版本读回不一致，请先保存并核对”。沿用月明水清深账号组与修复授权，先核实真实保存版本及回执，保护已采纳稿件与原生成意图。

先用安装版公开CLI动态发现能力并只读定位唯一项目、脚本artifact/版本、采纳回执；不读数据库或浏览器凭据，不重复采纳、不覆盖稿件、不新建付费任务。工程源码读取属于本次修复范围。

依据现场数据与源码补充最小修复及评审/TDD。预计范围为frontend/src/features/script/script-rich-editor.tsx及相邻测试、必要的draft-workbench生成入口回归；不放松项目/账号组/版本归属、并发更新、在途输入或未知写入保护。不得直接删除读回守卫来洗绿，必须覆盖正常采纳后完整公共入口成功与真实并发/脏稿仍被保护。无已授权采纳内容之外的新AI稿自动落库。

验收：现场先确认是否确已保存，红绿测试复现已采纳/富文本正常化后的错误，原保存和候选采纳链/一键生成入口及相关回归、类型/边界/超时检查按实际改动执行；明确源码与本机安装生效范围，若打包按冻结流程核验来源、签名、启动及原保存正文回读。任务控制状态仅通过taskctl更新。

## 现场证据与实现

公开CLI确认唯一项目project-intake-805db5e5cc350c0711f416d5cd65cab3，候选preparation-draft:execution-task-3b354426-36714的正式采纳回执preparation-acceptance-3b354426-36780已返回artifactVersion=2。当前artifact-3b354426-36777的v2（artifactversion-3b354426-36779）正文638字，contentData为空。读侧以“脚本正文”标题和段落显示成644字，prepareForCreation却把编辑器HTML/Text直接等同比较原始contentData.html/contentText，合法已保存稿被拒绝。

仅在前端既有script-editor-bridge收口保存版本到编辑器HTML的技术投影，并由SSR读侧和真实编辑器生成前校验共用。生成前使用相同TipTap schema解析正式版本，与当前编辑器文档做精确结构相等比较；不是语义模糊相似。原生富文本版本仍核对纯文本字段，保留项目/版本/工作区/在途变化守卫。已有artifact不因缺编辑器保存ref而重复追加版本；外部已确认版本锚点随版本切换，即使HTML相同也更新。

变更路径：frontend/src/features/script/script-editor-bridge.ts、script-editor-data.ts、script-rich-editor.tsx及其测试，新增必要的公共UI链测试；不修改后端归属、契约schema或SDK。覆盖纯文本、仅sections、富文本规范化三种保存输入，正常采纳→生成完整入口成功，错误正文/项目、真实并发更新、在途编辑、未知保存结果仍保护。禁止为通过测试修改断言或删除安全校验。
