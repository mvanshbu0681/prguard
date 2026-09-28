#!/usr/bin/env node
// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// Screenshot routes of a running Witness dev server with Playwright's chromium.
// Normally driven by scripts/shoot.sh, which owns the dev server and the browser
// slot. Run it directly only against a server you manage (pass --port or --base-url).
//
// For every route × width:
//   <out>/<slug>@<w>.png              viewport, after load + document.fonts.ready + --settle ms
//   <out>/<slug>@<w>-full.png         full page (--full)
//   <out>/<slug>@<w>-t<ms>.png        --timeline: <ms> after the load event (animation frames)
//   <out>/<slug>@<w>-press.png        --press: keys sent after the base shot, then --settle
//   <out>/<slug>@<w>-press-t<ms>.png  --press + --timeline: <ms> after the last key press
//   <out>/report.json                 status, console/page errors, failed requests, overflow
// <slug>: the route with "/" → "-", other unsafe characters → "_", "/" itself → "root".
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const USAGE = `usage: shoot.mjs --port <p> --out <dir> --route <path> [--route <path>...]
       [--width 375,768,1280,1440] [--height 900] [--settle <ms>] [--timeline <ms,ms,...>]
       [--press <key>]... [--reduced-motion] [--full] [--contrast high] [--lenient] [--base-url <url>]
  --timeline      extra screenshots at these ms after load (and after --press, if given)
  --press         a key for page.keyboard.press (e.g. P, Shift+D, Escape); repeatable, sent in order
  --reduced-motion  emulate prefers-reduced-motion: reduce
  --contrast high   set data-contrast="high" on <html> right after load
  --lenient       exit 0 whenever screenshots were written (e.g. a deliberate 404 route)
exit status: 1 if any shot had a navigation failure, HTTP >= 400, a page or console error,
a failed sub-resource (HTTP >= 400) or horizontal overflow (scrollWidth > innerWidth).`;

function die(msg) {
  console.error(`shoot.mjs: ${msg}\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { port: null, baseUrl: null, out: null, routes: [], widths: [375, 768, 1280, 1440], height: 900, settle: 1500, timeline: [], press: [], reducedMotion: false, full: false, contrast: null, lenient: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) die(`${a} needs a value`);
      return v;
    };
    const nums = (s) => s.split(",").filter(Boolean).map((x) => {
      const n = Number(x);
      if (!Number.isFinite(n) || n < 0) die(`${a}: "${x}" is not a non-negative number`);
      return n;
    });
    switch (a) {
      case "--port": o.port = nums(val())[0]; break;
      case "--base-url": o.baseUrl = val().replace(/\/$/, ""); break;
      case "--out": o.out = val(); break;
      case "--route": {
        const r = val();
        o.routes.push(r.startsWith("/") ? r : `/${r}`);
        break;
      }
      case "--width": o.widths = nums(val()); break;
      case "--height": o.height = nums(val())[0]; break;
      case "--settle": o.settle = nums(val())[0]; break;
      case "--timeline": o.timeline = nums(val()).sort((x, y) => x - y); break;
      case "--press": o.press.push(val()); break;
      case "--reduced-motion": o.reducedMotion = true; break;
      case "--full": o.full = true; break;
      case "--contrast": {
        o.contrast = val();
        if (o.contrast !== "high") die(`--contrast only accepts "high"`);
        break;
      }
      case "--lenient": o.lenient = true; break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        die(`unknown argument ${a}`);
    }
  }
  if (!o.baseUrl && !o.port) die("--port (or --base-url) is required");
  if (!o.out) die("--out is required");
  if (o.routes.length === 0) die("at least one --route is required");
  if (o.widths.length === 0) die("--width needs at least one width");
  return o;
}

function slug(route) {
  const s = route.replace(/^\/+|\/+$/g, "").replace(/\//g, "-").replace(/[^A-Za-z0-9._-]/g, "_");
  return s || "root";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(t0, ms) {
  const wait = t0 + ms - Date.now();
  if (wait > 0) await sleep(wait);
}

async function shootOne(browser, o, base, route, width) {
  const r = { route, width, height: o.height, url: `${base}${route}`, status: null, title: null, consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [], overflowX: null, scrollWidth: null, innerWidth: null, shots: [], error: null };
  const context = await browser.newContext({
    viewport: { width, height: o.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: o.reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") r.consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => r.pageErrors.push(String(e?.message ?? e)));
  page.on("requestfailed", (q) => r.failedRequests.push({ url: q.url(), failure: q.failure()?.errorText ?? "failed" }));
  page.on("response", (s) => {
    if (s.status() >= 400 && s.request().resourceType() !== "document") r.badResponses.push({ url: s.url(), status: s.status() });
  });
  const name = `${slug(route)}@${width}`;
  const shot = async (suffix, full = false) => {
    const file = path.join(o.out, `${name}${suffix}.png`);
    await page.screenshot({ path: file, fullPage: full });
    r.shots.push(path.basename(file));
  };
  try {
    const resp = await page.goto(r.url, { waitUntil: "load", timeout: 120_000 });
    const t0 = Date.now();
    r.status = resp ? resp.status() : null;
    if (o.contrast === "high") await page.evaluate(() => document.documentElement.setAttribute("data-contrast", "high"));
    for (const ms of o.timeline) {
      await until(t0, ms);
      await shot(`-t${ms}`);
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await sleep(o.settle);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, title: document.title }));
    r.scrollWidth = m.sw;
    r.innerWidth = m.iw;
    r.overflowX = m.sw > m.iw;
    r.title = m.title;
    await shot("");
    if (o.full) await shot("-full", true);
    if (o.press.length) {
      for (const key of o.press) {
        await page.keyboard.press(key);
        await sleep(50);
      }
      const t1 = Date.now();
      for (const ms of o.timeline) {
        await until(t1, ms);
        await shot(`-press-t${ms}`);
      }
      await sleep(o.settle);
      await shot("-press");
    }
  } catch (e) {
    r.error = String(e?.message ?? e).split("\n")[0];
  } finally {
    await context.close();
  }
  r.issues = [
    r.error && `error: ${r.error}`,
    r.status === null && !r.error && "no response",
    r.status !== null && r.status >= 400 && `HTTP ${r.status}`,
    r.pageErrors.length && `${r.pageErrors.length} page error(s)`,
    r.consoleErrors.length && `${r.consoleErrors.length} console error(s)`,
    r.badResponses.length && `${r.badResponses.length} sub-resource(s) >= 400`,
    r.overflowX && `horizontal overflow (${r.scrollWidth} > ${r.innerWidth})`,
  ].filter(Boolean);
  return r;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const base = o.baseUrl ?? `http://localhost:${o.port}`;
  o.out = path.resolve(process.cwd(), o.out);
  await fs.mkdir(o.out, { recursive: true });
  // Own the signals: Playwright's default SIGTERM handler closes the browser but
  // leaves this process running, which would keep shoot.sh (and the dev server) alive.
  const browser = await chromium.launch({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
  for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
    process.on(sig, () => {
      const bye = () => process.exit(code);
      setTimeout(bye, 2000).unref();
      browser.close().then(bye, bye);
    });
  }
  const results = [];
  try {
    for (const route of o.routes) {
      for (const width of o.widths) {
        const r = await shootOne(browser, o, base, route, width);
        results.push(r);
        const counts = `console ${r.consoleErrors.length} · page ${r.pageErrors.length} · failed ${r.failedRequests.length} · http>=400 ${r.badResponses.length} · overflow ${r.overflowX === null ? "?" : r.overflowX ? "YES" : "no"}`;
        console.log(`${r.issues.length ? "FAIL" : "ok  "} ${route} @${width}  ${r.status ?? "---"}  ${counts}  → ${r.shots.join(", ") || "(no screenshot)"}`);
        for (const i of r.issues) console.log(`       ${i}`);
        for (const e of [...r.pageErrors, ...r.consoleErrors].slice(0, 5)) console.log(`       | ${e.split("\n")[0].slice(0, 200)}`);
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    base,
    options: { widths: o.widths, height: o.height, settle: o.settle, timeline: o.timeline, press: o.press, reducedMotion: o.reducedMotion, full: o.full, contrast: o.contrast },
    results,
  };
  await fs.writeFile(path.join(o.out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  const bad = results.filter((r) => r.issues.length).length;
  const wrote = results.every((r) => r.shots.length > 0);
  console.log(`shoot: ${results.length - bad}/${results.length} clean · report ${path.join(o.out, "report.json")}`);
  process.exit(o.lenient ? (wrote ? 0 : 1) : bad ? 1 : 0);
}

main().catch((e) => {
  console.error(`shoot.mjs: ${e?.stack ?? e}`);
  process.exit(1);
});
