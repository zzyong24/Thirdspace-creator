/**
 * `/experience` route(T-113 · IA 收敛 SPEC §B)。
 *
 * 知识库 + 经验沉淀合并为 `/knowledge` 双 Tab 后,经验独立入口退役。保留本路由
 * 只做 **服务端重定向** 到 `/knowledge?tab=experience`,防旧链接/书签/复盘页
 * 引导失效(复盘页对经验的 `learnings.list` **数据**读取不受影响,只有指向
 * `/experience` 的**跳转链接**改指向 `/knowledge?tab=experience`)。
 *
 * `redirect()` 在 Server Component 里发 307(GET 保持),旧路由不再渲染经验页。
 */

import { redirect } from "next/navigation";

export default function ExperienceRoute() {
  redirect("/knowledge?tab=experience");
}
