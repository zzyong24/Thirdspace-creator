import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PositioningFitBadge } from "./positioning-fit-badge";
import type { PositioningGateResultResource } from "@creatoros/backend/modules/positioning";

// 定位契合度 Badge test (Task 6.4). With the viewModel seam (no network) it asserts
// the returned positioningFit renders and the Badge stays non-blocking when below
// threshold (advisory only, SPEC §3.3 — 标灰/降权, never disabled/blocked).

afterEach(cleanup);

const result = (fit: number): PositioningGateResultResource => ({
  subjectType: "project",
  subjectId: "project-1",
  statementId: "posstmt-1",
  positioningFit: fit,
  reasons: ["命中关键词 3/3", "锚定产品一致"],
});

describe("PositioningFitBadge", () => {
  it("renders the returned positioningFit score", () => {
    render(
      <PositioningFitBadge projectId="project-1" viewModel={result(82)} />,
    );
    const badge = screen.getByTestId("positioning-fit-badge");
    expect(badge.getAttribute("data-fit")).toBe("82");
    expect(badge.textContent).toContain("82");
    expect(badge.getAttribute("data-below-threshold")).toBe("false");
  });

  it("stays non-blocking (标灰/降权, never disabled) when below threshold", () => {
    render(
      <PositioningFitBadge
        projectId="project-1"
        threshold={60}
        viewModel={result(40)}
      />,
    );
    const badge = screen.getByTestId("positioning-fit-badge");
    expect(badge.getAttribute("data-below-threshold")).toBe("true");
    // Advisory: it is a status pill, not a control — it carries no disabled/blocked
    // semantics on the host surface.
    expect(badge.getAttribute("aria-disabled")).toBeNull();
    expect(badge.tagName.toLowerCase()).not.toBe("button");
  });

  it("exposes reasons[] in the title tooltip", () => {
    render(
      <PositioningFitBadge projectId="project-1" viewModel={result(82)} />,
    );
    const badge = screen.getByTestId("positioning-fit-badge");
    expect(badge.getAttribute("title")).toContain("命中关键词 3/3");
  });
});
