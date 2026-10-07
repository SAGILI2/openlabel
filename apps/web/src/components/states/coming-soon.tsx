import type { LucideIcon } from "lucide-react";

/**
 * Placeholder for sections not built yet. Says what the page will do and which ticket
 * delivers it, so contributors can find the work.
 */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  ticket,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  ticket: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div className="bg-muted text-muted-foreground mb-5 flex size-12 items-center justify-center rounded-lg border">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-2 leading-relaxed">{description}</p>
      <p className="text-muted-foreground mt-6 text-[13px]">
        In development · tracked in <span className="text-foreground font-mono">{ticket}</span>
      </p>
    </div>
  );
}
