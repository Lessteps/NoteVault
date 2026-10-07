import { describe, expect, it } from "vitest";
import { applyLauncherOrder, moveLauncher } from "./launcherOrder";

describe("launcher order", () => {
  it("puts the saved order first and keeps unknown buttons at the end in their default order", () => {
    expect(applyLauncherOrder(["a", "b", "c", "d"], ["c", "a"])).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores saved ids that are not shown in this area", () => {
    expect(applyLauncherOrder(["a", "b"], ["x", "b", "y", "a"])).toEqual(["b", "a"]);
  });

  it("moves a button to the place of the one it is dropped on", () => {
    expect(moveLauncher(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveLauncher(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("leaves the order alone when the drop makes no sense", () => {
    expect(moveLauncher(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveLauncher(["a", "b"], "z", "a")).toEqual(["a", "b"]);
  });
});
