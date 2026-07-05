/**
 * `/experience` route(T-118c · 经验归位 SPEC §C)。
 *
 * 经验模块彻底退役:已验证经验并入 `/knowledge` 作只读一等类型(T-118b),经验
 * 裁决(采纳/翻案)迁进复盘页(T-118a)。`/knowledge` 已从双 Tab 收敛为单一
 * 知识库视图,不再有经验 Tab。保留本路由只做 **服务端重定向** 到 `/knowledge`
 * (去掉旧的 `?tab=experience` —— Tab 已退役),防旧链接/书签失效。
 *
 * `redirect()` 在 Server Component 里发 307(GET 保持),旧路由不再渲染经验页。
 */

import { redirect } from "next/navigation";

export default function ExperienceRoute() {
  redirect("/knowledge");
}
