#!/usr/bin/env node
// Fails when a production dependency uses a licence outside the permissive allow-list.
// Exceptions are per package and need a reason; review them when the dependency changes.
import { execSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
]);

/** package name prefix → reason it is acceptable despite its licence */
const EXCEPTIONS = {
  "@img/sharp-":
    "libvips binaries (LGPL-3.0) are dynamically linked by Next.js image optimisation and not modified",
  "caniuse-lite": "CC-BY-4.0 data used at build time only",
  geist: "SIL Open Font Licence permits bundling fonts with software",
  lightningcss:
    "MPL-2.0 (file-level copyleft), used unmodified by the CSS build; reaches the prod tree only via better-auth's optional vitest peer",
};

const raw = execSync("pnpm licenses list --prod --json", {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
/** @type {Record<string, { name: string; versions: string[] }[]>} */
const byLicence = JSON.parse(raw);

const violations = [];
for (const [licence, packages] of Object.entries(byLicence)) {
  // SPDX "A OR B" is fine when any branch is allowed.
  const ok = licence.split(/\s+OR\s+/).some((l) => ALLOWED.has(l.replace(/[()]/g, "")));
  if (ok) continue;
  for (const pkg of packages) {
    const exception = Object.keys(EXCEPTIONS).find((prefix) => pkg.name.startsWith(prefix));
    if (!exception) violations.push(`${pkg.name}@${pkg.versions.join(",")}: ${licence}`);
  }
}

if (violations.length > 0) {
  console.error(`Disallowed licences in production dependencies:\n  ${violations.join("\n  ")}`);
  console.error("Replace the dependency or add a reviewed exception in scripts/check-licences.mjs.");
  process.exit(1);
}
console.log(`Licence check passed (${Object.values(byLicence).flat().length} packages).`);
