import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RootDiagnosticsListener } from "./root-diagnostics-listener";

const { reportClientDiagnostic } = vi.hoisted(() => ({
  reportClientDiagnostic: vi.fn(async () => {}),
}));

vi.mock("@/lib/client-diagnostics", () => ({ reportClientDiagnostic }));

describe("RootDiagnosticsListener", () => {
  beforeEach(() => reportClientDiagnostic.mockClear());

  it("捕获 window error 与未处理 Promise，但只交给本地 hash 诊断器", async () => {
    const view = render(<RootDiagnosticsListener />);
    await act(async () => {
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("secret") }));
      window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("rejected-secret"),
      }));
    });
    expect(reportClientDiagnostic).toHaveBeenCalledWith("window_error", expect.any(Error));
    expect(reportClientDiagnostic).toHaveBeenCalledWith("unhandled_rejection", expect.any(Error));
    view.unmount();
  });
});
