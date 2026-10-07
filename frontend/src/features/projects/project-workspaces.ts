/** 工作面是并列导航，形式以属主校验后的真实作品列表为准。 */
export function projectWorkspaceId(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[2] === "outputs") return parts[4] === "image" ? "image" : "script";
  if (parts[2] === "moments") return "work";
  if (["work", "image", "article", "production", "review"].includes(parts[2] ?? "")) return parts[2]!;
  return "script";
}
export type WorkspaceOutput = {readonly id: string; readonly contentType: string};

export function projectWorkspaces(projectId: string, pathname: string, outputs: readonly WorkspaceOutput[] | null = null, selectedVideoId?:string|null) {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const active = projectWorkspaceId(pathname);
  const currentOutputId = pathname.split("/").filter(Boolean)[3];
  const pick = (type: string) => outputs?.find(output => output.contentType === type && output.id === currentOutputId)
    ?? outputs?.find(output => output.contentType === type);
  const article = pick("article");
  const image = pick("image");
  const video = (selectedVideoId?outputs?.find(output=>output.id===selectedVideoId&&output.contentType==="video"):undefined)??pick("video");
  // 明确读到无 output 的旧项目仍沿原稿面和制作链；读失败不伪装成多形式项目。
  const legacyVideo = outputs !== null && outputs.length === 0;
  const visible = (id: string, hasOutput: boolean) => hasOutput || (outputs === null && active === id);
  const tabs = [
    {id: "script", label: "脚本", href: base},
    ...(visible("article", Boolean(article)) ? [{id: "article", label: "文章", href: article ? `${base}/article?outputId=${encodeURIComponent(article.id)}` : `${base}/article`}] : []),
    ...(visible("image", Boolean(image)) ? [{id: "image", label: "图文", href: image ? `${base}/outputs/${encodeURIComponent(image.id)}/image` : `${base}/image`}] : []),
    ...(visible("production", Boolean(video) || legacyVideo) ? [{id: "production", label: "制作视频", href: video ? `${base}/production?outputId=${encodeURIComponent(video.id)}` : `${base}/production`}] : []),
    {id: "review", label: "复盘", href: `${base}/review`},
  ];
  return tabs.map(item => ({...item, status: item.id === active ? "in_progress" as const : "pending" as const}));
}
