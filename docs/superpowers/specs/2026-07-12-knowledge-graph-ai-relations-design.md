# SPEC:知识关系图复原(AI 建网,人只确认)+ 详情弹窗精简

> 日期 2026-07-12 · 状态:⚠️ **CONCERNS(MiniMax gate)→ 6 findings 逐条处置 → 可开工(待用户审)**(见 .review.md) · 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md)。来源:用户打磨审视——「知识详情弹窗有没有必要?之前那个 Obsidian 式思维导图哪去了?」+ 拍板「B:图找回来,但**关联应该 AI 来做,不该人来做**」。

## 0. 一句话

把 T-199 误删的**力导向知识关系图**复原成知识区的探索主面(修掉当初的「底部空白」根因),关系边**全部 AI 产候选、人确认**(复用已建的 runKnowledgeRelate + 确认门),**砍掉人手动「关联到…」**;详情弹窗随之精简为「预览 + 归档」。

## 1. 背景与考古(实锤)

- **图是 T-199(a7ef732,2026-07-10)删的**,用户当时反馈「知识图谱**底部大片空白** + 记忆命中率『规划中』占位去掉」。
- **删错了根因**:底部空白来自 knowledge-page 塞的 `KnowledgeGraph` **ChartFrame 摘要 bar 图**(`graphSeries`,稀疏即空白);但连带把真正的**力导向关系图** `knowledge-graph-view.tsx`(506 行,含「AI 找关联」按钮+节点边渲染,`height:480`)一起删了。为一个摘要图的布局问题,砍掉了整个关系网特性。
- **AI 关联基建全在,只是没了家**:`knowledge-relate-runner.ts`(runKnowledgeRelate → 候选边 {sourceId,targetId,relationType∈supports/contradicts/references/extends,reason})+ `/api/knowledge/relate` 路由(服务端自读 active 知识→跑 runner→返候选)+ 确认门(人采纳 N 条→knowledge.relations.create,createdByType='ai')。注释明写「图谱 tab 点『AI 找关联』」触发——删图把这条 AI 飞轮的入口端了。
- **现状「关联」被架空**:详情弹窗还留着人手动「关联到…」(T-091,createdByType='user')建边,但**建了没地方可视化**(只剩弹窗内一行文本列表),等于废了一半。

## 2. 方向(用户拍板)

**关联是脑力活 = 编导干,不是用户手连**(合宪法「AI 产候选/人确认」+「编导做重活」)。所以:
- **复原力导向关系图**为知识区探索主面(不是复原那个空白摘要 bar 图)。
- **关系边全 AI 建**:图面挂「AI 找关联」→ runKnowledgeRelate 产候选 → 确认门采纳 → 图上生边。**移除人手动「关联到…」**入口。
- **详情抽屉精简**:主区回归预览 + 归档;去掉「关联到…」(人建边)。修订(createRevision)**保留但降权进次级入口**(gate 裁决:宪法 §5.5 许可「人改」,整删偏定位)。

## 3. 设计

> 复用锚:`knowledge-graph-view.tsx` + `knowledge-graph-vm.ts`(git `a7ef732^` 完整可取,力导向渲染+AI 找关联按钮+确认门 UI 都在)· runKnowledgeRelate runner + `/api/knowledge/relate` 路由 + knowledge.relations.create/list/delete(createdByType='ai')· knowledge-page 二态结构。

### 3.1 关系图主面(复原 + 修布局)
- 从 `a7ef732^` 取回 **三件**(gate-M1:装配胶水也被同 commit 删,不止 2 文件):① `knowledge-graph-view.tsx`(收 `graph: KnowledgeGraphVm` 作 prop,自己不取数)② `knowledge-graph-vm.ts`(`buildKnowledgeGraphVm` 纯函数在内)③ **`assembleGraph` 装配层**(`a7ef732^:knowledge-data.ts:336,477-522`:fan-out `knowledge.list`+`relations.listAll`+`listMaterialLinks`+`listProjects`、算 `usedCount/usedInPublished` 战绩投影、调 buildKnowledgeGraphVm)+ 测试。**接回前核实** `listMaterialLinks/listProjects` 客户端方法仍在(否则补),否则接回即悬空。
- **布局修「空白」根因**:图作为**填满的探索面**(tab 或页内主区,占满可用高度,`min-h`/`flex-1` 而非固定 `height:480` 塞底部);**不复原** `KnowledgeGraph` ChartFrame 摘要 bar 图(`graphSeries`/assembleGraph/summariseGraph —— 那才是空白源,保持删除)。
- 空态诚实:关系为 0 时不留大片空白,给「还没有关联——点『AI 找关联』让编导找找知识间的联系」引导(不是空白画布)。
- 节点=知识原子(点开=详情预览),边=AI 建的关系(supports/contradicts/... 分色/标注 relationType),可缩放/拖拽(沿用老实现)。

### 3.2 关系全 AI 建(移除人手连)
- 图面「AI 找关联」按钮 → `/api/knowledge/relate`(现成)→ 候选边确认门(现成 UI 在老 graph-view 里)→ 采纳 createdByType='ai'。
- **移除**详情弹窗的「关联到…」人手动**建边**入口(T-091,createdByType='user')+ create 调用;`knowledge.relations.create` 契约保留(AI 路径仍用),前端不再暴露 user 建边 UI。
- **[gate-M2] 删边不能孤立**:老 graph-view **无删边 UI**,而详情弹窗的 KnowledgeRelationsList(`knowledge.relations.delete`,T-247)是当前删边唯一入口。「关系归图面」要落地,**图面必须补 edge-delete**(选中边/节点右键删),否则采纳了错的 AI 候选边就删不掉、削弱确认闭环。本轮图面补最小删边路径,才准撤 KnowledgeRelationsList 的删边职责。
- **[gate-concern] 飞轮不留「可选」**(违铁律④ 禁 optional/多阶段):AI 关联**自动触发**带独立触发策略+失败模式(何时触发/候选去重/别打扰),是独立能力,**从本 SPEC 剔除,另立 backlog 任务**。本 SPEC 就是 on-demand 全 AI 的完整 0→1(T-260a~c),不做减法。

### 3.3 详情抽屉精简(落点校正)
> **[gate-M3] 落点校正**:真正的「知识详情」弹窗是 `knowledge-interactive-region.tsx` 的抽屉(48KB,内嵌 KnowledgeDetailPreview 预览 + 修订表单 + 归档);`knowledge-detail-preview.tsx` **只读** revisions,「保存修订」createKnowledgeRevision 在 `knowledge-interactive-region.tsx:254,441`。T-260c 主战场是 **interactive-region.tsx**,不是 detail-preview.tsx —— 执行者别改错文件/测错断言。
- 保留:内容预览(结构化,T-198 的 KnowledgeContentBody 不动)。
- 保留:归档(hide stale,有读侧滤 archived,T-247 已补)。
- 移除:「关联到…」人建边入口(关系归图面,删边职责移图面见 §3.2)。
- **[gate 裁决] 修订「保存修订」= 保留但视觉降权,不整删**(reviewer 引宪法 §5.5「人只审/**改**/删」——手改内容是被明确许可的一等操作;整删=砍掉宪法允许的「人改」路径,反偏定位;且修订 append-only immutable 安全,改错别字/纠一句金句用「重跑 AI 蒸馏」是 overkill)。处置:修订从抽屉主区收进「更多/编辑」次级入口(主区留预览+归档),满足精简诉求又不违 §5.5。
- 结果:弹窗从「管理台」回归「预览 + 归档」两件事。

## 4. 边界(防走样)

- **不复原摘要 bar 图**(graphSeries/ChartFrame KnowledgeGraph)——那是空白源,是 T-199 该删的部分。
- **关系只 AI 建**:contract knowledge.relations.create 保留但前端只走 AI 采纳路径,不给 user 手动建边 UI(createdByType='user' 前端下线)。
- **[gate-m1] 节点上限给死**:老 graph-view 无渲染侧 node cap(仅注释「<100 节点富余」),relate 侧 `MAX_RELATE_ATOMS=120` 是提议侧。ECharts force 数百节点会卡 → T-260a 定具体阈值(如 >150 节点按 usedCount/度数采样虚化 + 「显示前 N,共 M」诚实提示),验收含此。
- 模型走 model-config(knowledge.relate capability 现成)。
- 不新增采集/不碰数据归属;纯前端复原 + 前端入口增减 + 布局修。

## 5. 切片(拆 Task,过审+用户审后落 BACKLOG)

- **T-260a** 复原力导向关系图为知识探索主面(取回 graph-view/vm + 接 knowledge-page + 布局修「空白」根因 + 空态引导;不复原摘要 bar 图)。
- **T-260b** 关系全 AI 建:图面「AI 找关联」接线(runKnowledgeRelate+确认门)+ 移除详情弹窗人手动「关联到…」/关系管理。
- **T-260c** 详情**抽屉**精简(落点=`knowledge-interactive-region.tsx` 非 detail-preview;去人建边入口,修订降权进次级入口保留,留预览+归档主区)。
- ~~T-260d 飞轮~~ **剔出本 SPEC**,另立独立 backlog 任务(自动触发策略需单独定,违本 SPEC 的一次 0→1 纪律)。

## 6. 验收

- 知识区有力导向关系图主面,填满无空白;关系 0 时诚实引导非空白画布。
- 点「AI 找关联」→ AI 产候选边 → 确认门采纳 → 图上生边(createdByType='ai');全程 MiniMax 可跑。
- 详情抽屉无「关联到…」人建边入口;主区剩预览+归档;修订收进次级入口仍可用(gate 裁决保留)。
- **[gate-m2] 移动端降级**:老 graph-view 有「移动端渲 stats 摘要+提示桌面查看,不硬塞 force 图」——复原时保留,验收含移动端断言。
- 三端 typecheck + 单测(graph-vm 复原测 + assembleGraph 装配 + 图面删边 + AI 关联确认门 + 抽屉精简后断言 + 节点上限采样 + 移动端降级);知识全家零回归。
