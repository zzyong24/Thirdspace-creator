"use client";

/**
 * `monetization-center-interactive-region.tsx` — Client islands for the 变现/漏斗中心
 * page (七步⑦ · SPEC §4.7).
 *
 * needs-backend controls, each → its mapped contract op then `router.refresh()`:
 *  - `CreateProductForm` (新建产品) → `client.createProduct({ body })`.
 *  - `ProductRow` 退役 → `client.retireProduct`; 新增 Offer → `client.createOffer`
 *    (a NEW append-only offer, never mutates the old price, §4.2); 链接内容 →
 *    `client.linkOutputProduct` (意图层).
 *  - `RegisterLeadForm` (登记一条线索/成交) → `client.createLead` then, when a 成交
 *    amount is given, `client.createConversion` (§4.7 P0 手工登记).
 *  - `LeadStatusControl` (Lead 流转 new→qualified→won/lost) → `client.patchLead`.
 *
 * Determinism (C-5): every visible value comes from props or controlled local state
 * seeded from props; no Date.now / Math.random / fetch in render. The mutation seam
 * mirrors the positioning/settings islands. Client-local filters (status) issue NO
 * mutation.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ProductResource, LeadResource } from "@creatoros/backend/modules/monetization";

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on success
// it calls router.refresh() so the server re-reads the persisted rows.
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

export function CreateProductForm() {
  const { pending, run } = useMutation();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("");

  const valid = name.trim().length > 0 && kind.trim().length > 0;

  function submit() {
    if (!valid) return;
    run(() =>
      client.createProduct({
        params: undefined,
        query: undefined,
        body: { name: name.trim(), kind: kind.trim() },
      }),
    );
  }

  return (
    <form
      data-testid="create-product-form"
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="产品名称"
        placeholder="产品名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-[12rem]"
      />
      <Input
        aria-label="产品类型"
        placeholder="类型（自定义，如训练营/咨询）"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        className="max-w-[16rem]"
      />
      <Button type="submit" disabled={pending || !valid} className="self-start">
        新建产品
      </Button>
    </form>
  );
}

export function ProductRow({ product }: { readonly product: ProductResource }) {
  const { pending, run } = useMutation();
  const [price, setPrice] = React.useState("");
  const [outputId, setOutputId] = React.useState("");

  function retire() {
    run(() =>
      client.retireProduct({
        params: { productId: product.id },
        query: undefined,
        body: undefined,
      }),
    );
  }

  function addOffer() {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) return;
    run(() =>
      client.createOffer({
        params: { productId: product.id },
        query: undefined,
        body: { price: n },
      }),
    );
  }

  function linkOutput() {
    if (outputId.trim().length === 0) return;
    run(() =>
      client.linkOutputProduct({
        params: { outputId: outputId.trim() },
        query: undefined,
        body: { productId: product.id, contentRole: "conversion" },
      }),
    );
  }

  return (
    <li
      data-testid="product-row"
      data-product-id={product.id}
      data-status={product.status}
      className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="font-medium text-foreground">{product.name}</span>
          <Badge variant="secondary" className="text-[10px]">
            {product.kind}
          </Badge>
          {product.status === "retired" ? (
            <Badge variant="outline" className="text-[10px]">
              已退役
            </Badge>
          ) : null}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || product.status === "retired"}
          onClick={retire}
        >
          退役产品
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`新增 Offer 价格 ${product.name}`}
          placeholder="新价格（新增 Offer）"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="max-w-[10rem]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={addOffer}
        >
          新增 Offer
        </Button>
        <Input
          aria-label={`链接内容 ${product.name}`}
          placeholder="内容 id（意图层链接）"
          value={outputId}
          onChange={(e) => setOutputId(e.target.value)}
          className="max-w-[12rem]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={linkOutput}
        >
          链接内容
        </Button>
      </div>
    </li>
  );
}

export function RegisterLeadForm() {
  const { pending, run } = useMutation();
  const [attributedContentId, setAttributedContentId] = React.useState("");
  const [confidence, setConfidence] = React.useState("med");
  const [amount, setAmount] = React.useState("");

  function submit() {
    const attributed = attributedContentId.trim();
    const amt = Number(amount);
    const hasConversion = amount.trim().length > 0 && Number.isFinite(amt);
    run(async () => {
      const lead = (await client.createLead({
        params: undefined,
        query: undefined,
        body: {
          source: "manual",
          attributedContentId: attributed.length > 0 ? attributed : undefined,
          attributionConfidence:
            attributed.length > 0
              ? (confidence as "high" | "med" | "low")
              : undefined,
        },
      })) as { id: string };
      if (hasConversion) {
        await client.createConversion({
          params: { leadId: lead.id },
          query: undefined,
          body: { eventType: "purchase", value: amt },
        });
      }
    });
  }

  return (
    <form
      data-testid="register-lead-form"
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="关联内容"
        placeholder="关联内容 id（可空）"
        value={attributedContentId}
        onChange={(e) => setAttributedContentId(e.target.value)}
        className="max-w-[12rem]"
      />
      <select
        aria-label="归因置信度"
        value={confidence}
        onChange={(e) => setConfidence(e.target.value)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="high">高</option>
        <option value="med">中</option>
        <option value="low">低</option>
      </select>
      <Input
        aria-label="成交金额"
        placeholder="成交金额（可空）"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="max-w-[10rem]"
      />
      <Button type="submit" disabled={pending} className="self-start">
        登记线索/成交
      </Button>
    </form>
  );
}

const LEAD_STATUSES = ["new", "qualified", "won", "lost"] as const;

export function LeadStatusControl({ lead }: { readonly lead: LeadResource }) {
  const { pending, run } = useMutation();

  function onChange(status: string) {
    if (status === lead.status) return;
    run(() =>
      client.patchLead({
        params: { leadId: lead.id },
        query: undefined,
        body: { status: status as (typeof LEAD_STATUSES)[number] },
      }),
    );
  }

  return (
    <select
      aria-label={`线索状态 ${lead.id}`}
      data-testid="lead-status-control"
      value={lead.status}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
