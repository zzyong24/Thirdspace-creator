"use client";

import * as React from "react";
import { client } from "@/lib/contract-client";
import { useDraftChatRequest } from "./draft-chat-request";

const actions = [
  ["判断这条值不值得做", "判断这条为什么值得做：具体观众在什么处境下会在意、看完获得什么、哪些依据真实可用。尊重我已选的内容目的。"],
  ["检查哪里留不住人", "检查当前稿哪里留不住人，关注开头承诺、信息推进和观众收益；指出具体句段。"],
  ["把证据讲清楚", "检查主张与证据是否对应，区分真实材料与待验证假设；缺证据时缩小承诺或建议可拍的演示，不编造客户成果。"],
] as const;

/** 当前稿诊断：保存成功后重新读服务端锚点，不用页面加载时的版本。 */
export function ContentDirectionActions({ projectId, projectTitle }: {
  projectId: string; projectTitle: string;
}) {
  const { flushSaveStrict, openChat } = useDraftChatRequest();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const diagnose = async (prompt: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await flushSaveStrict();
      const anchor = await Promise.race([
        (async () => {
          const listed = await client.listArtifacts({ params: { projectId }, query: { page: 1, pageSize: 200 }, body: undefined });
          const artifacts = (Array.isArray(listed) ? listed : []) as Array<{ id: string; stage: string; artifactType: string }>;
          const scripts = artifacts.filter(a => a.stage === "script");
          const script = scripts.find(a => a.artifactType === "output_script") ?? scripts.find(a => a.artifactType === "master_script");
          if (!script) throw new Error("当前还没有已保存的稿件，请先写稿。");
          const latest = await client.getArtifact({ params: { artifactId: script.id }, query: undefined, body: undefined });
          if (latest.projectId !== projectId || !latest.currentVersionId) throw new Error("未能确认当前稿件版本，请稍后重试。");
          return latest;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("读取当前稿件超时，本次未发送诊断，请重试。")), 10000); }),
      ]);
      if (!alive.current) return;
      openChat({
        autoSend: true,
        selection: { kind: "project", id: projectId, title: projectTitle, artifactId: anchor.id, versionId: anchor.currentVersionId },
        prefill: `${prompt}\n先读取项目 ${projectId} 的稿件 ${anchor.id}、版本 ${anchor.currentVersionId}，结合账号定位和已有材料判断。本次先做内容诊断，不要自动调用改稿或采纳工具；只有我明确要求修改时再给局部候选。默认只指出最重要的 1–3 个问题；没有明确问题就说明理由，不凑数。修改只交付局部候选，用户采纳后才写入，保留范围外文字；不是合规审核，也不阻断创作或发布。`,
      });
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "保存或读取失败，本次未发送诊断。稿面内容保留，请重试。");
    } finally {
      clearTimeout(timer);
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return <section aria-label="内容判断" className="mt-3 rounded-card border border-border bg-surface px-3.5 py-3">
    <p className="text-[13px] font-semibold">让编导看内容</p>
    <p className="mt-1 text-xs text-text-subtle">结合当前稿和已有资料判断，修改建议由你采纳。</p>
    <div className="mt-2 flex flex-wrap gap-2">{actions.map(([label, prompt]) => <button key={label} type="button" disabled={busy} onClick={() => void diagnose(prompt)} className="rounded-control border border-border px-2.5 py-1.5 text-xs hover:bg-brand-soft disabled:opacity-50">{label}</button>)}</div>
    {busy ? <p role="status" className="mt-2 text-xs">正在保存并读取当前稿…</p> : null}
    {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error} 可再次点击上方按钮重试。</p> : null}
  </section>;
}
