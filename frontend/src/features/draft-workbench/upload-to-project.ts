/**
 * 共用上传链(T-146 抽取):把一个文件上传到「当前项目」的弹药库。
 *
 * 原本这套 createUpload → PUT uploadUrl → completeUpload → materialLinks →
 * 确定性标签 → fire-and-forget AI 归类/文档抽取 的流程内联在 `ammo-dump-zone.tsx`
 * 的 `uploadOne` 里。T-146 要在稿面「写之前先备料」CTA 加「＋上传素材」按钮(PR/接商单
 * 场景:上传自己的 PDF/Word/MD 资料进当前项目弹药库),两处走同一条链——故抽成本模块,
 * AmmoDumpZone 与 CreationFlowCtas 共用,不重造上传逻辑。
 *
 * 与 AmmoDumpZone.uploadOne 语义完全一致:
 *   - assetType/tags 走 classifyFile(确定性归类);
 *   - uploadUrl 以 `mock://` 开头则跳过 PUT(测试/mock transport);
 *   - complete 后挂 materialLink(role=reference, stage=script)到本项目;
 *   - 标签 best-effort(失败不阻断);
 *   - asset.classify 排队(未配视觉模型 runner 诚实跳过);
 *   - document 额外触发 material.extract(抽全文 + AI 要点卡,T-146 后端已做)。
 */

import { client } from "@/lib/contract-client";
import { classifyFile } from "./classify-asset";
import { assignTagsBestEffort } from "./ammo-dump-zone";

export async function uploadFileToProject(
  projectId: string,
  file: File,
): Promise<{ assetId: string } | null> {
  const mimeType = file.type || "application/octet-stream";
  const { assetType, tags } = classifyFile(file.name, mimeType);
  const upload = (await client.createUpload({
    params: undefined,
    query: undefined,
    body: {
      assetType,
      mimeType,
      fileSize: Math.max(1, file.size),
      projectId,
      fileName: file.name,
    },
  })) as unknown as { uploadId: string; uploadUrl: string };
  if (!upload.uploadUrl.startsWith("mock://")) {
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "content-type": mimeType },
      body: file,
    });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  }
  const asset = (await client.completeUpload({
    params: { uploadId: upload.uploadId },
    query: undefined,
    body: { name: file.name },
  })) as unknown as { id: string };
  if (!asset?.id) return null;
  await client.createMaterialLink({
    params: undefined,
    query: undefined,
    body: {
      projectId,
      entityType: "asset",
      entityId: asset.id,
      role: "reference",
      stage: "script",
    },
  });
  await assignTagsBestEffort(asset.id, tags);
  // AI 归类排队慢跑(未配视觉模型 → runner 诚实跳过)。
  void client
    .createAITask({
      params: undefined,
      query: undefined,
      body: { taskType: "asset.classify", inputData: { assetId: asset.id } },
    })
    .catch(() => undefined);
  // [T-146] document 上传完成 → fire-and-forget 文档抽取(抽全文 + AI 要点卡)。
  // 只对 document 触发;fileName 传给 runner 做 mimeType 分派兜底(File.type 常为空)。
  if (assetType === "document") {
    void client
      .createAITask({
        params: undefined,
        query: undefined,
        body: {
          taskType: "material.extract",
          inputData: { assetId: asset.id, fileName: file.name },
        },
      })
      .catch(() => undefined);
  }
  return { assetId: asset.id };
}
