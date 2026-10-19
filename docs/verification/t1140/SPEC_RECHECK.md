# T-1140 正式 SPEC 独立复核

- 复核时间：2026-10-09T16:29:17Z
- 结论：**PASS**
- review kind：`recheck`
- 首轮正式收据：`CONCERNS[REV:5242edcffc5c]`
- 当前 SPEC SHA256：`145c2bded5d85748f30f468c7dbe202f4c42e6000e412be5b72db9178e086408`
- 当前 modules SHA256：`e554d1d3eb1d8df6264c309104b24c65176e94cfb423823176a74af9b199ed96`
- constitution SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`

## REV-001 已销账：正式模块边界完整

当前 `modules.config.json` 已新增 T-1140：

- `depends_on` 明确为 T-1136，避免在其 watched AssetPicker 仍冻结验收时并行修改；
- 产品写集只有 `frontend/src/components/media/asset-picker.tsx`；
- E2E、`docs/verification/t1140/**`、SPEC/review 与必要控制路径逐项纳入，runner 由验证目录 glob 覆盖；
- read set 覆盖现有 AssetPicker、MediaPreview、source hook、Canvas 消费者、宿主最小窗口和 UI 规范；
- 11 条实现验证命令包含真实 Chrome、原 AssetPicker/source/media、LED-047 八文件、frontend type、boundary、semantic、orphan、timeout、diff、pmem 与完整 reconcile；测试保持 retry 0、120 秒 test/hook 预算。

这满足首轮 finding 的机械约束，没有增加第二条产品路径。

## REV-002 已销账：正式低高度边界纳入验收

当前 SPEC 新增 512×340，它明确来自原生最小窗口 1024×680 的 200% 等效空间，且不冒称原生 zoom。验证同时保留 1366×900、1024×680、683×450、390×900、390×450。

方案也修正了 340 高度下的空间竞争：当宽度小于640或高度不超过480时，搜索/筛选、图库和预览进入唯一正文主滚动区；只固定标题与底部动作。用户可滚回筛选，并在滚动后看完整 `object-contain` 预览。这样比首轮建议中固定筛选更符合项目“一表面一个主滚动区”的规范，同时仍闭合原 finding 要求的预览可达、footer 不遮挡和键盘可操作。

正常高度维持图库/预览独立职责；683 仍按 `sm` 双列验收初屏完整；512/390 以单滚动区验证完整缩略图和候选预览。gallery、身份/错误、无预览合法选择、精确 file/owner、确认与取消行为均未扩张。

## 边界

- 当前 AssetPicker 仍为原 SHA `ab1b7323dc1947c6352b0ead2a0e2747b9d371406c30a641b4fbceaf831c04f3`，T1136 的其余 6 条 watched path 也保持冻结字节；没有实施或运行 T1140 测试。
- T1140 仍必须等待 T1136 完成后才可 start/修改产品。
- 本 PASS 只销账首轮两个 finding，并允许后续实施；不代签 RED/GREEN、视觉、full reconcile、安装、模型、平台或全功能。

没有新增 finding。
