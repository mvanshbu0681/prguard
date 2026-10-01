import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_COUNT, PRIORITIES, REVIEWERS, RISKS, SEVERITIES, STATUSES, VERIFIED, type Item, type Tone } from "./catalog.ts";

const ICONS = join(import.meta.dirname, "..", "..", "node_modules", "lucide-react", "dist", "esm", "icons");

/** Lucide icon as inline SVG, read from the icon data the dashboard already ships with. */
export function icon(name: string, cls = ""): string {
  const source = readFileSync(join(ICONS, `${name}.mjs`), "utf8");
  const literal = /const __iconData = (\{[\s\S]*?\n\});/.exec(source)?.[1];
  if (!literal) throw new Error(`No icon data in ${name}`);
  const nodes = (new Function(`return ${literal}`)() as { node: [string, Record<string, string>][] }).node;
  const children = nodes
    .map(([tag, attrs]) => {
      const list = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${list}/>`;
    })
    .join("");
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

/** The PR Guard mark (eye and check), same geometry as the dashboard's. */
export function mark(color: string, cls = "mark"): string {
  return `<svg class="${cls}" viewBox="0.076 0.076 31.848 31.848" fill="none"><path d="M26.35 12.3Q13.75 3.1 2.75 15.6L11.25 23.6L29.25 10.1" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.3 14.8A2.7 2.7 0 1 0 15.7 14.8A2.7 2.7 0 1 0 10.3 14.8Z" fill="${color}"/></svg>`;
}

function badge(style: string, tone: Tone, label: string, count?: number | string): string {
  const shown = typeof count === "number" && count > MAX_COUNT ? `${MAX_COUNT}+` : count;
  const n = shown === undefined ? "" : `<span class="n">${shown}</span>`;
  return `<span class="b ${style}" style="--c:${tone.color}">${icon(tone.icon)}${n}<span>${label}</span></span>`;
}

export function items(): Item[] {
  const out: Item[] = [];
  for (const s of SEVERITIES) {
    out.push({ name: `sev-${s.id}`, alt: s.label, html: badge("solid caps", s, s.label) });
    for (let n = 1; n <= MAX_COUNT + 1; n++) {
      const name = n > MAX_COUNT ? `sev-${s.id}-many` : `sev-${s.id}-${n}`;
      out.push({ name, alt: `${n > MAX_COUNT ? `${MAX_COUNT}+` : n} ${s.label}`, html: badge("solid caps", s, s.label, n) });
    }
  }
  for (const r of REVIEWERS) out.push({ name: `rev-${r.id}`, alt: r.label, html: badge("chip", r, r.label) });
  for (const p of PRIORITIES) {
    out.push({ name: `priority-${p.id}`, alt: `${p.id.toUpperCase()} ${p.label}`, html: badge("tint", p, p.label, p.id.toUpperCase()) });
  }
  for (const r of RISKS) out.push({ name: `risk-${r.id}`, alt: r.label, html: badge("tint", r, r.label) });
  for (const s of STATUSES) {
    out.push({ name: `status-${s.id}`, alt: s.label, html: badge("tint", s, s.label) });
    if (s.id === "learned") continue;
    for (let n = 1; n <= MAX_COUNT + 1; n++) {
      const name = n > MAX_COUNT ? `status-${s.id}-many` : `status-${s.id}-${n}`;
      out.push({ name, alt: `${n > MAX_COUNT ? `${MAX_COUNT}+` : n} ${s.label}`, html: badge("tint", s, s.label.toLowerCase(), n) });
    }
  }
  out.push({ name: "verified", alt: VERIFIED.label, html: badge("tint", VERIFIED, VERIFIED.label) });
  out.push({
    name: "logo",
    alt: "PR Guard",
    html: `<span class="logo">${mark("#2ECEDD")}<span>PR Guard</span></span>`,
  });
  out.push({
    name: "button-review",
    alt: "Open full review",
    html: `<span class="btn primary">${mark("#03272C")}<span>Open full review</span>${icon("arrow-up-right", "arrow")}</span>`,
  });
  out.push({
    name: "button-finding",
    alt: "View in PR Guard",
    html: `<span class="btn secondary">${mark("#2ECEDD")}<span>View in PR Guard</span>${icon("arrow-up-right", "arrow")}</span>`,
  });
  return out;
}

export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">`;

export const BADGE_CSS = `
.b, .btn, .logo {
  font-family: Inter, sans-serif; font-feature-settings: "cv11", "ss01", "ss03";
  -webkit-font-smoothing: antialiased; box-sizing: border-box; white-space: nowrap;
  display: inline-flex; align-items: center; line-height: 1;
}
.b { height: 20px; gap: 5px; padding: 0 7px 0 6px; border-radius: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.005em; }
.b svg { width: 12px; height: 12px; flex: none; }
.b .n { font-weight: 700; font-variant-numeric: tabular-nums; margin-right: -1px; }
.tint .n { color: color-mix(in oklab, var(--c) 80%, #ffffff); }
.caps > span:last-child { text-transform: uppercase; letter-spacing: 0.07em; font-size: 10px; font-weight: 700; }

.chip {
  background: linear-gradient(180deg, #22272d 0%, #171a1e 100%);
  border: 1px solid #323840; color: #e9ecef;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.chip svg { color: var(--c); }

.tint {
  background: linear-gradient(180deg, color-mix(in oklab, var(--c) 24%, #1b1e22) 0%, color-mix(in oklab, var(--c) 13%, #15181b) 100%);
  border: 1px solid color-mix(in oklab, var(--c) 50%, #15181b);
  color: color-mix(in oklab, var(--c) 45%, #ffffff);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.tint svg { color: var(--c); }

.solid {
  background: linear-gradient(180deg, color-mix(in oklab, var(--c) 72%, #ffffff) 0%, var(--c) 100%);
  border: 1px solid color-mix(in oklab, var(--c) 70%, #000000);
  color: #0d0f12;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.solid svg { stroke-width: 2.5; }

.logo {
  height: 28px; gap: 7px; padding: 0 12px 0 9px; border-radius: 8px;
  background: linear-gradient(180deg, #22272d 0%, #14171a 100%);
  border: 1px solid #323840; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  color: #f3f5f7; font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em;
}
.logo .mark { width: 17px; height: 17px; }

.btn { font-weight: 600; letter-spacing: -0.005em; }
.btn .arrow { flex: none; }
.btn.primary {
  height: 32px; gap: 7px; padding: 0 11px 0 10px; border-radius: 8px; font-size: 13px;
  background: linear-gradient(180deg, #86e9f1 0%, #2ecedd 100%);
  border: 1px solid #1aa9b6; color: #03272c;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}
.btn.primary .mark { width: 16px; height: 16px; }
.btn.primary .arrow { width: 14px; height: 14px; }
.btn.secondary {
  height: 26px; gap: 6px; padding: 0 9px 0 8px; border-radius: 7px; font-size: 12px;
  background: linear-gradient(180deg, #22272d 0%, #171a1e 100%);
  border: 1px solid #323840; color: #e9ecef;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.btn.secondary .mark { width: 14px; height: 14px; }
.btn.secondary .arrow { width: 13px; height: 13px; color: #8d9399; }
`;

/** The page every badge is rendered from; each badge is screenshotted on its own. */
export function sheet(list: Item[]): string {
  const body = list.map((i) => `<div class="slot" data-name="${i.name}">${i.html}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
html, body { margin: 0; background: transparent; }
body { padding: 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
.slot { display: inline-flex; }
${BADGE_CSS}
</style></head><body>${body}</body></html>`;
}
