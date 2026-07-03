/**
 * [T-055a] 阶段页退役(SPEC §3.3):publishing 阶段的内容已并入稿面工作台,
 * 本路由 301 到稿面对应锚点。页面正文由 draft-workbench 承接。
 */

import { redirect } from "next/navigation";

export default async function LegacyStageRedirect({
  params,
}: {
  readonly params: Promise<{ readonly projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}#publish`);
}
