import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Conversion column test (Step 5b · SPEC §4.7). The read-only 转化/线索 column renders
// the lead/inquiry/conversion counts from its view-model prop and issues NO
// Monetization network call (source of truth is Analytics §4.6). When the Analytics
// keys are not yet seeded (OQ3), it renders the decorative "—" placeholder.

// Guard: importing the column must NOT pull in the contract client (no network).
const clientSpy = vi.fn();
vi.mock("@/lib/contract-client", () => ({
  client: new Proxy({}, { get: () => clientSpy }),
}));

import { ConversionColumn } from "./conversion-column";

afterEach(cleanup);

describe("ConversionColumn", () => {
  it("renders lead/inquiry/conversion counts from the view model (no network call)", () => {
    render(
      <ConversionColumn
        data={{
          leadCount: 12,
          inquiryCount: 4,
          conversionCount: 2,
          decorative: false,
        }}
      />,
    );
    const col = screen.getByTestId("conversion-column");
    expect(col).toHaveAttribute("data-decorative", "false");
    expect(col.textContent).toContain("线索 12");
    expect(col.textContent).toContain("咨询 4");
    expect(col.textContent).toContain("成交 2");
    // read-only — no Monetization (or any) op issued.
    expect(clientSpy).not.toHaveBeenCalled();
  });

  it("renders the decorative placeholder when Analytics §4.6 keys are not yet seeded", () => {
    render(
      <ConversionColumn
        data={{
          leadCount: 0,
          inquiryCount: 0,
          conversionCount: 0,
          decorative: true,
        }}
      />,
    );
    const col = screen.getByTestId("conversion-column");
    expect(col).toHaveAttribute("data-decorative", "true");
    expect(col.textContent).toContain("转化 —");
    expect(clientSpy).not.toHaveBeenCalled();
  });
});
