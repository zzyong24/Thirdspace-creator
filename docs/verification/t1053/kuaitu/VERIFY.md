# 快图原生候选交接（T-1053）

固定上游 commit：`b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889`。所有改动仅在临时目录；CreatorOS 共享 checkout 未写入。

## 交付文件

- `native/`：本地 ESM 原生组件、CSS、真实构建模块图与 hash 元数据、原 MIT LICENSE 和完整依赖声明。
- `native-source.tar.gz`：308 个实际源文件（无 node_modules、dist、绝对路径的临时测试 runner）。
- `native.patch`：相对冻结源完整 59 个文件改动，原源上 git apply --check 通过。
- `dependency-license-inventory.csv`：现有冻结依赖 804 行；原 core package ISC 声明保留。
- `provenance.json`：原源、归档、patch、产品逐项 SHA256，以及实际命令和许可保留核对。
- `evidence/`：实际日志；包括早期失败，不把早期广泛 TypeScript 失败记成通过。

## 已发生的验证

```bash
# 工作目录 /tmp/t1053-native-canvas/source
node native-build.mjs
node node_modules/typescript/bin/tsc --noEmit --target es2022 --module esnext --moduleResolution node --strict --skipLibCheck --lib es2022,dom src/native-types.ts src/native-engine.ts src/native-controller.ts typings/extends.d.ts
node /Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/node_modules/vitest/vitest.mjs run --config native.vitest.config.mts
# 工作目录 /tmp/t1053-native-canvas/upstream
 git apply --check /tmp/t1053-native-canvas/delivery/native.patch
# native-source.tar.gz 解压到新 /tmp/t1053-native-canvas/rebuild-final；仅链接原冻结缓存依赖
# 工作目录 /tmp/t1053-native-canvas/rebuild-final
node native-build.mjs
```

原 Vue Home/Fabric 工作面构建 PASS（实际 1,271 个 transform，图文件 1,096 个非虚拟模块）；13 项 JSDOM controller / 实际 Editor、Resize、Workspace 方法夹具 PASS；仅新宿主窄真实 engine 接口 TS PASS。归档重建 JS、CSS、graph 三个 SHA256 与候选全部一致。

测试 config 在 evidence 中保留实际绝对路径，测试文件使用 @creatoros/contract alias 引用真实合同；移到其他 checkout 后必须改 runner 路径。源码本身的构建入口无这些测试绝对路径。

## 已实现的数据及生命周期边界

宿主信任下发的精确 blob 映射；已知媒体暂不可读时以空图在原引擎呈现，snapshot 保留已知 creatoros-media scheme 和真实 creatorosMediaId。未知外链或未知 ID 留安全 PNG 和 MissingSource/MissingMediaId 元数据，不丢图层，不访问外链、不上传占位像素。主宿主仍核对真实 mediaRefs、归属、CAS。

独立 mount/unmount、真实容器 refs、局部 portal、焦点快捷键、导出锁、计时器/observer/插件/Fabric 精确清理；原画纸和内容颜色保持。实际原导出、导入、替换、裁剪、撤销工作台沿用，图片通过 importMedia 获得归属。

## 尚未验证

真实浏览器像素、完整实际 Fabric 编辑交互、原生 PNG 实际渲染、系统 Clipboard、主宿主真实 HTTP 保存/重开公共链路均未在本候选内运行。这里的 JSDOM 带明确 Fabric 夹具，不能当作完整浏览器证据。parent 串行集成之后仍需执行 SPEC 的宿主验证与 Gate。
