// OWNER: T0 (wave 0). FROZEN — nobody edits this during the build (plan §8).
//
// next/core-web-vitals + next/typescript (typescript-eslint's recommended set),
// plus the engine boundary as errors, not a convention (plan §2 hard rule 2):
//   app/(app)/** and src/components/charts/**  → no GSAP
//   app/(marketing)/**                         → no Motion / framer-motion
//   everywhere                                 → no three, @react-three/*, lenis (D1, plan §3)
// ESLint flat config REPLACES a rule's options when several blocks match one file,
// so every scoped block repeats the global bans. `no-restricted-imports` does not
// see dynamic import(), so `no-restricted-syntax` covers that form.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SOURCES = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];

const BANNED_EVERYWHERE = [
  { group: ["three", "three/*"], message: "D1: zero WebGL — no Three.js." },
  { group: ["@react-three/*"], message: "D1: zero WebGL — no React Three Fiber / drei." },
  { group: ["lenis", "lenis/*", "@studio-freight/lenis"], message: "Banned (plan §3): smooth scroll adds a frame of latency; Motion never drives scroll." },
];
const NO_GSAP = { group: ["gsap", "gsap/*", "@gsap/*"], message: "GSAP is marketing-only (plan §2 rule 2). Dashboard motion is Motion via LazyMotion." };
const NO_MOTION = { group: ["motion", "motion/*", "framer-motion", "framer-motion/*"], message: "Motion is dashboard-only (plan §2 rule 2). Marketing motion is GSAP." };

const dynamicImportBan = (pattern, message) => ({ selector: `ImportExpression[source.value=${pattern}]`, message });
const DYN_EVERYWHERE = [dynamicImportBan("/^(three|lenis)(\\u002F|$)|^@react-three\\u002F/", "D1 / plan §3: no WebGL and no smooth scroll.")];
const DYN_GSAP = dynamicImportBan("/^(gsap|@gsap\\u002F)/", NO_GSAP.message);
const DYN_MOTION = dynamicImportBan("/^(motion|framer-motion)(\\u002F|$)/", NO_MOTION.message);

const boundary = (extraPattern, extraDynamic) => ({
  "no-restricted-imports": ["error", { patterns: [...BANNED_EVERYWHERE, ...(extraPattern ? [extraPattern] : [])] }],
  "no-restricted-syntax": ["error", ...DYN_EVERYWHERE, ...(extraDynamic ? [extraDynamic] : [])],
});

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "coverage/**",
    // T2's generated client (`npm run api:gen`, committed). Hand-written files
    // there (e.g. src/api/ext.ts) are still linted.
    "src/api/**/*.gen.ts",
    "src/api/client/**",
    "src/api/core/**",
  ]),
  { files: SOURCES, rules: boundary(null, null) },
  { files: ["app/(app)/**", "src/components/charts/**"], rules: boundary(NO_GSAP, DYN_GSAP) },
  { files: ["app/(marketing)/**"], rules: boundary(NO_MOTION, DYN_MOTION) },
]);
