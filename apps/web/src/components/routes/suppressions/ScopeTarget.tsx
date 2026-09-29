// What one suppression covers: its scope as a five-step reach meter (one finding
// → every repository), then the exact target in mono — the fingerprint for a
// line suppression, the file or glob for a path one, the rule key for a
// repository- or org-wide one.
import type { SuppressionItem } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { SCOPE_LABEL, SCOPE_REACH, scopeLevel, shortHash } from "./format";
import s from "./suppressions.module.css";

export function ReachMeter({ scope, className }: { scope: SuppressionItem["scope"]; className?: string }) {
  const level = scopeLevel(scope);
  return (
    <span className={cn(s.reach, className)} data-level={level} aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} data-on={i <= level ? "" : undefined} />
      ))}
    </span>
  );
}

export function ScopeTarget({ item, fingerprint, className }: { item: SuppressionItem; fingerprint: string | null; className?: string }) {
  const path = item.scope === "file" || item.scope === "pattern" ? item.match_path : null;
  const target =
    item.scope === "line" && fingerprint ? (
      <code className={s.target} title={`fingerprint ${fingerprint}`}>
        <span className={s.targetKey}>fp</span> {shortHash(fingerprint)}
      </code>
    ) : path ? (
      <code className={s.target} title={path}>
        {path}
      </code>
    ) : null;
  return (
    <span className={cn(s.scopeLine, className)}>
      <span className={s.scope} title={`${SCOPE_LABEL[item.scope]} scope — ${SCOPE_REACH[item.scope]}`}>
        <ReachMeter scope={item.scope} />
        <span className={s.scopeLabel}>{SCOPE_LABEL[item.scope]}</span>
      </span>
      {target}
      {item.rule_key ? (
        <code className={s.rule} title={`rule ${item.rule_key}`}>
          {item.rule_key}
        </code>
      ) : null}
    </span>
  );
}
