import { LocalTime } from "@/components/time";

export interface ActivityView {
  id: string;
  action: string;
  actorName: string | null;
  details: Record<string, unknown>;
  occurredAt: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Plain-language sentence for an audit event. Unknown actions fall back to the raw verb. */
export function describeActivity(e: ActivityView): string {
  const who = e.actorName ?? "Someone";
  switch (e.action) {
    case "organization.created":
      return `${who} created the organisation`;
    case "invitation.created":
      return `${who} invited ${str(e.details.email)} as ${str(e.details.role)}`;
    case "invitation.revoked":
      return `${who} revoked an invitation`;
    case "invitation.accepted":
      return `${who} joined as ${str(e.details.role)}`;
    case "membership.role_changed":
      return `${who} changed a role from ${str(e.details.from)} to ${str(e.details.to)}`;
    case "membership.removed":
      return `${who} removed a member`;
    case "membership.left":
      return `${who} left the organisation`;
    default:
      return `${who}: ${e.action}`;
  }
}

/** Recent audit events for the organisation. */
export function ActivityList({ events }: { events: ActivityView[] }) {
  return (
    <section aria-labelledby="activity-heading" className="grid gap-3">
      <h3 id="activity-heading" className="font-semibold">
        Recent activity
      </h3>
      {events.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">Nothing yet.</p>
      ) : (
        <ol className="bg-card divide-y rounded-lg border">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5"
            >
              <span className="text-[13px]">{describeActivity(e)}</span>
              <span className="text-muted-foreground text-[12px] tabular-nums">
                <LocalTime iso={e.occurredAt} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
