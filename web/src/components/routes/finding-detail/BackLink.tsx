"use client";
// OWNER: d3 (wave 3). "A back link to /findings keeps the list's filters"
// (brief). /findings/[id] owns no filter state of its own — the filters live
// in /findings' URL (nuqs, another track's route) — so the one way to return
// to exactly the view the reader came from is the browser's own history: when
// the previous entry is same-origin /findings (with whatever query it carried),
// `router.back()` lands there unchanged. Anywhere else (a deep link, a new
// tab), the fallback is a plain link to the unfiltered list.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

function sameOriginFindingsReferrer(): boolean {
  if (typeof document === "undefined" || !document.referrer) return false;
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin && referrer.pathname === "/findings";
  } catch {
    return false;
  }
}

// document.referrer never changes after load, so there is nothing to subscribe
// to — the store's one job is to defer reading it until after hydration
// (useSyncExternalStore's snapshot is only trusted client-side), the same
// pattern @/components/app-shell's useIsMobile uses for the same reason.
function subscribe(): () => void {
  return () => {};
}
const serverSnapshot = () => false;

export function BackLink() {
  const router = useRouter();
  const canGoBack = useSyncExternalStore(subscribe, sameOriginFindingsReferrer, serverSnapshot);

  if (canGoBack) {
    return (
      <Button variant="quiet" size="sm" onClick={() => router.back()}>
        {"← BACK TO FINDINGS"}
      </Button>
    );
  }
  return (
    <Button asChild variant="quiet" size="sm">
      <Link href="/findings">{"← BACK TO FINDINGS"}</Link>
    </Button>
  );
}
