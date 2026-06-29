import { describe, it, expect } from "vitest";
import { canTransition, AI_TASK_STATUSES } from "./state-machine";

describe("canTransition", () => {
  it("allows the candidate-confirm happy path", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "awaiting_confirmation")).toBe(true);
    expect(canTransition("awaiting_confirmation", "succeeded")).toBe(true);
  });

  it("allows the advisory path (running straight to succeeded)", () => {
    expect(canTransition("running", "succeeded")).toBe(true);
  });

  it("allows failure and rejection", () => {
    expect(canTransition("running", "failed")).toBe(true);
    expect(canTransition("awaiting_confirmation", "cancelled")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("succeeded", "running")).toBe(false);
    expect(canTransition("queued", "succeeded")).toBe(false);
    expect(canTransition("failed", "succeeded")).toBe(false);
  });

  it("enumerates all six statuses", () => {
    expect(AI_TASK_STATUSES).toEqual([
      "queued",
      "running",
      "awaiting_confirmation",
      "succeeded",
      "failed",
      "cancelled",
    ]);
  });
});
