'use client';
// <TrackingMark> — the Witness eye, awake. The marketing nav and footer use it:
// the pupil follows the pointer (it is watching) and blinks every few seconds.
// Everything else about the drawing is <Mark>'s, from ./geometry.
//
// Colour is currentColor, so the parent sets it (the landing sets --lime).
// The server renders the eye at rest; motion starts after hydration and never
// runs under reduced motion (the OS preference or html[data-motion="reduced"]).
// The pupil moves through a transform on its own group, in artboard units, so
// it stays inside the lids at every size.
import { useEffect, useRef, type SVGProps } from 'react';
import { MARK_PUPIL_TRAVEL, markGeometry, markViewBox } from './geometry';
import { prefersReducedMotion } from './live-favicon';

export interface TrackingMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height' | 'viewBox'> {
  /** Rendered edge in CSS px. Default 26. */
  size?: number;
  /** Accessible name. Omit when the mark sits next to the wordmark (it is then decorative). */
  title?: string;
}

/** Pointer distance (CSS px) at which the pupil reaches the edge of its travel. */
const REACH = 180;

export function TrackingMark({ size = 26, title, ...rest }: TrackingMarkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const pupilRef = useRef<SVGCircleElement>(null);
  const g = markGeometry(size);

  useEffect(() => {
    const svg = svgRef.current;
    const look = lookRef.current;
    const pupil = pupilRef.current;
    if (!svg || !look || !pupil || prefersReducedMotion()) return;

    const { box, pupil: rest } = markGeometry(size);
    let target = { x: 0, y: 0 };
    let at = { x: 0, y: 0 };
    let frame = 0;
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;

    const step = () => {
      at = { x: at.x + (target.x - at.x) * 0.2, y: at.y + (target.y - at.y) * 0.2 };
      look.setAttribute('transform', `translate(${at.x.toFixed(3)} ${at.y.toFixed(3)})`);
      const settled = Math.abs(target.x - at.x) < 0.005 && Math.abs(target.y - at.y) < 0.005;
      frame = settled ? 0 : requestAnimationFrame(step);
    };
    const aim = (x: number, y: number) => {
      target = { x, y };
      if (!frame) frame = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const cx = r.left + ((rest.cx - box.x) / box.side) * r.width;
      const cy = r.top + ((rest.cy - box.y) / box.side) * r.height;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d < 1) return aim(0, 0);
      const k = Math.min(1, d / REACH);
      aim((dx / d) * k * MARK_PUPIL_TRAVEL.x, (dy / d) * k * MARK_PUPIL_TRAVEL.y);
    };
    const onLeave = () => aim(0, 0);

    const blink = () => {
      pupil.animate?.(
        [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.12)', offset: 0.45 }, { transform: 'scaleY(1)' }],
        { duration: 220, easing: 'ease-in-out' },
      );
      blinkTimer = setTimeout(blink, 3200 + Math.random() * 4200);
    };
    blinkTimer = setTimeout(blink, 1800 + Math.random() * 1600);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(blinkTimer);
    };
  }, [size]);

  const named = Boolean(title);
  return (
    <svg
      {...rest}
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={g.size}
      height={g.size}
      viewBox={markViewBox(g)}
      role={named ? 'img' : undefined}
      aria-label={named ? title : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
    >
      <path d={g.lid} fill="none" stroke="currentColor" strokeWidth={g.stroke} strokeLinecap="round" strokeLinejoin="round" />
      <g ref={lookRef}>
        <circle
          ref={pupilRef}
          cx={g.pupil.cx}
          cy={g.pupil.cy}
          r={g.pupil.r}
          fill="currentColor"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      </g>
    </svg>
  );
}
