// @vitest-environment node
// OWNER: T3. The handshake, the revealer and motion.css in a REAL browser (jsdom runs
// no CSS animations and has no Web Animations API). Headless Chromium loads the actual
// app/tokens/core.css and src/styles/motion.css plus the <AnimHandshake /> markup; the
// real markAnimReady() (bundled from src/motion with esbuild) is injected where a test
// needs the runtime. The Web Animations API reads the CSS animations' timing, so the
// 1600ms is measured, not assumed.
//
// Holds one machine-wide `browser` slot (plan A12, same protocol as scripts/slot.sh).
// Skips, loudly, if Playwright's Chromium (or esbuild, for the runtime tests) is missing.
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

/** The real runtime half of the handshake, as a browser script defining window.__motion. */
async function runtimeBundle(): Promise<string | null> {
  try {
    const esbuild = await import("esbuild");
    const out = await esbuild.build({
      stdin: {
        contents: [
          `export { markAnimReady, animReadyInfo } from "./src/motion/handshake";`,
          `export { pendingReveals } from "./src/motion/reveal";`,
          `export { drawLength, fitDraw } from "./src/motion/draw";`,
          `export { retrigger } from "./src/motion/stamp";`,
        ].join("\n"),
        resolveDir: WEB,
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "iife",
      globalName: "__motion",
      platform: "browser",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    return out.outputFiles[0].text;
  } catch (error) {
    console.warn("[motion] could not bundle src/motion for the browser; the runtime tests are skipped", error);
    return null;
  }
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

const names = async (page: Page, selector: string) => (await animations(page, selector)).map((a) => a.name);

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
const attr = (page: Page, selector: string, name: string) => page.$eval(selector, (el, n) => el.getAttribute(n), name);

let release: (() => void) | null = null;
let browser: Browser | null = null;
let bundle: string | null = null;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  bundle = await runtimeBundle();
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

/** Inject the real runtime half (markAnimReady + the revealer). */
async function withRuntime(page: Page): Promise<void> {
  await page.addScriptTag({ content: bundle! });
}

type Ready = { runtime: string | null; at: number; kept: number } | null;
const markReady = (page: Page) => page.evaluate(() => (window as unknown as { __motion: { markAnimReady(r: string): Ready } }).__motion.markAnimReady("gsap"));

// Real-clock Chromium checks: under many parallel builds the page can take longer than the
// animation itself to become scriptable. The behaviour is deterministic on an idle machine;
// retries absorb scheduler noise without loosening any assertion.
describe.skipIf(!HAS_BROWSER)("the fallback handshake in Chromium", { retry: 2 }, () => {
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

  it("is disarmed by html.anim-ready: the timer is gone and data-anim-in reveals it", async () => {
    const { page, context } = await open(`<p id="t" data-anim>content</p>`);
    await page.evaluate(() => document.documentElement.classList.add("anim-ready"));
    expect(await animations(page, "#t")).toEqual([]);
    await page.waitForTimeout(FORCE_REVEAL_MS + 200);
    expect(await style(page, "#t", "visibility")).toBe("hidden"); // the timer is gone
    await page.$eval("#t", (el) => el.setAttribute("data-anim-in", ""));
    expect(await style(page, "#t", "visibility")).toBe("visible");
    await context.close();
  }, 15_000);

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

describe.skipIf(!HAS_BROWSER)("markAnimReady and the revealer in Chromium", () => {
  const page2 = (id: string) => `<p id="${id}" data-anim class="reveal">${id}</p>`;
  const BELOW = `<div style="height: 250vh"></div>`;
  // Room after the last element, so it can scroll past the 84% line.
  const TAIL = `<div style="height: 100vh"></div>`;

  it("on time: in-view content reveals at once, staggered; content below the fold waits for the scroll", async ({ skip }) => {
    if (!bundle) skip();
    const { page, context } = await open(`${page2("a")}${page2("b")}${BELOW}${page2("below")}${TAIL}`);
    await withRuntime(page);
    const ready = await markReady(page);
    expect(ready).toMatchObject({ runtime: "gsap", kept: 0 });
    await page.waitForFunction(() => document.getElementById("b")?.hasAttribute("data-anim-in"));
    expect([await attr(page, "#a", "data-anim-in"), await attr(page, "#b", "data-anim-in")]).toEqual(["", ""]);
    expect((await animations(page, "#a"))[0]).toMatchObject({ name: "prg-reveal", delay: 0, duration: 420 });
    expect((await animations(page, "#b"))[0]).toMatchObject({ name: "prg-reveal", delay: 60 }); // the sibling stagger
    expect(await style(page, "#below", "visibility")).toBe("hidden");
    expect(await animations(page, "#below")).toEqual([]); // disarmed: the revealer owns it now
    await page.$eval("#below", (el) => el.scrollIntoView());
    await page.waitForFunction(() => document.getElementById("below")?.getAttribute("data-anim-in") === "");
    expect(await style(page, "#below", "visibility")).toBe("visible");
    await context.close();
  });

  it("late: content whose force-reveal fired stays visible and still (static); content mounted since is revealed normally", async ({ skip }) => {
    if (!bundle) skip();
    const { page, context } = await open(`${page2("shown")}${BELOW}`);
    await withRuntime(page);
    // #shown's timer has fired (the runtime is late) …
    await page.$eval("#shown", (el, fired) => (el.getAnimations()[0].currentTime = fired), FORCE_REVEAL_MS + 100);
    expect(await style(page, "#shown", "visibility")).toBe("visible");
    // … and #later was mounted a moment ago, so its own timer has not.
    await page.evaluate((tail) => document.body.insertAdjacentHTML("beforeend", `<p id="later" data-anim class="reveal">later</p>${tail}`), TAIL);
    const ready = await markReady(page);
    expect(ready?.kept).toBe(1);
    expect(await attr(page, "#shown", "data-anim-in")).toBe("static");
    expect(await style(page, "#shown", "visibility")).toBe("visible"); // never flashed back to hidden
    expect(await animations(page, "#shown")).toEqual([]); // and it does not animate in again
    expect(await style(page, "#later", "visibility")).toBe("hidden");
    await page.$eval("#later", (el) => el.scrollIntoView());
    await page.waitForFunction(() => document.getElementById("later")?.getAttribute("data-anim-in") === "");
    expect(await names(page, "#later")).toEqual(["prg-reveal"]);
    await context.close();
  });

  it("content mounted after the runtime loaded is revealed too", async ({ skip }) => {
    if (!bundle) skip();
    const { page, context } = await open(`<main id="m"></main>`);
    await withRuntime(page);
    await markReady(page);
    await page.evaluate(() => document.getElementById("m")!.insertAdjacentHTML("beforeend", `<ul><li id="x" data-anim class="reveal">x</li><li id="y" data-anim class="reveal reveal-rise">y</li></ul>`));
    await page.waitForFunction(() => document.getElementById("y")?.hasAttribute("data-anim-in"));
    expect(await names(page, "#x")).toEqual(["prg-reveal"]);
    expect(await names(page, "#y")).toEqual(["prg-reveal-rise"]);
    expect(await page.evaluate(() => (window as unknown as { __motion: { pendingReveals(): number } }).__motion.pendingReveals())).toBe(0);
    await context.close();
  });

  it("a scaled non-scaling hairline gets a dash that covers it: fitDraw measures the screen-to-user ratio", async ({ skip }) => {
    if (!bundle) skip();
    // viewBox 100 wide drawn 200px wide: a 2x scale.
    const { page, context } = await open(`
      <svg width="200" height="20" viewBox="0 0 100 10">
        <path id="hair" class="draw" pathLength="1" d="M0 5 C30 5 70 5 100 5" stroke="red" fill="none" vector-effect="non-scaling-stroke"/>
        <path id="plain" class="draw" pathLength="1" d="M0 8 H100" stroke="red"/>
      </svg>
      <svg width="50" height="5" viewBox="0 0 100 10"><path id="small" class="draw" pathLength="1" d="M0 5 H100" stroke="red" vector-effect="non-scaling-stroke"/></svg>`);
    await withRuntime(page);
    type M = { drawLength(el: Element): number; retrigger(el: Element, attr: string): void };
    const lengths = await page.evaluate(() => {
      const m = (window as unknown as { __motion: M }).__motion;
      return ["hair", "plain", "small"].map((id) => m.drawLength(document.getElementById(id)!));
    });
    expect(lengths[0]).toBeCloseTo(2, 2);
    expect(lengths[1]).toBe(1); // a scaling stroke's dash already follows the path
    expect(lengths[2]).toBeCloseTo(0.5, 2); // drawn smaller than its viewBox: a shorter dash
    await page.evaluate(() => (window as unknown as { __motion: M }).__motion.retrigger(document.getElementById("hair")!, "data-draw"));
    const start = await page.$eval("#hair", (el) => {
      el.getAnimations()[0].currentTime = 0;
      const cs = getComputedStyle(el);
      return [el.style.getPropertyValue("--draw-len"), cs.strokeDasharray, cs.strokeDashoffset];
    });
    expect(start).toEqual(["2", "2px, 2px", "2px"]);
    await context.close();
  });

  it("the first runtime decides; a second call changes nothing", async ({ skip }) => {
    if (!bundle) skip();
    const { page, context } = await open(page2("a"));
    await withRuntime(page);
    expect(await markReady(page)).not.toBeNull();
    expect(await markReady(page)).toBeNull();
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-anim-runtime"))).toBe("gsap");
    await context.close();
  });
});

describe.skipIf(!HAS_BROWSER)("motion.css in Chromium", () => {
  it(".stamp: the colour flips in 0ms whatever else asks for a transition; controlled rest / a / b", async () => {
    const { page, context } = await open(`
      <style>.utility { transition: background-color 120ms, color 120ms; }</style>
      <span id="s" class="stamp utility" data-stamp="rest" style="transition: color 200ms; background-color: rgb(0, 0, 0)">PROVEN</span>`);
    expect(await style(page, "#s", "transition-duration")).toBe("0s");
    expect(await style(page, "#s", "display")).toBe("inline-block"); // a scale needs a box
    expect(await animations(page, "#s")).toEqual([]); // rest: a page load is not a verdict
    await page.$eval("#s", (el) => ((el as HTMLElement).style.backgroundColor = "rgb(46, 206, 221)"));
    expect(await style(page, "#s", "background-color")).toBe("rgb(46, 206, 221)"); // same frame: no tween
    await page.$eval("#s", (el) => el.setAttribute("data-stamp", "a"));
    expect(await animations(page, "#s")).toEqual([{ name: "prg-stamp-a", delay: 0, duration: 180, fill: "none", easing: "cubic-bezier(0.2, 0, 0, 1)", iterations: 1 }]);
    await page.$eval("#s", (el) => el.setAttribute("data-stamp", "b"));
    expect(await names(page, "#s")).toEqual(["prg-stamp-b"]); // a ↔ b restarts it
    await context.close();
  });

  it(".stamp: declarative, it plays once when the class arrives or the element mounts with it", async () => {
    const { page, context } = await open(`<span id="chip" class="chip">PROVEN</span><div id="host"></div>`);
    expect(await animations(page, "#chip")).toEqual([]);
    await page.$eval("#chip", (el) => el.classList.add("stamp"));
    expect((await animations(page, "#chip"))[0]).toMatchObject({ name: "prg-stamp", duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    await page.$eval("#host", (el) => (el.innerHTML = `<svg id="dot" class="stamp" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>`));
    expect(await names(page, "#dot")).toEqual(["prg-stamp"]); // a re-mount (React key change) stamps
    await context.close();
  });

  it(".heartbeat ticks on steps(1, end) at the telemetry period, lags in --marker, and stops when stale", async () => {
    const { page, context } = await open(`
      <span id="live" class="heartbeat" style="--heartbeat-period: 1200ms"></span>
      <span id="lag" class="heartbeat" data-lagging></span>
      <span id="stale" class="heartbeat" data-stale></span>
      <svg width="10" height="10"><circle id="ring" class="heartbeat" cx="5" cy="5" r="4" fill="none" stroke="red"/></svg>`);
    expect(await animations(page, "#live")).toEqual([{ name: "prg-tick", delay: 0, duration: 1200, fill: "none", easing: "steps(1)", iterations: Infinity }]);
    const opacityAt = await page.$eval("#live", (el) => {
      const a = el.getAnimations()[0];
      return [0, 100, 144, 600, 1199].map((t) => {
        a.currentTime = t;
        return getComputedStyle(el).opacity;
      });
    });
    expect(opacityAt).toEqual(["0.35", "0.35", "1", "1", "1"]); // 0.35 → 1 at 12% (144ms)
    expect(await style(page, "#live", "background-color")).toBe(await tokenColour(page, "--signal"));
    expect([await style(page, "#live", "width"), await style(page, "#live", "height"), await style(page, "#live", "border-radius")]).toEqual(["6px", "6px", "9999px"]);
    expect(await names(page, "#lag")).toEqual(["prg-tick"]); // still ticking …
    expect(await style(page, "#lag", "background-color")).toBe(await tokenColour(page, "--marker")); // … in --marker
    expect(await style(page, "#lag", "transition-duration")).toBe("0.12s");
    expect(await animations(page, "#stale")).toEqual([]);
    expect(await style(page, "#stale", "opacity")).toBe("1");
    expect(await style(page, "#stale", "background-color")).toBe(await tokenColour(page, "--marker"));
    expect(await style(page, "#stale", "transition-duration")).toBe("0s"); // the stale flip is 0ms
    expect(await names(page, "#ring")).toEqual(["prg-tick"]); // an SVG ring ticks …
    expect(await style(page, "#ring", "background-color")).toBe("rgba(0, 0, 0, 0)"); // … without the dot's box
    await context.close();
  });

  it(".reveal runs only under html.anim-ready for data-anim-in=\"\", staggered and capped at the 6th item; \"static\" never animates", async () => {
    const items = Array.from({ length: 8 }, (_, i) => `<li id="r${i}" data-anim class="reveal" style="--reveal-index:${Math.min(i, 5)}">${i}</li>`).join("");
    const { page, context } = await open(
      `<ul>${items}</ul><div data-surface="app"><p id="app" data-anim class="reveal">app</p></div><p id="rise" data-anim class="reveal reveal-rise">rise</p><p id="still" data-anim class="reveal">still</p>`,
    );
    await page.evaluate(() => document.querySelectorAll("[data-anim]:not(#still)").forEach((el) => el.setAttribute("data-anim-in", "")));
    await page.$eval("#still", (el) => el.setAttribute("data-anim-in", "static"));
    expect(await names(page, "#r0")).toEqual(["prg-force-reveal"]); // pending: no reveal animation yet
    await page.evaluate(() => document.documentElement.classList.add("anim-ready"));
    expect(await animations(page, "#r0")).toEqual([{ name: "prg-reveal", delay: 0, duration: 420, fill: "both", easing: "cubic-bezier(0.33, 0, 0.12, 1)", iterations: 1 }]);
    expect((await animations(page, "#r5"))[0].delay).toBe(300);
    expect((await animations(page, "#r7"))[0].delay).toBe(300); // the cap
    expect((await animations(page, "#app"))[0].duration).toBe(180); // the dashboard's --dur-enter
    expect((await animations(page, "#rise"))[0].name).toBe("prg-reveal-rise");
    expect(await animations(page, "#still")).toEqual([]);
    expect(await style(page, "#still", "visibility")).toBe("visible");
    await context.close();
  });

  it(".draw restarts on a ↔ b and rests drawn and solid; .scan travels once on --ease-mass and rests collapsed", async () => {
    const { page, context } = await open(`
      <svg width="100" height="100"><path id="d" class="draw" pathLength="1" d="M0 0 L100 0" stroke="red"/></svg>
      <i id="scan" class="scan" style="display: block; height: 2px; --scan-travel: 400px"></i>`);
    expect(await animations(page, "#d")).toEqual([]);
    expect(await style(page, "#d", "stroke-dasharray")).toBe("none"); // no dash at rest: solid at any scale
    expect(await style(page, "#d", "stroke-dashoffset")).toBe("0px");
    await page.$eval("#d", (el) => el.setAttribute("data-draw", "a"));
    expect((await animations(page, "#d"))[0]).toMatchObject({ name: "prg-draw-a", duration: 420, fill: "backwards", easing: "cubic-bezier(0.33, 0, 0.12, 1)" });
    const frames = await page.$eval("#d", (el) => {
      const a = el.getAnimations()[0];
      // Pause before seeking: left running at 419ms, the 420ms animation finishes (and is
      // removed, fill: backwards) before the next $eval can .finish() it, a race that
      // failed under load.
      a.pause();
      const at = (t: number) => {
        a.currentTime = t;
        const cs = getComputedStyle(el);
        return { dash: cs.strokeDasharray, offset: Number.parseFloat(cs.strokeDashoffset) };
      };
      return [at(0), at(419)];
    });
    expect(frames[0]).toEqual({ dash: "1px, 1px", offset: 1 }); // undrawn: the dash is shifted off the path
    expect(frames[1].dash).toBe("1px, 1px");
    expect(frames[1].offset).toBeLessThan(0.001); // drawn
    await page.$eval("#d", (el) => el.getAnimations()[0].finish());
    expect(await style(page, "#d", "stroke-dasharray")).toBe("none"); // hands back to the solid path
    await page.$eval("#d", (el) => el.setAttribute("data-draw", "rest"));
    expect(await animations(page, "#d")).toEqual([]);
    expect(await style(page, "#scan", "scale")).toBe("1 0"); // collapsed: the line exists only while it moves
    await page.$eval("#scan", (el) => el.setAttribute("data-scan", "a"));
    expect((await animations(page, "#scan"))[0]).toMatchObject({ name: "prg-scan-a", duration: 1400, easing: "cubic-bezier(0.52, 0, 0.08, 1)" });
    const mid = await page.$eval("#scan", (el) => {
      el.getAnimations()[0].pause();
      el.getAnimations()[0].currentTime = 700;
      const cs = getComputedStyle(el);
      return { scale: cs.scale, opacity: cs.opacity };
    });
    expect(mid).toEqual({ scale: "1", opacity: "0.6" });
    await context.close();
  });

  it("reduced motion is a designed second state, for BOTH the OS preference and html[data-motion=reduced]", async () => {
    const body = `
      <span id="s" class="stamp" data-stamp="a">PROVEN</span>
      <span id="s2" class="stamp">PROVEN</span>
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
      expect(await animations(page, "#s2"), trigger).toEqual([]);
      expect(await animations(page, "#h"), trigger).toEqual([]);
      expect(await style(page, "#h", "opacity"), trigger).toBe("1"); // static, fully visible
      expect(await animations(page, "#d"), trigger).toEqual([]);
      expect(await animations(page, "#d2"), trigger).toEqual([]);
      expect(await style(page, "#d2", "visibility"), trigger).toBe("visible"); // drawn, complete
      expect(await style(page, "#d2", "stroke-dashoffset"), trigger).toBe("0px");
      expect(await animations(page, "#scan"), trigger).toEqual([]); // never runs
      expect(await animations(page, "#r"), trigger).toEqual([{ name: "prg-reveal", delay: 120, duration: 120, fill: "both", easing: "cubic-bezier(0.33, 0, 0.12, 1)", iterations: 1 }]);
      await context.close();
    }
  });
});
