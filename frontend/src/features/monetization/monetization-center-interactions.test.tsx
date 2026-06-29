import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Monetization island wiring test (Step 5a). Proves the needs-backend controls each
// issue their mapped contract op then router.refresh() (the island → client.* →
// router.refresh seam). Also proves the funnel view ALWAYS renders the unattributed
// bucket (§4.5 诚实漏损) and that a client-local read carries no mutation. Deterministic
// — the mock client resolves immediately, no network/clock.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createProduct: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  retireProduct: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createOffer: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  linkOutputProduct: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createLead: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "lead-new" }),
  ),
  createConversion: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  patchLead: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createProduct: (i: unknown) => mockClient.createProduct(i),
    retireProduct: (i: unknown) => mockClient.retireProduct(i),
    createOffer: (i: unknown) => mockClient.createOffer(i),
    linkOutputProduct: (i: unknown) => mockClient.linkOutputProduct(i),
    createLead: (i: unknown) => mockClient.createLead(i),
    createConversion: (i: unknown) => mockClient.createConversion(i),
    patchLead: (i: unknown) => mockClient.patchLead(i),
  },
}));

import {
  CreateProductForm,
  ProductRow,
  RegisterLeadForm,
  LeadStatusControl,
} from "./monetization-center-interactive-region";
import { MonetizationCenterView } from "./monetization-center-page";
import type {
  ProductResource,
  LeadResource,
  MonetizationFunnelResource,
} from "@creatoros/backend/modules/monetization";

const PRODUCT: ProductResource = {
  id: "prod-1",
  userId: "user-a",
  name: "训练营",
  kind: "course",
  tier: null,
  deliveryWeight: null,
  targetPersona: null,
  status: "active",
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
};

const LEAD: LeadResource = {
  id: "lead-1",
  userId: "user-a",
  source: "manual",
  surveySource: null,
  attributedContentId: null,
  attributionMethod: null,
  attributionConfidence: null,
  status: "new",
  ingestionRunId: null,
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
};

const FUNNEL: MonetizationFunnelResource = {
  productId: null,
  periodStart: null,
  periodEnd: null,
  stages: [
    { stage: "lead", count: 3, contentOutputId: null },
    { stage: "purchase", count: 1, contentOutputId: null },
  ],
  revenueAttributed: 100,
  unattributed: { leadCount: 2, conversionCount: 1, revenue: 50 },
  unattributedRatio: 0.5,
};

beforeEach(() => {
  for (const fn of Object.values(mockClient)) fn.mockClear();
  mockRouter.refresh.mockClear();
});
afterEach(cleanup);

describe("CreateProductForm", () => {
  it("calls client.createProduct then router.refresh", async () => {
    render(<CreateProductForm />);
    fireEvent.change(screen.getByLabelText("产品名称"), {
      target: { value: "训练营" },
    });
    fireEvent.change(screen.getByLabelText("产品类型"), {
      target: { value: "course" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新建产品" }));
    await waitFor(() =>
      expect(mockClient.createProduct).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createProduct.mock.calls[0]![0] as {
      body: { name: string; kind: string };
    };
    expect(arg.body).toEqual({ name: "训练营", kind: "course" });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });
});

describe("ProductRow", () => {
  it("退役 calls client.retireProduct then router.refresh", async () => {
    render(<ProductRow product={PRODUCT} />);
    fireEvent.click(screen.getByRole("button", { name: "退役产品" }));
    await waitFor(() =>
      expect(mockClient.retireProduct).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.retireProduct.mock.calls[0]![0] as {
      params: { productId: string };
    };
    expect(arg.params.productId).toBe("prod-1");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("新增 Offer calls client.createOffer with the new price (never mutates old)", async () => {
    render(<ProductRow product={PRODUCT} />);
    fireEvent.change(screen.getByLabelText("新增 Offer 价格 训练营"), {
      target: { value: "149" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增 Offer" }));
    await waitFor(() => expect(mockClient.createOffer).toHaveBeenCalledTimes(1));
    const arg = mockClient.createOffer.mock.calls[0]![0] as {
      params: { productId: string };
      body: { price: number };
    };
    expect(arg.params.productId).toBe("prod-1");
    expect(arg.body.price).toBe(149);
  });

  it("链接内容 calls client.linkOutputProduct (意图层)", async () => {
    render(<ProductRow product={PRODUCT} />);
    fireEvent.change(screen.getByLabelText("链接内容 训练营"), {
      target: { value: "out-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "链接内容" }));
    await waitFor(() =>
      expect(mockClient.linkOutputProduct).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.linkOutputProduct.mock.calls[0]![0] as {
      params: { outputId: string };
      body: { productId: string };
    };
    expect(arg.params.outputId).toBe("out-1");
    expect(arg.body.productId).toBe("prod-1");
  });
});

describe("RegisterLeadForm", () => {
  it("登记线索+成交 calls createLead then createConversion then router.refresh", async () => {
    render(<RegisterLeadForm />);
    fireEvent.change(screen.getByLabelText("关联内容"), {
      target: { value: "out-1" },
    });
    fireEvent.change(screen.getByLabelText("成交金额"), {
      target: { value: "1999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记线索/成交" }));
    await waitFor(() => expect(mockClient.createLead).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockClient.createConversion).toHaveBeenCalledTimes(1),
    );
    const leadArg = mockClient.createLead.mock.calls[0]![0] as {
      body: { attributedContentId?: string; attributionConfidence?: string };
    };
    expect(leadArg.body.attributedContentId).toBe("out-1");
    const convArg = mockClient.createConversion.mock.calls[0]![0] as {
      params: { leadId: string };
      body: { eventType: string; value: number };
    };
    expect(convArg.params.leadId).toBe("lead-new");
    expect(convArg.body).toEqual({ eventType: "purchase", value: 1999 });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("登记线索 without 成交金额 calls createLead but NOT createConversion", async () => {
    render(<RegisterLeadForm />);
    fireEvent.click(screen.getByRole("button", { name: "登记线索/成交" }));
    await waitFor(() => expect(mockClient.createLead).toHaveBeenCalledTimes(1));
    expect(mockClient.createConversion).not.toHaveBeenCalled();
  });
});

describe("LeadStatusControl", () => {
  it("Lead 流转 calls client.patchLead with the new status then router.refresh", async () => {
    render(<LeadStatusControl lead={LEAD} />);
    fireEvent.change(screen.getByLabelText("线索状态 lead-1"), {
      target: { value: "qualified" },
    });
    await waitFor(() => expect(mockClient.patchLead).toHaveBeenCalledTimes(1));
    const arg = mockClient.patchLead.mock.calls[0]![0] as {
      params: { leadId: string };
      body: { status: string };
    };
    expect(arg.params.leadId).toBe("lead-1");
    expect(arg.body.status).toBe("qualified");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });
});

describe("MonetizationCenterView (funnel always honest)", () => {
  it("ALWAYS renders the unattributed bucket + ratio (§4.5)", () => {
    render(
      <MonetizationCenterView
        viewModel={{ products: [PRODUCT], leads: [LEAD], funnel: FUNNEL }}
      />,
    );
    expect(screen.getByTestId("funnel-unattributed")).toBeInTheDocument();
    expect(screen.getByTestId("funnel-unattributed-ratio").textContent).toContain(
      "50%",
    );
  });

  it("renders products + leads from the view model and issues no mutation (read-only)", () => {
    render(
      <MonetizationCenterView
        viewModel={{ products: [PRODUCT], leads: [LEAD], funnel: FUNNEL }}
      />,
    );
    expect(screen.getAllByTestId("product-row")).toHaveLength(1);
    expect(screen.getAllByTestId("lead-row")).toHaveLength(1);
    // A pure render issues no mutation.
    expect(mockClient.createProduct).not.toHaveBeenCalled();
    expect(mockClient.patchLead).not.toHaveBeenCalled();
  });
});
