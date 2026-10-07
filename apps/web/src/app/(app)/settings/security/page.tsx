import { headers } from "next/headers";
import { TopBar } from "@/components/shell";
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
      <div className="mx-auto grid w-full max-w-[880px] gap-6 px-6 py-8">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">Account security</h2>
          <p className="text-muted-foreground mt-1">
            Signed in as <span className="text-foreground">{current.user.email}</span>
          </p>
        </div>
        <TwoFactorCard enabled={current.user.twoFactorEnabled === true} />
        <SessionsCard sessions={rows} />
      </div>
    </>
  );
}
