import { Building2, ChevronRight, KeyRound, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { TopBar } from "@/components/shell";

export const metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/settings/security",
    icon: ShieldCheck,
    title: "Security",
    description: "Two-factor authentication and signed-in devices.",
    ready: true,
  },
  {
    href: "/settings",
    icon: Building2,
    title: "Organisation",
    description: "Name, members and invitations. Arrives with OL-9.",
    ready: false,
  },
  {
    href: "/settings",
    icon: Users,
    title: "Roles and permissions",
    description: "Who can label, review and manage projects. Arrives with OL-10.",
    ready: false,
  },
  {
    href: "/settings",
    icon: KeyRound,
    title: "API keys",
    description: "Tokens for scripts, CI and integrations. Arrives with OL-34.",
    ready: false,
  },
] as const;

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" />
      <div className="mx-auto w-full max-w-[880px] px-6 py-8">
        <ul className="bg-card divide-y rounded-lg border">
          {SECTIONS.map(({ href, icon: Icon, title, description, ready }) => {
            const body = (
              <>
                <Icon className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground text-[13px]">{description}</p>
                </div>
                {ready && <ChevronRight className="text-muted-foreground size-4" aria-hidden />}
              </>
            );
            return (
              <li key={title}>
                {ready ? (
                  <Link
                    href={href}
                    className="hover:bg-muted/60 flex items-center gap-4 px-5 py-4 transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-4 px-5 py-4 opacity-60">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
