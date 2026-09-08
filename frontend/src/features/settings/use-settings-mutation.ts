"use client";
import { readCurrentAccountId } from "@/lib/http-transport";

import { useRouter } from "next/navigation";
import * as React from "react";

export function useSettingsMutation() {
  const router = useRouter();
  const inFlight = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async (mutate: () => Promise<unknown>): Promise<boolean> => {
      if(inFlight.current) return false;
      inFlight.current = true;
      const accountId = readCurrentAccountId();
      setPending(true);
      try {
        await mutate();
        if(accountId !== readCurrentAccountId()) return false;
        router.refresh();
        return true;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [router],
  );
  return { pending, run };
}

