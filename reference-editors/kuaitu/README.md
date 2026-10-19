# 完整图文开源工作台最小实验

官方来源：https://github.com/ikuaitu/vue-fabric-editor
锁定提交：b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889
根许可证：MIT，2022 秦少卫；packages/core/package.json另声明ISC，保留原声明。

保留：完整三栏工作台、Fabric画布、基础文字与几何图形、图片文件插入、图层、组合、移动缩放、撤销重做、JSON导入/导出、PNG/SVG本地导出、尺寸/背景/字体/对齐属性面板。
隔离适配：关闭上游云模板/图库/字体库/账户/个人空间入口；本地系统字体；上游API指向本机未启用端点；去除商业版链接和本机浏览器自动打开。未接CreatorOS真实后端，不宣称作品保存已集成。

Vue保持原实现，以静态同源iframe嵌入React。最窄接口在src/views/home/index.vue持有的canvasEditor上：
- getJson() 导出Fabric原生文档（含workspace、每层id、图片src与属性）。
- loadJSON(json, callback) 完成载入；调用期间需抑制changed防回写，串行处理切图卡。
- preview(): Promise<string> 原生PNG dataURL；可转Blob由host上传现有Asset。
- createImgByElement(imgElement) + addBaseType(image,{scale:true}) 使用现有导入流程。
- canvas.on('object:added/modified/removed/text:changed') 捕获用户编辑，手动属性设置有些仅renderAll，需snapshot保存为真实当前值，不能仅依赖事件。

Host持有cardId/outputId/账号归属、原CAS版本号、原生JSON及Asset关联。iframe只编辑当前图卡，不取得DB或任务权。跨图卡切换前host发snapshot，保存后load另卡；失败保留当前编辑与重试。NativeJSON中的图片src必须由host通过Asset归属后映射受控访问URL，不能信任任意远端地址。

PNG/SVG导出原生保持；保存作品必须由host公共服务处理。原生单页编辑器不声称自带多页图文、公众号富文本排版；各图卡由CreatorOS现有cardId组合，文章仍用Tiptap。

许可范围：根MIT允许代码复制改造并保留著作权和许可；商业版代码及云模板/图库不在本次获取范围。不分发src/assets/fonts/cn/华康金刚黑.ttf与汉体.ttf（未找到单独字体许可）。图片滤镜预览/图标原仓资产保留根许可，不将外部云图案下载到产品。所有直接/传递依赖以安装后的package许可证汇总为准，不泛称全部MIT。

## 当场运行证据

- `npx --yes --registry=https://registry.npmjs.org pnpm@8.15.9 install --ignore-scripts --registry=https://registry.npmjs.org` 首次下载与链接完成后，写锁因 onlyBuiltDependencies 类型失败。隔离 package.json 显式 `pnpm.onlyBuiltDependencies=[]` 后，`... install --offline --ignore-scripts --registry=https://registry.npmjs.org` 成功，Done in 2s。详见 vue-install-final.log，不隐藏首失败。
- `node_modules/.bin/vite build --base ./` 最终成功，7.47s，vue-build-bridge.log；构建警告为较大chunk，没有构建错误。
- dev http://127.0.0.1:4597/ ，生产静态预览 http://127.0.0.1:4599/ ，均HTTP200。保留两个server供主会话浏览器验收。
- 新桥文件 src/creatoros-bridge.ts；统一type creatoros.reference-editor、version1、session、requestId、operation。source===parent与同origin检查；不开放独立持久化。
- load/snapshot/export(png Blob)/insert-media(File+mediaId)/import-media(File→host result mediaId)；imports跨load epoch防旧图片回写其他图卡。NativeJSON自定义data在ServersPlugin.getExtensionKey中包含。
- 本地插入SVG图片文件也由host先上传后标识Asset；嵌入模式移除SVG字符串入口。
- bundle-manifest.json记录每个静态文件SHA256；完整离线源（不含.git/node_modules/未授权中文TTF）在vue-fabric-editor-offline-source.tar.gz。
- 依赖许可inventory为实际安装804个distinct package版本，未知0；以具体许可分别保留MIT/Apache/ISC/BSD/CC/BlueOak/Python等，不能一概称全MIT。约2MB完整声明在THIRD_PARTY_REFERENCE_NOTICES.txt与dist/THIRD_PARTY_NOTICES.txt；CC-BY依赖主要dev/caniuse与spdx，不把未核外部云图库用于产品。

界面手动编辑、上传、导出与同源iframe bridge仍由主会话CUA验证；本子任务只提供源码/构建/HTTP当场证据，未把HTTP200当作交互验收。主会话接Host公共服务后，才能记CreatorOS作品保存已集成。

## 2026-10-02 导出冻结与真实脏状态补充

- export回应现在为 `{blob, document, fileName}`。新增原生ServersPlugin.previewDocument，在上游导出钩子与实际render后，用同一同步调用段深冻结getJson、生成PNG，返回实际对应PNG的图层稿；不是host预先获取另一个snapshot。
- 整次导出期间屏蔽鼠标、键盘、输入、剪贴板、拖放事件。图片File异步加载可继续，但最终插入等待导出屏障释放，保留用户文件；后端request处理仍串行。
- changed在ready与成功load后初始化原生JSON baseline，再做精确JSON比较；仅afterrender、缩放、选中等不改变图层数据时不通知changed。此比较仅去重事件，不作语义内容选择。
- 最终生产build 7.64s PASS（vue-build-export.log），HTTP4599 200。导出helper回归2项PASS（vue-export-test.log）；该单元使用canvas夹具验证返回文档的深冻结以及渲染失败时恢复钩子，不冒充真实浏览器PNG或CreatorOS保存验收。测试启动配置经历了外部目录模块解析/未编译native canvas依赖问题，最终显式fixture module完成，未启用外部安装脚本。
- 最新bundle-manifest.json已覆盖dist全部文件与两个变动source文件，离线源码tar也已更新。浏览器冻结、无操作不脏与CreatorOS落库仍由主会话实际验证。
