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

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CreatorProfileResource } from "@/server/modules/positioning";

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on
// success it calls router.refresh() so the server re-reads the persisted rows.
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
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
}

export function PositioningProfileForm({
  profile,
  ctaLabel,
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
    run(() =>
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

export function PositioningStatementForm() {
  const { pending, run } = useMutation();
  const [oneLiner, setOneLiner] = React.useState("");
  const [kw0, setKw0] = React.useState("");
  const [kw1, setKw1] = React.useState("");
  const [kw2, setKw2] = React.useState("");
  const [anchors, setAnchors] = React.useState("");

  const keywordsValid =
    kw0.trim().length > 0 && kw1.trim().length > 0 && kw2.trim().length > 0;

  function submit() {
    if (!keywordsValid || oneLiner.trim().length === 0) return;
    run(() =>
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
