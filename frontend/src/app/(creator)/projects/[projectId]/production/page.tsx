/**
 * [T-076] 拍摄阶段退役(SPEC 2026-07-03 §1/§5):production 前端全删,
 * 遗留路由 301 落稿面(收藏/历史深链不 404)。后端 production 模块与 ops
 * 保留(gate-F3 契约零删除),将来「拍摄/生成」阶段回归时复用。
 */

import { redirect } from "next/navigation";

export default async function LegacyStageRedirect({
  params,
}: {
  readonly params: Promise<{ readonly projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}`);
}
