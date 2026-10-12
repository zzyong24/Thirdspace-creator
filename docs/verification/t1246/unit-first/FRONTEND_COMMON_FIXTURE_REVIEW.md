# 前端首轮共同fixture前置只读复核

原559/5078回执保留：38文件/158断言FAIL，1未处理拒绝，不以根因明确代签下游。冻结533224f，精确源码SHA见frontend-common-fixture-source-binding.json；没有编辑产品/测试或复跑。

**缺Reporting端口13例**：真实first JSON中check-update-card.test.tsx全部8、identity-section.test.tsx全部5失败均TypeError client.getReportingStatus不是函数。reporting-consent-card.tsx:18在挂载useEffect调用该已注册端口，两个fixture module mock只给旧保存/登录方法，遗漏端口；同目录settings-page/settings-interactive-region/reporting-consent-card现mock有公开DTO。最小写集仅两个原test：补符合实际response的已禁用/空队列/无secret公开reporting DTO，不绕生产组件或捕空返回，保每个更新与身份下游assert。未到下游的13例不能算更新/身份产品行为已验证，也不是本轮模型网络或App失败。

**NoteRelay旧owner缺projectId4例**：first JSON四例均“作品归属缺失”，失败在共同host工厂，尚未到MarkdownDOM/图片/页序/HTML或PNG导出。原fixture owner仅accountId/outputId/sourceVersionId；原native.ts:12需groupId/accountId/projectId/outputId/sourceVersionId，:20明确projectId和输出/源版本，以及至少一个workspace轴。现fixture虽有合法account轴，真正缺的是projectId，不能仅猜为groupId缺失。最小test写集一文件host() owner补同原输入一致projectId与明确groupId:null；保历史account兼容，不删生产owner核验或伪造group权限。合同来源与公共bridge实际owner赋值仍待主线程独评最终确认，修复后原四例完整复验。其第四例像素捕获明确fixture，不是原生App或真实PNG质量验证。

**未处理拒绝**：frontend原log另外1件Cannot update an unmounted root，settings-interactive-region.test.tsx:303把router.refresh的once实现绑定旧tree.rerender，原log定位后续自动保存用例时触发，详frontend-unhandled-first.txt。需在同一旧测试文件修fixture生命周期：每例clear/reset迟到mock、原fixture偏好GET/ready真实等待与owned async清理；不删除生产refresh、不以ignoreUnhandledErrors消除红。未签每个52失败同源；逐例原stack与合同仍必须核。
