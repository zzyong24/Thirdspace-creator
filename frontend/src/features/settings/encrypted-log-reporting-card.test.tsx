import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EncryptedLogReportingCard } from "./encrypted-log-reporting-card";
const status = {
  consentVersion: 2,
  enabled: false,
  metricsEnabled: false,
  installationAlias: "123e4567-e89b-42d3-a456-426614174000",
  changedAt: null,
  lastAttemptAt: null,
  nextAttemptAt: null,
  lastUploadedAt: null,
  lastReceiptId: null,
  pendingCount: 0,
  lastErrorCode: null,
  uploadAvailable: true,
  remotePaused: false,
};
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/contract-client", () => ({
  client: { getLogReporting: mocks.get, setLogReporting: mocks.set },
}));
describe("T1255 separate explicit consent controls", () => {
  it("starts unchecked, saves exact v2 and re-reads persisted status", async () => {
    mocks.get.mockResolvedValue(status);
    mocks.set.mockResolvedValue({ ...status, metricsEnabled: true });
    render(<EncryptedLogReportingCard />);
    const checkbox = await screen.findByRole("checkbox", {
      name: "共享运行指标",
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(mocks.set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存共享设置" }));
    await waitFor(() =>
      expect(mocks.set).toHaveBeenCalledWith({
        params: undefined,
        query: undefined,
        body: { enabled: false, metricsEnabled: true, consentVersion: 2 },
      }),
    );
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
