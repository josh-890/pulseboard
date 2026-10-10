"use client";

import { useEffect } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { toast } from "sonner";

const isStaleAction = (err: unknown) =>
  unstable_isUnrecognizedActionError(err) ||
  (err instanceof Error && (err.name === "UnrecognizedActionError" || /Failed to find Server Action/i.test(err.message)));

// A tab opened before a rebuild still calls the old build's server actions; the
// server no longer knows them and the click silently does nothing (seen
// 2026-10-11: linking an archive folder "had no visible response"). Catch that
// anywhere in the app and say what to do.
export function StaleDeploymentGuard() {
  useEffect(() => {
    let shown = false;
    const warn = (err: unknown) => {
      if (!isStaleAction(err) || shown) return false;
      shown = true;
      toast.error("Pulseboard was updated — reload the page to continue.", {
        description: "This tab still runs the previous version, so that action did not go through.",
        duration: Infinity,
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
      return true;
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (warn(e.reason)) e.preventDefault();
    };
    const onError = (e: ErrorEvent) => {
      if (warn(e.error)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
