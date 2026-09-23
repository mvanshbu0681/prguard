// OWNER: T3 (wave 1). The one measurement .draw needs (motion spec §4.7, §4.8.2).
//
// A drawn edge carries pathLength="1", so one keyframe (stroke-dashoffset 1 → 0) draws
// an 80px fork and a 2400px spine at the same perceived speed. Hairlines also carry
// vector-effect="non-scaling-stroke" (§4.7). The two disagree in a scaled SVG: with a
// non-scaling stroke Chromium lays the dash pattern out along the SCREEN-space path, while
// pathLength calibrates it to the USER-space length, so a dash of "1" covers only
// 1 / scale of the line (0.73 of it at 1.37×) and the edge never reaches its node.
//
// So src/styles/motion.css draws with a dash of var(--draw-len, 1) and sets the dash
// only inside the keyframes: at rest a .draw path has no dash at all and is solid, with
// or without JavaScript, at any scale. fitDraw() writes --draw-len on the path itself
// (never :root) right before a draw starts; retrigger(el, "data-draw") and the revealer
// call it, so a component never does.
//
// GSAP-driven draws use the same number: gsap.set() the path's strokeDasharray to
// `${len} ${len}` (a constant), tween strokeDashoffset from len to 0, and clear both
// on complete so the path rests solid.
//
// Engine-free.

export const DRAW_LEN_VAR = "--draw-len";
const SAMPLES = 24;

type Geometry = SVGGeometryElement & { getScreenCTM(): DOMMatrix | null };

function isGeometry(el: Element): el is Geometry {
  return typeof (el as Partial<SVGGeometryElement>).getTotalLength === "function" && typeof (el as Partial<Geometry>).getScreenCTM === "function";
}

/**
 * The dash length, in pathLength="1" units, that covers `el` exactly when it is
 * drawn: 1, or the screen-to-user length ratio for a non-scaling stroke.
 */
export function drawLength(el: Element): number {
  if (!isGeometry(el) || typeof getComputedStyle !== "function") return 1;
  if (getComputedStyle(el).getPropertyValue("vector-effect").trim() !== "non-scaling-stroke") return 1;
  const ctm = el.getScreenCTM();
  const user = el.getTotalLength();
  if (!ctm || !(user > 0)) return 1;
  // Sum the path's length in screen space (exact for any transform, skew included).
  const start = el.getPointAtLength(0);
  let prev = new DOMPoint(start.x, start.y).matrixTransform(ctm);
  let screen = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    const p = el.getPointAtLength((user * i) / SAMPLES);
    const next = new DOMPoint(p.x, p.y).matrixTransform(ctm);
    screen += Math.hypot(next.x - prev.x, next.y - prev.y);
    prev = next;
  }
  // Below 1 when the SVG is drawn smaller than its viewBox: the dash shrinks to match.
  const ratio = screen / user;
  return Number.isFinite(ratio) && ratio > 0 ? Math.round(ratio * 10_000) / 10_000 : 1;
}

/** Write --draw-len on a .draw path (and on each .draw path inside `el`). */
export function fitDraw(el: Element): void {
  const paths = el.matches(".draw") ? [el] : [...el.querySelectorAll(".draw")];
  for (const path of paths) if (path instanceof SVGElement) path.style.setProperty(DRAW_LEN_VAR, String(drawLength(path)));
}
