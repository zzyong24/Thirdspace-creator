# T-920 业务 Skill 方法交付

已补齐 45 个原有内置 Skill 的业务执行方法，并新增自主资料研究、自主素材整理、自主来源采集 3 个可管理 Skill，共 48 个。方法按注册 ID 映射，对话由模型根据当前意图选择方法；没有以关键词规则替代语义判断。

设置页 official methodSystem 与运行 registry 同源，账号覆盖继续优先；生产 chat assembly 读取有效 Skill，独立 Pi 新任务在 prepare 中读取账号有效 methodSystem 并直接冻结进 modelInput，旧 execution 回读时不重新取配置。独立 Pi 不再把不可编辑的默认方法拼在账号方法前面。新增三个 Skill 仅支持 system 编辑，前端同步读取 editableFields，保存/恢复不提交不可编辑的 template。

素材研究覆盖理解全文、需求分解、精确检索、正文阅读、相关性判断、调整路径、映射回稿件与来源限制；其他包括定位、选题、策划、写稿、视觉、发布、复盘、知识与产品帮助。工具权限、候选采纳和原输出 schema 保持原边界。

独立评审 skill_method_review 通过初版方案；实现复核指出默认提示隐藏拼接问题，已改为直接使用有效方法，默认安全提醒移入官方 Skill 可见文本。

验证：48 个注册项均包含业务方法；重复注册无变化，official methodSystem 与注册 system 无差异。frontend TypeScript 编译通过。没有运行业务自动测试、真实模型/浏览器任务或安装包验收；这是代码接线与注册检查，不代表业务效果达标。用户自定义 system 不被覆盖，可在技能管理中查看或恢复官方内容；旧任务保持旧快照。

当前 Downloads 内 DMG 未更新；T-919 主导航现场卡顿仍未确认根因。
