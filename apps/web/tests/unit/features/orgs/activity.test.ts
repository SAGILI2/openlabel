import { describe, expect, it } from "vitest";
import { describeActivity, type ActivityView } from "@/features/orgs/describe-activity";

const ev = (action: string, details: Record<string, unknown> = {}): ActivityView => ({
  id: "1",
  action,
  actorName: "Rohith",
  details,
  occurredAt: "2026-10-07T00:00:00.000Z",
});

describe("describeActivity", () => {
  it("writes review, project and export events as sentences", () => {
    expect(describeActivity(ev("review.requested"))).toBe("Rohith sent a page for review");
    expect(describeActivity(ev("review.approve"))).toBe("Rohith approved a page");
    expect(describeActivity(ev("review.request_changes"))).toBe("Rohith requested changes on a page");
    expect(describeActivity(ev("project.created", { name: "Writer Corp" }))).toBe(
      "Rohith created the project Writer Corp",
    );
    expect(describeActivity(ev("export.created", { items: 4 }))).toBe("Rohith started an export of 4 pages");
    expect(describeActivity(ev("assets.deleted", { count: 1 }))).toBe("Rohith deleted 1 file");
  });

  it("stays readable for events it doesn't know yet", () => {
    expect(describeActivity({ ...ev("something.new"), actorName: null })).toBe("Someone: something.new");
  });
});
