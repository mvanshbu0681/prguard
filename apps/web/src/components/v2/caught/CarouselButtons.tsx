"use client";

// The carousel's prev/next pair. The track itself is a native horizontal
// scroller with snap points, so touch, trackpad and keyboard scrolling all work
// without this; the buttons page it by one card and disable at either end.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import s from "./caught.module.css";

export function CarouselButtons({
  trackId,
  label = "finding",
  className = s.nav,
  buttonClassName = s.navBtn,
}: {
  trackId: string;
  /** What one card is, for the buttons' accessible names. */
  label?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const track = document.getElementById(trackId);
    if (!track) return;
    const update = () => {
      setAtStart(track.scrollLeft <= 2);
      setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 2);
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      track.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [trackId]);

  const page = (dir: 1 | -1) => {
    const track = document.getElementById(trackId);
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: smooth ? "smooth" : "auto" });
  };

  return (
    <div className={className}>
      <button type="button" className={buttonClassName} onClick={() => page(-1)} disabled={atStart} aria-controls={trackId} aria-label={`Previous ${label}`}>
        <ChevronLeft size={18} strokeWidth={2} />
      </button>
      <button type="button" className={buttonClassName} onClick={() => page(1)} disabled={atEnd} aria-controls={trackId} aria-label={`Next ${label}`}>
        <ChevronRight size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
