// @vitest-environment node
// OWNER: T3. The handshake and motion.css in a REAL browser (jsdom runs no CSS
// animations). Headless Chromium loads the actual app/tokens/core.css and
// src/styles/motion.css plus the <AnimHandshake /> markup, and the Web Animations
// API reads the CSS animations' timing, so the 1600ms is measured, not assumed.
//
// Holds one machine-wide `browser` slot (plan A12, same protocol as scripts/slot.sh).
// Skips, loudly, if Playwright's Chromium is not installed.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnimHandshake, FORCE_REVEAL_MS } from "@/motion/handshake";
import { loadTokens } from "../../../scripts/lib/tokens";

const WEB = path.resolve(import.meta.dirname, "../../..");
const HAS_BROWSER = existsSync(chromium.executablePath());
if (!HAS_BROWSER) console.warn("[motion] Playwright Chromium is not installed: the real-browser handshake tests are skipped (npx playwright install chromium)");

/** core.css + the `@theme static` values Tailwind would emit + motion.css, raw. Browsers drop @theme / @utility / @custom-variant. */
function stylesheet(): string {
  const model = loadTokens(WEB);
  const themed = [...model.layers.theme.values()].filter((d) => d.name.startsWith("--") && !d.name.includes("*") && !d.value.includes("var(--font"));
  const theme = `:root{${themed.map((d) => `${d.name}:${d.value}`).join(";")}}`;
  return [readFileSync(path.join(WEB, "app/tokens/core.css"), "utf8"), theme, readFileSync(path.join(WEB, "src/styles/motion.css"), "utf8")].join("\n");
}

function documentHtml(body: string): string {
  const handshake = renderToStaticMarkup(createElement(AnimHandshake));
  return `<!doctype html><html><head>${handshake}<style>${stylesheet()}</style></head><body>${body}</body></html>`;
}

// --- browser slot (scripts/slot.sh protocol) --------------------------------
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireSlot(timeoutMs = 300_000): Promise<() => void> {
  const root = process.env.PRGUARD_SLOT_DIR ?? path.join(process.env.TMPDIR ?? "/tmp", "prguard-slots");
  mkdirSync(root, { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (let i = 1; i <= 3; i++) {
      const dir = path.join(root, `browser.${i}`);
      try {
        mkdirSync(dir);
        writeFileSync(path.join(dir, "pid"), String(process.pid));
        return () => rmSync(dir, { recursive: true, force: true });
      } catch {
        const pidFile = path.join(dir, "pid");
        const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : NaN;
        const stale = Number.isFinite(pid) ? !alive(pid) : Date.now() - (statSync(dir, { throwIfNoEntry: false })?.mtimeMs ?? Date.now()) > 60_000;
        if (stale) rmSync(dir, { recursive: true, force: true });
      }
    }
    if (Date.now() > deadline) throw new Error("no free browser slot");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// --- helpers run in the page --------------------------------------------------
type Anim = { name: string; delay: number; duration: number; fill: string; easing: string; iterations: number };

/** CSS animations on the element. For CSS animations the timing function sits on each keyframe, not the effect. */
async function animations(page: Page, selector: string): Promise<Anim[]> {
  return page.$eval(selector, (el) =>
    el.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect;
      const t = effect.getTiming();
      return {
        name: (a as CSSAnimation).animationName,
        delay: Number(t.delay),
        duration: Number(t.duration),
        fill: String(t.fill),
        easing: String(effect.getKeyframes()[0]?.easing ?? t.easing),
        iterations: Number(t.iterations),
      };
    }),
  );
}

/** A token's computed colour, via a probe element. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement("i");
    probe.style.backgroundColor = `var(${t})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, token);

const style = (page: Page, selector: string, prop: string) => page.$eval(selector, (el, p) => getComputedStyle(el).getPropertyValue(p), prop);

let release: (() => void) | null = null;
let browser: Browser | null = null;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  release = await acquireSlot();
  browser = await chromium.launch();
}, 330_000);

afterAll(async () => {
  await browser?.close();
  release?.();
});

async function open(body: string, init: Parameters<Browser["newContext"]>[0] = {}): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser!.newContext(init);
  const page = await context.newPage();
  await page.setContent(documentHtml(body));
  return { page, context };
}

describe.skipIf(!HAS_BROWSER)("the fallback handshake in Chromium", () => {
  it("hides [data-anim] until the force-reveal fires at 1600ms when no runtime loads", async () => {
    const { page, context } = await open(`<p id="t" data-anim>content</p>`);
    expect(await style(page, "#t", "visibility")).toBe("hidden");
    expect(await animations(page, "#t")).toEqual([{ name: "prg-force-reveal", delay: FORCE_REVEAL_MS, duration: 0, fill: "forwards", easing: "ease", iterations: 1 }]);
    const frames = await page.$eval("#t", (el) => {
      const a = el.getAnimations()[0];
      const at = (ms: number) => {
        a.currentTime = ms;
        return getComputedStyle(el).visibility;
      };
      return [at(0), at(1599), at(1600), at(5000)];
    });
    expect(frames).toEqual(["hidden", "hidden", "visible", "visible"]);
    await context.close();
  });

  it("reveals by 1600ms on the real clock", async () => {
    const { page, context } = await open(`<p id="t" data-anim>content</p>`);
    const elapsed = await page.$eval(
      "#t",
      (el) =>
        new Promise<number>((resolve) => {
          const start = (el.getAnimations()[0].startTime as number) ?? performance.now();
          const poll = () => (getComputedStyle(el).visibility === "visible" ? resolve(performance.now() - start) : requestAnimationFrame(poll));
          poll();
        }),
    );
    expect(elapsed).toBeGreaterThanOrEqual(FORCE_REVEAL_MS - 20); // never early …
    expect(elapsed).toBeLessThan(FORCE_REVEAL_MS + 400); // … and on time (a frame or two under load)
    await context.close();
  }, 15_000);

  it("is disarmed by html.anim-ready: the runtime owns the reveal, and data-anim-in reveals it", async () => {
    const { page, context } = await open(`<p id="t" data-anim>content</p>`);
    await page.evaluate(() => document.documentElement.classList.add("anim-ready"));
    expect(await animations(page, "#t")).toEqual([]);
    await page.waitForTimeout(FORCE_REVEAL_MS + 200);
    expect(await style(page, "#t", "visibility")).toBe("hidden"); // the timer is gone
    await page.$eval("#t", (el) => el.setAttribute("data-anim-in", ""));
    expect(await style(page, "#t", "visibility")).toBe("visible");
    await context.close();
  }, 15_000);

  it("a late runtime (anim-late) keeps force-revealed content visible and static", async () => {
    const { page, context } = await open(`<p id="t" data-anim class="reveal">content</p>`);
    await page.$eval("#t", (el) => (el.getAnimations()[0].currentTime = 1700));
    expect(await style(page, "#t", "visibility")).toBe("visible");
    await page.evaluate(() => document.documentElement.classList.add("anim-late"));
    expect(await style(page, "#t", "visibility")).toBe("visible");
    expect(await animations(page, "#t")).toEqual([]);
    await context.close();
  });

  it("never hides anything with JavaScript disabled (noscript) or in print", async () => {
    const noJs = await open(`<p id="t" data-anim>content</p>`, { javaScriptEnabled: false });
    expect(await style(noJs.page, "#t", "visibility")).toBe("visible");
    await noJs.context.close();
    const print = await open(`<p id="t" data-anim>content</p>`);
    await print.page.emulateMedia({ media: "print" });
    expect(await style(print.page, "#t", "visibility")).toBe("visible");
    await print.context.close();
  });
});

describe.skipIf(!HAS_BROWSER)("motion.css in Chromium", () => {
  it(".stamp: the colour flips in 0ms whatever else asks for a transition; the scale is 180ms on --ease-snap", async () => {
    const { page, context } = await open(`
      <style>.utility { transition: background-color 120ms, color 120ms; }</style>
      <span id="s" class="stamp utility" style="transition: color 200ms; background-color: rgb(0, 0, 0)">PROVEN</span>`);
    expect(await style(page, "#s", "transition-duration")).toBe("0s");
    await page.$eval("#s", (el) => ((el as HTMLElement).style.backgroundColor = "rgb(46, 206, 221)"));
    expect(await style(page, "#s", "background-color")).toBe("rgb(46, 206, 221)"); // same frame: no tween
    await page.$eval("#s", (el) => el.setAttribute("data-stamp", "a"));
    expect(await animations(page, "#s")).toEqual([{ name: "prg-stamp-a", delay: 0, duration: 180, fill: "none", easing: "cubic-bezier(0.2, 0, 0, 1)", iterations: 1 }]);
    await page.$eval("#s", (el) => el.setAttribute("data-stamp", "b"));
    expect((await animations(page, "#s")).map((a) => a.name)).toEqual(["prg-stamp-b"]); // a ↔ b restarts it
    await context.close();
  });

  it(".heartbeat ticks on steps(1, end) at the telemetry period and stops when stale", async () => {
    const { page, context } = await open(`
      <span id="live" class="heartbeat" style="--heartbeat-period: 1200ms"></span>
      <span id="stale" class="heartbeat" data-stale></span>`);
    expect(await animations(page, "#live")).toEqual([{ name: "prg-tick", delay: 0, duration: 1200, fill: "none", easing: "steps(1)", iterations: Infinity }]);
    const opacityAt = await page.$eval("#live", (el) => {
      const a = el.getAnimations()[0];
      return [0, 100, 144, 600, 1199].map((t) => {
        a.currentTime = t;
        return getComputedStyle(el).opacity;
      });
    });
    expect(opacityAt).toEqual(["0.35", "0.35", "1", "1", "1"]); // 0.35 → 1 at 12% (144ms)
    expect(await animations(page, "#stale")).toEqual([]);
    expect(await style(page, "#stale", "opacity")).toBe("1");
    expect(await style(page, "#stale", "background-color")).toBe(await tokenColour(page, "--marker"));
    expect(await style(page, "#live", "background-color")).toBe(await tokenColour(page, "--signal"));
    await context.close();
  });

  it(".reveal runs only under html.anim-ready, on --dur-enter, staggered and capped at the 6th item", async () => {
    const items = Array.from({ length: 8 }, (_, i) => `<li id="r${i}" data-anim class="reveal" style="--reveal-index:${Math.min(i, 5)}">${i}</li>`).join("");
    const { page, context } = await open(`<ul>${items}</ul><div data-surface="app"><p id="app" data-anim class="reveal">app</p></div><p id="rise" data-anim class="reveal reveal-rise">rise</p>`);
    await page.evaluate(() => document.querySelectorAll("[data-anim]").forEach((el) => el.setAttribute("data-anim-in", "")));
    expect((await animations(page, "#r0")).map((a) => a.name)).toEqual(["prg-force-reveal"]); // pending: no reveal animation yet
    await page.evaluate(() => document.documentElement.classList.add("anim-ready"));
    const first = await animations(page, "#r0");
    expect(first).toEqual([{ name: "prg-reveal", delay: 0, duration: 420, fill: "both", easing: "cubic-bezier(0.33, 0, 0.12, 1)", iterations: 1 }]);
    expect((await animations(page, "#r5"))[0].delay).toBe(300);
    expect((await animations(page, "#r7"))[0].delay).toBe(300); // the cap
    expect((await animations(page, "#app"))[0].duration).toBe(180); // the dashboard's --dur-enter
    expect((await animations(page, "#rise"))[0].name).toBe("prg-reveal-rise");
    await context.close();
  });

  it(".draw and .scan restart on a ↔ b and rest drawn / hidden", async () => {
    const { page, context } = await open(`
      <svg width="100" height="100"><path id="d" class="draw" pathLength="1" d="M0 0 L100 0" stroke="red"/></svg>
      <i id="scan" class="scan" style="--scan-travel: 400px"></i>`);
    expect(await animations(page, "#d")).toEqual([]);
    expect(await style(page, "#d", "stroke-dasharray")).toBe("1px");
    expect(await style(page, "#d", "stroke-dashoffset")).toBe("0px"); // rests drawn
    await page.$eval("#d", (el) => el.setAttribute("data-draw", "a"));
    expect((await animations(page, "#d"))[0]).toMatchObject({ name: "prg-draw-a", duration: 420, easing: "cubic-bezier(0.33, 0, 0.12, 1)" });
    await page.$eval("#scan", (el) => el.setAttribute("data-scan", "a"));
    expect((await animations(page, "#scan"))[0]).toMatchObject({ name: "prg-scan-a", duration: 1400, easing: "cubic-bezier(0.52, 0, 0.08, 1)" });
    await context.close();
  });

  it("reduced motion is a designed second state, for BOTH the OS preference and html[data-motion=reduced]", async () => {
    const body = `
      <span id="s" class="stamp" data-stamp="a">PROVEN</span>
      <span id="h" class="heartbeat"></span>
      <svg><path id="d" class="draw" pathLength="1" d="M0 0 L9 0" data-draw="a"/></svg>
      <svg><path id="d2" class="draw" pathLength="1" d="M0 0 L9 0" data-anim data-anim-in/></svg>
      <i id="scan" class="scan" data-scan="a"></i>
      <p id="r" data-anim data-anim-in class="reveal reveal-rise" style="--reveal-index:2">reveal</p>`;
    for (const trigger of ["os", "attribute"] as const) {
      const { page, context } = await open(body, trigger === "os" ? { reducedMotion: "reduce" } : {});
      await page.evaluate((t) => {
        document.documentElement.classList.add("anim-ready");
        if (t === "attribute") document.documentElement.setAttribute("data-motion", "reduced");
      }, trigger);
      expect(await animations(page, "#s"), trigger).toEqual([]); // scale dropped, colour unaffected
      expect(await animations(page, "#h"), trigger).toEqual([]);
      expect(await style(page, "#h", "opacity"), trigger).toBe("1"); // static, fully visible
      expect(await animations(page, "#d"), trigger).toEqual([]);
      expect(await animations(page, "#d2"), trigger).toEqual([]);
      expect(await style(page, "#d2", "visibility"), trigger).toBe("visible"); // drawn, complete
      expect(await animations(page, "#scan"), trigger).toEqual([]); // never runs
      expect(await animations(page, "#r"), trigger).toEqual([{ name: "prg-reveal", delay: 120, duration: 120, fill: "both", easing: "cubic-bezier(0.33, 0, 0.12, 1)", iterations: 1 }]);
      await context.close();
    }
  });
});
