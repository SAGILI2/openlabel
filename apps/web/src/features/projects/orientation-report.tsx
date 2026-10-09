import type { OrientationStats } from "@openlabel/db";

function pct(n: number, of: number): string {
  return of === 0 ? "—" : `${String(Math.round((n / of) * 100))}%`;
}

/**
 * How well the page-orientation model did on this project, per model, so a better model can be
 * chosen. Pages people turned by hand count as the right answer.
 */
export function OrientationReport({ stats, noText }: { stats: OrientationStats[]; noText: number }) {
  if (stats.length === 0) {
    return (
      <p className="text-muted-foreground text-[13px]">
        No pages have been read with orientation detection yet. New uploads and pages read again show up here.
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      {stats.map((s) => {
        const total = s.straight + s.judged;
        const turns = ["0", "90", "180", "270"].map((k) => [k, s.applied[k] ?? 0] as const);
        const most = Math.max(1, ...turns.map(([, n]) => n));
        return (
          <section key={s.model} className="bg-card rounded-lg border">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
              <h3 className="font-mono text-[13px] font-semibold">{s.model}</h3>
              <p className="text-muted-foreground text-[12px] tabular-nums">
                {total.toLocaleString()} pages · {s.straight.toLocaleString()} read straight without asking
                the model
              </p>
            </header>
            <dl className="grid grid-cols-2 gap-px border-b sm:grid-cols-4">
              <Stat
                label="Model right"
                value={pct(s.correct, s.judged)}
                hint={`${s.correct.toLocaleString()} of ${s.judged.toLocaleString()} pages it was asked about`}
              />
              <Stat
                label="Fixed by comparing readings"
                value={s.corrected.toLocaleString()}
                hint="Usually upside down vs. upright"
              />
              <Stat
                label="Turned by people"
                value={s.turnedByPeople.toLocaleString()}
                hint="Turned by hand in the editor: the automatic turn was wrong"
              />
              <Stat
                label="Still no text"
                value={noText.toLocaleString()}
                hint="Files whose latest reading found no words"
              />
            </dl>
            <div className="grid gap-6 p-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-[12px] font-semibold">Is its confidence worth trusting?</h4>
                <table className="w-full text-[12px] tabular-nums">
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="pb-1 font-normal">Model confidence</th>
                      <th className="pb-1 text-right font-normal">Pages</th>
                      <th className="pb-1 text-right font-normal">Right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byConfidence.map((b) => (
                      <tr key={b.band} className="border-t">
                        <td className="py-1.5">{b.band}</td>
                        <td className="py-1.5 text-right">{b.judged.toLocaleString()}</td>
                        <td className="py-1.5 text-right font-medium">{pct(b.correct, b.judged)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4 className="mb-2 text-[12px] font-semibold">How pages had to be turned</h4>
                <ul className="grid gap-1.5 text-[12px]">
                  {turns.map(([deg, n]) => (
                    <li key={deg} className="grid grid-cols-[72px_1fr_56px] items-center gap-2 tabular-nums">
                      <span className="text-muted-foreground">{deg === "0" ? "Upright" : `${deg}°`}</span>
                      <span className="bg-muted h-2 overflow-hidden rounded-full">
                        <span
                          className="bg-brand block h-full rounded-full"
                          style={{ width: `${String((n / most) * 100)}%` }}
                        />
                      </span>
                      <span className="text-right">{n.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-muted-foreground text-[12px]">{label}</dt>
      <dd className="mt-0.5 text-[20px] font-semibold tabular-nums">{value}</dd>
      <dd className="text-muted-foreground text-[11px]">{hint}</dd>
    </div>
  );
}
