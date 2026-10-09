# T1170 原浏览器失败上下文的无损压缩归档

用户要求有问题及时创建task修复。当前main aa7de1e9来源整合提交前，首次git diff --cached --check真实exit2：新增原Playwright失败error-context.md第147/162/230行包含原源代码摘录的行尾空格。外层暂存脚本真实exit1；产品代码和原浏览器失败不变，不能删原失败、改其原字节或放宽Git检查。原上下文SHA256 ccbdd8678d0cbc8153506e88c4498db5c66a6ee35f3d067ba0c749d7503550bd 已在T1165原manifest/独评保留。

阶段4-build，证据储存机械修复，无产品/测试/validator改动，不改变范围、IA、身份或门规则。先原暂存diff命令保存当前真实拒绝，再将新增未提交raw md逐字保留到本会话私有目录并gzip压缩为error-context.md.gz；解压SHA必须精确等于原manifest。原MANIFEST.json与独评不改，在同目录独立RAW_CONTEXT_STORAGE.json准确说明原逻辑路径到gzip/私有原件映射。原md从当前待提交集合撤出后移入私有目录；不伪造同名干净raw、不修剪正文。其余历史失败/图/trace和旧已提交文件不动。

验证原git diff --cached --check恢复exit0、gzip解压和私有原件字节全等；原失效receipt/源SHA保留。不重跑模型、浏览器或真人任务，不备份用户App/库/媒体，不修改构建/Gate。控制写集本SPEC、BACKLOG、events、PROJECT和新证据储存索引/gzip；pmem和最终完整canonical如实记录，不能把此局部存储修复称为产品或全量PASS。
