# SPEC 审核记录:web-session-vault-reader-design(T-217)

- **裁决**:✅ **PASS(可开工 T-217a→b→c)**
- **review_mode**:① cross-family(MiniMax-M2.7,`mmx text chat`,角色进 system、宪法+SPEC 进 message)
- **日期**:2026-07-11

## MiniMax verdict: PASS(0 findings)

> summary(原文):合宪。复用抖音采集已有的 persistentContext+auth 底座泛化至任意域名登录态保管,读正文取代截图默认路径,落逐字稿素材驱动选题飞轮,无 scope reduction,无硬造轮子。

findings: `[]`(空)。

## 结论

- **合定位**:读网页正文→蒸馏→选题弹药,直接服务编导选题飞轮(宪法 §编导对话化 + 选题弹药);登录态保管让「你自己能看到的内容」可读,不越权。
- **不造轮子**:全部复用抖音采集底座 —— `launchPersistentContext`(douyin-cdp.ts:794)、有头登录弹窗(:830)、headless 被动探针(:813)、web-capture.ts 三墙错误分类(:134)、createGeneratedAsset 素材落库(persistence-client.ts:3117/6709)、T-205 authDir 跨版本注入。断言均带 file:line。
- **无缩水**:通用 Readability + ChatGPT 定制 extractor 是用户显式拍板的覆盖面(增量加站点非砍需求);截图工具并存保留。
- **边界清晰**:只读用户主动指定的单页、不做批量爬虫、不碰凭据、自起隔离 Chromium(不连用户日常 Chrome)、`.auth/web/` 不进 git、cookie 不外传。

**可开工 T-217a(Web Session Vault)→ T-217b(Web Reader)→ T-217c(编导接线+prompt 修正)。**
