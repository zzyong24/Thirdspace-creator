"use client";

/**
 * `positioning-interactive-region.tsx` — Client islands for the 定位中心 page.
 *
 * Two needs-backend forms (SPEC §3.4 / plan Task 5.3-5.4):
 *  - `PositioningProfileForm` (编辑账号画像) → `client.upsertProfile({ body })`
 *    then `router.refresh()` so the server re-reads the seeded repo.
 *  - `PositioningStatementForm` (保存新版本定位) → `client.createStatement({ body })`;
 *    on success a NEW immutable version row appears in the 历史版本 timeline
 *    (append-only — the prior 版本保留). `router.refresh()`.
 *
 * Determinism (C-5): every visible value comes from props or controlled local
 * state seeded from props; no Date.now / Math.random / fetch in the render. The
 * mutation seam mirrors settings/project-overview islands.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { PencilLine, Plus } from "lucide-react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CreatorProfileResource } from "@/server/modules/positioning";

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on
// success it calls router.refresh() so the server re-reads the persisted rows,
// then an optional onSuccess (e.g. close the draft drawer).
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, onSuccess?: () => void) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
          onSuccess?.();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

export interface PositioningProfileFormProps {
  readonly profile: CreatorProfileResource | null;
  readonly ctaLabel: string;
  /** Optional — called after a successful save (e.g. close the draft drawer). */
  readonly onSuccess?: () => void;
}

export function PositioningProfileForm({
  profile,
  ctaLabel,
  onSuccess,
}: PositioningProfileFormProps) {
  const { pending, run } = useMutation();
  const [persona, setPersona] = React.useState(profile?.persona ?? "");
  const [field, setField] = React.useState(profile?.field ?? "");
  const [audience, setAudience] = React.useState(profile?.audience ?? "");
  const [differentiation, setDifferentiation] = React.useState(
    profile?.differentiation ?? "",
  );
  const [capabilities, setCapabilities] = React.useState(
    (profile?.capabilities ?? []).join("、"),
  );

  function submit() {
    run(
      () =>
        client.upsertProfile({
          params: undefined,
          query: undefined,
          body: {
            persona,
            field,
            audience,
            differentiation,
            capabilities: capabilities
              .split(/[、,，]/)
              .map((c) => c.trim())
              .filter((c) => c.length > 0),
          },
        }),
      onSuccess,
    );
  }

  return (
    <form
      data-testid="positioning-profile-form"
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="人设"
        placeholder="人设（我是谁）"
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
      />
      <Input
        aria-label="领域"
        placeholder="领域/赛道"
        value={field}
        onChange={(e) => setField(e.target.value)}
      />
      <Input
        aria-label="目标人群"
        placeholder="目标人群"
        value={audience}
        onChange={(e) => setAudience(e.target.value)}
      />
      <Input
        aria-label="差异化"
        placeholder="差异化"
        value={differentiation}
        onChange={(e) => setDifferentiation(e.target.value)}
      />
      <Input
        aria-label="能力清单"
        placeholder="能力清单（用、分隔）"
        value={capabilities}
        onChange={(e) => setCapabilities(e.target.value)}
      />
      <Button type="submit" disabled={pending} className="self-start">
        {ctaLabel}
      </Button>
    </form>
  );
}

export interface PositioningStatementSeed {
  readonly oneLiner: string;
  readonly keywords: readonly string[];
  readonly productAnchorIds: readonly string[];
}

export interface PositioningStatementFormProps {
  /** Pre-fill (复制为草稿 from a history row). Defaults to a blank form. */
  readonly seed?: PositioningStatementSeed;
  /** Optional — called after a successful save (e.g. close the draft drawer). */
  readonly onSuccess?: () => void;
}

export function PositioningStatementForm({
  seed,
  onSuccess,
}: PositioningStatementFormProps = {}) {
  const { pending, run } = useMutation();
  const [oneLiner, setOneLiner] = React.useState(seed?.oneLiner ?? "");
  const [kw0, setKw0] = React.useState(seed?.keywords?.[0] ?? "");
  const [kw1, setKw1] = React.useState(seed?.keywords?.[1] ?? "");
  const [kw2, setKw2] = React.useState(seed?.keywords?.[2] ?? "");
  const [anchors, setAnchors] = React.useState(
    (seed?.productAnchorIds ?? []).join("、"),
  );

  const keywordsValid =
    kw0.trim().length > 0 && kw1.trim().length > 0 && kw2.trim().length > 0;

  function submit() {
    if (!keywordsValid || oneLiner.trim().length === 0) return;
    run(
      () =>
        client.createStatement({
          params: undefined,
          query: undefined,
          body: {
            oneLiner: oneLiner.trim(),
            keywords: [kw0.trim(), kw1.trim(), kw2.trim()],
            productAnchorIds: anchors
              .split(/[、,，\s]+/)
              .map((a) => a.trim())
              .filter((a) => a.length > 0),
          },
        }),
      onSuccess,
    );
  }

  return (
    <form
      data-testid="positioning-statement-form"
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="一句话定位"
        placeholder="一句话定位（我是谁 + 帮谁 + 解决什么 + 怎么表达）"
        value={oneLiner}
        onChange={(e) => setOneLiner(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <Input
          aria-label="关键词 1"
          placeholder="关键词 1"
          value={kw0}
          onChange={(e) => setKw0(e.target.value)}
        />
        <Input
          aria-label="关键词 2"
          placeholder="关键词 2"
          value={kw1}
          onChange={(e) => setKw1(e.target.value)}
        />
        <Input
          aria-label="关键词 3"
          placeholder="关键词 3"
          value={kw2}
          onChange={(e) => setKw2(e.target.value)}
        />
      </div>
      <Input
        aria-label="产品锚"
        placeholder="产品锚 id（可选，用、分隔）"
        value={anchors}
        onChange={(e) => setAnchors(e.target.value)}
      />
      <Button
        type="submit"
        disabled={pending || !keywordsValid || oneLiner.trim().length === 0}
        className="self-start"
      >
        保存新版本定位
      </Button>
    </form>
  );
}

export interface PositioningDraftDrawerProps {
  /** Current profile (pre-fills 账号画像 inside the drawer). */
  readonly profile: CreatorProfileResource | null;
  /** Trigger button label, e.g. 「+ 新建定位版本」/「编辑」/「复制为草稿」. */
  readonly triggerLabel: string;
  /** Trigger button visual: default (页头主按钮) | outline (英雄区/历史行). */
  readonly triggerVariant?: "default" | "outline";
  readonly triggerSize?: "default" | "sm";
  /** Show a + / pencil icon on the trigger. */
  readonly triggerIcon?: "plus" | "pencil" | "none";
  /** Drawer title + subtitle. */
  readonly title: string;
  readonly description: string;
  /** Pre-fill the statement form (复制为草稿 from a history row). */
  readonly statementSeed?: PositioningStatementSeed;
}

/**
 * `PositioningDraftDrawer` — the 「新建定位版本 / 编辑 / 复制为草稿」 entry. A Sheet that
 * houses the two REAL needs-backend forms (账号画像 → upsertProfile, 新版本定位 →
 * createStatement) so the 9-field forms no longer live permanently on the page. A
 * successful save closes the drawer; the form's own router.refresh() re-reads the
 * page. The drawer body remounts per-open (keyed on `open`) so a 复制为草稿 seed
 * always re-seeds a fresh form.
 */
export function PositioningDraftDrawer({
  profile,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "default",
  triggerIcon = "plus",
  title,
  description,
  statementSeed,
}: PositioningDraftDrawerProps) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const Icon = triggerIcon === "pencil" ? PencilLine : Plus;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          data-testid="positioning-draft-trigger"
        >
          {triggerIcon !== "none" ? <Icon /> : null}
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="positioning-draft-drawer"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {open ? (
          <div key={String(open)} className="flex flex-col gap-5 px-4 pb-4">
            <section className="flex flex-col gap-2">
              <h3 className="text-[13px] font-medium text-foreground">
                账号画像
              </h3>
              <p className="text-xs text-muted-foreground">
                我是谁 / 领域 / 目标人群 / 差异化 / 能力——下游 AI 会以此为约束源。
              </p>
              <PositioningProfileForm
                profile={profile}
                ctaLabel={profile ? "保存账号画像" : "创建定位"}
                onSuccess={close}
              />
            </section>
            <div className="h-px bg-border" />
            <section className="flex flex-col gap-2">
              <h3 className="text-[13px] font-medium text-foreground">
                新版本定位
              </h3>
              <p className="text-xs text-muted-foreground">
                一句话定位 + 3 个关键词。保存即追加一条不可变版本。
              </p>
              <PositioningStatementForm seed={statementSeed} onSuccess={close} />
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
