"use client";

/**
 * `KnowledgeAtlas` — 观点地图分组卡墙(T-079c,SPEC
 * 2026-07-03-knowledge-asset-redesign §3)。
 *
 * 知识库页的默认视图:按 tag 主题聚类的分组卡墙,VM 由纯函数
 * `buildKnowledgeAtlas`(knowledge-atlas.ts)在服务端装配好传入,组件只渲染:
 *   - 组头 = 主题名 + 「观点 N · 证据 M」计数;
 *   - 知识卡 = type 中文徽章 + title 本体 + source_note 小字 + 战绩行
 *     (usedCount>0 显「被 N 条内容用过」;usedInPublished 加亮「⚡ 用于已发布」);
 *   - 「未归类」组固定渲在卡墙底部、**默认折叠**可展开[gate-F3];
 *   - 点卡片 → onSelectCard(id),父层(interactive-region)复用 T-062c 的
 *     KnowledgeDetailPreview 渲详情。
 *
 * 本组件唯一的本地状态是未归类组的折叠开关;其余全由 props 决定(确定性渲染)。
 */

import * as React from "react";

import { TagChip } from "@/components/content/tag-chip";
import type {
  AtlasCardVm,
  AtlasGroupVm,
  KnowledgeAtlasVm,
} from "./knowledge-atlas-vm";

export function KnowledgeAtlas({
  atlas,
  selectedId,
  onSelectCard,
}: {
  readonly atlas: KnowledgeAtlasVm;
  readonly selectedId: string | null;
  readonly onSelectCard: (id: string) => void;
}) {
  // [gate-F3] 未归类组默认折叠;点组头切换展开。
  const [unsortedOpen, setUnsortedOpen] = React.useState(false);

  const isEmpty = atlas.groups.length === 0 && atlas.unsorted === null;

  return (
    <section
      data-slot="knowledge-atlas"
      aria-label="观点地图"
      className="flex flex-col gap-card-gap"
    >
      {isEmpty ? (
        <p
          data-slot="knowledge-atlas-empty"
          className="rounded-md border border-border bg-surface-subtle px-3 py-4 text-center text-[12px] text-muted-foreground"
        >
          还没有可上墙的知识 —— 把材料倒进上方倾倒场,蒸馏出的观点会按主题聚在这里。
        </p>
      ) : null}

      {atlas.groups.map((group) => (
        <AtlasGroup
          key={group.key}
          group={group}
          selectedId={selectedId}
          onSelectCard={onSelectCard}
        />
      ))}

      {/* [gate-F3] 未归类组:固定卡墙底部,默认折叠可展开。 */}
      {atlas.unsorted ? (
        <div
          data-slot="knowledge-atlas-unsorted"
          data-open={unsortedOpen ? "true" : "false"}
          className="rounded-lg border border-dashed border-border bg-surface-subtle/50"
        >
          <button
            type="button"
            data-slot="knowledge-atlas-unsorted-toggle"
            aria-expanded={unsortedOpen}
            onClick={() => setUnsortedOpen((open) => !open)}
            className="flex w-full items-center justify-between px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium text-foreground">
                未归类
              </span>
              <GroupCounts group={atlas.unsorted} />
            </span>
            <span aria-hidden="true" className="text-[11px] text-muted-foreground">
              {unsortedOpen
                ? "收起 ▴"
                : `展开 ${atlas.unsorted.cards.length} 条 ▾`}
            </span>
          </button>
          {unsortedOpen ? (
            <div className="px-3 pb-3">
              <AtlasCardWall
                cards={atlas.unsorted.cards}
                selectedId={selectedId}
                onSelectCard={onSelectCard}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 主题组(组头 + 卡墙)
// ---------------------------------------------------------------------------

function AtlasGroup({
  group,
  selectedId,
  onSelectCard,
}: {
  readonly group: AtlasGroupVm;
  readonly selectedId: string | null;
  readonly onSelectCard: (id: string) => void;
}) {
  return (
    <div
      data-slot="knowledge-atlas-group"
      data-group-key={group.key}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline gap-2">
        <h3
          data-slot="knowledge-atlas-group-name"
          className="text-[13px] font-semibold text-foreground"
        >
          {group.name}
        </h3>
        <GroupCounts group={group} />
      </div>
      <AtlasCardWall
        cards={group.cards}
        selectedId={selectedId}
        onSelectCard={onSelectCard}
      />
    </div>
  );
}

/** 组头「观点 N · 证据 M」计数 —— 弹药足不足一眼可见(SPEC §3)。 */
function GroupCounts({ group }: { readonly group: AtlasGroupVm }) {
  return (
    <span
      data-slot="knowledge-atlas-group-counts"
      className="text-[11px] text-muted-foreground"
    >
      观点 {group.claimCount} · 证据 {group.evidenceCount}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 卡墙(响应式网格)+ 单卡
// ---------------------------------------------------------------------------

function AtlasCardWall({
  cards,
  selectedId,
  onSelectCard,
}: {
  readonly cards: ReadonlyArray<AtlasCardVm>;
  readonly selectedId: string | null;
  readonly onSelectCard: (id: string) => void;
}) {
  return (
    <ul
      data-slot="knowledge-atlas-card-wall"
      className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {cards.map((card) => (
        <li key={card.id}>
          <AtlasCard
            card={card}
            selected={card.id === selectedId}
            onSelect={() => onSelectCard(card.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function AtlasCard({
  card,
  selected,
  onSelect,
}: {
  readonly card: AtlasCardVm;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="knowledge-atlas-card"
      data-knowledge-id={card.id}
      data-knowledge-type={card.knowledgeType}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      onClick={onSelect}
      className={
        "flex h-full w-full flex-col items-start gap-1 rounded-md border px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
        (selected
          ? "border-brand bg-brand-soft/40"
          : "border-border bg-surface hover:bg-surface-subtle")
      }
    >
      <span className="flex items-center gap-1.5">
        <TagChip label={card.typeLabel} tone={card.typeTone} size="sm" />
      </span>
      <span className="text-[13px] leading-snug text-foreground">
        {card.title}
      </span>
      {card.sourceNote ? (
        <span
          data-slot="knowledge-atlas-card-source"
          className="text-[11px] leading-snug text-muted-foreground"
        >
          {card.sourceNote}
        </span>
      ) : null}
      {/* 战绩行:被用过才显(usedCount=0 不渲,诚实不凑行);用于已发布加亮。 */}
      {card.usedCount > 0 ? (
        <span
          data-slot="knowledge-atlas-card-stats"
          data-used-in-published={card.usedInPublished ? "true" : "false"}
          className={
            "text-[11px] font-medium " +
            (card.usedInPublished ? "text-brand" : "text-muted-foreground")
          }
        >
          被 {card.usedCount} 条内容用过
          {card.usedInPublished ? " · ⚡ 用于已发布" : ""}
        </span>
      ) : null}
    </button>
  );
}
