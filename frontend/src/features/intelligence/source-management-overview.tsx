import { Activity, ArrowRight } from "lucide-react";
import { dateLabel, runStatusLabel, sourceTypeLabel } from "./intelligence-display";
import type { RadarWorkspace } from "./intelligence-workbench-types";
import styles from "./source-management.module.css";

export function SourceManagementOverview({ workspace, selectedSourceId, selectedCollectionId }: {
  readonly workspace: RadarWorkspace;
  readonly selectedSourceId: string | null;
  readonly selectedCollectionId: string | null;
}) {
  const source = workspace.sources.find(row => row.id === selectedSourceId);
  const collection = workspace.collections.find(row => row.id === selectedCollectionId);
  const sources = collection ? workspace.sources.filter(row => row.collectionId === collection.id || workspace.memberships.some(membership => membership.collectionId === collection.id && membership.sourceId === row.id)) : workspace.sources;
  const health = source ? workspace.health.find(row => row.sourceId === source.id) : null;
  const sourceStatus = { draft: "草稿", active: "启用", paused: "暂停", archived: "已归档" } as const;

  return <section className={styles.overview} aria-label="来源采集概览">
    <dl className={styles.metrics}>
      <div><dt>来源{collection ? "（当前分类）" : ""}</dt><dd>{sources.length}</dd></div>
      <div><dt>自动同步</dt><dd>{sources.filter(row => row.monitorEnabled && row.status === "active").length}</dd></div>
      <div><dt>采集受阻（全部）</dt><dd>{workspace.blockedCount}</dd></div>
    </dl>
    {source ? <div className={styles.sourceDetail}>
      <span className={styles.eyebrow}>来源详情</span><h3>{source.displayName}</h3>
      <dl className={styles.properties}>
        <div><dt>来源类型</dt><dd>{sourceTypeLabel(source.type)}</dd></div>
        <div><dt>来源状态</dt><dd>{sourceStatus[source.status]}</dd></div>
        <div><dt>最近运行</dt><dd>{runStatusLabel(health?.lastRunStatus ?? null)}</dd></div>
        <div><dt>上次同步</dt><dd>{source.lastRunAt ? dateLabel(source.lastRunAt) : "尚未同步"}</dd></div>
        <div><dt>自动同步</dt><dd>{source.monitorEnabled ? "已开启" : "已暂停"}</dd></div>
        <div><dt>下次运行</dt><dd>{source.nextRunAt ? dateLabel(source.nextRunAt) : "未安排"}</dd></div>
      </dl>
      {source.canonicalUrl ? <a href={source.canonicalUrl} target="_blank" rel="noreferrer" className={styles.original}>查看来源原链接 <ArrowRight size={15} aria-hidden="true"/></a> : null}
      {health?.lastErrorCode ? <p className={styles.warning}>采集遇到问题，请在来源行查看运行记录或重新连接。</p> : null}
    </div> : <div className={styles.guidance}>
      <Activity size={24} aria-hidden="true"/>
      <h3>{sources.length ? (collection?.name ?? "来源已就绪") : (collection ? `${collection.name}暂无来源` : "从添加一个来源开始")}</h3>
      <p>{sources.length ? "选择目录中的来源，查看同步状态与运行时间。" : "添加持续跟踪的来源，或粘贴链接导入单条作品。"}</p>
    </div>}
    <div className={styles.nextStep}><strong>采集后，再处理正文</strong><p>同步后的作品会进入内容列表；逐字稿需按需导入或转写，不会自动生成。</p></div>
  </section>;
}
