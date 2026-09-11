# T-953 项目模块架构依赖图

用户授权安装 Archify Skill，并生成当前项目各模块架构依赖图。只读源码提取包依赖、模块依赖和运行装配；输出 HTML、可再生成的 JSON 与证据，不修改产品架构和数据。图中区分静态导入和动态运行调用，不将目标边界画成已完成事实。


## 交付入口

打开 [index.html](index.html)。包含一张主架构图、17 张直接依赖分图、3 张无直接跨模块导入的模块分组图，共覆盖 34 个后端模块与 44 对直接引用。左侧支持模块搜索；分图可独立打开；底部有每条引用的文件与行号。五个工作区包的声明依赖也在入口中列出。

安装来源：https://github.com/tt-a1i/archify ，Skill 2.17 安装于 `/Users/zyongzhu/.codex/skills/archify`。下个回合可直接调用，本次已读取并执行其本地渲染器。没有安装额外插件、没有上传项目源码。

## 证据与边界

源码快照：`336f5fcf`。`dependencies.json` 保存 TypeScript AST 与模块路径解析得到的 5395 条工作区内部引用证据。排除测试与 fixtures；包含 import/export、字面量动态 import/require、类型 import 查询。44 对表示业务模块之间去重后的直接引用，不是 44 次实际运行调用。

跨模块依赖最多的三个模块：ai-runtime（15）、execution（9）、ai（7）。静态图可见双向引用，但其中包含类型引用，不能仅据此断言存在运行时循环加载错误。没有跨模块导入的 23 个模块仍可经 application 的注入端口协作、使用 contract 与数据库基座。

总览是主要调用链的抽象；宿主也会直接装配业务服务，并非所有请求都必经 application。frontend/src/server 中仍存在宿主装配与采集代码，图没有把物理边界的目标状态当作迁移完成事实。动态字符串、依赖注入和平台运行时行为未由静态扫描完整还原。

## 验收

21 份 Archify HTML 均通过 9/9 showcase 校验，0 composition error、0 warning；每份 deliver 回执记录输入与产物 SHA-256，集中见 verification.json。21 份均通过 visual-check：1440×900、1600×1000、1920×1080、2048×1320 无页面溢出，大小端视口均采集浅色/深色截图。

已用图像工具检查 review-0/1/2.png 全量联系表，以及总览、四分支依赖和无导入分组的单张大图/深色代表图。视觉复核通过；这不等于逐项验证所有导出格式。入口实测搜索 analytics、切换 ai-runtime 四张分图、独立打开链接随分图更新，结果正确。

项目 pmem sync 已运行；全局 reconcile 仍有 233 条既有治理漂移（T-916），不影响本次文档图表的独立校验；未声称全局 Gate 通过。未修改任何产品源码或真实用户数据。

## 再生成

在项目根执行 `node docs/research/t953-architecture/extract-dependencies.mjs` 刷新证据；`build-module-maps.mjs` 为依赖分图生成候选 JSON。输入源码变化后应更新索引内嵌数据并重新校验、交付、浏览器检查。最终 JSON 是本次图形布局真相。

示例：

```bash
node /Users/zyongzhu/.codex/skills/archify/bin/archify.mjs validate architecture docs/research/t953-architecture/ai-runtime-1.json --repo-root . --quality showcase --json
node /Users/zyongzhu/.codex/skills/archify/bin/archify.mjs deliver architecture docs/research/t953-architecture/ai-runtime-1.json docs/research/t953-architecture/ai-runtime-1.html --repo-root . --quality showcase --json
node /Users/zyongzhu/.codex/skills/archify/bin/archify.mjs visual-check docs/research/t953-architecture/ai-runtime-1.html --json
```
