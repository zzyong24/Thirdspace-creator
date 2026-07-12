import type { ProjectStageName } from "@/types/domain";

// [T-049 B1/B2] 项目工作台链接的**单一生成器** —— 审计逮到的两个 high bug 的修复点:
//   B1 旧实现剥 `project-` 前缀当 slug:真实项目 id 是 `project-<uuid>`,剥前缀后阶段页
//      解析不回(resolveProjectIdParam 拿 `<uuid>` 匹配不到任何项目)→ 打开即身份丢失;
//      恰好只有 fixture 项目(dy-proj-*/别名特例)能打开,真实项目全军覆没。修:恒用完整 id。
//   B2 brief 阶段无独立子路由(立项工作台挂在项目总览 `/projects/[id]` 上),旧实现对
//      brief 直拼 `/projects/x/brief` → 404(新建项目默认 stage=brief,必踩)。修:brief 落总览。
// 全部「进入工作台/查看复盘」类 href 一律走这里,不许再各自拼串。
export function projectWorkspaceHref(
  projectId: string,
  stage: ProjectStageName,
): string {
  // [T-076] 项目两阶段化(SPEC 2026-07-03):review → 复盘页;其余一律 → 稿面
  // (选题/脚本/素材/发布动作全部发生在稿面;research/planning 不再有独立工作台,
  // 遗留路由 301 落稿面)。
  // [T-254c] production「制作视频」页复活(SPEC 2026-07-11 §3.3)→ 指回自己的子路由。
  if (stage === "review") {
    return `/projects/${projectId}/review`;
  }
  if (stage === "production") {
    return `/projects/${projectId}/production`;
  }
  return `/projects/${projectId}`;
}
