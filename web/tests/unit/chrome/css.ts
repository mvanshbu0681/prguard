// OWNER: t1a (wave 1). Test helper: read src/styles/chrome.css as rules and
// declarations. jsdom does not apply stylesheets (vitest runs with css: false),
// so the chrome's styling contracts are asserted against the source itself.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WEB = fileURLToPath(new URL('../../..', import.meta.url));

export interface CssRule {
  selector: string;
  declarations: [property: string, value: string][];
}

export function readCss(relative: string): string {
  return readFileSync(`${WEB}/${relative}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Innermost `selector { declarations }` blocks, whatever at-rules wrap them. */
export function cssRules(source: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const declarations = m[2]
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const at = d.indexOf(':');
        return [d.slice(0, at).trim(), d.slice(at + 1).trim().replace(/\s+/g, ' ')] as [string, string];
      });
    rules.push({ selector, declarations });
  }
  return rules;
}

export function declarationsOf(rules: CssRule[], property: string): { selector: string; value: string }[] {
  return rules.flatMap((r) => r.declarations.filter(([p]) => p === property).map(([, value]) => ({ selector: r.selector, value })));
}
