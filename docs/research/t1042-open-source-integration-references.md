# 多媒体与作品工作台的开源参考

2026-10-01 实际克隆到 `/tmp/creatoros-open-source-references`；临时资料不进入应用运行路径，未执行参考仓安装脚本。整合仍由 CreatorOS 现有 Asset、具体作品、执行任务和版本服务承载。

| 参考 | 本地目录 | 实际提交 | 许可 | 复用方式 |
| --- | --- | --- | --- | --- |
| [react-timeline-editor](https://github.com/xzdarcy/react-timeline-editor) | `react-timeline-editor` | `4148f4a837dd767ea66807560d05bc7b65c7e578` | MIT，已读根 LICENSE | 选中、拖移、伸缩和虚拟时间轴；不引入第二渲染器；隔离兼容探针见 T-1036 |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | `OpenCut` | `e668010778568641babef2cc40be4703ae6916d6` | MIT，已读根 LICENSE | 参考素材、预览、时间轴、参数面板的组织，不移入其整套存储和任务权 |
| [infinite-canvas](https://github.com/basketikun/infinite-canvas) | `infinite-canvas` | `dab19adc0847e32e39b7fc8ff90cb392561fb826` | MIT，已读根 LICENSE | 复用已存在 creator-canvas 分支的集成，核对实际媒体能力和作品归属后合并 |
| [Tiptap](https://github.com/ueberdosis/tiptap) | 已安装 frontend 依赖 | `3.27.1`（包版本） | 具体扩展随复用核对 | 文章/图文的文字编辑参考；保留现有段落、图片 AssetFile 和版本合同 |

```mermaid
flowchart LR
  O[开源交互组件] --> W[CreatorOS具体作品工作台]
  W --> S[同一作品方案与版本]
  S --> A[同一Asset素材服务]
  S --> E[既有执行任务与采纳]
  E --> R[查看与交付真实结果]
```

画布分支 HEAD `de031bc3`，目标分支本轮开始 HEAD `31ef5c43`。不整分支覆盖已有修改；T-1042已独立评审两种0101数据库迁移谱系的兼容验收。视频可视界面、编导局部编辑、音效字体和真媒体成片分别沿已确认队列执行，服务测试不代表这些界面或安装版已经交付。
