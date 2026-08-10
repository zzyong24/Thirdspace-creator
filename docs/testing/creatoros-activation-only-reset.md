# CreatorOS 重新输入激活码

CreatorOS 正式版已在设置页提供“重新输入激活码”。这是首选入口：它只退出当前电脑的本地激活态，
不会联网、不包含激活服务器地址，也不修改服务端记录。项目、素材、账号、模型配置和密钥都会保留。

```mermaid
flowchart LR
    A[设置里的激活信息] --> B[重新输入激活码]
    B --> C[确认本地清理]
    C --> D[先停止旧本地服务]
    D --> E[只清固定激活白名单]
    E --> F[CreatorOS 整体重启]
    F --> G[输入新的激活码]
```

## 用户使用方式

1. 打开 CreatorOS“设置”，找到当前激活信息。
2. 点击“重新输入激活码”。
3. 阅读确认说明后点击“确认并重新启动”。
4. CreatorOS 会先安全停止旧本地服务，只清除本机激活状态，然后整体重启到既有激活页。
5. 输入新的激活码。

本操作不解除服务端绑定；新码是否可在这台电脑激活，仍由正式授权服务按既有规则判断。

## 会清理什么

- 官方应用数据目录中的 `.license`、`.license-seen`、`.channel-model-config` 和 `.channel-links`；
- macOS 的 `cloud.aitongban.creatoros.license` Preferences 域中的 `lastSeenMs`；
- Windows 当前用户目录下的 `.creatoros-seen`。

产品入口使用原生固定白名单，不接受用户传入路径、激活码或服务地址。

## 一定保留什么

- `db/`、`.auth/`、`logs/`；
- `machine-id`、`.master-key`；
- `~/CreatorOS` 工作区；
- 项目、定位、知识、素材、账号、模型配置、模型密钥和采集数据；
- 服务端的激活码消费、绑定、换绑和吊销记录。

## 维护者备用脚本

旧版本无法进入设置页时，维护者仍可使用仓库内的白名单脚本。它不是面向普通用户分发的独立 EXE。

```bash
# 只读预览，不修改
node tools/reset-creatoros-activation.mjs

# 确认预览无误后执行；交互输入 RESET ACTIVATION
node tools/reset-creatoros-activation.mjs --execute
```

自动化验收已得到明确授权时才可使用 `--execute --yes`。脚本同样不调用换绑接口，也不会向任何
服务器发送请求。
