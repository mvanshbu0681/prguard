// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// `npx playwright test` — end-to-end tests in tests/e2e against `next dev`.
// PLAYWRIGHT_BASE_URL=<url>  test an already-running server; no web server is started.
// PLAYWRIGHT_PORT=<port>     (default 3100) the port for the dev server started here. Use your
//                            track's own dev port when several worktrees run tests at once.
// The dev server is started through scripts/slot.sh, so it holds one of the machine-wide
// `browser` slots (plan A12) while the suite runs, and is stopped when the suite ends.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const external = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = external ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: `bash scripts/slot.sh browser npm run dev -- -p ${port}`,
        url: baseURL,
        // Never attach to someone else's server on this port (another worktree's code).
        reuseExistingServer: false,
        // Includes time spent queueing for a browser slot and the first compile.
        timeout: 600_000,
        stdout: "ignore",
        stderr: "pipe",
        // SIGTERM first so slot.sh's trap releases the slot; SIGKILL after 5s.
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      },
});
