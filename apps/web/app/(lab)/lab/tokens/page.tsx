// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// The token specimen: every colour token (swatch, name, hex, oklch, utility), the
// type scale in both families, the weight axis, tabular numerals and the slashed
// zero, and the non-colour scales. It is rendered from the same parsed model as
// `npm run tokens:verify` (scripts/lib/tokens.ts), so it cannot drift from
// app/tokens/*.css. Swatches paint var(--token) live, so /lab/tokens with
// data-contrast="high" on <html> shows the projector variant.
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import {
  isColorValue,
  layered,
  loadTokens,
  resolveValue,
  tailwindColorName,
  type Context,
  type TokenModel,
} from "../../../../scripts/lib/tokens";
import { FontStatus } from "./font-status";

export const metadata: Metadata = { title: "Tokens (lab)" };

const PAPER: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 64px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 64px)",
  ].join(", "),
};

const TYPE_SAMPLES: Record<string, string> = {
  "type-display-hero": "We run the test.",
  "type-display-h2": "Proven, or it doesn't block.",
  "type-display-h3": "The score is arithmetic.",
  "type-display-h4": "Rejections stick.",
  "type-label": "/ 05 — Computed severity",
  "type-lead": "Witness executes a test before it claims a bug.",
  "type-body": "Every number carries its denominator; no adjective does a measurement's job.",
  "type-small": "12s since last output · 1,284 findings · n = 312",
  "type-micro": "captured 2026-09-19T14:22:07Z",
  "type-readout-xl": "0.810",
  "type-readout": "0.914",
  "type-terminal": "E   AttributeError: 'NoneType' object has no attribute 'currency'",
  "type-data": "a91f3c2e…8b4d  9c2d4b1  7c41a09  1,284",
  "type-chip": "9c2d4b1",
  "type-badge": "Proven",
};

function Section({ index, title, children, note }: { index: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="border-t border-rule-1 py-10">
      <h2 className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <div className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function tokenViews(model: TokenModel) {
  const views = (ctx: Context) => {
    const values = layered(model, ctx);
    if (ctx === "marketing") model.layers["surface-marketing"].forEach((d, k) => values.set(k, d.value));
    const withFallbacks = new Map(values);
    model.layers.fallback.forEach((d, k) => withFallbacks.set(k, d.value));
    const resolve = (name: string) => resolveValue(values.get(name) ?? "", values);
    const hexOf = (name: string, depth = 0): string | null => {
      const fb = model.layers.fallback.get(name);
      if (fb) return resolveValue(fb.value, withFallbacks);
      const alias = /^var\((--[\w-]+)\)$/.exec((values.get(name) ?? "").trim());
      return alias && depth < 12 ? hexOf(alias[1], depth + 1) : null;
    };
    return { resolve, hexOf };
  };
  return { root: views("root"), marketing: views("marketing") };
}

function Swatch({ name, value, hex, utility }: { name: string; value: string; hex: string | null; utility: string | null }) {
  return (
    <li className="flex min-w-0 items-center gap-3 border-b border-rule-hair py-2">
      <span aria-hidden className="size-10 shrink-0 rounded-data border border-rule-2" style={{ background: `var(${name})` }} />
      <div className="min-w-0 type-data [overflow-wrap:anywhere]">
        <div className="text-text-primary">{name}</div>
        <div className="text-text-body">
          {hex ?? "—"} · {value}
        </div>
        {utility ? <div className="text-text-dim">bg-{utility} · text-{utility} · border-{utility}</div> : null}
      </div>
    </li>
  );
}

export default function TokensPage() {
  const model = loadTokens(process.cwd());
  const v = tokenViews(model);

  const groups = model.groups.map((g) => {
    const view = g.layer === "surface-marketing" ? v.marketing : v.root;
    const colours = g.names.filter((n) => isColorValue(view.resolve(n)));
    const gradients = g.names.filter((n) => /^(linear|radial)-gradient\(|^url\(/.test(view.resolve(n)));
    const others = g.names.filter((n) => !colours.includes(n) && !gradients.includes(n));
    return { ...g, view, colours, gradients, others };
  });
  const colourGroups = groups.filter((g) => g.colours.length > 0);
  const valueGroups = groups.filter((g) => g.others.length > 0);
  const gradientGroups = groups.filter((g) => g.gradients.length > 0);

  const utilities = new Map<string, Map<string, string>>();
  model.layers.utility.forEach((d, key) => {
    const [util, prop] = key.split("::");
    if (!util.startsWith("type-")) return;
    if (!utilities.has(util)) utilities.set(util, new Map());
    utilities.get(util)!.set(prop, d.value);
  });
  const theme = [...model.layers.theme.values()].filter((d) => /^--(radius|shadow|inset-shadow|ease|default-transition)/.test(d.name) && !d.name.endsWith("*"));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <header>
        <p className="type-label text-text-dim">/ lab — tokens · T0 reference</p>
        <h1 className="mt-3 type-display-h2 text-text-primary">Token specimen</h1>
        <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
          Parsed from app/tokens/core.css and marketing.css — the same model `npm run tokens:verify` gates. In hand-written CSS use
          the short names (var(--ink-2)); utilities are listed under each swatch.
        </p>
      </header>

      <Section index="01" title="Type specimen" note="Google Sans Code is the display and mono face; Inter renders sentences.">
        <div className="space-y-8">
          <div className="overflow-hidden">
            <p className="type-label text-text-dim">type-display-hero · clamp(2.25rem, 0.9rem + 3.9vw, 3.875rem) = 62px at ≥ 1280px</p>
            <p className="mt-3 type-display-hero text-text-primary">
              {"We don't guess."}
              <br />
              {"We run the test."}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="type-label text-text-dim">Google Sans Code · wght 400 vs 700</p>
              <p className="mt-2 font-mono text-[2.5rem] leading-tight text-text-primary">
                <span style={{ fontWeight: 400 }}>PROVEN 400</span>
                <br />
                <span style={{ fontWeight: 700 }}>PROVEN 700</span>
              </p>
            </div>
            <div>
              <p className="type-label text-text-dim">Inter · wght 400 vs 700</p>
              <p className="mt-2 font-sans text-[2.5rem] leading-tight text-text-primary">
                <span style={{ fontWeight: 400 }}>Proven 400</span>
                <br />
                <span style={{ fontWeight: 700 }}>Proven 700</span>
              </p>
            </div>
          </div>
          <div>
            <p className="type-label text-text-dim">Google Sans Code · the variable axis, 300 → 800</p>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-2xl text-text-body">
              {[300, 400, 500, 520, 560, 600, 700, 800].map((w) => (
                <span key={w} style={{ fontWeight: w }}>
                  {w}
                </span>
              ))}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="type-label text-text-dim">GSC · tabular, slashed zero</p>
              <p className="mt-2 font-mono text-xl text-text-primary">0.810 1,284 9c2d4b1</p>
              <p className="mt-1 font-mono text-xl text-text-body">
                0.810
                <br />
                1.111
                <br />
                9.999
              </p>
            </div>
            <div>
              <p className="type-label text-text-dim">Inter · .tabular (tnum zero)</p>
              <p className="mt-2 font-sans tabular text-xl text-text-primary">0.810 1,284 9c2d4b1</p>
              <p className="mt-1 font-sans tabular text-xl text-text-body">
                0.810
                <br />
                1.111
                <br />
                9.999
              </p>
            </div>
            <div>
              <p className="type-label text-text-dim">Inter · default (proportional)</p>
              <p className="mt-2 font-sans text-xl text-text-primary">0.810 1,284 9c2d4b1</p>
              <p className="mt-1 font-sans text-xl text-text-body">
                0.810
                <br />
                1.111
                <br />
                9.999
              </p>
            </div>
          </div>
          <div>
            <p className="type-label text-text-dim">Slashed zero · 0 vs O, l 1 I</p>
            <p className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-3xl text-text-primary">
              <span className="font-mono">0O l1I GSC</span>
              <span className="font-sans tabular">0O l1I tabular</span>
              <span className="font-sans">0O l1I Inter</span>
            </p>
          </div>
          <div>
            <p className="type-label text-text-dim">document.fonts</p>
            <div className="mt-2">
              <FontStatus />
            </div>
          </div>
        </div>
      </Section>

      <Section index="02" title="Type scale · both families" note="Each row: the type-* utility in its own family, then the same utility in the other family.">
        <div className="space-y-6">
          {[...utilities.entries()].map(([util, props]) => {
            const family = props.get("font-family") ?? "";
            const other = family.includes("--font-sans") ? "var(--font-mono)" : "var(--font-sans)";
            const sample = TYPE_SAMPLES[util] ?? util;
            const meta = [props.get("font-size"), props.get("line-height"), props.get("letter-spacing"), props.get("font-weight"), props.get("text-transform")]
              .filter(Boolean)
              .join(" · ");
            const wrap = util === "type-terminal" ? "overflow-x-auto whitespace-pre" : "[overflow-wrap:anywhere]";
            return (
              <div key={util} className="border-b border-rule-hair pb-4">
                <p className="type-data text-text-dim [overflow-wrap:anywhere]">
                  {util} · {meta}
                </p>
                <p className={`${util} mt-1 text-text-primary ${wrap}`}>{sample}</p>
                <p className={`${util} mt-1 text-text-body ${wrap}`} style={{ fontFamily: other }}>
                  {sample}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section index="03" title="Colour" note="Swatches paint var(--token) live. Hex is the committed fallback (or its alias); oklch is the authored value.">
        <div className="space-y-10">
          {colourGroups.map((g) => (
            <div key={`${g.layer}-${g.title}`} data-surface={g.layer === "surface-marketing" ? "marketing" : undefined}>
              <h3 className="type-label text-text-body">{g.title}</h3>
              <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-x-6">
                {g.colours.map((name) => (
                  <Swatch key={name} name={name} value={g.view.resolve(name)} hex={g.view.hexOf(name)} utility={tailwindColorName(model, name)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section index="04" title="Surfaces and hairlines" note={'data-surface re-derives --grid on its own element; data-contrast="high" on <html> promotes every hairline to --ink-7.'}>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { surface: undefined, label: "root · --grid-alpha 0.028" },
            { surface: "marketing", label: "marketing · 0.028 + grain 0.035" },
            { surface: "app", label: "app · 0.018, no grain" },
          ].map((s) => (
            <div key={s.label} data-surface={s.surface} className="h-32 rounded-panel border border-rule-1 bg-ink-0 p-3" style={PAPER}>
              <p className="type-data text-text-body">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {["--rule-hair", "--rule-1", "--rule-2", "--rule-3"].map((r) => (
            <div key={r} className="h-16 rounded-panel bg-ink-2 p-3" style={{ border: `1px solid var(${r})`, boxShadow: "inset 0 1px 0 var(--inset-hi)" }}>
              <p className="type-data text-text-body">{r}</p>
            </div>
          ))}
        </div>
      </Section>

      {gradientGroups.length > 0 ? (
        <Section index="05" title="Marketing gradients" note={'Scoped to data-surface="marketing".'}>
          <div data-surface="marketing" className="grid gap-4 md:grid-cols-2">
            {gradientGroups.flatMap((g) =>
              g.gradients.map((name) => (
                <div key={name} className="rounded-panel border border-rule-1 bg-ink-1 p-3">
                  <div aria-hidden className="h-24 rounded-data bg-ink-0" style={{ backgroundImage: `var(${name})` }} />
                  <p className="mt-2 type-data text-text-primary">{name}</p>
                  <p className="type-data text-text-dim [overflow-wrap:anywhere]">{g.view.resolve(name).slice(0, 160)}</p>
                </div>
              )),
            )}
          </div>
        </Section>
      ) : null}

      <Section index="06" title="Scales">
        <div className="grid gap-8 md:grid-cols-2">
          {valueGroups.map((g) => (
            <div key={`${g.layer}-${g.title}`} className="min-w-0">
              <h3 className="type-label text-text-body">{g.title}</h3>
              <dl className="mt-2 type-data">
                {g.others.map((name) => (
                  <div key={name} className="flex gap-3 border-b border-rule-hair py-1">
                    <dt className="w-44 shrink-0 text-text-primary [overflow-wrap:anywhere]">{name}</dt>
                    <dd className="min-w-0 text-text-body [overflow-wrap:anywhere]">{g.view.resolve(name)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <div className="min-w-0">
            <h3 className="type-label text-text-body">Tailwind theme — radius, shadow, easing</h3>
            <dl className="mt-2 type-data">
              {theme.map((d) => (
                <div key={`${d.block}-${d.name}`} className="flex gap-3 border-b border-rule-hair py-1">
                  <dt className="w-44 shrink-0 text-text-primary [overflow-wrap:anywhere]">{d.name}</dt>
                  <dd className="min-w-0 text-text-body [overflow-wrap:anywhere]">{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>
    </div>
  );
}
