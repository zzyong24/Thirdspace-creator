import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";

const { reportClientDiagnostic } = vi.hoisted(() => ({
  reportClientDiagnostic: vi.fn(async () => {}),
}));

vi.mock("@/lib/client-diagnostics", () => ({ reportClientDiagnostic }));

describe("GlobalError", () => {
  beforeEach(() => reportClientDiagnostic.mockClear());

  it("显示安全兜底与错误编号，并允许真实重试", async () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("内部 secret 不应渲染"), { digest: "safe-digest" });
    render(<GlobalError error={error} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("CreatorOS 暂时无法继续");
    expect(screen.getByRole("alert")).not.toHaveTextContent("内部 secret");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(reset).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(reportClientDiagnostic).toHaveBeenCalledWith("root_error", error, "safe-digest"),
    );
  });
});
