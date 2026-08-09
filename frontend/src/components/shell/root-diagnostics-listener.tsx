"use client";

import { useEffect } from "react";

import { reportClientDiagnostic } from "@/lib/client-diagnostics";

export function RootDiagnosticsListener(): null {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void reportClientDiagnostic("window_error", event.error ?? event.message);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportClientDiagnostic("unhandled_rejection", event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
  return null;
}
