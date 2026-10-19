# T1250 公共回归隔离候选独立复核

结论：仅私有工具/fixture候选通过，等待 ROOT 精确应用和 fresh 绑定；不签实际回归或 runtime。

V9 launcher `ca24b82b9ce6cc65833db8f9e6cd22592e61e219903e4e170bf230b6e5cd610c`；V9 binding `119f3c49230b4174fa9b596681341c9793f51ea887150e1428ea57d1a4700cac`；两 fixture binding `69c44b1c1a25bb93db4764c8e8fc1bd064aa9938339d962e70bd8065bba45f86`。逐条源、原档、diff、真实首轮结果 SHA 全部相等。

原 CLI 在没有显式 BASEURL 时会发现用户默认连接。V9 给每个 child 显式指向自有根中不存在的 connection/access 文件，保 HOME/CODEX_HOME；原 discovery 的 access 门会在读凭据或发网络前拒绝。有效 fixture 仍须自己设置实际 owned listener，不能拿哨兵失败冒业务成功。V9 逆删唯一五行后与已评 V8 完全相同。

新慢 hosts case 用独立 PGlite，完整 setup 外层 finally 关闭该库，内层原 host 清理保留；新慢 CDP case 在原 afterEach 清空 beforeAll 环境后重新绑定同一个 owned server 真实端口和原四个隔离值。两原文件全部 142/34 条 expect AST、case 名称与有效预算保留。没有修改旧 case 的权限、停止证明、deadline、usage 或终态。

当前没有运行新 body/list 或任何 PG、浏览器、App、模型。旧失败/未知 404 的实际目标保留，不能归为账号被删。hosts 原 6 个资格不足仍计未验；实际是否修复必须 fresh 绑定后运行。
