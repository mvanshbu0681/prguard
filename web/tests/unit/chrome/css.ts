// OWNER: t1a (wave 1). Test helpers for the chrome suite.
//
// jsdom does not apply stylesheets (vitest runs with css: false), so the
// chrome's styling contracts are asserted against the CSS source itself.
// WEB comes from import.meta.dirname: under the jsdom environment the global
// URL is jsdom's, which node:url's fileURLToPath rejects.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const WEB = path.resolve(import.meta.dirname, '../../..');

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
