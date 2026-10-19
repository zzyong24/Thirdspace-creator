# T1219 画布 E2E 定位器前置独评

2026-10-11，已先读 T1219 Task Packet/SPEC，再只读原测试、CanvasLibrary/CanvasAssetPicker/AssetPicker 及后续 T1069/T1101/T1117 SPEC/DEC，查看保存的素材抽屉截图。没有启动 Next、运行浏览器测试或修改代码。**限定三类 selector 范围 PASS；空态双断言整体替换不准入**。最终浏览器 GREEN 待发生。

## 精确候选定位器

1. 原 `getByRole('button',{name:'新建画布'})` 在空列表同时匹配页头和空态按钮；`canvas-library.tsx` 两处真实按钮调用同一 create。限定到 header 的真实新建按钮，例如 `page.locator('header').getByRole('button',{name:'新建画布',exact:true})`，先核唯一，不用 `.first()`、force 或删空态绕严格定位。
2. 图片/视频插入：当前共享卡片中预览按钮 ARIA 名为 `预览 {精确素材名}`，直接父 div 是该 choice 的单卡片，内部另有 `放到画布` 操作。候选为 `gallery.getByRole('button',{name:'预览 画布预览图片.png',exact:true}).locator('..').getByRole('button',{name:'放到画布',exact:true})`，视频同理。gallery 取 `getByRole('complementary',{name:'当前账号素材'})`。先核精确预览名/单卡唯一，再可信点实际插入操作；不能点击预览后当作插入，也不能任意挑第一个插入按钮。
3. 首页资产“用此素材创作”：在同 complementary 中，`预览 douyin-icon.png` 的直接父卡内定位 exact `用此素材创作`。保留上传、原画布选择与正式保存/get；不能把旧“文件名 · 操作”合并按钮 locator 泛化为全页任意操作。

截图已实际展示两真实素材卡及独立“放到画布”；源码精确匹配上述结构。当前所提供 `t1208/20261011-targeted-output` 未找到画布 trace（仅新建项目/项目排期/雷达），已请求主任务补具体路径；因此不冒称已亲自核到“画布 trace assets.list 返回两条”的网络证据。定位器准入来自当前源码及保存截图，实际 trace/API 结果必须在后续日志补核。

## 空态合同分歧不得洗掉

T994 原要求“搜索已加载的 N 件素材”及无素材导航到素材中心上传。后续 `DEC-T1069-INSTALLED-MEDIA-AND-BINDING` 与 FR-1069-PICKER 明确画布适配器为全库 image/video library，通过 assets.search 的 cursor 公共搜索且无 total；“已加载 N”的旧 bounded 搜索语义已经后续合同覆盖，不能强迫当前全库选择器伪造库存总数。

但没有读到删除无素材上传导航的明确后续确认。T1101/1117 的素材画面改版强调保留搜索/筛选/空态/原动作，仅去可见文件名和规格，不能据此推断上传入口允许消失。因此本次仅准入以上三类 selector 校准；原 T994 空态计数/上传导航用例继续保留失败与证据，上传可达性另登记精确产品缺口。不把“这里还没有可选素材/导入素材后可在这里选择”两段普通文字替换成原上传入口断言来宣称通过。

## 保留的验证边界

所有原预览 naturalWidth/video readyState、保存、刷新/重开、组隔离、版本、计数、真实 0、精确 file/checksum、取消无写入、生成锁和模拟任务回执声明均保留；不修改产品、skip、guard、基线、业务 ID 或模型边界。原“＋ 图片生成/＋ 视频生成”在当前 editor 仍存在，无证据支持顺带改成其它按钮名。

T1208 timeout0/expect120000 只用于诊断测试观察，原网络/数据库隔离与显式更长预算保持，不改变产品执行期限。实际浏览器复测须逐例留图和公共结果，不把类型通过或 selector 源码一致签成全 E2E/全局 GREEN。
