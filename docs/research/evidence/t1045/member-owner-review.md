# T-1045 成员、公开模块与删除边界独立复审

2026-10-02 独立 reviewer `/root/conversion_ports`，只读共享工作树。初审 FAIL：原 Projects/Articles/GraphicPosts 创建未在事务内锁项目，可能在删除收集子键后创建孤儿；朋友圈全量重验旧引用阻断合法文字编辑。

修正后静态实现审查 PASS：

- 原 Projects 有/无 requestId 创建均事务先锁项目；无 requestId 生产仓库走 createOutputAtomic，同事务写 output/stages/activity。
- Articles/GraphicPosts 原创建事务先持项目锁；新 Moments/WorkCompositions 写锁顺序先项目后领域根，与删除一致。
- Moments 历史豁免仅覆盖原配图字段同 asset/file、原 sourceRefs 字段同完整引用。
- Basis 历史豁免按文档／claim ID／fact ID 隔离，新增或跨触点引用必须重新核验；rule 仅以正式不可变 versionId 保留。
- 模块 transport 的提交回执恢复与历史版本绑定正确，四类 owner 身份和类型、项目与账号隔离正确。

reviewer 没有自行运行 green；当场 root [5文件60项回归](original-owner-lock-final.log) 全部通过，包含原文章、图文与新两个 owner、四成员集成；[真实配图归属测试](real-file-owner.log) 7项通过，但未进行对象存储下载或渲染。

本审查不包含应用根 HTTP/CLI 接线、产品 UI、物料修改、模型生成或完整审核，不代表 T-1045 完成。
