"use client";

/**
 * `audience-questions-interactive-region.tsx` — the「一键转 Candidate」client island
 * for the AudienceQuestionsCard (七步③ · SPEC §5.5).
 *
 * `LinkSignalButton` → `client.linkSignalToCandidate` (omit `candidateId` → spawn a
 * new `demand` Candidate from the signal) then `router.refresh()`.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in render.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";

export function LinkSignalButton({ signalId }: { readonly signalId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  function convert() {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        await client.linkSignalToCandidate({
          params: { signalId },
          query: undefined,
          // omit candidateId → spawn a new `demand` Candidate from the signal.
          body: {},
        });
        router.refresh();
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="link-signal-button"
      disabled={pending}
      onClick={convert}
    >
      一键转 Candidate
    </Button>
  );
}
