// OWNER: T0 (wave 0). Vitest stand-in for next/font/local (a build-time transform).
export default function localFont(options: { variable?: string }) {
  return { className: "", variable: options.variable ?? "", style: { fontFamily: "" } };
}
