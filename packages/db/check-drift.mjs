// Fails when src/schema has changes that no committed migration captures.
//
// Copies the committed migrations into a scratch folder inside this package (drizzle-kit
// resolves --out relative to the working directory), runs `drizzle-kit generate` against
// the copy, and fails if a new migration file appears. Any generator error also fails.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SCRATCH = ".drift-check";
const OUT = `${SCRATCH}/drizzle`;

rmSync(SCRATCH, { recursive: true, force: true });
try {
  cpSync("drizzle", OUT, { recursive: true });
  const before = new Set(readdirSync(OUT));

  const bin = resolve(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "drizzle-kit.CMD" : "drizzle-kit",
  );
  if (!existsSync(bin)) throw new Error(`drizzle-kit not found at ${bin}; run pnpm install`);
  const res = spawnSync(
    process.platform === "win32" ? `"${bin}"` : bin,
    [
      "generate",
      "--dialect=postgresql",
      "--schema=./src/schema/index.ts",
      `--out=${OUT}`,
      "--casing=snake_case",
    ],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  if (res.status !== 0) {
    console.error(res.stdout, res.stderr);
    throw new Error(`drizzle-kit generate failed with exit code ${res.status}`);
  }

  const added = readdirSync(OUT).filter((f) => !before.has(f));
  if (added.length > 0) {
    console.error(
      `Schema drift: src/schema changed without a migration (would generate ${added.join(", ")}).\n` +
        "Run `pnpm db:generate --name <change>` and commit the new migration.",
    );
    process.exit(1);
  }
  console.log("no schema drift");
} finally {
  rmSync(SCRATCH, { recursive: true, force: true });
}
