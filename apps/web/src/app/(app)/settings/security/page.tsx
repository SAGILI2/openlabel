import { headers } from "next/headers";
import { PageBody, TopBar } from "@/components/shell";
import { SettingsNav } from "@/features/settings";
import { SessionsCard, TwoFactorCard, type SessionRow } from "@/features/account";
import { getAuth, requireSession } from "@/server/auth";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const current = await requireSession();
  const sessions = await getAuth().api.listSessions({ headers: await headers() });
  const rows: SessionRow[] = sessions
    .map((s) => ({
      token: s.token,
      userAgent: s.userAgent ?? null,
      ipAddress: s.ipAddress ?? null,
      createdAt: s.createdAt.toISOString(),
      current: s.token === current.session.token,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <TopBar title="Security" />
      <SettingsNav variant="tabs" />
      <PageBody className="max-w-none gap-6">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">Account security</h2>
          <p className="text-muted-foreground mt-1">
            Signed in as <span className="text-foreground">{current.user.email}</span>
          </p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 2xl:grid-cols-2">
          <TwoFactorCard enabled={current.user.twoFactorEnabled === true} />
          <SessionsCard sessions={rows} />
        </div>
      </PageBody>
    </>
  );
}
