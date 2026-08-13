# 本机 CreatorOS 数据恢复报告

> 日期：2026-08-13（America/Los_Angeles）
> 任务：T-810
> 授权：用户明确回复“开始恢复”

## 结果

恢复成功。CreatorOS 已重新使用修复后的原数据库，正式安装包成功启动，首页已显示恢复的真实账号、继续创作、最近发布、历史播放数据和热门选题。

恢复后的核心数据：

| 数据 | 数量 |
| --- | ---: |
| 项目 `projects` | 57 |
| 产物 `artifacts` | 169 |
| 素材 `assets` | 179 |
| 发布记录 `publications` | 63 |
| AI 对话 `ai_conversations` | 49 |
| AI 消息 `ai_messages` | 539 |
| 执行任务 `execution_tasks` | 926 |
| 搜索文档 `search_documents` | 324 |
| 模型配置 `model_configurations` | 11 |
| 智能体配置 `agent_configurations` | 8 |

## 恢复过程

```mermaid
flowchart LR
    A["退出 CreatorOS<br/>确认全部句柄释放"]
    B["当前空库与隔离旧库<br/>分别做字节级副本"]
    C["只在修复副本上<br/>重置损坏 WAL checkpoint"]
    D["109 张表可读"]
    E["清理搜索索引中的<br/>252 组逐字段完全相同重复元组"]
    F["全库 REINDEX"]
    G["全表扫描 + 约束/索引检查"]
    H["保留回滚库并切换"]
    I["正式 CreatorOS 启动与界面复核"]
    A --> B --> C --> D --> E --> F --> G --> H --> I
```

### 1. 数据保全

恢复前确认 CreatorOS 及 sidecar 已退出，当前库和隔离库均无打开句柄。随后创建恢复目录：

`~/Library/Application Support/cloud.aitongban.creatoros/recovery-20260813-0710`

逐文件 SHA-256 清单结果：

| 对象 | 文件数 | 清单 SHA-256 |
| --- | ---: | --- |
| 事故后当前空库 | 1,590 | `5bb983180552a43d9311d5c9a50412a3201fc2a2f024b65eb42bdad5aae37c17` |
| 隔离旧库原件 / 原样副本 | 1,657 | `7a5b44bc998fef0129922ca2286d7c096fd8acf2f872335c2d121bfb21571433` |
| 最终修复候选 / 冻结副本 | 1,652 | `38bf1519288d71656cdbe0ca8af8a06628aca2817082854858124fa1e452af69` |

隔离旧库原件没有被修复工具打开；修复只发生在 `repair-working-copy`。

### 2. WAL / checkpoint 修复

修复副本首次打开报错：

```text
invalid checkpoint record
could not locate a valid checkpoint record
```

`pg_controldata` 显示数据库格式为 PostgreSQL 16、cluster state 为 `shut down`，最后可信 checkpoint 为 2026-08-13 02:00:22。本机 PostgreSQL 16 的 `pg_resetwal -n` 预演给出下一段 WAL 为 `0000000100000000000000DA`，随后仅在修复副本上执行 WAL reset。数据库成功打开并识别出 109 张业务表。

### 3. 索引与物理重复恢复

全库 `REINDEX` 首次发现 `search_documents_pkey` 仍有物理重复。禁用索引后检查显示：

- 576 个物理可见元组；
- 324 个唯一 ID；
- 252 个 ID 各有两份；
- 252 组均为逐字段完全相同；
- 0 组内容冲突；
- `search_documents` 没有被其他表外键引用，它是可从项目等实体派生的搜索索引。

修复副本对每组完全相同元组只保留一条，恢复为 `324 行 / 324 唯一 ID / 324 唯一来源实体`。随后 `REINDEX TABLE search_documents` 和 `REINDEX DATABASE template1` 均成功。

### 4. 事故后新库合并

事故后新库共有 108 张表、59 行，业务数据为空：项目、素材、发布、对话均为 0。非空数据只有用户、授权状态、模型/智能体默认配置和审核规则。

- 保留恢复库中完整用户昵称、11 项模型配置、8 项智能体配置和 43 条审核规则；
- 只把事故后新库中更晚的授权心跳合并进恢复库；
- 没有用空库的默认用户或默认模型配置覆盖旧库中的真实设置。

### 5. 切换前 Gate

最终候选检查：

- 109 张表全部禁用索引顺序扫描成功；
- 共 17,301 行；
- 118 个约束全部有效；
- 287 个索引全部 `indisvalid / indisready / indislive`；
- 0 个扫描、约束、索引或关闭错误。

### 6. 正式启动验收

- 恢复候选切换为正式 `db`；
- 事故后空库改名保留为回滚库；
- `/Applications/CreatorOS.app` 启动成功，sidecar 正常监听；
- 没有生成新的 `db.corrupt-*`；
- 最新加密日志解密后无 checkpoint、B-tree、数据库损坏或索引错误；
- 首页实际显示“月明”、当前账号“月明水清深”、继续创作、最近发布、历史指标和热门选题。

启动最初几秒曾有三条 `AccountRequiredError`，随后账号上下文自动恢复，首页真实数据正常显示；这不是数据库恢复失败。

## 回滚与保留位置

本次没有删除任何数据库副本：

| 位置 | 用途 |
| --- | --- |
| `.../db` | 当前正式使用的恢复库 |
| `.../db.empty-after-quarantine-1786630620` | 事故后新建的空库，目录级回滚 |
| `.../db.corrupt-1786622723008` | 111 MB 原隔离库，未修原件 |
| `.../recovery-20260813-0710/current-db-byte-exact` | 事故后空库的字节级副本 |
| `.../recovery-20260813-0710/isolated-db-original-copy` | 隔离旧库的字节级副本 |
| `.../recovery-20260813-0710/repair-after-reset-before-reindex` | WAL reset 后、索引修复前快照 |
| `.../recovery-20260813-0710/repaired-final-candidate` | 最终修复候选冻结副本 |

恢复目录还保存逐文件 SHA-256 清单、全表逻辑哈希和修复工具输出。为了可回滚，本任务不清理这些副本。

## 尚未包含的范围

本任务只恢复本机数据，没有修改产品代码。防止测试脚本再次连正式库、增加跨进程独占锁、把通用 `Aborted()` 改为 fail-closed、以及产品内提供 `db.corrupt-*` 恢复入口，应另立代码任务完成。
