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
  _stage: ProjectStageName,
): string {
  // [T-057①] 打开项目一律进稿面工作台(T-055 稿面 = 项目的单一主视图)。
  // 旧行为按 currentStage 跳阶段页 —— review/production 是保留独立页,导入作品
  // (全是 review)点开直落老复盘壳,绕过了稿面;复盘/制作改从稿面顶条进。
  return `/projects/${projectId}`;
}
