/**
 * Writes every template with sample data to ./preview/*.html for a look in the browser:
 *   pnpm --filter @openlabel/emails build && pnpm --filter @openlabel/emails preview
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderEmail } from "./render.js";
import type { TemplateName } from "./templates/index.js";

const url = "http://localhost:3000/example";
const samples: Record<TemplateName, unknown> = {
  invitation: {
    orgName: "Acme Research",
    inviterName: "Katherine Johnson",
    role: "reviewer",
    url,
    expiresAt: "14 Oct 2026",
  },
  "reset-password": { name: "Katherine", url },
  "verify-email": { name: "Katherine", url },
  "review-requested": {
    requesterName: "Katherine Johnson",
    projectName: "Invoices 2026",
    pageName: "RECEIPT-B.png",
    url,
  },
  "changes-requested": {
    reviewerName: "Rosalind Franklin",
    projectName: "Invoices 2026",
    pageName: "RECEIPT-B.png",
    comment: "The total line has an extra colon.",
    url,
  },
};

const dir = join(process.cwd(), "preview");
await mkdir(dir, { recursive: true });
for (const [name, payload] of Object.entries(samples)) {
  const email = await renderEmail(name as TemplateName, payload);
  await writeFile(join(dir, `${name}.html`), email.html);
  process.stdout.write(`${name}: ${email.subject}\n`);
}
