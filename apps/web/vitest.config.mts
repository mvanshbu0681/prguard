// OWNER: T0 (wave 0). FROZEN once T0 merges.
// Unit and component tests: jsdom, React, the @/ alias. Co-locate tests as
// src/**/*.test.ts(x) or put them under tests/unit/. tests/e2e/ is Playwright's.
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@fixtures": path.resolve(import.meta.dirname, "public/fixtures"),
      // next/font is a compile-time transform; give layout tests an inert stand-in.
      "next/font/local": path.resolve(import.meta.dirname, "tests/mocks/next-font-local.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    css: false,
    // Up to eight worktrees run this suite at once during a build wave; several honest
    // tests (a 512x512 PNG walk, the Shiki highlighter, lint-motion over the tree) pass 5s
    // under that load. 15s is a budget, not a loosened assertion.
    testTimeout: 15_000,
  },
});
