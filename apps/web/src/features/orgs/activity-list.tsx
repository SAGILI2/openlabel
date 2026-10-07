import { LocalTime } from "@/components/time";

import { describeActivity, type ActivityView } from "./describe-activity";

export { describeActivity, type ActivityView };

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
