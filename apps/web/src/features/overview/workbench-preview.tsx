/**
 * Hero illustration of the core job: a page with word regions drawn over it, one of which
 * (a low-confidence amount) is selected and being corrected in the side panel.
 * Pure SVG + markup, no data dependencies.
 */
const WORDS: readonly {
  x: number;
  y: number;
  w: number;
  text: string;
  ink: string;
  low?: boolean;
  sel?: boolean;
}[] = [
  { x: 28, y: 36, w: 78, text: "Invoice", ink: "var(--ink-1)" },
  { x: 112, y: 36, w: 108, text: "INV-2024-00187", ink: "var(--ink-6)" },
  { x: 28, y: 70, w: 44, text: "Date", ink: "var(--ink-1)" },
  { x: 160, y: 70, w: 86, text: "12/03/2026", ink: "var(--ink-5)" },
  { x: 28, y: 118, w: 60, text: "Subtotal", ink: "var(--ink-1)" },
  { x: 176, y: 118, w: 70, text: "1,250.00", ink: "var(--ink-3)" },
  { x: 28, y: 148, w: 34, text: "Tax", ink: "var(--ink-1)" },
  { x: 176, y: 148, w: 70, text: "1O5.20", ink: "var(--ink-2)", low: true, sel: true },
  { x: 28, y: 186, w: 44, text: "Total", ink: "var(--ink-1)" },
  { x: 176, y: 186, w: 70, text: "1,355.20", ink: "var(--ink-3)" },
];

/** Shows a value with one character marked, so an O-vs-0 confusion is visible in any font. */
function MarkedValue({
  before,
  char,
  after,
  tone,
}: {
  before: string;
  char: string;
  after: string;
  tone: "error" | "fix";
}) {
  return (
    <span>
      {before}
      <mark
        className={
          tone === "error"
            ? "rounded-sm bg-[color-mix(in_oklab,var(--ink-2)_22%,transparent)] px-px text-[var(--ink-2)] underline decoration-wavy decoration-1 underline-offset-2"
            : "rounded-sm bg-transparent px-px font-semibold text-inherit underline decoration-1 underline-offset-2"
        }
      >
        {char}
      </mark>
      {after}
    </span>
  );
}

export function WorkbenchPreview() {
  return (
    <figure
      className="bg-card relative overflow-hidden rounded-lg border"
      aria-label="Labelling a document: correcting a low-confidence amount"
    >
      <div className="text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-[12px]">
        <span className="bg-muted rounded px-1.5 py-0.5 font-mono">invoice-0187.png</span>
        <span>10 regions</span>
        <span className="ml-auto">1 needs review</span>
      </div>
      <div className="grid grid-cols-[1fr_220px]">
        <div className="bg-muted/50 relative p-5">
          <svg viewBox="0 0 280 220" className="w-full drop-shadow-sm" role="img" aria-hidden>
            <rect x="8" y="8" width="264" height="206" rx="3" fill="var(--card)" stroke="var(--border)" />
            <line x1="28" y1="100" x2="252" y2="100" stroke="var(--border)" />
            <line x1="28" y1="172" x2="252" y2="172" stroke="var(--border)" />
            {WORDS.map((w) => (
              <g key={`${w.x}-${w.y}`}>
                <text
                  x={w.x + 3}
                  y={w.y + 13}
                  fontSize="11"
                  fill="var(--foreground)"
                  fontFamily="var(--font-geist-mono)"
                >
                  {w.low ? (
                    <>
                      {w.text.slice(0, 1)}
                      <tspan fill="var(--ink-2)" fontWeight="700" textDecoration="underline">
                        {w.text.slice(1, 2)}
                      </tspan>
                      {w.text.slice(2)}
                    </>
                  ) : (
                    w.text
                  )}
                </text>
                <rect
                  x={w.x}
                  y={w.y}
                  width={w.w}
                  height="18"
                  rx="2"
                  fill={w.ink}
                  fillOpacity={w.sel ? 0.14 : 0.07}
                  stroke={w.ink}
                  strokeWidth={w.sel ? 1.75 : 1}
                  strokeDasharray={w.low && !w.sel ? "3 2" : undefined}
                />
                {w.sel &&
                  [
                    [w.x, w.y],
                    [w.x + w.w, w.y],
                    [w.x, w.y + 18],
                    [w.x + w.w, w.y + 18],
                  ].map(([cx = 0, cy = 0]) => (
                    <rect
                      key={`${cx}-${cy}`}
                      x={cx - 2.5}
                      y={cy - 2.5}
                      width="5"
                      height="5"
                      fill="var(--card)"
                      stroke={w.ink}
                      strokeWidth="1.25"
                    />
                  ))}
              </g>
            ))}
          </svg>
        </div>
        <aside className="border-l p-4 text-[13px]">
          <p className="text-muted-foreground">Selected region</p>
          <div className="bg-muted mt-2 rounded border px-2 py-3 text-center font-mono text-[15px]">
            <MarkedValue before="1" char="O" after="5.20" tone="error" />
          </div>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Model read</dt>
              <dd className="font-mono">
                <MarkedValue before="1" char="O" after="5.20" tone="error" />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Confidence</dt>
              <dd className="text-warning font-medium">0.62</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Type</dt>
              <dd>Currency</dd>
            </div>
          </dl>
          <p className="text-muted-foreground mt-3">Suggested fix: letter O → zero</p>
          <div className="border-brand bg-accent text-accent-foreground mt-1 flex items-center justify-between rounded border px-2 py-1.5 font-mono">
            <MarkedValue before="1" char="0" after="5.20" tone="fix" />
            <kbd className="font-sans text-[11px]">Enter</kbd>
          </div>
        </aside>
      </div>
    </figure>
  );
}
