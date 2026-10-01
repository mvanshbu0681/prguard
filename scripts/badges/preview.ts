import { PRIORITIES, REVIEWERS, SEVERITIES } from "./catalog.ts";
import { mark } from "./html.ts";

export type Manifest = Record<string, { width: number; height: number; alt: string }>;

/** A GitHub-looking page (light and dark) built from the rendered PNGs, to judge them in place. */
export function previewHtml(manifest: Manifest): string {
  const img = (name: string) => {
    const m = manifest[name];
    if (!m) throw new Error(`No badge ${name}`);
    return `<img src="img/${name}.png" width="${m.width}" height="${m.height}" alt="${m.alt}">`;
  };
  const row = (names: string[]) => `<p class="badges">${names.map(img).join(" ")}</p>`;
  const head = (when: string) =>
    `<div class="c-head"><span class="avatar">${mark("#2ECEDD", "av")}</span><b>prguard</b><span class="bot">bot</span><span class="muted">${when}</span></div>`;

  const column = (theme: "light" | "dark") => `
<section class="gh ${theme}">
  <div class="theme">GitHub ${theme}</div>

  <h4>Severity</h4>
  ${row(SEVERITIES.map((s) => `sev-${s.id}`))}
  ${row(["sev-critical-1", "sev-high-3", "sev-medium-2", "sev-low-4", "sev-nit-12"])}
  <h4>Reviewers</h4>
  ${row(REVIEWERS.map((r) => `rev-${r.id}`))}
  <h4>Priority and risk</h4>
  ${row(PRIORITIES.map((p) => `priority-${p.id}`))}
  ${row(["risk-low", "risk-medium", "risk-high"])}
  <h4>Status and verified</h4>
  ${row(["status-fixed-2", "status-new-1", "status-open-3", "status-learned", "verified"])}
  <h4>Logo and buttons</h4>
  ${row(["logo", "button-review", "button-finding"])}

  <h4>Line comment</h4>
  <div class="file">
    <div class="file-head">app/routers/refunds.py</div>
    <table class="diff">
      <tr class="add"><td class="ln">41</td><td class="code">+    invoice = db.get(Invoice, payload.invoice_id)</td></tr>
      <tr class="add"><td class="ln">42</td><td class="code">+    if invoice.status not in ("paid", "partially_refunded"):</td></tr>
    </table>
    <div class="thread">
      ${head("now")}
      <div class="md">
        ${row(["sev-high", "rev-security", "verified"])}
        <p><strong>Missing ownership check when creating a refund</strong></p>
        <p><code>create_refund</code> loads the invoice with <code>db.get</code> and never checks that the caller owns it, so anyone who knows an invoice id can refund it. Use <code>get_owned_invoice</code>, as the other endpoints do.</p>
        <div class="suggestion">
          <div class="s-head">Suggested change</div>
          <div class="s-del">    invoice = db.get(Invoice, payload.invoice_id)</div>
          <div class="s-add">    invoice = get_owned_invoice(db, payload.invoice_id, user)</div>
          <div class="s-foot"><span class="gh-btn">Commit suggestion</span></div>
        </div>
        <div class="det open"><div class="sum">Evidence</div><p><code>get_owned_invoice</code> guards 4 other endpoints in <code>app/routers/</code>, including <code>get_invoice</code> and <code>pay_invoice</code>.</p></div>
        <div class="det"><div class="sum">Prompt for AI agents</div></div>
        ${row(["button-finding"])}
      </div>
    </div>
  </div>

  <h4>Supply chain comment</h4>
  <div class="file">
    <div class="file-head">package.json</div>
    <table class="diff">
      <tr class="add"><td class="ln">18</td><td class="code">+    "toga-ai": "1.0.922",</td></tr>
    </table>
    <div class="thread">
      ${head("now")}
      <div class="md">
        ${row(["sev-critical", "rev-supply-chain"])}
        <p><strong><code>toga-ai@1.0.922</code> is known malware</strong></p>
        <p>Socket flags this version as malware (supply-chain score 0). Remove it before anyone runs <code>npm install</code> on this branch.</p>
        <div class="det"><div class="sum">What Socket found</div></div>
        ${row(["button-finding"])}
      </div>
    </div>
  </div>

  <h4>Review</h4>
  <div class="review">
    ${head("reviewed now")}
    <div class="md">
      ${row(["logo", "priority-p1", "risk-high"])}
      <p>Adds refunds to the invoicing service: a <code>Refund</code> model, a router with list, summary and create endpoints, and two new <code>Invoice</code> statuses.</p>
      <p class="why"><b>High priority:</b> changes how money leaves the system. <b>High risk:</b> new write endpoint on <code>invoices</code>, 6 callers of <code>Invoice.status</code>.</p>
      ${row(["sev-high-3", "sev-medium-2", "sev-low-1"])}
      <p class="since">Since the last review ${row(["status-fixed-2", "status-new-1", "status-open-3"]).replace(/<\/?p[^>]*>/g, "")}</p>
      <table class="md-table">
        <thead><tr><th></th><th>Finding</th><th>Where</th></tr></thead>
        <tbody>
          <tr><td>${img("sev-high")}</td><td>Missing ownership check when creating a refund</td><td><a><code>refunds.py:41</code></a></td></tr>
          <tr><td>${img("sev-high")}</td><td>Refund amount stored as a float</td><td><a><code>models.py:88</code></a></td></tr>
          <tr><td>${img("sev-medium")}</td><td>Concurrent refunds can exceed the invoice balance</td><td><a><code>refunds.py:57</code></a></td></tr>
        </tbody>
      </table>
      <div class="det"><div class="sum">Key changes (4 files)</div></div>
      <div class="det"><div class="sum">How the change flows</div></div>
      <div class="det"><div class="sum">2 nits</div></div>
      ${row(["button-review"])}
    </div>
  </div>
</section>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: #8a9099; padding: 24px; font-family: -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; }
.title { color: #fff; font: 600 15px/1 "Segoe UI", sans-serif; margin: 0 0 16px 4px; }
.cols { display: flex; gap: 20px; align-items: stretch; }
.gh { flex: 1; width: 660px; padding: 20px 24px 28px; border-radius: 10px; }
.light { --bg: #ffffff; --subtle: #f6f8fa; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0; --code: rgba(129,139,152,.12); --link: #0969da; --add: #dafbe1; --addln: #aceebb; --del: #ffebe9; }
.dark { --bg: #0d1117; --subtle: #151b23; --fg: #f0f6fc; --muted: #9198a1; --border: #3d444d; --code: rgba(101,108,118,.2); --link: #4493f8; --add: rgba(46,160,67,.15); --addln: rgba(63,185,80,.3); --del: rgba(248,81,73,.1); }
.gh { background: var(--bg); color: var(--fg); }
.theme { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
h4 { margin: 18px 0 8px; font-size: 13px; color: var(--muted); font-weight: 600; }
p { margin: 0 0 10px; }
.badges { line-height: 0; margin: 0 0 8px; }
.badges img { vertical-align: middle; margin: 0 2px 4px 0; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 85%; background: var(--code); padding: .2em .4em; border-radius: 6px; }
.file { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.file-head { background: var(--subtle); border-bottom: 1px solid var(--border); padding: 8px 12px; font: 12px ui-monospace, Consolas, monospace; }
.diff { width: 100%; border-collapse: collapse; font: 12px/20px ui-monospace, Consolas, monospace; }
.diff .add { background: var(--add); }
.diff .ln { width: 44px; text-align: right; padding-right: 10px; color: var(--muted); background: var(--addln); }
.diff .code { padding-left: 10px; white-space: pre; }
.thread, .review { padding: 12px 16px 6px; border-top: 1px solid var(--border); background: var(--bg); }
.review { border: 1px solid var(--border); border-radius: 6px; }
.c-head { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 14px; }
.avatar { width: 20px; height: 20px; border-radius: 5px; background: #16191c; display: inline-flex; align-items: center; justify-content: center; }
.av { width: 14px; height: 14px; }
.bot { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 2em; padding: 0 7px; line-height: 18px; }
.muted { color: var(--muted); font-size: 13px; }
.why { font-size: 13px; color: var(--muted); }
.why b { color: var(--fg); font-weight: 600; }
.suggestion { border: 1px solid var(--border); border-radius: 6px; margin: 0 0 10px; overflow: hidden; font: 12px/20px ui-monospace, Consolas, monospace; }
.s-head { background: var(--subtle); padding: 6px 10px; font: 600 12px "Segoe UI", sans-serif; border-bottom: 1px solid var(--border); }
.s-del { background: var(--del); padding: 0 10px; white-space: pre; }
.s-add { background: var(--add); padding: 0 10px; white-space: pre; }
.s-foot { padding: 6px 10px; border-top: 1px solid var(--border); text-align: right; }
.gh-btn { font: 600 12px "Segoe UI", sans-serif; border: 1px solid var(--border); background: var(--subtle); border-radius: 6px; padding: 3px 10px; }
.det { margin: 0 0 8px; }
.det .sum { font-size: 14px; cursor: default; }
.det .sum::before { content: "▸ "; color: var(--muted); }
.det.open .sum::before { content: "▾ "; }
.det p { margin: 6px 0 0 16px; }
.since { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.since img { vertical-align: middle; }
.md-table { border-collapse: collapse; margin: 0 0 12px; width: 100%; }
.md-table th, .md-table td { border: 1px solid var(--border); padding: 6px 13px; text-align: left; }
.md-table th { font-weight: 600; }
.md-table tbody tr:nth-child(2n) { background: var(--subtle); }
.md-table td:first-child { width: 1%; white-space: nowrap; }
.md-table img { vertical-align: middle; }
.md-table a { color: var(--link); }
</style></head><body>
<div class="title">PR Guard badges</div>
<div class="cols">${column("light")}${column("dark")}</div>
</body></html>`;
}
