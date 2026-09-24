import { describe, expect, it } from "vitest";
import { layout, type GraphNode } from "./graph";

const node = (id: string): GraphNode => ({ id, title: id, subject: "general", topic: "", type: "concept", difficulty: 1, mastery: 0 });

describe("graph layout", () => {
  it("is deterministic and keeps linked nodes closer than unlinked ones", () => {
    const nodes = ["a", "b", "c"].map(node);
    const edges = [{ source: "a", target: "b", relation_type: "related" }];
    const p1 = layout(nodes, edges);
    const p2 = layout(nodes, edges);
    expect([...p1.entries()]).toEqual([...p2.entries()]);
    const d = (x: string, y: string) => Math.hypot(p1.get(x)![0] - p1.get(y)![0], p1.get(x)![1] - p1.get(y)![1]);
    expect(d("a", "b")).toBeLessThan(d("a", "c"));
  });
  it("falls back to a grid for huge graphs", () => {
    const nodes = Array.from({ length: 401 }, (_, i) => node(String(i)));
    expect(layout(nodes, []).get("1")).toEqual([60, 0]);
  });
});
