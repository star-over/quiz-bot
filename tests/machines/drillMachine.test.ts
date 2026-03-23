import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { drillMachine } from "../../convex/machines/drillMachine";

function startDrill() {
  const actor = createActor(drillMachine);
  actor.start();
  return actor;
}

describe("drillMachine", () => {
  it("стартует в состоянии idle", () => {
    const actor = startDrill();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("idle → START → questioning", () => {
    const actor = startDrill();
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("questioning");
  });

  it("questioning → STOP → idle", () => {
    const actor = startDrill();
    actor.send({ type: "START" });
    actor.send({ type: "STOP" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("questioning → START → questioning (re-entry)", () => {
    const actor = startDrill();
    actor.send({ type: "START" });
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("questioning");
  });

  it("idle + STOP → остаётся idle (нет перехода)", () => {
    const actor = startDrill();
    actor.send({ type: "STOP" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("snapshot round-trip: serialize → deserialize → продолжение", () => {
    const actor1 = startDrill();
    actor1.send({ type: "START" });
    const snapshot = JSON.stringify(actor1.getSnapshot());

    const actor2 = createActor(drillMachine, {
      snapshot: JSON.parse(snapshot),
    });
    actor2.start();

    expect(actor2.getSnapshot().value).toBe("questioning");
    actor2.send({ type: "STOP" });
    expect(actor2.getSnapshot().value).toBe("idle");
  });
});
