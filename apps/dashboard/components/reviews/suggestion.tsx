// A suggested replacement, shown the way a diff shows added lines.

function toLines(suggestion: string): string[] {
  let text = suggestion.replace(/\r\n/g, "\n");
  // Tolerate a fenced block (```suggestion ... ```), which is how GitHub stores them.
  const fenced = text.match(/^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/);
  if (fenced?.[1] !== undefined) text = fenced[1];
  return text.replace(/\n+$/, "").split("\n");
}

export function Suggestion({ code }: { code: string }) {
  const lines = toLines(code);

  return (
    <figure className="overflow-hidden rounded-md border border-line bg-surface-0">
      <figcaption className="flex h-7 items-center border-b border-line px-3 text-2xs font-medium uppercase tracking-[0.06em] text-dim">
        Suggestion
      </figcaption>
      <pre className="overflow-x-auto bg-ok/8 font-mono text-xs leading-5">
        <code className="block min-w-max py-2">
          {lines.map((line, i) => (
            <span key={i} className="flex">
              <span aria-hidden="true" className="w-8 shrink-0 select-none text-center text-ok">
                +
              </span>
              <span className="whitespace-pre pl-1 pr-4 text-ok-text">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
