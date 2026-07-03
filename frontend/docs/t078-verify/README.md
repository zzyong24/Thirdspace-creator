# T-078 作品封面抓取与展示 — 真机验收

日期:2026-07-03

## 链路

1. 采集:任务中心「每天抓取主页数据」(self.metrics)runNow → refreshDouyin 指标落库后,
   对缺 coverAssetId 的已发布抖音 publication 逐条:iesdouyin 分享页(T-038 限流网关
   iesdouyin channel,minInterval 9s)→ `video.cover.url_list[0]` → 带 Referer 下载真字节 →
   `assetsService.createGeneratedAsset`(image asset)→ `publishingService.setCover`
   (append-only 新 revision 带 coverAssetId,置 current)。
2. 幂等:候选集(listPublicationsMissingCover)只含缺封面作品;当前 revision 已有封面
   (含用户手选)绝不覆盖。
3. 降级:单作品失败记日志继续(真机实测 2 条 item_list 为空的作品被诚实跳过,整批不受影响);
   整批失败不影响指标 run(仍 succeeded)。
4. 展示:发布中心列表 / 项目列表行 / 稿面发布包区,经 CoverThumb(共享
   resolveAssetPreviewUrl 签名 URL 缓存)渲真封面,无封面回原渐变/文字占位。

## 真机结果(2026-07-03 08:59 触发 runNow,一轮进行中)

- DB 实证(浏览器会话 dispatch 遍历 projects→outputs→publications→revisions):
  **73 条已发布 publication,回填进行中时点计数 11 条 current revision 带 coverAssetId**
  (与磁盘 `~/CreatorOS/media/image/uploads/` 下 11 个真 WebP 封面一一对应,
  1920×1080,40–48KB/张;截稿时已到 12 张,后续按限流节奏继续,剩余作品由下轮
  「拉指标」幂等续填)。
- 单作品降级实证:`[douyin-cover-backfill] 作品 7655201886019218161 / 7647363103269737073
  封面回填失败: item_list 为空` —— 记 failed 继续,未拖垮整批。
- 浏览器 console 0 error;封面 <img> 全部 `complete && naturalWidth>0`。

## 截图(1440 宽)

- `publishing-center-covers.png` — 发布中心列表:已回填行渲真封面,其余保持渐变占位。
- `projects-covers.png` — 项目列表:已发布导入作品(俩小时小程序/越喂越笨/22个逐字稿)
  渲真封面;站内未发布项目(ClaudeCode封号/Minimax评测)保持渐变占位(正确)。
- `draft-publish-pack-cover.png` — 稿面发布包区:原「封面待生成」位渲出真封面。

## 测试

- backend `publishing.service.test.ts` +5 例(候选集/幂等/append-only 复制字段/过滤/归属校验),全模块 41 绿。
- frontend `douyin-cover-backfill.test.ts` 10 例(回填/跳过/单作品降级/limit/下载头与失败分类)。
- frontend `cover-thumb.test.tsx` 4 例(真图/无封面/换 URL 失败/onError 降级)。
- `tsc --noEmit` frontend+backend 0 错;frontend 全量 1167 绿;backend 全量 793 绿;contract 99 绿。
