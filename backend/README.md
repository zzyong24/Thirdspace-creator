# CreatorOS Backend

CreatorOS 后端采用 **Next.js / Node.js 模块化单体**。

所有业务模块：

- 运行在同一个 Next.js 应用中。
- 使用同一个 PostgreSQL 数据库。
- 作为一个部署单元发布。
- 通过模块公开 Service 协作。
- 不允许跨模块访问 Repository。

## 文档

- [Backend SPEC](./SPEC.md)
- [Module Architecture](./MODULE-ARCHITECTURE.md)
- [TDD Plan](./TDD-PLAN.md)

## 关联文档

- [数据模型](../docs/CreatorOS-data-model.md)
- [存储与业务逻辑](../docs/CreatorOS-storage-and-business-logic.md)
- [产品实施计划](../docs/CreatorOS-implementation-plan.md)
- [Frontend SPEC](../frontend/SPEC.md)

当前阶段只包含后端规格与测试计划，不包含后端代码。

