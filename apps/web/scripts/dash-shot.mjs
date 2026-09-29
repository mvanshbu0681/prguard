#!/usr/bin/env node
// Screenshot a dashboard route in light and/or dark, for visual review.
//
//   node scripts/dash-shot.mjs <path> [--theme light|dark|both] [--width 1440] [--height 900]
//        [--full] [--out <dir>] [--name <prefix>] [--wait 1500] [--scroll <px>]
//        [--click "<css or text=… selector>"]... [--local key=value]...
//
// Uses the system Chrome (no Playwright browser download) against the dev
// server at DASH_URL (default http://localhost:3401). Prints the PNG paths.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const route = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && args[args.indexOf(a) - 1]?.startsWith("--") !== true) ?? "/overview";
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : args[i + 1];
};
const flag = (k) => args.includes(`--${k}`);
const many = (k) => args.flatMap((a, i) => (a === `--${k}` && args[i + 1] ? [args[i + 1]] : []));
const clicks = many("click");
const locals = many("local").map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]);
const base = process.env.DASH_URL ?? "http://localhost:3401";
const themeArg = opt("theme", "both");
const themes = themeArg === "both" ? ["light", "dark"] : [themeArg];
const width = Number(opt("width", 1440));
const height = Number(opt("height", 900));
const out = opt("out", path.resolve(process.env.TMPDIR ?? "/tmp", "dash-shots"));
const name = opt("name", route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root");
const wait = Number(opt("wait", 1500));
const scroll = Number(opt("scroll", 0));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await ctx.addInitScript(
      ([t, kvs]) => {
        try {
          localStorage.setItem("witness:dash-theme", t);
          for (const [k, v] of kvs) localStorage.setItem(k, v);
        } catch {}
      },
      [theme, locals],
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(wait);
    for (const sel of clicks) {
      await page.locator(sel).first().click();
      await page.waitForTimeout(700);
    }
    let file = path.join(out, `${name}-${theme}-${width}.png`);
    if (flag("full")) {
      // The dashboard scrolls inside <main>, not the window: grow the viewport to the content.
      const h = await page.evaluate(() => {
        const m = document.querySelector("main#main");
        return m ? m.scrollHeight + 24 : document.documentElement.scrollHeight;
      });
      await page.setViewportSize({ width, height: Math.min(Math.max(h, height), 12000) });
      await page.waitForTimeout(400);
    } else if (scroll) {
      await page.evaluate((y) => document.querySelector("main#main")?.scrollTo(0, y), scroll);
      await page.waitForTimeout(400);
      file = path.join(out, `${name}-${theme}-${width}-y${scroll}.png`);
    }
    await page.screenshot({ path: file });
    console.log(file);
    if (errors.length) console.log(`  console errors (${theme}):\n   - ` + [...new Set(errors)].slice(0, 8).join("\n   - "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
