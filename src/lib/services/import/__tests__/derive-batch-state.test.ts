import { describe, expect, it } from "vitest";
import { deriveBatchState } from "@/lib/services/import/staging-service";

describe("deriveBatchState", () => {
  it("is DONE when no reviewable work remains (auto-flow sets/co-models don't count)", () => {
    expect(
      deriveBatchState({ batchStatus: "REVIEW", reviewablePending: 0, blocked: 0 }),
    ).toBe("DONE");
  });

  it("is NEEDS_REVIEW while reviewable items are pending", () => {
    expect(
      deriveBatchState({ batchStatus: "REVIEW", reviewablePending: 3, blocked: 0 }),
    ).toBe("NEEDS_REVIEW");
  });

  it("prioritises pending review over blocked items", () => {
    expect(
      deriveBatchState({ batchStatus: "REVIEW", reviewablePending: 1, blocked: 2 }),
    ).toBe("NEEDS_REVIEW");
  });

  it("is BLOCKED when nothing is pending but items are blocked", () => {
    expect(
      deriveBatchState({ batchStatus: "REVIEW", reviewablePending: 0, blocked: 2 }),
    ).toBe("BLOCKED");
  });

  it("is FAILED whenever the batch itself failed, regardless of item tallies", () => {
    expect(
      deriveBatchState({ batchStatus: "FAILED", reviewablePending: 5, blocked: 1 }),
    ).toBe("FAILED");
  });
});
