#!/usr/bin/env node
// Verifies every non-merge commit in <base>..<head> has a Signed-off-by trailer matching its author.
// Usage: node scripts/check-dco.mjs <base> <head>
import { execFileSync } from "node:child_process";

const [base, head = "HEAD"] = process.argv.slice(2);
if (!base) {
  console.error("Usage: node scripts/check-dco.mjs <base> [head]");
  process.exit(2);
}

const SEP = "\x1e";
const log = execFileSync(
  "git",
  ["log", "--no-merges", `--format=%H%x1f%an <%ae>%x1f%B${SEP}`, `${base}..${head}`],
  {
    encoding: "utf8",
  },
);

const failures = [];
let checked = 0;
for (const entry of log.split(SEP)) {
  const [sha, author, body] = entry.trim().split("\x1f");
  if (!sha || author === undefined || body === undefined) continue;
  checked += 1;
  const signoffs = [...body.matchAll(/^Signed-off-by:\s*(.+)$/gim)].map((m) => (m[1] ?? "").trim());
  if (!signoffs.some((s) => s.toLowerCase() === author.toLowerCase())) {
    failures.push(`${sha.slice(0, 10)} by ${author}`);
  }
}

if (failures.length > 0) {
  console.error(`Commits missing a matching Signed-off-by trailer:\n  ${failures.join("\n  ")}`);
  console.error("Fix with: git rebase --signoff " + base);
  process.exit(1);
}
console.log(`DCO check passed (${String(checked)} commits).`);
