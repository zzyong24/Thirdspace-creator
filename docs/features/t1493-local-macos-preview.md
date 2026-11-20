# T-1493 macOS 本地预览包

用户要求跳过官网验收，从当前工作树生成 macOS 本地预览包并移除当前安装。包包含 T-1491 转写文章和 T-1492 编导布局的本地改动。旧应用移至废纸篓，保留现有数据库、设置和用户文件，再从本轮产物安装和启动。范围限于本机预览。

核对安装包路径和版本、校验值、应用签名与本机实际启动。单独记录安装包和启动是否成功。

## 实测结果

- `pnpm install --frozen-lockfile` 与 `pnpm -C frontend desktop:package-local` 成功，生成 Apple 芯片版 `~/Downloads/CreatorOS-1.2.0.dmg`，共 897,852,221 字节。`hdiutil verify` 通过，SHA-256 为 `e385f3f814cd67903435168c196ed55783384bcc0c759a2b66f7e1a01db73fb2`。
- 原应用移至 `~/.Trash/CreatorOS-1.2.0-before-T1493.app`。从只读挂载的 DMG 安装新应用到 `/Applications/CreatorOS.app`，挂载源和安装前暂存应用均通过 `codesign --verify --deep --strict`。本地包使用 ad-hoc 签名，未提交 Apple 公证。
- 实际启动出现 1440 × 900 CreatorOS 窗口。本地服务返回 HTTP 200 和 CreatorOS 首页 HTML。原数据库目录 inode 保持一致，新服务实际打开该目录中的数据库文件。这个任务只验收本地打包和启动。
- 按要求跳过官网验收。只读项目对账记录了已有的 T-1434 官网验收收据契约哈希不一致，当前任务未变更相关文件。
