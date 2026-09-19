import React from 'react';
import { SectionCard } from '@/components/project/section-card';
import { TagChip } from '@/components/content/tag-chip';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { creatorIcons } from '@/lib/icons';
import { canonicalDataset } from '@/fixtures/canonical';

// ---------------------------------------------------------------------------
// CreatorOS 真实组件接入。演示数据一律来自 canonicalDataset fixture
// (fixed clock, 无随机/无网络),不冒充真实业绩。
// ---------------------------------------------------------------------------

// 侧栏一级导航(与 components/shell/sidebar.tsx PRIMARY_NAV 同序、同图标来源)。
const NAV_ITEMS = [
  ['dashboard', '首页'],
  ['positioning', '定位中心'],
  ['radar', '内容雷达'],
  ['topics', '选题'],
  ['projects', '项目'],
  ['knowledge', '知识库'],
  ['assets', '素材中心'],
  ['publishing', '发布中心'],
  ['operations', '运营分析'],
  ['automations', '自动化'],
  ['settings', '设置'],
];

const STAGE_LABELS = {
  research: '研究',
  planning: '策划',
  script: '脚本',
  production: '制作',
  publishing: '发布',
  review: '复盘',
};

function NavRail() {
  return (
    <div data-enter="0.15" className="grid grid-cols-3 gap-2.5">
      {NAV_ITEMS.map(([key, label]) => {
        const Icon = creatorIcons[key];
        return (
          <div
            key={key}
            className="flex items-center gap-2.5 rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function OverviewVisual() {
  return (
    <SectionCard
      title="CreatorOS 工作台"
      description="从定位到复盘，一个本地优先的编导工作区"
    >
      <NavRail />
      <div data-enter="0.45" className="mt-4 flex items-center gap-2 rounded-card border border-dashed border-border bg-surface-subtle px-4 py-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-brand">
          <creatorIcons.sparkles className="size-3.5" aria-hidden="true" />
        </span>
        <p className="text-[13px] text-muted-foreground">
          定位 → 选题 → 稿面 → 成片 → 发布 → 复盘，数据形成复利
        </p>
      </div>
    </SectionCard>
  );
}

function PositioningVisual() {
  return (
    <SectionCard title="账号定位" description="先搞清楚你在为谁、为什么做内容">
      <div data-enter="0.15" className="rounded-card bg-brand-soft/60 border border-brand/10 px-4 py-3.5">
        <p className="text-[15px] font-medium leading-relaxed text-foreground">
          面向中文口播 / 观点视频创作者，持续产出、让真实作品数据回流。
        </p>
      </div>
      <div data-enter="0.4" className="mt-3 flex flex-wrap gap-2">
        <TagChip label="口播观点" tone="brand" />
        <TagChip label="抖音优先" tone="info" />
        <TagChip label="数据复利" tone="success" />
      </div>
    </SectionCard>
  );
}

function TopicsVisual() {
  const p = canonicalDataset.projects[0];
  return (
    <SectionCard title="选题候选" description="评论、热点、对标、收藏，有依据地立项">
      <div data-enter="0.15" className="flex flex-col gap-2">
        {canonicalDataset.projects.slice(0, 3).map((proj) => (
          <div
            key={proj.id}
            className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-foreground">{proj.title}</p>
              <p className="truncate text-xs text-muted-foreground">{proj.brief}</p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {STAGE_LABELS[proj.currentStage] ?? proj.currentStage}
            </Badge>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ScriptVisual() {
  const p = canonicalDataset.projects[0];
  return (
    <SectionCard title="稿面" description="Brief、结构、脚本、审核，一个版本不漏">
      <div data-enter="0.15" className="rounded-card border border-border bg-surface px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">{p.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.brief}</p>
          </div>
          <Badge className="shrink-0">进行中</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <TagChip label="研究 ✓" tone="success" size="sm" />
          <TagChip label="策划 ✓" tone="success" size="sm" />
          <TagChip label="脚本 · 65%" tone="brand" size="sm" />
          <TagChip label="制作" tone="neutral" size="sm" />
        </div>
      </div>
      <div data-enter="0.4" className="mt-3 rounded-card border border-border bg-surface px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">AI 干重活，人做判断</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          AI 产候选与草稿，你编辑、确认、拒绝——每一步都可恢复、可追溯。
        </p>
      </div>
    </SectionCard>
  );
}

function ProductionVisual() {
  const p = canonicalDataset.projects[0];
  return (
    <SectionCard title="受控成片" description="不是通用剪辑器，是口播稿到成片的受控流水线">
      <div data-enter="0.15" className="rounded-card border border-border bg-surface px-4 py-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-medium text-foreground">分镜脚本 · 主视频</p>
          <Badge variant="outline">16:9 · 12 分钟</Badge>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <TagChip label="粗剪" tone="success" size="sm" />
          <TagChip label="字幕" tone="success" size="sm" />
          <TagChip label="B-roll" tone="success" size="sm" />
          <TagChip label="四决策" tone="brand" size="sm" />
        </div>
      </div>
      <div data-enter="0.4" className="mt-3 flex items-center justify-between rounded-card border border-border bg-surface-subtle px-4 py-3">
        <span className="text-[13px] text-muted-foreground">任务可恢复</span>
        <span className="text-[13px] font-medium text-brand">切页 / 刷新 / 重启不丢进度</span>
      </div>
    </SectionCard>
  );
}

function ReviewVisual() {
  const views = canonicalDataset.metricValues.find((m) => m.metricKey === 'views');
  const likes = canonicalDataset.metricValues.find((m) => m.metricKey === 'likes');
  const comments = canonicalDataset.metricValues.find((m) => m.metricKey === 'comments');
  return (
    <SectionCard title="复盘" description="发布前预测 vs 真实数据，偏差变成下一条的经验">
      <div data-enter="0.15" className="grid grid-cols-3 gap-2.5">
        {[
          ['播放', views?.numericValue, 'count'],
          ['点赞', likes?.numericValue, 'count'],
          ['评论', comments?.numericValue, 'count'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-border bg-surface px-3 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-[18px] font-semibold text-foreground">
              {Number(value).toLocaleString('zh-CN')}
            </p>
          </div>
        ))}
      </div>
      <div data-enter="0.4" className="mt-3 flex flex-col gap-2">
        {canonicalDataset.reviewInsights.slice(0, 2).map((ins) => (
          <div key={ins.id} className="flex items-start gap-2 rounded-card border border-border bg-surface px-3.5 py-2.5">
            <Badge variant={ins.insightType === 'success' ? 'secondary' : 'outline'} className="mt-0.5 shrink-0">
              {ins.insightType === 'success' ? '有效' : '待办'}
            </Badge>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{ins.title}</p>
              <p className="text-xs text-muted-foreground">{ins.description}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

const VISUALS = {
  overview: OverviewVisual,
  positioning: PositioningVisual,
  topics: TopicsVisual,
  script: ScriptVisual,
  production: ProductionVisual,
  review: ReviewVisual,
};

export function FeatureVisual({ shot }) {
  const Visual = VISUALS[shot.id];
  if (!Visual) return null;
  return <Visual />;
}
