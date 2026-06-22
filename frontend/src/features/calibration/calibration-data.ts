/**
 * `calibration-data.ts` — server-side read helper for the 校准闭环 surface (GAP-CAL-1).
 *
 * The calibration route is a Server Component; it must NOT touch the repository (FE reads
 * go through the typed contract `client` → `/api/v1` dispatch → user-scoped pglite). This
 * helper wraps `client.listPredictions` so the page can render the already-locked /
 * draft predictions as `PredictionRow[]`.
 *
 * Failure isolation: a read error returns an EMPTY list (never throws) so the page falls
 * back to the「暂无盲预测」empty state instead of crashing — the island's `useMutation`
 * seam only governs writes, so the read side owns its own try/catch fallback.
 */
import { client } from "@/lib/contract-client.server";
import type { PredictionResource } from "@/server/modules/calibration";

export async function loadPredictions(): Promise<PredictionResource[]> {
  try {
    const rows = (await client.listPredictions({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as PredictionResource[];
    return rows;
  } catch {
    // No predictions yet / read failure → empty list → 「暂无盲预测」empty state.
    return [];
  }
}
