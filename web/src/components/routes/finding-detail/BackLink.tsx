"use client";
// OWNER: d3 (wave 3). "A back link to /findings keeps the list's filters"
// (brief). /findings/[id] owns no filter state of its own — the filters live
// in /findings' URL (nuqs, another track's route) — so the one way to return
// to exactly the view the reader came from is the browser's own history.
//
// FIXED (reviewer defect, major): document.referrer is an HTTP header fixed
// at THIS document's own load and never touched by a same-origin client-side
// (pushState) transition — exactly how next/link navigates from /findings to
// /findings/[id]. Checking it here always read the value from whatever page
// loaded this document (often empty), so the "did the reader come from the
// filtered list" check was always false and the fallback always discarded
// the reader's filters.
//
// The Navigation API's session history (window.navigation), unlike
// document.referrer, is a live record of same-document route changes: its
// entries carry the URL of every stop the SPA has made, including the query
// string a nuqs filter wrote onto /findings. We read the entry immediately
// before the current one and use ITS url — for both the "came from the
// list" check and the link's href — so a plain <Link> (no JS, works
// mid-navigation, crawlable) still lands on the exact filtered view, and
// router.back() is only ever invoked once we know it goes there.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

interface NavigationHistoryEntryLike {
  id: string;
  url: string;
}
interface NavigationLike {
  currentEntry?: NavigationHistoryEntryLike;
  entries(): NavigationHistoryEntryLike[];
}

/** Exported for tests/unit/routes/finding-detail/back-link.test.tsx. */
export function findingsBackHref(): string | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!nav || typeof nav.entries !== "function") return null;
  try {
    const entries = nav.entries();
    const currentId = nav.currentEntry?.id;
    const currentIndex = entries.findIndex((entry) => entry.id === currentId);
    if (currentIndex <= 0) return null;
    const previous = entries[currentIndex - 1];
    if (!previous?.url) return null;
    const previousUrl = new URL(previous.url, window.location.href);
    if (previousUrl.origin !== window.location.origin) return null;
    if (previousUrl.pathname !== "/findings") return null;
    return `${previousUrl.pathname}${previousUrl.search}`;
  } catch {
    return null;
  }
}

// Nothing to subscribe to (the Navigation API has no relevant change event before
// this component ever renders again) — the store's one job is to defer reading
// history until after hydration, the same pattern @/components/app-shell's
// useIsMobile uses for the same reason: the server has no history to read.
function subscribe(): () => void {
  return () => {};
}
function getServerSnapshot(): string | null {
  return null;
}

export function BackLink() {
  const router = useRouter();
  const findingsHref = useSyncExternalStore(subscribe, findingsBackHref, getServerSnapshot);

  if (findingsHref) {
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
